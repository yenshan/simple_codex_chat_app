import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

export class Codex extends EventEmitter {
  constructor({ command = process.env.CODEX_BIN || 'codex', args = ['app-server'] } = {}) {
    super();
    this.pending = new Map();
    this.sequence = 0;
    this.child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.on('data', data => process.stderr.write(data));
    this.child.stdin.on('error', error => this.fail(error));
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', () => this.fail(new Error('Codex app-server が終了しました。アプリを再起動してください。')));
    createInterface({ input: this.child.stdout }).on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.method && message.id != null) {
        // This chat client never grants tool permissions automatically.
        this.send({ id: message.id, error: { code: -32601, message: 'Interactive tools are not supported by this chat client.' } });
      } else if (message.id != null) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
      } else if (message.method) {
        this.emit('notification', message);
      }
    });
    this.ready = this.request('initialize', { clientInfo: { name: 'simple_codex_chat', title: 'Codex Chat', version: '1.0.0' } })
      .then(() => this.send({ method: 'initialized', params: {} }));
    this.ready.catch(() => {});
  }
  send(message) {
    if (this.failure) throw this.failure;
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (this.failure) return reject(this.failure);
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} がタイムアウトしました。`));
      }, 60000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  fail(error) {
    if (this.failure) return;
    this.failure = error;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear();
    this.emit('disconnect', error);
  }
  close() { this.child.kill(); }
}
