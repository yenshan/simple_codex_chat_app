export function renderMarkdown(text, Marked, purifier, katex) {
  const math = [];
  const placeholder = source => {
    const token = `MATH_PLACEHOLDER_${math.length}_END`;
    math.push(source);
    return token;
  };
  const parser = new Marked({ gfm: true, extensions: [
    {
      name: 'displayMath', level: 'block',
      tokenizer(source) {
        const match = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])(?:\n|$)/.exec(source);
        if (match) return { type: 'displayMath', raw: match[0], text: match[1] ?? match[2] };
      },
      renderer(token) { return `<p class="math-display">${placeholder({ text: token.text, displayMode: true })}</p>\n`; },
    },
    {
      name: 'inlineMath', level: 'inline',
      start(source) { return source.search(/\$|\\\(/); },
      tokenizer(source) {
        const match = /^(?:\$([^\s$\n](?:[^$\n]*?[^\s$\n])?)\$(?!\d)|\\\((.+?)\\\))/.exec(source);
        if (match) return { type: 'inlineMath', raw: match[0], text: match[1] ?? match[2] };
      },
      renderer(token) { return placeholder({ text: token.text, displayMode: false }); },
    },
  ] });
  const clean = purifier.sanitize(parser.parse(text), {
    ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'del', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input'],
    ALLOWED_ATTR: ['href', 'title', 'class', 'start', 'type', 'checked', 'disabled'],
  });
  return clean.replace(/MATH_PLACEHOLDER_(\d+)_END/g, (token, index) => {
    const expression = math[Number(index)];
    return expression && katex
      ? katex.renderToString(expression.text, { displayMode: expression.displayMode, throwOnError: false, trust: false })
      : token;
  });
}
