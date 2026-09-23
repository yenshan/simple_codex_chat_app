import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Marked } from 'marked';
import createDOMPurify from 'dompurify';
import katex from 'katex';
import { renderMarkdown } from '../public/markdown.js';

const window = new JSDOM('').window;
const purifier = createDOMPurify(window);
const render = text => JSDOM.fragment(renderMarkdown(text, Marked, purifier, katex));
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
test('renders inline and display math while leaving code and currency alone', () => {
  const doc = render('式 $x^2 + y^2$ と \\(\\frac{1}{2}\\)\n\n$$\\int_0^1 x\\,dx$$\n\n\\[a+b\\]\n\n`$x$` と $5 and $10\n\n```tex\n$$x$$\n```');
  assert.equal(doc.querySelectorAll('.katex').length, 4);
  assert.equal(doc.querySelectorAll('.katex-display').length, 2);
  assert.equal(doc.querySelectorAll('math').length, 4);
  assert.equal(doc.querySelector('code').textContent, '$x$');
  assert.match(doc.textContent, /\$5 and \$10/);
  assert.match(doc.querySelector('pre code').textContent, /\$\$x\$\$/);
});
test('keeps unsafe math commands inert', () => {
  const doc = render('$\\href{javascript:alert(1)}{click}$');
  assert.equal(doc.querySelector('a,script,[onclick]'), null);
});
