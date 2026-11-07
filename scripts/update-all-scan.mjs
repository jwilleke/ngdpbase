/**
 * Read-only helpers for `./server.sh update all`.
 *
 * sanitize-pm2   strip a `pm2 jlist` document down to name, cwd, script,
 *                status and watch. The process environment is never copied
 *                to the output.
 * scan-ownership read LaunchAgents, systemd user units and a crontab file
 *                the caller already collected, and report checkouts an
 *                updater script updates, and lines in it that look like a
 *                pin. Pins are never read from a script. Scripts are not
 *                executed.
 *
 * Records are NUL-separated fields, four per record for scan-ownership and
 * five for sanitize-pm2. A field never contains NUL.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// An array opened at the start of a line: NAME=(, NAME+=(, or either after
// declare, typeset, local, readonly or export and their flags.
const ARRAY_OPEN = /^\s*(?:(?:declare|typeset|local|readonly|export)\s+(?:[-+][A-Za-z]+\s+)*)?([A-Za-z_][A-Za-z0-9_]*)\+?=\(\s*(.*)$/;
const SITE_ARRAY
 = /^(SITES|SITE|INSTANCES|INSTANCE|REPOS|REPO|CHECKOUTS|CHECKOUT|TARGETS|TARGET)$|_SITES$/;

// Pins are read only from the update-policy file and a checkout's
// .ngdpbase-update-policy file. An updater script that looks like it holds a
// pin blocks the run, so the pin is moved, not guessed at.
//
// A pin variable: the whole name is PINNED, PINS, EXCLUDE, EXCLUDED, SKIP or
// SKIPPED, starts with one of those and an underscore, or ends in _PINNED,
// _PINS, _EXCLUDE or _SKIP, in any case. THRESHOLD, SPINNER_PID and
// HOLD_SECONDS are not.
const PIN_NAME = /^(?:pinned|pins|exclude|excluded|skip|skipped)(?:_[a-z0-9_]*)?$|_(?:pinned|pins|exclude|skip)$/i;
// Whole words that mark pin wording in a comment, a command name or a sourced file.
const PIN_WORDS = new Set(['pin', 'pins', 'pinned', 'pinning', 'exclude', 'excluded', 'skip', 'skipped', 'hold', 'frozen', 'freeze']);
const DO_NOT_UPDATE = /\bdo\s+not\s+update\b|\bdon'?t\s+update\b/i;
// An assignment anywhere on a line: NAME=, NAME+=, NAME[i]=, also inside a quoted eval string.
const ASSIGN = /(?:^|[\s;&|({"'`])([A-Za-z_][A-Za-z0-9_]*)(?:\[[^\]]*\])?\+?=([^\s;&|)]*)/g;
// A lowercase local flag such as skip=0 or skip=true is a loop flag, not a pin list.
const FLAG_VALUE = /^(?:-?\d+|true|false)?$/;
const DECLARE = /(?:^|[\s;&|({])(?:declare|typeset|local|readonly|export|readarray|mapfile|read|unset)\s+(.*)$/;

function isPinName(name) {
  return PIN_NAME.test(name);
}

function isFlag(name, value) {
  return name === name.toLowerCase() && FLAG_VALUE.test(value);
}

function hasPinWord(text) {
  if (DO_NOT_UPDATE.test(text)) return true;
  return text.toLowerCase().split(/[^a-z0-9]+/).some((word) => PIN_WORDS.has(word));
}

// Why a line reads as a pin, or '' when it does not.
export function pinWording(line) {
  const code = stripInlineComment(line);
  const comment = line.slice(code.length);
  if (comment.startsWith('#!')) {
    // A shebang names an interpreter, not a pin.
  } else if (comment && hasPinWord(comment)) {
    return 'a comment with pin wording';
  }
  for (const match of code.matchAll(ASSIGN)) {
    if (isPinName(match[1]) && !isFlag(match[1], match[2])) return `an assignment to ${match[1]}`;
    if (isPinName(match[2].replace(/["'(]/g, ''))) return `a reference to ${match[2].replace(/["'(]/g, '')}`;
  }
  const declared = code.match(DECLARE);
  if (declared) {
    const rest = declared[1].replace(/\b[a-z_][a-z0-9_]*=(?:-?\d+|true|false)?(?=\s|;|$)/g, ' ');
    const name = (rest.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []).find(isPinName);
    if (name) return `a declaration of ${name}`;
  }
  // A read of an uppercase pin variable ("${PINNED[@]}", $SKIP) means one is set somewhere.
  for (const match of code.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (isPinName(match[1]) && match[1] !== match[1].toLowerCase()) return `a reference to ${match[1]}`;
  }
  const printed = code.match(/\bprintf\s+-v\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (printed && isPinName(printed[1])) return `an assignment to ${printed[1]}`;
  for (const match of code.matchAll(/(?:^|[;&|({]|\b(?:then|do|else)\b)\s*(?:function\s+)?([A-Za-z_][A-Za-z0-9_-]*)(?=\s|\(|$)/g)) {
    if (PIN_WORDS.has(match[1].toLowerCase()) || isPinName(match[1])) return `a command named ${match[1]}`;
  }
  const sourced = code.match(/(?:^|[;&|]\s*|\s)(?:source|\.)\s+(\S+)/);
  if (sourced && hasPinWord(sourced[1])) return `a sourced file named ${sourced[1]}`;
  return '';
}

export function classifyScript(text, scriptPath) {
  const lines = text.split('\n');
  // Each NAME=( or NAME+=( is its own entry, so an append is read like the first list.
  const arrays = [];
  let arrayName = '';
  let arrayLines = [];

  function flushArray() {
    if (!arrayName) return;
    arrays.push([arrayName, arrayLines.join('\n')]);
    arrayName = '';
    arrayLines = [];
  }

  for (const line of lines) {
    if (arrayName) {
      arrayLines.push(line);
      if (stripInlineComment(line).includes(')')) flushArray();
      continue;
    }
    const opened = stripInlineComment(line).match(ARRAY_OPEN);
    if (opened) {
      arrayName = opened[1];
      arrayLines = [opened[2]];
      if (opened[2].includes(')')) flushArray();
    }
  }
  flushArray();

  const records = [];
  let autoCount = 0;
  let arrayAutoCount = 0;
  let incomplete = '';
  const knownArrays = new Set();

  function addAuto(filePath) {
    // A line that runs <checkout>/server.sh update names the checkout, not the file.
    const target = path.basename(filePath) === 'server.sh' ? path.dirname(filePath) : filePath;
    records.push(['path', 'auto', canonPath(target), scriptPath]);
    autoCount += 1;
  }

  for (const [name, body] of arrays) {
    if (!SITE_ARRAY.test(name) || isPinName(name)) continue;
    knownArrays.add(name);
    const paths = extractPaths(body);
    if (paths.length === 0 || /\$[{A-Za-z_]/.test(stripInlineComment(body))) {
      incomplete ||= 'a site list is empty or built from variables';
    }
    for (const filePath of paths) {
      addAuto(filePath);
      arrayAutoCount += 1;
    }
  }

  let updateLinesWithoutPath = 0;
  for (let i = 0; i < lines.length; i++) {
    const why = pinWording(lines[i]);
    if (why) {
      records.push(['note', 'pinword', `${i + 1}: ${why}: ${lines[i].trim().slice(0, 80)}`, scriptPath]);
    }
    const code = stripInlineComment(lines[i]);
    if (/server\.sh\b/.test(code) && /\bupdate\b/.test(code)) {
      const found = extractPaths(code);
      if (found.length === 0) updateLinesWithoutPath += 1;
      for (const filePath of found) addAuto(filePath);
    }
    const loop = unreadableLoop(code, knownArrays);
    if (loop) incomplete ||= loop;
  }

  // A script that runs server.sh update on checkouts it takes from somewhere
  // other than a parsed list has not been read completely.
  if (updateLinesWithoutPath > 0 && arrayAutoCount === 0) {
    incomplete ||= 'it runs server.sh update on a directory taken from a variable, function argument or relative path';
  }
  if (autoCount === 0) incomplete ||= 'no checkout path could be read from it';

  if (incomplete) {
    records.push(['note', 'block', `could not read which checkouts it updates: ${incomplete}`, scriptPath]);
  }
  records.push(['note', 'updater', '', scriptPath]);
  return records;
}

// A for/while loop whose list is not a literal or a parsed site array.
function unreadableLoop(code, knownArrays) {
  if (/\bwhile\b[^;]*\bread\b/.test(code)) return 'it reads checkouts in a while-read loop';
  const loop = code.match(/^\s*for\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+(.*?)\s*(?:;|$)/);
  if (!loop) return '';
  let list = loop[1].replace(/^do\b.*/, '');
  list = list.replace(/"?\$\{([A-Za-z_][A-Za-z0-9_]*)\[[@*]\]\}"?/g, (all, name) => (knownArrays.has(name) ? '' : all));
  if (/[*?[\]$`]/.test(list)) return 'it loops over a glob, command output or variable';
  return '';
}

// Text that runs `server.sh update` itself (a cron line, a unit, a plist
// argument list) is an updater too, not only the scripts it points at.
function collectCandidateFiles(home, xdg, crontabFile) {
  const files = new Set();
  const inline = [];
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
      const strings = xmlStrings(xml);
      const joined = strings.join(' ');
      if (isUpdaterScript(joined, full)) inline.push({ file: full, text: joined });
      for (const value of strings) {
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
      if (isUpdaterScript(text, path.join(dir, name))) inline.push({ file: path.join(dir, name), text });
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
    if (isUpdaterScript(text, 'crontab')) inline.push({ file: 'crontab', text });
    for (const filePath of extractPaths(text)) {
      try {
        if (fs.statSync(filePath).isFile()) files.add(canonPath(filePath));
      } catch {
        // Ignore tokens that are not files.
      }
    }
  }
  return { files: [...files], inline };
}

function scanOwnership(home, xdg, crontabFile) {
  const { files, inline } = collectCandidateFiles(home, xdg, crontabFile);
  for (const entry of inline) {
    for (const record of classifyScript(entry.text, entry.file)) writeFields(record);
  }
  for (const file of files) {
    let text = '';
    try {
      text = readScript(file) || '';
    } catch {
      continue;
    }
    if (!text || !isUpdaterScript(text, file)) continue;
    for (const record of classifyScript(text, file)) writeFields(record);
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
      const list = sanitizePm2(Buffer.concat(chunks).toString('utf8'));
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
    scanOwnership(home, argValue('--xdg'), argValue('--crontab'));
  } else {
    process.stderr.write('usage: update-all-scan.mjs <sanitize-pm2|scan-ownership>\n');
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
