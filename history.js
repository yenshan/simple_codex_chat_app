import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export class History {
  constructor(path) {
    this.path = path;
    this.sessions = new Map();
    this.queue = Promise.resolve();
    this.ready = this.load();
    this.ready.catch(() => {});
  }
  async load() {
    if (!this.path) return;
    try {
      const entries = JSON.parse(await readFile(this.path, 'utf8'));
      for (const [id, session] of entries) this.sessions.set(id, { ...session, busy: false, turnId: null, loaded: false });
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  save() {
    if (!this.path) return Promise.resolve();
    const snapshot = JSON.stringify([...this.sessions].filter(([, s]) => s.messages.length).map(([id, s]) => [id, {
      threadId: s.threadId, messages: s.messages, title: s.title, updatedAt: s.updatedAt, model: s.model, effort: s.effort,
    }]));
    const write = async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path + '.tmp', snapshot, { mode: 0o600 });
      await rename(this.path + '.tmp', this.path);
    };
    this.queue = this.queue.catch(() => {}).then(write);
    return this.queue;
  }
}
