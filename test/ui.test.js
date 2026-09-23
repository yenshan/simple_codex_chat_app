import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { Marked } from 'marked';
import createDOMPurify from 'dompurify';
import katex from 'katex';
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
      '/api/open': { sessionId: 'saved', model: 'test', effort: 'low', messages: [{ role: 'assistant', text: '# 保存された見出し\n\n$x^2$', label: 'Test' }] },
      '/api/reset': { sessionId: 'new' },
    }[path];
    if (path === '/api/chat') return new Response([
      { type: 'delta', id: 'answer', text: '**回答**' },
      { type: 'message', id: 'answer', text: '**回答**\n\n$$x^2$$\n\n```js\nconst n = 1;\n```' },
      { type: 'done', status: 'completed' },
    ].map(e => JSON.stringify(e) + '\n').join(''));
    assert.ok(data, path);
    return Response.json(data);
  };
  const source = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  const run = new (Object.getPrototypeOf(async function() {}).constructor)('document', 'localStorage', 'navigator', 'Option', 'fetch', 'Marked', 'DOMPurify', 'katex', 'renderMarkdown', source);
  await run(window.document, window.localStorage, window.navigator, window.Option, fetch, Marked, createDOMPurify(window), katex, renderMarkdown);
  const $ = selector => window.document.querySelector(selector);
  assert.ok($('#sidebar .brand'));
  assert.equal(window.document.querySelector('header .brand'), null);
  assert.equal($('main').firstElementChild.id, 'conversation');
  assert.equal($('#sidebar-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal($('#sidebar-toggle').textContent, '×');
  assert.equal(window.document.querySelectorAll('#sidebar-toggle, #sidebar-close').length, 1);
  $('#sidebar-toggle').click();
  assert.equal($('.workspace').classList.contains('sidebar-open'), false);
  assert.equal($('#sidebar-toggle').getAttribute('aria-label'), 'サイドバーを開く');
  assert.equal($('#sidebar-toggle').textContent, '☰');
  $('#sidebar-toggle').click();
  assert.equal($('.workspace').classList.contains('sidebar-open'), true);
  assert.equal($('#messages h1').textContent, '保存された見出し');
  assert.ok($('#messages .katex'));
  assert.equal($('.history-item').getAttribute('aria-current'), 'page');
  $('#prompt').value = '続けて'; $('#prompt').dispatchEvent(new window.Event('input'));
  await $('#composer').onsubmit({ preventDefault() {} });
  assert.equal($('#messages strong').textContent, '回答');
  assert.equal($('#messages pre code').textContent.trim(), 'const n = 1;');
  assert.ok($('#messages .katex-display'));
  assert.equal(calls.find(c => c.path === '/api/chat').options.headers['X-Session-Id'], 'saved');
  await $('#new-chat').onclick();
  assert.equal($('#messages').children.length, 0);
  assert.equal($('#welcome').hidden, false);
  assert.equal($('.history-item span').textContent, '以前の会話');
  await $('.history-item').onclick();
  assert.equal($('#messages h1').textContent, '保存された見出し');
  $('#sidebar-toggle').click();
  assert.equal($('.workspace').classList.contains('sidebar-open'), false);
  dom.window.close();
});
