#!/usr/bin/env tsx
/**
 * The caller's context is mandatory, positional, and used (#1399,
 * security-posture P1).
 *
 * P1 says an entry point that decides, records, or acts takes a context, and
 * says why the parameter must not be optional: *"Optional is what makes
 * omission the easy path"* — a flag that gates a mechanism creates two code
 * paths, and the weak one is what everybody runs. `check-permission-subject`
 * already rejects a REBUILT subject; nothing checked for a context that was
 * never asked for, or one that was accepted and dropped.
 *
 * Both shapes were live when this was written. `FileSystemProvider.deletePage`
 * took `_ctx` and resolved the page without it, so a sealed page could not be
 * resolved for deletion; `pageExists` made the context optional while
 * `PageManager.pageExists` requires it.
 *
 * The rules:
 *
 * 1. __No ambient context__ — `AsyncLocalStorage` / `node:async_hooks` in
 *    `src/` or `addons/`. P1 rules it out by name: the call site stops showing
 *    what identity it runs under, so a missing context is invisible at review
 *    instead of a compile error.
 * 2. __No optional identity parameter__ — `ctx?: ActorContext` and friends.
 *    Mandatory and positional, or it is not a door.
 * 3. __No discarded identity parameter__ — `_ctx: ActorContext`. Taking the
 *    context and marking it unused is the same defect as never taking it, with
 *    a signature that claims otherwise.
 * 4. __One identity type__ — a `UserContext` interface must EXTEND
 *    `PermissionSubject`, never restate its fields. `WikiContext`'s copy had
 *    drifted without `privateStoreHandle` and `ParseContext`'s without that and
 *    `ipAddress`; both kept compiling because each carries an index signature,
 *    which turns a missing field into `unknown` rather than an error. That is
 *    the #1173 failure mode, and the compiler cannot be asked to catch it:
 *    `tsconfig.json` excludes every `__tests__` directory, so a type-level
 *    assertion written as a test is never checked at all.
 * 5. __The deciders convert a context, nobody else__ (#2022) — the PDP's
 *    `decide`, `permits` and `holds` and the PIP's page questions take the
 *    caller's context, a `JobContext` included, and turn it into a subject
 *    themselves through `decisionSubject` (`src/context/ActorContext.ts`), the
 *    one conversion. A caller writing `isJobContext(ctx) ?
 *    toPermissionSubject(ctx) : ctx` before asking is a second copy of that
 *    rule, and the copy is what drifts: one that forgot `viaShare` or
 *    `viaProxy` would let a job outrun its ceiling. So each conversion
 *    function appears exactly where {@link CONVERSIONS} says, and nowhere
 *    else outside tests.
 * 6. __No context-free lookup__ (#2018) — PersonManager's `getById`,
 *    `getByIdentifier` and `getByUserIdentifier`, RoleManager's `hasRole`,
 *    `resolveUserRoles` and `getById`, OrganizationManager's `getById` and
 *    `getByFile`, and AssetManager's `getById` take the caller's context first.
 *    The compiler holds `src/` to that, but it does not check add-ons or
 *    tests, and a local interface can still declare the old shape. So a call
 *    with fewer arguments than {@link LOOKUPS} names is the old, context-free
 *    call. A provider's own lookups (`provider.getByIdentifier(id)`) are below
 *    the door and take none.
 *
 * Each allowlist entry states why that site is not the defect. A stale entry
 * fails the run (see `run()`), so the list cannot outlive what it excuses.
 *
 * Run via `npm run lint:context`. Wired into `npm run lint` / `lint:ci` /
 * `.husky/pre-commit`. Exits 1 on any violation.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '..');

const SCAN = ['src', 'addons'];

/** The types that carry who is asking. An optional one of these is the defect. */
const IDENTITY_TYPES = ['ActorContext', 'PermissionSubject', 'JobContext'];

const AMBIENT = /\bAsyncLocalStorage\b|['"]node:async_hooks['"]|['"]async_hooks['"]/;
const OPTIONAL_IDENTITY = new RegExp(`\\b\\w+\\?\\s*:\\s*(${IDENTITY_TYPES.join('|')})\\b`);
const DISCARDED_IDENTITY = new RegExp(`\\b_\\w*\\s*:\\s*(${IDENTITY_TYPES.join('|')})\\b`);
/** `export interface …UserContext {` — a redeclared identity shape unless it extends the subject. */
const USER_CONTEXT_DECL = /^\s*export\s+interface\s+(\w*UserContext)\s*(extends\s+([\w, ]+))?\{/;

/**
 * `file:line-ish` → why this optional identity parameter is not the hazard.
 * Keyed by file; the reason must name every site in it.
 */
const OPTIONAL_ALLOWED: Record<string, string> = {
  'src/providers/VersioningFileProvider.ts':
    'getVersionDirectory and versionTarget are private helpers reached only from writers that pass ctx; both fail CLOSED without one — an encrypted store\'s history is refused rather than read as plaintext (#1415)',
  'src/providers/FileSystemProvider.ts':
    'KNOWN, tracked by #1399: resolvePageInfo and pageExists still take ctx optionally. Making them mandatory means threading a context through movePrivatePage and findPage, which are declared on the Provider interface (src/types/Provider.ts) and implemented three times — the #1399 slice that narrows the doors, not a one-line change. Every caller INSIDE these two providers now passes ctx; this entry covers the signatures only'
};

/** `file` → why a `…UserContext` there is not a second copy of the subject. */
const REDECLARED_ALLOWED: Record<string, string> = {
  'src/parsers/context/ParseContext.ts':
    'ExportedUserContext is a cache PAYLOAD, not a forwarded subject — a deliberate reduction to the three fields a cached parse keyed on, written to disk and read back; extending PermissionSubject would put viaToken and privateStoreHandle in a cache file, which is the opposite of what #1382 wants',
  'addons/calendar/managers/CalendarDataManager.ts':
    'an addon-local VIEWER shape with every field optional, used to decide what the calendar UI shows; it is never handed to a permission door — the addon asks ctx.requirePermission (#1198). An addon cannot extend the host type without importing through dist/ (docs/guides/addons-developer-guide.md)'
};

/** `file` → why a parameter of an identity type is deliberately unused there. */
const DISCARDED_ALLOWED: Record<string, string> = {
  'src/providers/BasePageProvider.ts':
    'an unimplemented base-class stub — getPageUUID exists for providers that do not support it and returns null',
  'src/managers/PageManager.ts':
    'KNOWN, tracked by #1399: isPageDeleted takes ctx and asks provider.isPageDeleted(uuid), which has no context parameter to forward it to. A sealed page\'s trash entry lives in the owner\'s own user-trash catalogue, so the provider door has to take a context before this one can pass it on'
};

/**
 * The functions a context becomes a subject through (#2022), and exactly how
 * many times each file may name one with a call. More is a hand conversion;
 * fewer means the list is stale.
 */
const CONVERSIONS: ReadonlyArray<{ call: RegExp; allowed: Readonly<Record<string, number>> }> = [
  {
    call: /\btoPermissionSubject\s*\(/,
    allowed: {
      'src/context/JobContext.ts': 1, // its declaration
      'src/context/ActorContext.ts': 1 // decisionSubject, the one conversion
    }
  },
  {
    call: /\bdecisionSubject\s*(<[^>]*>\s*)?\(/,
    allowed: {
      'src/context/ActorContext.ts': 1, // its declaration
      'src/security/PolicyDecisionPoint.ts': 1, // decide, permits, holds
      'src/security/PolicyInformationPoint.ts': 1 // the page questions
    }
  }
];

export interface Violation {
  file: string;
  line: number;
  rule: 'ambient-context' | 'optional-identity' | 'discarded-identity' | 'redeclared-identity' | 'hand-conversion' | 'context-free-lookup' | 'stale-allowlist';
  detail: string;
}

/** The managers whose `getById` / `getByFile` are doors (#2018); another manager's `getById` is its own. */
const DOOR_RECEIVER = /(Person|Role|Organization|Asset)Manager|\b(persons|personManager|orgs|organizations|organizationManager|roleManager|roles|assetManager|assets)\b/;

/**
 * The lookups that take the caller's context first (#2018), and how many
 * arguments a call with the context has at least. `receiver`, when given,
 * is what the text before the call must name for it to be the door.
 */
const LOOKUPS: ReadonlyArray<{ method: string; args: number; receiver?: RegExp }> = [
  { method: 'getByIdentifier', args: 2 },
  { method: 'getByUserIdentifier', args: 2 },
  { method: 'resolveUserRoles', args: 2 },
  { method: 'hasRole', args: 3 },
  { method: 'getById', args: 2, receiver: DOOR_RECEIVER },
  { method: 'getByFile', args: 2, receiver: DOOR_RECEIVER }
];

/** The files that hold those doors: their own `this.getById(…)` is the door too. */
const DOOR_FILES = new Set(['src/managers/PersonManager.ts', 'src/managers/RoleManager.ts', 'src/managers/OrganizationManager.ts', 'src/managers/AssetManager.ts']);

/** A provider's lookup, below the door: `provider.x(`, `this.provider.x(`, `requireProvider().x(`. */
const PROVIDER_RECEIVER = /provider\s*(\(\s*\))?\s*!?\s*\??\s*$/i;

/** How many top-level arguments the call whose `(` is at `open` has. Strings and nested brackets are skipped. */
function argumentCount(text: string, open: number): number {
  let depth = 0;
  let count = 0;
  let sawToken = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\'' || ch === '"' || ch === '`') {
      const close = text.indexOf(ch, i + 1);
      i = close === -1 ? text.length : close;
      sawToken = true;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      if (depth > 1) sawToken = true;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return sawToken ? count + 1 : 0;
      continue;
    }
    if (depth === 1 && ch === ',') { count++; continue; }
    if (depth >= 1 && !/\s/.test(ch)) sawToken = true;
  }
  return sawToken ? count + 1 : 0;
}

/**
 * Rule 6 (#2018) over one file's source: each call of a {@link LOOKUPS}
 * method with fewer arguments than its context-first signature.
 */
export function contextFreeLookups(rel: string, source: string): Violation[] {
  const lines = strippedLines(source);
  const text = lines.join('\n');
  const out: Violation[] = [];
  for (const { method, args, receiver } of LOOKUPS) {
    const call = new RegExp(`\\??\\.\\s*${method}\\s*(<[^>()]*>\\s*)?\\(`, 'g');
    for (const match of text.matchAll(call)) {
      const at = match.index ?? 0;
      const before = text.slice(Math.max(0, text.lastIndexOf('\n', at) + 1), at);
      if (PROVIDER_RECEIVER.test(before)) continue;
      if (receiver && !receiver.test(before) && !(DOOR_FILES.has(rel) && /\bthis\s*$/.test(before))) continue;
      const given = argumentCount(text, at + match[0].length - 1);
      if (given >= args) continue;
      out.push({
        file: rel,
        line: text.slice(0, at).split('\n').length,
        rule: 'context-free-lookup',
        detail: `${method} called with ${given} argument(s) — it takes the caller's context first (#2018)`
      });
    }
  }
  return out;
}

/** Strip `//` line comments and block-comment bodies, keeping line numbering. */
function strippedLines(source: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of source.split('\n')) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end === -1) { out.push(''); continue; }
      line = line.slice(end + 2);
      inBlock = false;
    }
    const block = line.indexOf('/*');
    if (block !== -1) {
      const end = line.indexOf('*/', block + 2);
      if (end === -1) { inBlock = true; line = line.slice(0, block); }
      else line = line.slice(0, block) + line.slice(end + 2);
    }
    const lineComment = line.indexOf('//');
    if (lineComment !== -1) line = line.slice(0, lineComment);
    out.push(line);
  }
  return out;
}

function tsFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    let entries: string[];
    try { entries = readdirSync(current); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts') || entry.endsWith('.d.ts')) continue;
      found.push(full);
    }
  };
  walk(dir);
  return found;
}

export function scan(): Violation[] {
  const violations: Violation[] = [];
  const optionalHit = new Set<string>();
  const discardedHit = new Set<string>();
  const redeclaredHit = new Set<string>();
  /** `call index|file` → the lines naming that conversion function. */
  const conversions = new Map<string, number[]>();

  for (const root of SCAN) {
    for (const file of tsFiles(path.join(REPO, root))) {
      const rel = path.relative(REPO, file);
      // This guard names the patterns it bans, so it would flag itself.
      if (rel === 'scripts/check-context-discipline.ts') continue;
      const source = readFileSync(file, 'utf8');
      const lines = strippedLines(source);
      violations.push(...contextFreeLookups(rel, source));

      lines.forEach((line, index) => {
        const at = index + 1;
        CONVERSIONS.forEach(({ call }, i) => {
          if (call.test(line)) conversions.set(`${i}|${rel}`, [...(conversions.get(`${i}|${rel}`) ?? []), at]);
        });
        if (AMBIENT.test(line)) {
          violations.push({
            file: rel, line: at, rule: 'ambient-context',
            detail: 'ambient context is refused by P1 — pass the context positionally'
          });
        }
        if (OPTIONAL_IDENTITY.test(line)) {
          optionalHit.add(rel);
          if (!OPTIONAL_ALLOWED[rel]) {
            violations.push({
              file: rel, line: at, rule: 'optional-identity',
              detail: `optional identity parameter (${line.trim()}) — mandatory and positional, or it is not a door`
            });
          }
        }
        const decl = USER_CONTEXT_DECL.exec(line);
        if (decl) redeclaredHit.add(rel);
        if (decl && !(decl[3] ?? '').includes('PermissionSubject') && !REDECLARED_ALLOWED[rel]) {
          violations.push({
            file: rel, line: at, rule: 'redeclared-identity',
            detail: `${decl[1]} must extend PermissionSubject — an identity shape declared twice drifts, and an index signature hides it (#1173)`
          });
        }
        // A property declaration is storage, not a door's parameter: a private
        // field named `_subject` read back through an accessor is the opposite
        // of discarding the context. Parameters end in `,` or `)`; a property
        // declaration ends in `;`.
        const isPropertyDecl = /^\s*(private|protected|public|readonly|abstract|static)\b[^()]*;\s*$/.test(line);
        if (DISCARDED_IDENTITY.test(line) && !isPropertyDecl) {
          discardedHit.add(rel);
          if (!DISCARDED_ALLOWED[rel]) {
            violations.push({
              file: rel, line: at, rule: 'discarded-identity',
              detail: `identity parameter accepted and discarded (${line.trim()}) — forward it, or drop it from the signature`
            });
          }
        }
      });
    }
  }

  for (const [key, at] of conversions) {
    const [i, rel] = key.split('|');
    if (at.length > (CONVERSIONS[Number(i)].allowed[rel] ?? 0)) {
      for (const line of at) {
        violations.push({
          file: rel, line, rule: 'hand-conversion',
          detail: 'a context converted by hand before asking — pass the context; the PDP and the PIP convert it (#2022)'
        });
      }
    }
  }
  CONVERSIONS.forEach(({ call, allowed }, i) => {
    for (const [rel, count] of Object.entries(allowed)) {
      if ((conversions.get(`${i}|${rel}`)?.length ?? 0) < count) {
        violations.push({
          file: rel, line: 0, rule: 'stale-allowlist',
          detail: `CONVERSIONS allows ${count} ${String(call)} here, and there are fewer — lower or remove it`
        });
      }
    }
  });
  for (const rel of Object.keys(OPTIONAL_ALLOWED)) {
    if (!optionalHit.has(rel)) {
      violations.push({
        file: rel, line: 0, rule: 'stale-allowlist',
        detail: 'OPTIONAL_ALLOWED entry no longer matches anything — remove it'
      });
    }
  }
  for (const rel of Object.keys(REDECLARED_ALLOWED)) {
    if (!redeclaredHit.has(rel)) {
      violations.push({
        file: rel, line: 0, rule: 'stale-allowlist',
        detail: 'REDECLARED_ALLOWED entry no longer matches anything — remove it'
      });
    }
  }
  for (const rel of Object.keys(DISCARDED_ALLOWED)) {
    if (!discardedHit.has(rel)) {
      violations.push({
        file: rel, line: 0, rule: 'stale-allowlist',
        detail: 'DISCARDED_ALLOWED entry no longer matches anything — remove it'
      });
    }
  }

  return violations;
}

function run(): void {
  console.log('Context discipline (#1399)');
  console.log('==========================');
  const violations = scan();
  if (violations.length === 0) {
    console.log('No ambient context, no optional or discarded identity parameter, no redeclared identity shape, no hand conversion of a context, and no context-free lookup in src, addons.');
    return;
  }
  for (const v of violations) {
    console.error(`  ${v.file}${v.line ? `:${v.line}` : ''}  [${v.rule}] ${v.detail}`);
  }
  console.error(`\n${violations.length} violation(s). See docs/security-posture.md P1.`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  run();
}
