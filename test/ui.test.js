import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import createDOMPurify from 'dompurify';
import { renderMarkdown } from '../public/markdown.js';

test('restores history, renders streamed Markdown and switches to a new conversation', async () => {
  const dom = new JSDOM(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'), { url: 'http://localhost:8087' });
  const { window } = dom;
  window.localStorage.setItem('codex-chat-active', 'saved');
  const calls = [];
  const fetch = async (path, options) => {
    calls.push({ path, options });
    const data = {
      '/api/bootstrap': { authenticated: true, models: [{ model: 'test', displayName: 'Test', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }] }] },
      '/api/history': { conversations: [{ id: 'saved', title: '以前の会話', updatedAt: Date.now() }] },
      '/api/open': { sessionId: 'saved', model: 'test', effort: 'low', messages: [{ role: 'assistant', text: '# 保存された見出し', label: 'Test' }] },
      '/api/reset': { sessionId: 'new' },
    }[path];
    if (path === '/api/chat') return new Response([
      { type: 'delta', id: 'answer', text: '**回答**' },
      { type: 'message', id: 'answer', text: '**回答**\n\n```js\nconst n = 1;\n```' },
      { type: 'done', status: 'completed' },
    ].map(e => JSON.stringify(e) + '\n').join(''));
    assert.ok(data, path);
    return Response.json(data);
  };
  const source = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  const run = new (Object.getPrototypeOf(async function() {}).constructor)('document', 'localStorage', 'navigator', 'Option', 'fetch', 'marked', 'DOMPurify', 'renderMarkdown', source);
  await run(window.document, window.localStorage, window.navigator, window.Option, fetch, marked, createDOMPurify(window), renderMarkdown);
  const $ = selector => window.document.querySelector(selector);
  assert.equal($('#messages h1').textContent, '保存された見出し');
  assert.equal($('.history-item').getAttribute('aria-current'), 'page');
  $('#prompt').value = '続けて'; $('#prompt').dispatchEvent(new window.Event('input'));
  await $('#composer').onsubmit({ preventDefault() {} });
  assert.equal($('#messages strong').textContent, '回答');
  assert.equal($('#messages pre code').textContent.trim(), 'const n = 1;');
  assert.equal(calls.find(c => c.path === '/api/chat').options.headers['X-Session-Id'], 'saved');
  await $('#new-chat').onclick();
  assert.equal($('#messages').children.length, 0);
  assert.equal($('#welcome').hidden, false);
  assert.equal($('.history-item span').textContent, '以前の会話');
  await $('.history-item').onclick();
  assert.equal($('#messages h1').textContent, '保存された見出し');
  dom.window.close();
});
