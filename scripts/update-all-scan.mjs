/**
 * Read-only helpers for `./server.sh update all`.
 *
 * sanitize-pm2   strip a `pm2 jlist` document down to name, cwd, script,
 *                status and watch. The process environment is never copied
 *                to the output.
 * scan-ownership read LaunchAgents, systemd user units and a crontab file
 *                the caller already collected, and report checkouts an
 *                updater script updates or pins. Scripts are not executed.
 *
 * Records are NUL-separated fields, four per record for scan-ownership and
 * five for sanitize-pm2. A field never contains NUL.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_SCRIPT = 512 * 1024;
const MAX_PLIST = 1024 * 1024;

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
  return value.replace(/[\0\r\n]/g, ' ').slice(0, 200);
}

function cleanStatus(value) {
  if (typeof value !== 'string') return 'unknown';
  return /^[a-z]{1,32}$/.test(value) ? value : 'unknown';
}

function stripAnsi(text) {
  return String(text).replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function matchingBracket(text, start) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function isProcessList(value) {
  if (!Array.isArray(value)) return false;
  return value.every((item) => item && typeof item === 'object' && !Array.isArray(item) && typeof item.name === 'string');
}

/**
 * A PM2 client newer than the running daemon prints a warning on stdout
 * before `jlist`'s JSON. The warning can contain '[' from a colour code.
 * Take a JSON array of named processes from that stream and ignore the rest.
 * An array of something else, or text that only looks a bit like JSON, is
 * not a process list.
 */
export function extractProcessList(raw) {
  const text = stripAnsi(raw);
  let i = 0;
  while (i < text.length) {
    if (text[i] === '[') {
      const end = matchingBracket(text, i);
      if (end > i) {
        try {
          const parsed = JSON.parse(text.slice(i, end + 1));
          if (isProcessList(parsed)) return parsed;
        } catch {
          // This '[' did not start a process list.
        }
        i = end + 1;
        continue;
      }
    }
    i += 1;
  }
  return null;
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

function decodeXml(text) {
  return text
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function xmlStrings(xml) {
  const found = [];
  const re = /<string>([^<]*)<\/string>/g;
  let match;
  while ((match = re.exec(xml))) found.push(decodeXml(match[1]));
  return found;
}

function readPlistXml(file) {
  const buf = fs.readFileSync(file);
  if (buf.length > MAX_PLIST) throw new Error('too-big');
  const header = buf.subarray(0, 6).toString('utf8');
  if (header === 'bplist' || buf.includes(0)) {
    const converted = spawnSync('plutil', ['-convert', 'xml1', '-o', '-', '--', file], {
      encoding: 'utf8',
      maxBuffer: MAX_PLIST
    });
    if (converted.status !== 0 || !converted.stdout) throw new Error('binary-plist');
    return converted.stdout;
  }
  return buf.toString('utf8');
}

function readScript(file) {
  const info = fs.statSync(file);
  if (!info.isFile() || info.size > MAX_SCRIPT) return null;
  const buf = fs.readFileSync(file);
  if (buf.includes(0)) return null;
  return buf.toString('utf8');
}

function stripInlineComment(line) {
  let quote = '';
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      out += ch;
      if (ch === quote && line[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '#') break;
    out += ch;
  }
  return out;
}

function uncomment(text) {
  return text.split('\n').map(stripInlineComment).join('\n');
}

function extractPaths(text) {
  const found = [];
  const seen = new Set();
  const quoted = /(['"])(\/[^'"\n]+)\1/g;
  let match;
  while ((match = quoted.exec(text))) {
    if (!seen.has(match[2])) {
      seen.add(match[2]);
      found.push(match[2]);
    }
  }
  const bare = /(?:^|[\s=(])(\/[A-Za-z0-9._+\-/@]+)/g;
  while ((match = bare.exec(text))) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      found.push(match[1]);
    }
  }
  return found;
}

function canonPath(filePath) {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function isUpdaterScript(text, filePath) {
  if (path.basename(filePath) === 'server.sh') return false;
  if (text.includes('ngdpbase Server Management Script')) return false;
  const code = uncomment(text).replace(/\\\n/g, ' ');
  return /server\.sh['"]?\)?\s+update\b/.test(code);
}

const SITE_ARRAY = /^(SITES|SITE|INSTANCES|INSTANCE|REPOS|REPO|CHECKOUTS|CHECKOUT|TARGETS|TARGET)$|_SITES$/;
const PIN_ARRAY = /(PIN|PINNED|EXCLUDE|EXCLUDED|SKIP|SKIPPED|HOLD|FREEZE)/i;
const PIN_WORD = /\b(pinned|pin|exclude|excluded|skip|skipped)\b/i;
// A directory basename marked (pinned). The marker binds only that token, not
// every other name on the same comment. At least six characters, so a short
// English word next to "(pinned)" is not a checkout name.
const BASENAME_PIN = /(?:^|[^A-Za-z0-9._-])([A-Za-z0-9][A-Za-z0-9._-]{5,80})\s*\(\s*pinned\s*\)/gi;

function explicitBasenamePins(line) {
  const found = [];
  const seen = new Set();
  const re = new RegExp(BASENAME_PIN.source, 'gi');
  let match;
  while ((match = re.exec(line))) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      found.push(match[1]);
    }
  }
  return found;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function classifyScript(text, scriptPath, names) {
  const lines = text.split('\n');
  const arrays = new Map();
  let arrayName = '';
  let arrayLines = [];

  function flushArray() {
    if (!arrayName) return;
    arrays.set(arrayName, arrayLines.join('\n'));
    arrayName = '';
    arrayLines = [];
  }

  for (const line of lines) {
    if (arrayName) {
      arrayLines.push(line);
      if (stripInlineComment(line).includes(')')) flushArray();
      continue;
    }
    const opened = stripInlineComment(line).match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=\(\s*(.*)$/);
    if (opened) {
      arrayName = opened[1];
      arrayLines = [opened[2]];
      if (opened[2].includes(')')) flushArray();
    }
  }
  flushArray();

  const records = [];
  let autoCount = 0;
  let pinCount = 0;
  let incomplete = false;

  function addPath(policy, filePath) {
    const canon = canonPath(filePath);
    records.push(['path', policy, canon, scriptPath]);
    if (policy === 'auto') autoCount += 1;
    if (policy === 'pinned') pinCount += 1;
  }

  for (const [name, body] of arrays) {
    const paths = extractPaths(body);
    if (PIN_ARRAY.test(name) && !SITE_ARRAY.test(name)) {
      if (paths.length === 0 && /\$[{A-Za-z_]/.test(body)) incomplete = true;
      for (const filePath of paths) addPath('pinned', filePath);
      continue;
    }
    if (SITE_ARRAY.test(name)) {
      if (paths.length === 0 || /\$[{A-Za-z_]/.test(stripInlineComment(body))) incomplete = true;
      for (const filePath of paths) addPath('auto', filePath);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (PIN_WORD.test(line)) {
      const direct = extractPaths(line);
      for (const filePath of direct) addPath('pinned', filePath);
      if (direct.length === 0) {
        for (let j = i + 1; j < lines.length; j++) {
          if (!/^\s*#/.test(lines[j])) break;
          if (/^\s*#\s*$/.test(lines[j])) continue;
          const continued = extractPaths(lines[j]);
          if (continued.length === 0) break;
          for (const filePath of continued) addPath('pinned', filePath);
        }
      }
      if (/^\s*#/.test(line)) {
        const basenamePins = explicitBasenamePins(line);
        for (const base of basenamePins) {
          records.push(['basename', 'pinned', base, scriptPath]);
          pinCount += 1;
        }
        // A "(pinned)" basename owns this comment. Other names listed beside
        // it are not pins. A comment with no such marker can still name one
        // PM2 app ("Accounting Dev is pinned").
        if (basenamePins.length === 0) {
          const comment = line.replace(/^\s*#\s?/, '');
          for (const appName of names) {
            if (appName.length < 6) continue;
            const bound = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(appName)}([^A-Za-z0-9]|$)`);
            if (bound.test(comment)) {
              records.push(['name', 'pinned', appName, scriptPath]);
              pinCount += 1;
            }
          }
        }
      }
    }
    const code = stripInlineComment(line);
    if (/server\.sh\b/.test(code) && /\bupdate\b/.test(code)) {
      for (const filePath of extractPaths(code)) addPath('auto', filePath);
    }
  }

  const pinMentioned = lines.some((line) => PIN_WORD.test(line));
  if (incomplete || (pinMentioned && pinCount === 0)) {
    const why = incomplete ? 'incomplete-sites' : 'ambiguous-pin';
    records.push(['note', 'block', why, scriptPath]);
  }
  records.push(['note', 'updater', '', scriptPath]);
  return records;
}

function collectCandidateFiles(home, xdg, crontabFile) {
  const files = new Set();
  const plistDirs = [
    path.join(home, 'Library', 'LaunchAgents'),
    path.join(home, 'Library', 'LaunchDaemons')
  ];
  for (const dir of plistDirs) {
    if (!fs.existsSync(dir)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      process.stderr.write(`warn: could not read ${dir}\n`);
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.plist')) continue;
      const full = path.join(dir, name);
      let xml = '';
      try {
        xml = readPlistXml(full);
      } catch {
        process.stderr.write(`warn: skipped unreadable plist ${name}\n`);
        continue;
      }
      for (const value of xmlStrings(xml)) {
        if (!value.startsWith('/') || value.includes('\n')) continue;
        try {
          if (fs.statSync(value).isFile()) files.add(canonPath(value));
        } catch {
          // Not a file on this machine.
        }
      }
    }
  }

  const unitDirs = [path.join(home, '.config', 'systemd', 'user')];
  if (xdg && xdg !== path.join(home, '.config')) unitDirs.push(path.join(xdg, 'systemd', 'user'));
  for (const dir of unitDirs) {
    if (!fs.existsSync(dir)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.service') && !name.endsWith('.timer')) continue;
      let text = '';
      try {
        text = readScript(path.join(dir, name)) || '';
      } catch {
        continue;
      }
      for (const filePath of extractPaths(text)) {
        try {
          if (fs.statSync(filePath).isFile()) files.add(canonPath(filePath));
        } catch {
          // Ignore tokens that are not files.
        }
      }
    }
  }

  if (crontabFile && fs.existsSync(crontabFile)) {
    let text = '';
    try {
      text = readScript(crontabFile) || '';
    } catch {
      text = '';
    }
    for (const filePath of extractPaths(text)) {
      try {
        if (fs.statSync(filePath).isFile()) files.add(canonPath(filePath));
      } catch {
        // Ignore tokens that are not files.
      }
    }
  }
  return [...files];
}

function readNames(file) {
  if (!file) return [];
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return text.split('\n').map((line) => line.trim()).filter((line) => line && !line.includes('\0'));
}

function scanOwnership(home, xdg, crontabFile, namesFile) {
  const names = readNames(namesFile);
  for (const file of collectCandidateFiles(home, xdg, crontabFile)) {
    let text = '';
    try {
      text = readScript(file) || '';
    } catch {
      continue;
    }
    if (!text || !isUpdaterScript(text, file)) continue;
    for (const record of classifyScript(text, file, names)) writeFields(record);
  }
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return '';
  return process.argv[index + 1] || '';
}

function main() {
  const command = process.argv[2];
  if (command === 'sanitize-pm2') {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      const list = extractProcessList(Buffer.concat(chunks).toString('utf8'));
      if (!list) {
        process.stderr.write('pm2-json-unusable\n');
        process.exit(1);
      }
      emitProcesses(list);
    });
  } else if (command === 'scan-ownership') {
    const home = argValue('--home');
    if (!home || !home.startsWith('/')) {
      process.stderr.write('scan-ownership needs --home\n');
      process.exit(1);
    }
    scanOwnership(home, argValue('--xdg'), argValue('--crontab'), argValue('--names'));
  } else {
    process.stderr.write('usage: update-all-scan.mjs <sanitize-pm2|scan-ownership>\n');
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
