import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Codex } from './codex.js';
import { History } from './history.js';

export function createChatServer(codex, { historyPath, allowedOrigins = [] } = {}) {
  const history = new History(historyPath);
  const sessions = history.sessions;
  let models = [];
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
    const host = req.headers.host;
    if (!host || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || (req.headers.origin && req.headers.origin !== `http://${host}` && !allowedOrigins.includes(req.headers.origin))) return json(res, 403, { error: 'Forbidden origin' });
    try {
      const path = new URL(req.url, `http://${host}`).pathname;
      if (req.method === 'GET' && (path === '/' || path === '/index.html' || /^\/assets\/[\w.-]+$/.test(path))) {
        const file = path === '/' ? 'index.html' : path.slice(1);
        const extension = file.split('.').at(-1);
        const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf' };
        let contents;
        try { contents = await readFile(new URL(`./dist/${file}`, import.meta.url)); }
        catch (error) { if (error.code === 'ENOENT') return json(res, 404, { error: 'Not found' }); throw error; }
        res.setHeader('Content-Type', types[extension] || 'application/octet-stream');
        return res.end(contents);
      }
      await codex.ready;
      await history.ready;
      if (path === '/api/history' && req.method === 'GET') return json(res, 200, { conversations: [...sessions].filter(([, s]) => s.messages.length).map(([id, s]) => ({ id, title: s.title, updatedAt: s.updatedAt, busy: s.busy })).sort((a, b) => b.updatedAt - a.updatedAt) });
      if (path === '/api/bootstrap' && req.method === 'GET') {
        const account = await codex.request('account/read', { refreshToken: false });
        const list = [];
        let cursor = null;
        do {
          const page = await codex.request('model/list', { cursor, limit: 100 });
          list.push(...page.data); cursor = page.nextCursor;
        } while (cursor);
        models = list.filter(m => !m.hidden);
        return json(res, 200, { models, authenticated: Boolean(account.account) || !account.requiresOpenaiAuth });
      }
      if (req.method !== 'POST' || !['/api/chat', '/api/stop', '/api/reset', '/api/open'].includes(path)) return json(res, 404, { error: 'Not found' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'JSON required' });
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 65536) return json(res, 413, { error: 'メッセージが長すぎます。' });
      }
      let body;
      try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
      const token = req.headers['x-session-id'];
      let session = sessions.get(token);
      if (path === '/api/reset') {
        if (session?.busy) return json(res, 409, { error: '生成を停止してからやり直してください。' });
        if (session && !session.messages.length) sessions.delete(token);
        const id = randomUUID();
        sessions.set(id, { threadId: null, turnId: null, busy: false, loaded: false, messages: [], title: '新しい会話', updatedAt: Date.now() });
        return json(res, 200, { sessionId: id });
      }
      if (!session) return json(res, 400, { error: 'ページを再読み込みしてください。' });
      if (path === '/api/open') {
        if (session.busy) return json(res, 409, { error: 'この会話は回答を生成中です。少し待ってから開いてください。' });
        return json(res, 200, { sessionId: token, messages: session.messages, model: session.model, effort: session.effort });
      }
      if (path === '/api/stop') {
        session.stopping = true;
        if (session.turnId) await codex.request('turn/interrupt', { threadId: session.threadId, turnId: session.turnId });
        return json(res, 200, {});
      }
      const selectedModel = models.find(m => m.model === body.model);
      if (typeof body.text !== 'string' || !body.text.trim() || !selectedModel) return json(res, 400, { error: 'メッセージとモデルを確認してください。' });
      const effort = body.effort ?? selectedModel.defaultReasoningEffort;
      if (effort != null && !selectedModel.supportedReasoningEfforts?.some(option => option.reasoningEffort === effort)) return json(res, 400, { error: '選択したモデルに対応する推論レベルを指定してください。' });
      if (session.busy) return json(res, 409, { error: '回答を生成中です。' });
      session.busy = true; session.stopping = false;
      session.model = body.model; session.effort = effort;
      const label = selectedModel.displayName || body.model;
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
      const send = data => { if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(data) + '\n'); };
      let finished = false;
      const finish = async () => {
        if (finished) return;
        finished = true;
        clearInterval(heartbeat);
        codex.off('notification', notify); codex.off('disconnect', disconnected);
        session.turnId = null;
        try { await history.save(); } catch { send({ type: 'error', error: '履歴を保存できませんでした。ディスクの空き容量と権限を確認してください。' }); }
        session.busy = false;
        res.end();
      };
      const notify = ({ method, params: p }) => {
        if (p?.threadId !== session.threadId) return;
        if (method === 'turn/started') session.turnId = p.turn.id;
        if (method === 'item/agentMessage/delta' || (method === 'item/completed' && p.item.type === 'agentMessage')) {
          const id = p.itemId || p.item.id;
          let message = session.messages.find(m => m.id === id);
          if (!message) { message = { id, role: 'assistant', text: '', label }; session.messages.push(message); }
          message.text = method === 'item/agentMessage/delta' ? message.text + p.delta : p.item.text;
          session.updatedAt = Date.now();
        }
        if (method === 'item/agentMessage/delta') send({ type: 'delta', id: p.itemId, text: p.delta });
        if (method === 'item/completed' && p.item.type === 'agentMessage') send({ type: 'message', id: p.item.id, text: p.item.text });
        if (method === 'turn/completed') {
          send({ type: 'done', status: p.turn.status, error: p.turn.error?.message }); finish();
        }
      };
      const disconnected = error => { send({ type: 'error', error: error.message }); finish(); };
      const heartbeat = setInterval(() => send({ type: 'ping' }), 15000);
      codex.on('notification', notify); codex.on('disconnect', disconnected);
      res.on('close', () => {
        if (!finished) {
          session.stopping = true;
          if (session.turnId) codex.request('turn/interrupt', { threadId: session.threadId, turnId: session.turnId }).catch(() => {});
          finish();
        }
      });
      try {
        if (!session.threadId) {
          const result = await codex.request('thread/start', {
            model: body.model, sandbox: 'read-only', approvalPolicy: 'never',
            developerInstructions: 'You are a conversational assistant. Respond in the user’s language. Answer conversationally; do not execute commands or modify files unless explicitly requested.'
          });
          session.threadId = result.thread.id;
          session.loaded = true;
        } else if (!session.loaded) {
          await codex.request('thread/resume', { threadId: session.threadId, model: body.model, sandbox: 'read-only', approvalPolicy: 'never' });
          session.loaded = true;
        }
        if (session.stopping || finished) { send({ type: 'done', status: 'interrupted' }); finish(); return; }
        session.messages.push({ id: randomUUID(), role: 'user', text: body.text.trim() });
        if (session.messages.length === 1) session.title = body.text.trim().replace(/\s+/g, ' ').slice(0, 60);
        session.updatedAt = Date.now();
        await history.save();
        const result = await codex.request('turn/start', { threadId: session.threadId, model: body.model, ...(effort != null ? { effort } : {}), input: [{ type: 'text', text: body.text.trim() }] });
        if (!finished) session.turnId = result.turn.id;
        if (session.stopping) await codex.request('turn/interrupt', { threadId: session.threadId, turnId: result.turn.id });
      } catch (error) { send({ type: 'error', error: error.message }); finish(); }
    } catch (error) {
      if (!res.headersSent) json(res, 500, { error: error.message });
      else res.end();
    }
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const codex = new Codex();
  const server = createChatServer(codex, {
    historyPath: fileURLToPath(new URL('./.data/history.json', import.meta.url)),
    allowedOrigins: process.env.DEV_ORIGINS?.split(',') || [],
  });
  const port = Number(process.env.PORT || 8087);
  server.listen(port, '127.0.0.1', () => console.log(`Codex Chat: http://127.0.0.1:${port}`));
  server.on('error', error => { console.error(error.message); codex.close(); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { codex.close(); server.close(); server.closeAllConnections(); });
}
