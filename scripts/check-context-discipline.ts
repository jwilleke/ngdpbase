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
 * Three rules:
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

/** `file` → why a parameter of an identity type is deliberately unused there. */
const DISCARDED_ALLOWED: Record<string, string> = {
  'src/providers/BasePageProvider.ts':
    'unimplemented base-class stubs — getPageUUID and restoreVersion exist for providers that do not support them and throw or return null',
  'src/managers/PageManager.ts':
    'KNOWN, tracked by #1399: isPageDeleted takes ctx and asks provider.isPageDeleted(uuid), which has no context parameter to forward it to. A sealed page\'s trash entry lives in the owner\'s own user-trash catalogue, so the provider door has to take a context before this one can pass it on'
};

export interface Violation {
  file: string;
  line: number;
  rule: 'ambient-context' | 'optional-identity' | 'discarded-identity' | 'stale-allowlist';
  detail: string;
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

  for (const root of SCAN) {
    for (const file of tsFiles(path.join(REPO, root))) {
      const rel = path.relative(REPO, file);
      // This guard names the patterns it bans, so it would flag itself.
      if (rel === 'scripts/check-context-discipline.ts') continue;
      const lines = strippedLines(readFileSync(file, 'utf8'));

      lines.forEach((line, index) => {
        const at = index + 1;
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
        if (DISCARDED_IDENTITY.test(line)) {
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

  for (const rel of Object.keys(OPTIONAL_ALLOWED)) {
    if (!optionalHit.has(rel)) {
      violations.push({
        file: rel, line: 0, rule: 'stale-allowlist',
        detail: 'OPTIONAL_ALLOWED entry no longer matches anything — remove it'
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
    console.log('No ambient context, no optional identity parameter, and no identity parameter discarded in src, addons.');
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
