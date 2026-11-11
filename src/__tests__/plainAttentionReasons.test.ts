/**
 * #2354 — every reason a manager can show in the dashboard's "needs attention" and
 * "not working" boxes is in plain words: no issue number, setting name, environment
 * variable, file path, or "see the log". The developer detail is logged beside the
 * call, not shown.
 *
 * The scan reads each call to markNeedsAttention / markDegraded / markFailed in
 * src and addons, and each `reason:` a getManagerStatus() returns, collects the
 * string pieces of its reason (following a local variable to where it is built),
 * and checks them. Reasons built in a wrapper (OidcManager.refuse,
 * DatabaseManager.markUnavailable and fault) are scanned at the wrapper's call
 * sites (EXTRA_SOURCES); the rest are exported constants and functions checked
 * directly below.
 *
 * A `${…}` slot in a scanned reason must be a count or a plural choice: anything
 * else (an error message, a name, a path) would print developer text on the
 * dashboard, and the test fails on it.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BACKUP_KEY_MISSING_PLAIN, backupKeyNotSaved, envKeysChanged, sharedFoldersKeyNotSaved, backupHealthPlain } from '../managers/BackupManager';
import { SEND_FAILING_REASON } from '../managers/EmailManager';
import { PDF_UNAVAILABLE_REASON } from '../managers/ExportManager';
import { legacyStoreKeysReason } from '../utils/legacyStoreKeys';
import { STAGED_RESTORE_FIX, stagedRestoreNotApplied, UNUSABLE_FOLDER_REASON } from '../utils/plainAttention';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** What a home user must never be shown. */
const BANNED: Array<[string, RegExp]> = [
  ['an issue number', /#\d/],
  ['a setting name', /ngdpbase\./i],
  ['an environment variable', /NGDPBASE_/],
  ['a docs path', /docs\//],
  ['a file path', /(?:^|[\s(])(?:\.{1,2}\/|\/)[\w.-]+|[\w-]+\/[\w.-]+\.\w{1,5}\b|\b\w+\.(?:json|env|db|ts|js|ejs|md|ya?ml)\b|\*\.\w+/],
  ['the log', /\blogs?\b/i],
  ['JSON', /[{}]|\bJSON\b/i]
];

function violations(raw: string): string[] {
  // A template's ${...} slots are code, not words; they are limited to counts and plural choices by badSlots.
  const text = raw.replace(/\$\{[^}]*\}/g, '');
  return BANNED.filter(([, re]) => re.test(text)).map(([what]) => what);
}

/** The index of the `}` closing the `${` whose body starts at `from`. */
function slotEnd(src: string, from: number): number {
  let depth = 1;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') i++;
    else if (c === "'" || c === '"') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
    } else if (c === '`') {
      for (i++; i < src.length && src[i] !== '`'; i++) {
        if (src[i] === '\\') i++;
        else if (src[i] === '$' && src[i + 1] === '{') i = slotEnd(src, i + 2);
      }
    } else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return src.length;
}

/** Every `${…}` expression in the template literals of `src`, nested ones too. */
function slotsOf(src: string): string[] {
  const out: string[] = [];
  for (let i = src.indexOf('${'); i >= 0; i = src.indexOf('${', i + 1)) {
    const end = slotEnd(src, i + 2);
    out.push(src.slice(i + 2, end).trim());
  }
  return out;
}

/** A slot that prints a number, or chooses between words by one. Anything else could print developer text. */
const WORDS = String.raw`(?:'[^']*'|"[^"]*"|`+'`[^`]*`'+String.raw`)`; // a string literal; a template's own slots are checked on their own
const PLAIN_SLOT = new RegExp(String.raw`^(?:[\w.]+\.length|[\w.]*\b(?:total|count|n|\w+Skipped|\w+Refused)|localTime\([\w.]+\)|[\w.]+(?:\.length)?\s*(?:===|!==|>|<)\s*\d+\s*\?\s*${WORDS}\s*:\s*${WORDS}|[\w.\s=!<>]+\?\s*${WORDS}\s*:\s*${WORDS})$`);

/** Slots that are fixed words, not input: named per file so a new one has to be argued for. */
const FIXED_WORDS: Array<[string, string]> = [
  ['pageNotes.ts', 'roots.kind'], // 'footnotes' or 'comments'
  ['ConsentManager.ts', 'id'], // the page's own name
  ['ConsentManager.ts', 'fix'], // a sentence written just above
  ['AuthManager.ts', 'needs'], // the sentence written just above (#2367)
  ['AuthManager.ts', 'IN_SERVER_SETTINGS'] // the shared server-side wording
];

function badSlots(src: string, where: string): string[] {
  // OidcManager's wrapper puts the cause in `plain`, which is scanned at each refuse() call.
  return slotsOf(src).filter((e) => !PLAIN_SLOT.test(e)
    && !(where.includes('OidcManager.ts') && e === 'plain')
    && !FIXED_WORDS.some(([file, slot]) => where.includes(file) && e === slot));
}

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (['__tests__', 'node_modules', 'dist'].includes(e.name)) return [];
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

/** The top-level arguments of the call whose `(` is at `open`. */
function argsAt(text: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = open + 1;
  let quote = '';
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      depth--;
      if (depth === 0) {
        args.push(text.slice(start, i).trim());
        return args;
      }
    } else if (c === ',' && depth === 1) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  return args;
}

/** The text of every quoted piece in `expr`, template pieces included. */
function literals(expr: string): string[] {
  return [...expr.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
}

interface Reason { where: string; text: string; source: string }

/** Pieces of a reason that are built outside the marking call. */
const EXTRA_SOURCES: Array<{ file: string; call: string; arg: number }> = [
  { file: 'src/managers/ConsentManager.ts', call: 'this.problems.set(', arg: 1 },
  { file: 'src/managers/MediaManager.ts', call: 'reasons.push(', arg: 0 },
  // Wrappers whose plain-words argument is shown: the argument at every call.
  { file: 'src/managers/OidcManager.ts', call: 'this.refuse(', arg: 1 },
  { file: 'src/managers/DatabaseManager.ts', call: 'this.markUnavailable(', arg: 1 }
];

/** A statement that builds shown words, from its start to the end of the statement. */
const EXTRA_STATEMENTS: Array<{ file: string; start: string }> = [
  { file: 'src/managers/DatabaseManager.ts', start: 'const plain = cause' }
];

const MARKERS = /(?<![\w.])(?:this\.|this\.state\.)(markNeedsAttention|markDegraded|markFailed)\(/g;

function collect(): { reasons: Reason[]; unresolved: string[] } {
  const reasons: Reason[] = [];
  const unresolved: string[] = [];
  const files = [...walk(path.join(ROOT, 'src')), ...(fs.existsSync(path.join(ROOT, 'addons')) ? walk(path.join(ROOT, 'addons')) : [])]
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'));
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    for (const m of text.matchAll(MARKERS)) {
      const line = text.slice(0, m.index).split('\n').length;
      const first = argsAt(text, m.index + m[0].length - 1)[0] ?? '';
      // A reason passed on, not built: the manager that builds it is scanned.
      if (first === 'reason' && /markNeedsAttention: \(reason\)/.test(text.slice(Math.max(0, m.index - 80), m.index + 80))) continue;
      let pieces = literals(first);
      if (/^[A-Za-z_]\w*$/.test(first)) {
        // A local variable: its declaration, up to the statement's end.
        const decl = text.slice(0, m.index).lastIndexOf(`const ${first}`);
        if (decl >= 0) pieces = literals(text.slice(decl, text.indexOf(';\n', decl)));
        else pieces = [];
      }
      reasons.push({ where: `${rel}:${line}`, text: pieces.join(' '), source: /^[A-Za-z_]\w*$/.test(first) ? text.slice(text.lastIndexOf(`const ${first}`, m.index), text.indexOf(';\n', text.lastIndexOf(`const ${first}`, m.index))) : first });
      if (pieces.length === 0) unresolved.push(`${rel}:${line} ${first}`);
    }
  }
  for (const extra of EXTRA_SOURCES) {
    const text = fs.readFileSync(path.join(ROOT, extra.file), 'utf8');
    let at = text.indexOf(extra.call);
    let found = 0;
    while (at >= 0) {
      const arg = argsAt(text, at + extra.call.length - 1)[extra.arg] ?? '';
      reasons.push({ where: `${extra.file} ${extra.call}`, text: literals(arg).join(' '), source: arg });
      found++;
      at = text.indexOf(extra.call, at + 1);
    }
    expect(found).toBeGreaterThan(0);
  }
  for (const st of EXTRA_STATEMENTS) {
    const text = fs.readFileSync(path.join(ROOT, st.file), 'utf8');
    const at = text.indexOf(st.start);
    expect(at).toBeGreaterThan(0);
    const source = text.slice(at, text.indexOf(';\n', at));
    reasons.push({ where: `${st.file} ${st.start}`, text: literals(source).join(' '), source });
  }
  // A reason a manager returns from getManagerStatus() itself (the add-ons'): follow it to where it is set.
  let statuses = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/state: '(?:degraded|failed)'[^}]*?reason: ([\w.]+|`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g)) {
      statuses++;
      const rel = path.relative(ROOT, file);
      let source = m[1];
      if (m[1].startsWith('this.')) {
        // Every assignment to that field; an identifier on the right is the `const` it names.
        const field = m[1].replace(/\./g, '\\.');
        source = [...text.matchAll(new RegExp(`${field} = ([^;]+);`, 'g'))]
          .map((a) => (/^[A-Za-z_]\w*$/.test(a[1]) ? text.slice(text.indexOf(`const ${a[1]} =`), text.indexOf(';\n', text.indexOf(`const ${a[1]} =`))) : a[1]))
          .join('\n');
      }
      reasons.push({ where: `${rel} getManagerStatus reason: ${m[1]}`, text: literals(source).join(' '), source });
      if (literals(source).length === 0) unresolved.push(`${rel} getManagerStatus reason: ${m[1]} (no words found)`);
    }
  }
  expect(statuses).toBeGreaterThanOrEqual(2); // the Forms and Calendar add-ons
  return { reasons, unresolved };
}

describe('#2354 every dashboard reason is in plain words', () => {
  const { reasons, unresolved } = collect();

  test('the scan finds the call sites', () => {
    expect(reasons.length).toBeGreaterThan(40);
  });

  test('every call is read: a reason built elsewhere is one of the known helpers', () => {
    // Each of these is built by an exported helper or a method scanned through EXTRA_SOURCES, and checked below.
    const allowed = /ConsentManager\.ts:\d+ reason|MediaManager\.ts:\d+ reasons\.join|DatabaseManager\.ts:\d+ (reason|plain)|ConfigurationManager\.ts:\d+ legacyStoreKeysReason|BackupManager\.ts:\d+ (reminder|BACKUP_KEY_MISSING_PLAIN|plain)|EmailManager\.ts:\d+ SEND_FAILING_REASON|ExportManager\.ts:\d+ PDF_UNAVAILABLE_REASON|BaseManager\.ts:\d+ (UNUSABLE_FOLDER_REASON|stagedRestoreNotApplied)|AttachmentManager\.ts:\d+ stagedRestoreNotApplied|PolicyEvaluator\.ts/;
    expect(unresolved.filter((u) => !allowed.test(u))).toEqual([]);
  });

  test('no reason has an issue number, setting, variable, path, JSON or "log" in it', () => {
    const bad = reasons
      .filter((r) => !r.where.includes('PolicyEvaluator.ts')) // #2350's, tested with it
      .map((r) => ({ where: r.where, text: r.text, found: violations(r.text) }))
      .filter((r) => r.found.length > 0);
    expect(bad).toEqual([]);
  });

  test('a ${…} slot in a shown reason is a count or a plural choice, never developer text', () => {
    const bad = reasons.map((r) => ({ where: r.where, slots: badSlots(r.source, r.where) })).filter((r) => r.slots.length > 0);
    expect(bad).toEqual([]);
  });

  test('the slot rule would catch an error message in a reason', () => {
    expect(badSlots('`Could not start: ${err.message}`', 'X.ts')).toEqual(['err.message']);
    expect(badSlots('`Failed: ${n.length === 1 ? err.message : \'\'}`', 'X.ts')).toEqual(["n.length === 1 ? err.message : ''"]);
    expect(badSlots('`${n.length}`'+' ${x === 1 ? \'a\' : err.message}', 'X.ts')).toEqual(["x === 1 ? 'a' : err.message"]);
    expect(badSlots('`${n.length} of ${total} files${n.length === 1 ? \' is\' : \' are\'}`', 'X.ts')).toEqual([]);
  });

  test('the exported reasons and the text built by helpers are plain too', () => {
    const shown = [
      BACKUP_KEY_MISSING_PLAIN,
      backupKeyNotSaved(),
      sharedFoldersKeyNotSaved(),
      envKeysChanged({ added: ['NGDPBASE_SOMETHING'], removed: ['NGDPBASE_OTHER', 'NGDPBASE_THIRD'] }),
      backupHealthPlain({ failure: { reason: 'EACCES /data/backups', at: '2026-01-02T03:04:05Z' } as never, lastGood: null }),
      backupHealthPlain({ failure: null, lastGood: { filename: 'x.json', at: '2026-01-02T03:04:05Z', size: 1, location: '/data' } }),
      SEND_FAILING_REASON,
      PDF_UNAVAILABLE_REASON,
      legacyStoreKeysReason([{ key: 'ngdpbase.stores.default.encrypt', kind: 'default', setting: 'encrypt', message: 'x' }]),
      legacyStoreKeysReason([
        { key: 'ngdpbase.stores.a.owner', kind: 'a', setting: 'owner', message: 'x' },
        { key: 'ngdpbase.stores.b.owner', kind: 'b', setting: 'owner', message: 'x' }
      ]),
      stagedRestoreNotApplied('the attached files'),
      UNUSABLE_FOLDER_REASON
    ];
    for (const text of shown) expect({ text, found: violations(text) }).toEqual({ text, found: [] });
  });

  test('a link to where it is fixed points inside the app', () => {
    expect(STAGED_RESTORE_FIX.fixUrl).toMatch(/^\/admin\//);
  });

  test('the scan would catch the wording it forbids', () => {
    for (const bad of ['see the server log', 'Set ngdpbase.application.base-url', 'NGDPBASE_BACKUP_KEY is not set', 'closed (#1723)', 'in ./data/x.json', 'see docs/guides/x', 'in /var/data']) {
      expect(violations(bad).length).toBeGreaterThan(0);
    }
    for (const fine of ['Backups are not encrypted. This is set in the server\'s settings, outside this page.', 'Choose yes/no for each', 'over https, not plain http']) {
      expect(violations(fine)).toEqual([]);
    }
  });
});
