/**
 * Read-only helper for `./server.sh update all`.
 *
 * sanitize-pm2   strip a `pm2 jlist` document down to name, cwd, script,
 *                status and watch. The process environment is never copied
 *                to the output.
 *
 * Records are NUL-separated fields, five per record. A field never contains NUL.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

function writeFields(fields) {
  for (const field of fields) {
    const text = String(field ?? '').replace(/\0/g, '');
    process.stdout.write(text);
    process.stdout.write('\0');
  }
}

function cleanPath(value) {
  if (typeof value !== 'string') return '';
  if (value.includes('\0') || value.includes('\n') || value.includes('\r')) return '';
  return value;
}

function cleanName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\0\r\n\x1e]/g, ' ').trim().slice(0, 200);
}

function cleanStatus(value) {
  if (typeof value !== 'string') return 'unknown';
  return /^[a-z]{1,32}$/.test(value) ? value : 'unknown';
}

function sanitizePm2(raw) {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed;
}

function emitProcesses(list) {
  const capped = list.slice(0, 100);
  for (const proc of capped) {
    if (!proc || typeof proc !== 'object') continue;
    const env = proc.pm2_env && typeof proc.pm2_env === 'object' ? proc.pm2_env : {};
    const cwd = cleanPath(env.pm_cwd) || cleanPath(env.PWD);
    const script = cleanPath(env.pm_exec_path);
    writeFields([
      cleanName(proc.name),
      cwd,
      script,
      cleanStatus(env.status),
      env.watch === true ? '1' : '0'
    ]);
  }
  if (list.length > capped.length) {
    process.stderr.write('warn: pm2 list truncated to 100 processes\n');
  }
}

function main() {
  const command = process.argv[2];
  if (command === 'sanitize-pm2') {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      const list = sanitizePm2(Buffer.concat(chunks).toString('utf8'));
      if (!list) {
        process.stderr.write('pm2-json-unusable\n');
        process.exit(1);
      }
      emitProcesses(list);
    });
  } else {
    process.stderr.write('usage: update-all-scan.mjs sanitize-pm2\n');
    process.exit(2);
  }
}

// Compare real paths: a checkout reached through a symlink passes a symlinked
// argv[1], while import.meta.url is always the real file.
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    process.stderr.write(`error: cannot resolve ${process.argv[1]}\n`);
    process.exit(1);
  }
}

if (isMain()) {
  main();
}
