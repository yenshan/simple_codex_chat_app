import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createChatServer } from '../server.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

class FakeCodex extends EventEmitter {
  ready = Promise.resolve();
  calls = [];
  counter = 0;
  async request(method, params) {
    this.calls.push({ method, params });
    if (method === 'account/read') return { account: { type: 'chatgpt' } };
    if (method === 'model/list') return { data: [
      { model: 'first', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }] },
      { model: 'second', defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }] },
    ], nextCursor: null };
    if (method === 'thread/start') return { thread: { id: `thread-${++this.counter}` } };
    if (method === 'turn/start') {
      const turn = { id: `turn-${++this.counter}` };
      const emit = (method, extra) => this.emit('notification', { method, params: { threadId: params.threadId, ...extra } });
      emit('turn/started', { turn });
      if (params.input[0].text !== 'wait') setTimeout(() => {
        emit('item/agentMessage/delta', { itemId: 'item', delta: 'こんにちは' });
        emit('item/completed', { item: { id: 'item', type: 'agentMessage', text: 'こんにちは！' } });
        emit('turn/completed', { turn: { ...turn, status: 'completed' } });
      }, 5);
      return { turn };
    }
    if (method === 'turn/interrupt') this.emit('notification', { method: 'turn/completed', params: { threadId: params.threadId, turn: { id: params.turnId, status: 'interrupted' } } });
    return {};
  }
}
async function fixture(t, options) {
  const codex = new FakeCodex(), server = createChatServer(codex, options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, sessionId = '') => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId }, body: JSON.stringify(body) });
  await fetch(base + '/api/bootstrap');
  const { sessionId } = await (await post('/api/reset', {})).json();
  return { codex, base, post, sessionId };
}
test('streams final text and changes model within the same thread', async t => {
  const { codex, post, sessionId } = await fixture(t);
  for (const model of ['first', 'second']) {
    const response = await post('/api/chat', { text: 'hello', model }, sessionId);
    const events = (await response.text()).trim().split('\n').map(JSON.parse);
    assert.deepEqual(events.map(e => e.type), ['delta', 'message', 'done']);
    assert.equal(events[1].text, 'こんにちは！');
    assert.equal(events[2].status, 'completed');
  }
  assert.equal(codex.calls.filter(c => c.method === 'thread/start').length, 1);
  assert.deepEqual(codex.calls.filter(c => c.method === 'turn/start').map(c => c.params.model), ['first', 'second']);
  assert.deepEqual(codex.calls.filter(c => c.method === 'turn/start').map(c => c.params.effort), ['low', 'medium']);
});
test('forwards selected effort and rejects unsupported levels before starting a turn', async t => {
  const { codex, post, sessionId } = await fixture(t);
  await (await post('/api/chat', { text: 'hello', model: 'first', effort: 'high' }, sessionId)).text();
  assert.equal(codex.calls.find(c => c.method === 'turn/start').params.effort, 'high');
  assert.equal((await post('/api/chat', { text: 'hello', model: 'second', effort: 'high' }, sessionId)).status, 400);
  assert.equal((await post('/api/chat', { text: 'hello', model: 'first', effort: '' }, sessionId)).status, 400);
  assert.equal(codex.calls.filter(c => c.method === 'turn/start').length, 1);
});
test('interrupts active turns and rejects concurrent sends', async t => {
  const { codex, post, sessionId } = await fixture(t);
  const stream = post('/api/chat', { text: 'wait', model: 'first' }, sessionId);
  while (!codex.calls.some(c => c.method === 'turn/start')) await new Promise(r => setTimeout(r, 5));
  assert.equal((await post('/api/chat', { text: 'duplicate', model: 'first' }, sessionId)).status, 409);
  await post('/api/stop', {}, sessionId);
  assert.match(await (await stream).text(), /interrupted/);
  assert.equal((await post('/api/reset', {}, sessionId)).status, 200);
});
test('validates models, sessions, and cross-origin requests', async t => {
  const { base, post, sessionId } = await fixture(t);
  assert.equal((await post('/api/chat', { text: 'hello', model: 'invalid' }, sessionId)).status, 400);
  assert.equal((await post('/api/chat', { text: 'hello', model: 'first' }, 'unknown')).status, 400);
  assert.equal((await fetch(base + '/api/bootstrap', { headers: { Origin: 'https://example.com' } })).status, 403);
});
test('isolates conversations between browser sessions', async t => {
  const { codex, post, sessionId } = await fixture(t);
  const second = (await (await post('/api/reset', {})).json()).sessionId;
  const replies = await Promise.all([sessionId, second].map(async id => (await post('/api/chat', { text: 'hello', model: 'first' }, id)).text()));
  for (const reply of replies) assert.equal(reply.trim().split('\n').length, 3);
  assert.equal(new Set(codex.calls.filter(c => c.method === 'turn/start').map(c => c.params.threadId)).size, 2);
});
test('keeps history after new chat and resumes a saved thread after server restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'codex-chat-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { historyPath: join(directory, 'history.json') };
  const original = await fixture(t, options);
  await (await original.post('/api/chat', { text: '保存する会話', model: 'first', effort: 'high' }, original.sessionId)).text();
  await original.post('/api/reset', {}, original.sessionId);
  const list = await (await fetch(original.base + '/api/history')).json();
  assert.equal(list.conversations.length, 1);
  assert.equal(list.conversations[0].title, '保存する会話');
  const restored = await fixture(t, options);
  const opened = await (await restored.post('/api/open', {}, original.sessionId)).json();
  assert.deepEqual(opened.messages.map(m => m.text), ['保存する会話', 'こんにちは！']);
  assert.equal(opened.effort, 'high');
  await (await restored.post('/api/chat', { text: '続きを話す', model: 'second' }, original.sessionId)).text();
  assert.equal(restored.codex.calls.filter(c => c.method === 'thread/start').length, 0);
  assert.equal(restored.codex.calls.find(c => c.method === 'thread/resume').params.threadId, 'thread-1');
  assert.equal((await (await restored.post('/api/open', {}, original.sessionId)).json()).messages.filter(m => m.role === 'user').length, 2);
});
