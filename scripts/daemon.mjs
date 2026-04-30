import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const logPath = path.join(projectRoot, 'next-dev.log');
const pidPath = path.join(projectRoot, 'dev.pid');

// Truncate log (with retries in case another process holds it)
for (let i = 0; i < 5; i++) {
  try {
    fs.writeFileSync(logPath, `[daemon] spawning next dev at ${new Date().toISOString()}\n`);
    break;
  } catch (e) {
    if (i === 4) throw e;
    await new Promise((r) => setTimeout(r, 500));
  }
}

const out = fs.openSync(logPath, 'a');
const err = fs.openSync(logPath, 'a');

const nextBin = path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

const child = spawn(process.execPath, [nextBin, 'dev'], {
  cwd: projectRoot,
  detached: true,
  stdio: ['ignore', out, err],
  env: { ...process.env, FORCE_COLOR: '0' },
  windowsHide: true,
});

fs.writeFileSync(pidPath, String(child.pid));
child.unref();
console.log('spawned next dev with pid', child.pid);
