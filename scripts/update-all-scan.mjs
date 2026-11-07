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

// A pin variable: any name with a pin word in it, other than a site list.
function isPinName(name) {
  return PIN_ARRAY.test(name) && !SITE_ARRAY.test(name);
}

// An array opened at the start of a line: NAME=(, NAME+=(, or either after
// declare, typeset, local, readonly or export and their flags.
const ARRAY_OPEN = /^\s*(?:(?:declare|typeset|local|readonly|export)\s+(?:[-+][A-Za-z]+\s+)*)?([A-Za-z_][A-Za-z0-9_]*)\+?=\(\s*(.*)$/;
// Any assignment anywhere on a line: NAME=, NAME+=, NAME[i]=, and whether it opens an array.
const ASSIGN = /(?:^|[\s;&|({])([A-Za-z_][A-Za-z0-9_]*)(?:\[[^\]]*\])?\+?=(\(?)/g;
// Characters the scan cannot resolve: a variable, command substitution or home directory.
const UNRESOLVED = /[$`~]/;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function classifyScript(text, scriptPath, names) {
  const lines = text.split('\n');
  // Each NAME=( or NAME+=( is its own entry, so an append is read like the first list.
  const arrays = [];
  // Lines that open or continue a pin array; its entries are checked with the array.
  const pinArrayLines = new Set();
  let arrayName = '';
  let arrayLines = [];
  let arrayStart = 0;

  function flushArray(end) {
    if (!arrayName) return;
    arrays.push([arrayName, arrayLines.join('\n')]);
    if (isPinName(arrayName)) for (let k = arrayStart; k <= end; k++) pinArrayLines.add(k);
    arrayName = '';
    arrayLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (arrayName) {
      arrayLines.push(line);
      if (stripInlineComment(line).includes(')')) flushArray(i);
      continue;
    }
    const opened = stripInlineComment(line).match(ARRAY_OPEN);
    if (opened) {
      arrayName = opened[1];
      arrayLines = [opened[2]];
      arrayStart = i;
      if (opened[2].includes(')')) flushArray(i);
    }
  }
  flushArray(lines.length - 1);

  const records = [];
  let autoCount = 0;
  let arrayAutoCount = 0;
  let pinCount = 0;
  let incomplete = '';
  const knownArrays = new Set();

  function addPath(policy, filePath) {
    // A line that runs <checkout>/server.sh update names the checkout, not the file.
    const target = path.basename(filePath) === 'server.sh' ? path.dirname(filePath) : filePath;
    const canon = canonPath(target);
    records.push(['path', policy, canon, scriptPath]);
    if (policy === 'auto') autoCount += 1;
    if (policy === 'pinned') {
      pinCount += 1;
      if (!fs.existsSync(canon)) {
        records.push(['note', 'block', `a pin names ${canon}, which does not exist, so it pins nothing`, scriptPath]);
      }
    }
  }

  // An entry of a pin list that is not a path must be a PM2 app name; any other entry pins nothing.
  function checkPinEntry(name, entry) {
    if (UNRESOLVED.test(entry)) {
      // The scanner cannot resolve a variable, so it cannot tell which checkout this pins.
      records.push(['note', 'block', `pin ${name} lists ${entry}, a variable the scan cannot resolve, so it pins nothing`, scriptPath]);
    } else if (names.includes(entry)) {
      records.push(['name', 'pinned', entry, scriptPath]);
      pinCount += 1;
    } else {
      records.push(['note', 'block', `pin ${name} lists ${entry}, which is not a path or a PM2 app name, so it pins nothing`, scriptPath]);
    }
  }

  // A pin line must be read completely: once its literal paths are out, any $, backtick or ~ left blocks.
  function blockUnresolved(line, paths) {
    let rest = line;
    for (const filePath of paths) rest = rest.split(filePath).join(' ');
    if (UNRESOLVED.test(rest)) {
      records.push(['note', 'block', `pin line "${line.trim().slice(0, 80)}" has a $, backtick or ~ the scan cannot resolve`, scriptPath]);
    }
  }

  for (const [name, body] of arrays) {
    const paths = extractPaths(body);
    if (isPinName(name)) {
      knownArrays.add(name);
      if (paths.length === 0 && /\$[{A-Za-z_]/.test(body)) incomplete ||= 'a pin list is built from variables';
      for (const filePath of paths) addPath('pinned', filePath);
      // Entries that are not paths must be PM2 app names; any other entry pins nothing.
      let rest = body.split('\n').map(stripInlineComment).join(' ');
      rest = rest.slice(0, rest.indexOf(')') < 0 ? undefined : rest.indexOf(')'));
      for (const filePath of paths) rest = rest.split(filePath).join(' ');
      for (const entry of rest.replace(/["']/g, ' ').split(/\s+/).filter(Boolean)) checkPinEntry(name, entry);
      continue;
    }
    if (SITE_ARRAY.test(name)) {
      knownArrays.add(name);
      if (paths.length === 0 || /\$[{A-Za-z_]/.test(stripInlineComment(body))) {
        incomplete ||= 'a site list is empty or built from variables';
      }
      for (const filePath of paths) {
        addPath('auto', filePath);
        arrayAutoCount += 1;
      }
    }
  }

  let updateLinesWithoutPath = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const code = stripInlineComment(line);
    // A pin array's lines were read with the array. Any other assignment to a pin
    // variable is read here in full, or blocks.
    let pinAssignment = pinArrayLines.has(i);
    if (!pinAssignment) {
      for (const assigned of code.matchAll(ASSIGN)) {
        if (!isPinName(assigned[1])) continue;
        pinAssignment = true;
        if (assigned[2] === '(') {
          records.push(['note', 'block', `pin line "${line.trim().slice(0, 80)}" opens a pin array in a form the scan cannot read`, scriptPath]);
          continue;
        }
        // A string value: paths split on spaces, colons or commas; every other word must be a PM2 app name.
        const value = code.slice(assigned.index + assigned[0].length).replace(/[:,]/g, ' ');
        const paths = extractPaths(value);
        for (const filePath of paths) addPath('pinned', filePath);
        let rest = value;
        for (const filePath of paths) rest = rest.split(filePath).join(' ');
        for (const entry of rest.replace(/["';]/g, ' ').split(/\s+/).filter(Boolean)) checkPinEntry(assigned[1], entry);
      }
      const words = code.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
      if (!pinAssignment && /\b(?:readarray|mapfile|read)\b/.test(code) && words.some(isPinName)) {
        pinAssignment = true;
        records.push(['note', 'block', `pin line "${line.trim().slice(0, 80)}" fills a pin variable in a form the scan cannot read`, scriptPath]);
      }
    }
    if (!pinAssignment && PIN_WORD.test(line)) {
      const pinsBefore = pinCount;
      const direct = extractPaths(line);
      for (const filePath of direct) addPath('pinned', filePath);
      blockUnresolved(line, direct);
      if (direct.length === 0) {
        for (let j = i + 1; j < lines.length; j++) {
          if (!/^\s*#/.test(lines[j])) break;
          if (/^\s*#\s*$/.test(lines[j])) continue;
          const continued = extractPaths(lines[j]);
          if (continued.length === 0) break;
          for (const filePath of continued) addPath('pinned', filePath);
          blockUnresolved(lines[j], continued);
        }
      }
      if (/^\s*#/.test(line)) {
        const basenamePins = explicitBasenamePins(line);
        for (const base of basenamePins) {
          records.push(['basename', 'pinned', base, scriptPath]);
          pinCount += 1;
        }
        // Other PM2 app names on the same comment stay pinned too. The
        // "(pinned)" marker adds a basename pin, it does not narrow the line.
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
      // Each pin line must pin something, whatever other pins the script has.
      // Plain prose ("# skip a checkout that has local changes") names nothing, so it
      // blocks only when it has a (pinned) marker, a path or $VAR, or a name in a different case.
      const lower = line.toLowerCase();
      const aimed = /\(\s*pinned\s*\)|\$|\//i.test(line) || names.some((n) => n.length > 0 && lower.includes(n.toLowerCase()));
      if (pinCount === pinsBefore && aimed) {
        records.push(['note', 'block', `pin line "${line.trim().slice(0, 80)}" names no path or PM2 app name`, scriptPath]);
      }
    }
    if (/server\.sh\b/.test(code) && /\bupdate\b/.test(code)) {
      const found = extractPaths(code);
      if (found.length === 0) updateLinesWithoutPath += 1;
      for (const filePath of found) addPath('auto', filePath);
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
  } else if (pinCount === 0 && lines.some((line) => PIN_WORD.test(line))) {
    // Prose pin lines are exempt above, but a script whose only pin talk pins nothing still blocks.
    records.push(['note', 'block', 'a pin comment names no path or PM2 app name', scriptPath]);
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
  const { files, inline } = collectCandidateFiles(home, xdg, crontabFile);
  for (const entry of inline) {
    for (const record of classifyScript(entry.text, entry.file, names)) writeFields(record);
  }
  for (const file of files) {
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
    scanOwnership(home, argValue('--xdg'), argValue('--crontab'), argValue('--names'));
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
