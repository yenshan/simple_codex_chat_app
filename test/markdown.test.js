import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import createDOMPurify from 'dompurify';
import { renderMarkdown } from '../public/markdown.js';

const window = new JSDOM('').window;
const purifier = createDOMPurify(window);
const render = text => JSDOM.fragment(renderMarkdown(text, marked, purifier));
test('renders headings, lists, tables, links and fenced code', () => {
  const doc = render('# 見出し\n\n**太字** と [リンク](https://example.com)\n\n- 項目\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = "<tag>";\n```');
  assert.equal(doc.querySelector('h1').textContent, '見出し');
  assert.equal(doc.querySelector('strong').textContent, '太字');
  assert.equal(doc.querySelector('li').textContent, '項目');
  assert.equal(doc.querySelectorAll('td').length, 2);
  assert.match(doc.querySelector('pre code').textContent, /<tag>/);
  assert.equal(doc.querySelector('a').getAttribute('href'), 'https://example.com');
});
test('removes executable HTML, unsafe URLs and embedded content', () => {
  const doc = render('<script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://example.com"></iframe><svg onload=alert(1)></svg>\n\n[bad](javascript:alert%281%29)\n\n<a href="javascript:alert(1)" onclick="alert(1)">bad</a>');
  assert.equal(doc.querySelector('script,img,iframe,svg,[onclick],[onerror]'), null);
  for (const link of doc.querySelectorAll('a')) assert.equal(link.hasAttribute('href'), false);
});
