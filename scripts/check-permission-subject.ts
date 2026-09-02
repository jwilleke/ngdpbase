#!/usr/bin/env tsx
/**
 * Permission subjects are forwarded, never rebuilt (#1164).
 *
 * A scoped agent token reached admin rights it could never be minted with,
 * because the ceiling in `UserManager.hasPermission` can only run when the
 * caller passes the context the request carries — the token rides on it.
 *
 * Two ways to lose it, and the type system only closes one:
 *
 * 1. __Passing a username string.__ Closed by the compiler: `IUserManager`
 *    declares `hasPermission(subject: PermissionSubject, …)`, so a string in
 *    route code is a build error. Nothing here needs to check for it.
 *
 * 2. __Rebuilding a subject from parts.__ NOT closed by the compiler.
 *    `viaToken` is optional — a session request genuinely has none — so
 *    `{ username, roles, isAuthenticated }` type-checks perfectly and silently
 *    carries no token. `AttachmentManager` did exactly this on the branch that
 *    looked safe, and passing an object is what made it look safe.
 *
 * This check covers case 2. It is the cheap half of the pair; the compiler
 * does the heavy lifting.
 *
 * Run via `npm run lint:permission-subject`. Wired into `npm run lint` /
 * `lint:ci` / `.husky/pre-commit`. Exits 1 on any violation.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '..');

/**
 * Where a permission check is authorising a REQUEST, and a token may be present.
 *
 * `src/managers/` is not scanned: a manager may legitimately be asked "does
 * user X hold Y?" about somebody who is not the caller, where there is no token
 * to consider. That question is a lookup, not an authorisation.
 */
const SCAN_DIRS = ['src/routes'];

export interface Violation {
  file: string;
  line: number;
  detail: string;
}

/** `hasPermission({ … }` — an object literal as the subject. */
const REBUILT = /hasPermission\(\s*\{/;

export function checkSource(relPath: string, source: string): Violation[] {
  const out: Violation[] = [];
  source.split('\n').forEach((raw, i) => {
    // Strip line comments so prose describing the rule never trips it.
    const line = raw.includes('//') ? raw.slice(0, raw.indexOf('//')) : raw;
    if (REBUILT.test(line)) {
      out.push({
        file: relPath,
        line: i + 1,
        detail:
          'builds a permission subject inline. Forward the context the request carries ' +
          '(req.userContext / userContext) — a rebuilt object drops viaToken and with it ' +
          'the agent-token scope ceiling (#1164).'
      });
    }
  });
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walk(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

export function run(): Violation[] {
  return SCAN_DIRS.flatMap((d) => walk(path.join(REPO, d)))
    .flatMap((f) => checkSource(path.relative(REPO, f), readFileSync(f, 'utf8')));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  console.log('Permission subjects (#1164)');
  console.log('===========================');
  const violations = run();
  if (violations.length === 0) {
    console.log('No permission subject is rebuilt in route code.');
    process.exit(0);
  }
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.detail}`);
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}
