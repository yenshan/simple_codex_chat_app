import { marked } from '/vendor/marked.js';
import DOMPurify from '/vendor/purify.js';
import { renderMarkdown } from './markdown.js';
const $ = selector => document.querySelector(selector);
function renderText(content, text, role = 'assistant') {
  content.dataset.raw = text;
  if (role === 'user') content.textContent = text;
  else {
    content.innerHTML = renderMarkdown(text, marked, DOMPurify);
    content.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    content.querySelectorAll('input').forEach(input => { input.type = 'checkbox'; input.disabled = true; });
  }
}
const model = $('#model'), effort = $('#effort'), prompt = $('#prompt'), send = $('#send'), stop = $('#stop');
let models = [];
const effortLabels = { none: 'なし', minimal: '最小', low: '低', medium: '中', high: '高', xhigh: '非常に高い', max: '最大', ultra: 'Ultra' };
function updateEffort() {
  const selected = models.find(m => m.model === model.value);
  const options = selected?.supportedReasoningEfforts || [];
  let saved;
  try { saved = localStorage.getItem(`codex-chat-effort:${model.value}`); } catch {}
  effort.replaceChildren(...options.map(option => {
    const value = option.reasoningEffort;
    const label = `${effortLabels[value] || value} (${value})${value === selected.defaultReasoningEffort ? ' · 標準' : ''}`;
    const element = new Option(label, value);
    element.title = option.description;
    return element;
  }));
  if (!options.length) effort.add(new Option('指定なし', ''));
  effort.value = options.find(o => o.reasoningEffort === saved)?.reasoningEffort
    || options.find(o => o.reasoningEffort === selected.defaultReasoningEffort)?.reasoningEffort
    || options[0]?.reasoningEffort || '';
  controls();
}
let sessionId, busy = false, authenticated = false, switching = false;
let conversations = [];
function rememberSession() { try { localStorage.setItem('codex-chat-active', sessionId); } catch {} }
function renderHistory() {
  const list = $('#history-list'); list.replaceChildren();
  if (!conversations.length) { const empty = document.createElement('p'); empty.className = 'history-empty'; empty.textContent = 'まだ会話はありません'; list.append(empty); }
  for (const chat of conversations) {
    const button = document.createElement('button'); button.className = 'history-item';
    button.setAttribute('aria-current', chat.id === sessionId ? 'page' : 'false');
    button.disabled = busy || switching || chat.busy;
    const title = document.createElement('span'); title.textContent = chat.title;
    const date = document.createElement('small'); date.textContent = new Date(chat.updatedAt).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    button.append(title, date); button.title = chat.title;
    button.onclick = () => openConversation(chat.id).catch(e => error(e.message));
    list.append(button);
  }
}
async function refreshHistory() {
  const response = await fetch('/api/history');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  conversations = data.conversations; renderHistory();
}
async function openConversation(id) {
  if (busy || switching) return;
  switching = true; controls();
  try {
    const data = await (await api('/api/open', {}, id)).json();
    sessionId = data.sessionId; rememberSession();
    $('#messages').replaceChildren(); $('#welcome').hidden = data.messages.length > 0;
    for (const item of data.messages) message(item.role, item.text, item.label);
    if (models.some(m => m.model === data.model)) { model.value = data.model; updateEffort(); }
    if ([...effort.options].some(o => o.value === data.effort)) effort.value = data.effort;
    prompt.value = ''; $('#activity').textContent = ''; error(); scroll();
    $('#sidebar').classList.remove('open'); $('#history-toggle').setAttribute('aria-expanded', 'false');
  } finally { switching = false; controls(); }
}
function error(message = '') { $('#error').textContent = message; $('#error').hidden = !message; }
function controls() {
  prompt.disabled = !authenticated || switching;
  send.disabled = !authenticated || busy || switching || !sessionId || !prompt.value.trim() || !model.value;
  send.hidden = busy; stop.hidden = !busy;
  model.disabled = busy || switching || !authenticated;
  effort.disabled = busy || switching || !authenticated || !effort.value;
  $('#new-chat').disabled = busy || switching || !authenticated;
  renderHistory();
}
async function api(path, body, id = sessionId) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Id': id || '' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error((await response.json()).error);
  return response;
}
async function reset() {
  if (busy || switching) return;
  switching = true; controls();
  try {
    sessionId = (await (await api('/api/reset', {})).json()).sessionId; rememberSession();
    $('#messages').replaceChildren(); $('#welcome').hidden = false; prompt.value = ''; $('#activity').textContent = ''; error();
    await refreshHistory();
  } finally { switching = false; controls(); prompt.focus(); }
}
function message(role, text, label) {
  const article = document.createElement('article'); article.className = `message ${role}`;
  const who = document.createElement('div'); who.className = 'who'; who.textContent = role === 'user' ? 'あなた' : `Codex · ${label}`;
  const content = document.createElement('div'); content.className = 'text'; renderText(content, text, role);
  article.append(who, content);
  if (role === 'assistant') {
    const copy = document.createElement('button'); copy.className = 'copy'; copy.textContent = 'コピー';
    copy.onclick = async () => { try { await navigator.clipboard.writeText(content.dataset.raw); copy.textContent = 'コピーしました'; setTimeout(() => copy.textContent = 'コピー', 1500); } catch { error('コピーできませんでした。テキストを選択してコピーしてください。'); } };
    article.append(copy);
  }
  $('#messages').append(article); return content;
}
function scroll() { const view = $('#conversation'); view.scrollTop = view.scrollHeight; }
$('#composer').onsubmit = async event => {
  event.preventDefault();
  if (busy || send.disabled) return;
  const text = prompt.value.trim(), selected = model.value, label = model.selectedOptions[0].textContent;
  busy = true; controls(); error(); $('#welcome').hidden = true;
  message('user', text); prompt.value = ''; $('#activity').textContent = '考えています…'; scroll();
  const items = new Map(); let done = false, output = false;
  try {
    const response = await api('/api/chat', { text, model: selected, ...(effort.value ? { effort: effort.value } : {}) });
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    while (true) {
      const { value, done: ended } = await reader.read();
      if (ended) break;
      buffer += value;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!line) continue;
        const data = JSON.parse(line);
        if (data.type === 'delta' || data.type === 'message') {
          const view = $('#conversation'), nearBottom = view.scrollHeight - view.scrollTop - view.clientHeight < 100;
          if (!items.has(data.id)) items.set(data.id, message('assistant', '', label));
          const content = items.get(data.id);
          renderText(content, data.type === 'message' ? data.text : content.dataset.raw + data.text);
          output = true; $('#activity').textContent = '回答を生成中…'; if (nearBottom) scroll();
        }
        if (data.type === 'error') throw new Error(data.error);
        if (data.type === 'done') {
          done = true;
          if (data.error || data.status === 'failed') throw new Error(data.error || '回答の生成に失敗しました。');
          if (data.status === 'interrupted') $('#activity').textContent = '生成を停止しました。';
          else $('#activity').textContent = output ? '' : 'テキストの回答はありませんでした。';
        }
      }
    }
    if (!done) throw new Error('接続が切れました。もう一度お試しください。');
  } catch (e) { error(e.message); $('#activity').textContent = ''; if (!output && !prompt.value) prompt.value = text; }
  finally { busy = false; stop.disabled = false; controls(); prompt.focus(); await refreshHistory().catch(e => error(e.message)); }
};
prompt.addEventListener('input', controls);
prompt.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); $('#composer').requestSubmit(); } });
stop.onclick = async () => { stop.disabled = true; try { await api('/api/stop', {}); } catch (e) { error(e.message); stop.disabled = false; } };
$('#new-chat').onclick = () => reset().catch(e => error(e.message));
$('#history-toggle').onclick = () => { const open = $('#sidebar').classList.toggle('open'); $('#history-toggle').setAttribute('aria-expanded', String(open)); };
document.querySelectorAll('[data-prompt]').forEach(button => button.onclick = () => { prompt.value = button.dataset.prompt; controls(); prompt.focus(); });
model.onchange = () => { try { localStorage.setItem('codex-chat-model', model.value); } catch {} updateEffort(); };
effort.onchange = () => { try { localStorage.setItem(`codex-chat-effort:${model.value}`, effort.value); } catch {} };
try {
  const response = await fetch('/api/bootstrap'); const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  models = data.models;
  model.replaceChildren(...data.models.map(m => new Option(m.displayName || m.model, m.model)));
  let saved; try { saved = localStorage.getItem('codex-chat-model'); } catch {}
  model.value = data.models.find(m => m.model === saved)?.model || data.models.find(m => m.isDefault)?.model || data.models[0]?.model || '';
  authenticated = data.authenticated && data.models.length > 0;
  updateEffort();
  $('#connection').textContent = authenticated ? '● 接続済み' : '○ 接続の準備が必要です';
  await refreshHistory();
  let active; try { active = localStorage.getItem('codex-chat-active'); } catch {}
  if (conversations.some(chat => chat.id === active)) await openConversation(active);
  else await reset();
  if (!data.authenticated) error('ターミナルで codex login を実行し、ページを再読み込みしてください。');
  else if (!data.models.length) error('利用できるモデルがありません。Codex の設定を確認してください。');
} catch (e) { $('#connection').textContent = '○ 接続できません'; error(e.message); controls(); }
