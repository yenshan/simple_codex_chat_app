// Optional live check: starts one real model turn against the running app.
const base = process.env.CHAT_URL || 'http://127.0.0.1:8087';
const bootstrap = await (await fetch(`${base}/api/bootstrap`)).json();
if (!bootstrap.authenticated) throw new Error('Run codex login first.');
const model = bootstrap.models.find(m => m.isDefault) || bootstrap.models[0];
const post = (path, body, sessionId = '') => fetch(base + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000),
});
const { sessionId } = await (await post('/api/reset', {})).json();
const response = await post('/api/chat', { text: '日本語で「接続できました」とだけ答えてください。ツールは使わないでください。', model: model.model }, sessionId);
if (!response.ok) throw new Error(await response.text());
const result = await response.text();
console.log(result);
const events = result.trim().split('\n').map(JSON.parse);
if (!events.some(e => e.type === 'done' && e.status === 'completed') || !events.some(e => e.type === 'message')) throw new Error('Live generation failed.');
await post('/api/reset', {}, sessionId);
const history = await (await fetch(`${base}/api/history`)).json();
if (!history.conversations.some(chat => chat.id === sessionId)) throw new Error('Conversation is missing from history.');
const restored = await (await post('/api/open', {}, sessionId)).json();
if (!restored.messages.some(message => message.role === 'assistant')) throw new Error('Saved answer is missing.');
console.log(`Live smoke test passed (${model.model}).`);
