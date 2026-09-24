import { fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backendScript = fileURLToPath(new URL('../server.js', import.meta.url));
const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const viteArgs = process.argv.slice(2);
const portFlag = viteArgs.indexOf('--port');
const vitePort = Number(portFlag >= 0 ? viteArgs[portFlag + 1] : viteArgs.find(arg => arg.startsWith('--port='))?.slice(7)) || 5173;
const backend = fork(backendScript, {
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  env: {
    ...process.env,
    DEV_ORIGINS: process.env.DEV_ORIGINS || `http://127.0.0.1:${vitePort},http://localhost:${vitePort}`,
  },
});
let web;
let stopping = false;
let backendClosed = false;
let webClosed = false;

function finishIfStopped() {
  if (stopping && backendClosed && (!web || webClosed)) process.exit(process.exitCode ?? 0);
}

function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  web?.kill(signal);
  backend.kill(signal);
  setTimeout(() => process.exit(process.exitCode ?? 0), 5000);
  finishIfStopped();
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
backend.on('close', () => { backendClosed = true; finishIfStopped(); });
backend.on('exit', (code, signal) => {
  if (stopping) return;
  console.error(`Codex Chat APIが終了しました（${code ?? signal}）。`);
  process.exitCode = code || 1;
  stop();
});

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Codex app-serverの起動がタイムアウトしました。')), 30000);
    backend.on('message', message => {
      if (message?.type !== 'ready') return;
      clearTimeout(timer);
      resolve();
    });
    backend.once('error', error => { clearTimeout(timer); reject(error); });
    backend.once('exit', (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`Codex Chat APIの起動に失敗しました（${code ?? signal}）。`));
    });
  });
  if (!stopping) {
    web = spawn(process.execPath, [viteCli, ...viteArgs], { stdio: 'inherit' });
    web.on('error', error => {
      console.error(`Viteを起動できません: ${error.message}`);
      process.exitCode = 1;
      stop();
    });
    web.on('exit', (code, signal) => {
      if (stopping) return;
      process.exitCode = code ?? 1;
      if (signal) console.error(`Viteが終了しました（${signal}）。`);
      stop();
    });
    web.on('close', () => { webClosed = true; finishIfStopped(); });
  }
} catch (error) {
  if (!stopping) {
    console.error(error.message);
    process.exitCode = 1;
    stop();
  }
}
