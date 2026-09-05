export function renderMarkdown(text, marked, purifier) {
  return purifier.sanitize(marked.parse(text, { gfm: true }), {
    ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'del', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input'],
    ALLOWED_ATTR: ['href', 'title', 'class', 'start', 'type', 'checked', 'disabled'],
  });
}
