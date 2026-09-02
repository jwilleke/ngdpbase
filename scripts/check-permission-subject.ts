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
 * __The context classes are scanned too, as of #1173.__ Restricting this to
 * `src/routes` was a real gap: `ApiContext` and `ParseContext` each rebuilt a
 * three-field subject and dropped `viaToken`, so every addon API route using
 * `ctx.requirePermission()` bypassed the ceiling — the #1164 defect, one layer
 * further in, invisible to a guard that only looked at routes.
 *
 * `src/managers/` is still not scanned: a manager may legitimately be asked
 * "does user X hold Y?" about somebody who is not the caller, where there is no
 * token to consider. That question is `userHoldsPermission`, a lookup rather
 * than an authorisation, and it takes a name by design.
 */
const SCAN_DIRS = [
  'src/routes',
  'src/context',
  'src/parsers/context',
  // #1179: managers and handlers were excluded on the reasoning that a manager
  // legitimately asks "does this NAMED USER hold X?". That reasoning was wrong
  // in a way worth recording: the lookup is `userHoldsPermission(name, …)`,
  // which takes a STRING and never matches the patterns below. The exclusion
  // therefore protected nothing, and it hid `ImportManager` fabricating
  // `{ username: author, isAuthenticated: true, roles: ['admin'] }` from an
  // imported file's own frontmatter — an admin principal invented from input.
  'src/managers',
  'src/parsers/handlers'
];

export interface Violation {
  file: string;
  line: number;
  detail: string;
}

/** `hasPermission({ … }` — an object literal as the subject. */
const REBUILT = /hasPermission\(\s*\{/;

/**
 * An identity object built inline and handed to something else (#1179).
 *
 * `REBUILT` only sees a subject passed straight to `hasPermission`.
 * `ImportManager` built one and passed it as an upload OPTION, which reached
 * `hasPermission` two calls later — same defect, invisible to a pattern
 * anchored on the call. This matches the shape rather than the destination:
 * an object literal asserting authentication or roles.
 *
 * `ANONYMOUS_SUBJECT` is the sanctioned exception and is a named constant, so
 * it never appears as a literal.
 */
const FABRICATED = /(isAuthenticated\s*:\s*true|roles\s*:\s*\[)/;

/**
 * Strip `//` comments and the bodies of block comments.
 *
 * Block comments matter here as much as line comments: every `@example` in
 * `PolicyEvaluator`, and the doc comment on this rule's own fix in
 * `ImportManager`, describes a fabricated identity in prose. Reporting those
 * would make the check cry wolf on its own documentation — and a check whose
 * output is mostly its own comments is one nobody reads.
 *
 * Same approach as `check-http-boundary.ts`, which hit this first.
 */
function stripComments(source: string): string[] {
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
    const slash = line.indexOf('//');
    if (slash !== -1) line = line.slice(0, slash);
    out.push(line);
  }
  return out;
}

/**
 * An explicit, justified exemption.
 *
 * Deliberately a marker in a COMMENT, which `stripComments` removes from the
 * scanned text — so it is read off the raw line. Same idiom as
 * `csrf-guard-ignore`: a suppression that a reviewer can grep for and a reader
 * meets beside the reason for it, rather than a path exclusion that silently
 * covers whatever grows in that directory later.
 */
const SUPPRESS = 'permission-subject-ignore';

export function checkSource(relPath: string, source: string): Violation[] {
  const out: Violation[] = [];
  const rawLines = source.split('\n');
  const stripped = stripComments(source);
  stripped.forEach((line, i) => {
    if (REBUILT.test(line)) {
      out.push({
        file: relPath,
        line: i + 1,
        detail:
          'builds a permission subject inline. Forward the context the request carries ' +
          '(req.userContext / userContext) — a rebuilt object drops viaToken and with it ' +
          'the agent-token scope ceiling (#1164).'
      });
    } else if (/\bcontext\s*:\s*\{/.test(line) || (FABRICATED.test(line) && /\{/.test(line))) {
      // Only inside an identity-shaped literal — a bare `roles: [...]` in a
      // config object or a role DEFINITION is not a principal.
      const windowText = [line, stripped[i + 1] ?? '', stripped[i + 2] ?? ''].join('\n');
      const nearby = rawLines.slice(Math.max(0, i - 12), i + 3).join('\n');
      if (FABRICATED.test(windowText) && /username\s*:|user\s*:/.test(windowText) && !nearby.includes(SUPPRESS)) {
        out.push({
          file: relPath,
          line: i + 1,
          detail:
            'builds an identity inline and asserts authentication or roles. Forward the ' +
            'caller\'s context instead — an invented principal carries no viaToken, and ' +
            'hasPermission trusts supplied roles verbatim rather than re-resolving them (#1179).'
        });
      }
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
    console.log(`No permission subject is rebuilt in ${SCAN_DIRS.join(', ')}.`);
    process.exit(0);
  }
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.detail}`);
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}
