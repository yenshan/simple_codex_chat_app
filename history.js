import { readFile, readdir, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

export class History {
  constructor(path) {
    this.path = path;
    this.directory = path ? join(dirname(path), basename(path, extname(path))) : null;
    this.sessions = new Map();
    this.saved = new Map();
    this.queue = Promise.resolve();
    this.ready = this.load();
    this.ready.catch(() => {});
  }
  file(id) {
    return join(this.directory, `${encodeURIComponent(id)}.json`);
  }
  async load() {
    if (!this.path) return;
    let files;
    try { files = await readdir(this.directory); }
    catch (error) { if (error.code !== 'ENOENT') throw error; files = []; }
    for (const file of files.filter(name => name.endsWith('.json'))) {
      const id = decodeURIComponent(file.slice(0, -5));
      const raw = await readFile(join(this.directory, file), 'utf8');
      this.sessions.set(id, { ...JSON.parse(raw), busy: false, turnId: null, loaded: false });
      this.saved.set(id, raw);
    }
    let legacy;
    try { legacy = JSON.parse(await readFile(this.path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!legacy) return;
    for (const [id, session] of legacy) {
      if (!this.sessions.has(id)) this.sessions.set(id, { ...session, busy: false, turnId: null, loaded: false });
    }
    await this.save();
    await rename(this.path, `${this.path}.migrated-${Date.now()}`);
  }
  save() {
    if (!this.path) return Promise.resolve();
    const snapshot = new Map([...this.sessions].filter(([, s]) => s.messages.length).map(([id, s]) => [id, JSON.stringify({
      threadId: s.threadId, messages: s.messages, title: s.title, updatedAt: s.updatedAt, model: s.model, effort: s.effort,
    })]));
    const write = async () => {
      await mkdir(this.directory, { recursive: true });
      for (const [id, data] of snapshot) {
        if (this.saved.get(id) === data) continue;
        const file = this.file(id);
        await writeFile(file + '.tmp', data, { mode: 0o600 });
        await rename(file + '.tmp', file);
        this.saved.set(id, data);
      }
      for (const id of this.saved.keys()) {
        if (snapshot.has(id)) continue;
        try { await unlink(this.file(id)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        this.saved.delete(id);
      }
    };
    this.queue = this.queue.catch(() => {}).then(write);
    return this.queue;
  }
}
