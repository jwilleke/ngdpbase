#!/usr/bin/env tsx
/**
 * Permission gates are policy, never a role name or a session flag (#1198,
 * security-posture P2).
 *
 * Forty-nine role-name gates and seventeen `isAuthenticated` allows were
 * removed across `src/`, `addons/` and `views/` in the #1198 series. Three of
 * them (#1164, #1178, #1181) had been found by reading, after the fact, each
 * the same shape: a check that skipped PolicyEvaluator, deny policies and the
 * agent-token / share ceilings. This is the guard that keeps the count at
 * zero, in the `check-http-boundary` / `check-permission-subject` idiom: a
 * shape outside the policy engine is a lint failure, and every remaining read
 * is listed here with the reason it is not an allow/deny.
 *
 * Two rules:
 *
 * 1. __Role-name gate__ — `userHasRole(`, `.hasRole(`, `requireRole(`,
 *    `roles.includes('…')` — anywhere in `src/`, `addons/` or `views/`.
 * 2. __isAuthenticated as the allow__ — `if (` / ternary on the flag in
 *    `src/routes/`, where the honest uses are classifying a refusal after
 *    policy said no, login-vs-profile chrome, and bouncing a signed-in
 *    visitor off the login page.
 *
 * Run via `npm run lint:gates`. Wired into `npm run lint` / `lint:ci` /
 * `.husky/pre-commit`. Exits 1 on any violation.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '..');

const SCAN_TS = ['src', 'addons'];
const SCAN_VIEWS = ['views'];

/**
 * Files that still read a role name, and why each is not a gate. A new entry
 * is a claim that needs the same justification; a stale entry is refused
 * (see `run()`), so the list cannot outlive the reads it excuses.
 */
const ROLE_READ_ALLOWED: Record<string, string> = {
  'src/context/WikiContext.ts': 'defines hasRole / userHasRole — the lookup, not a gate',
  'src/managers/UserManager.ts': 'hasRole(username, role) is a lookup about a NAMED user (P2); getContactRecipient and searchUsers filter people, not requests',
  'src/services/InstallService.ts': 'asks whether the bootstrap admin account exists — a lookup about a named user, before any request',
  'src/parsers/handlers/WikiTagHandler.ts': "the [{If role='…'}] content directive — a page author's conditional, documented syntax, not a system gate",
  'src/managers/ACLManager.ts': 'the evaluator itself: tier 0 private-page bypass and the filter that mirrors it',
  'src/routes/WikiRoutes.ts': "validates a user-update PAYLOAD — whether an external account is being handed 'admin' — not the caller's roles",
  'views/admin-users.ejs': 'counts and filters the accounts that HOLD the admin role — data about users, not an affordance for the viewer',
  'views/header.ejs': "the 'Admin' badge beside the signed-in name states a membership; the links and actions around it ask can()"
};

/** Methods in WikiRoutes.ts that may read `isAuthenticated`, and why. */
const AUTH_FLAG_ALLOWED: Record<string, string> = {
  refuse: 'classifies a refusal AFTER policy said no — 401 / login redirect for anonymous, 403 for signed-in',
  getCommonTemplateData: 'login-vs-profile chrome',
  loginPage: 'sends a signed-in visitor away from the login page',
  adminLoginPage: 'sends a signed-in visitor away from the login page',
  sweepAnonymousSessions: 'reads the flag off session files on disk to decide which to sweep'
};

const ROLE_GATE = /\buserHasRole\(|\.hasRole\(|\brequireRole\(|\broles\??\.includes\(\s*['"]/;
const AUTH_FLAG = /isAuthenticated/;
const AUTH_DECISION = /if \(|\? |const anonymous =/;

export interface Violation {
  file: string;
  line: number;
  rule: 'role-name-gate' | 'isAuthenticated-allow' | 'stale-allowlist';
  detail: string;
}

/** Strip `//` line comments, block-comment bodies, and EJS `<%# … %>` comments. */
function strippedLines(source: string, ejs: boolean): string[] {
  let text = source;
  if (ejs) text = text.replace(/<%#[\s\S]*?%>/g, (m) => m.replace(/[^\n]/g, ' '));
  const out: string[] = [];
  let inBlock = false;
  for (const raw of text.split('\n')) {
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
    if (!ejs) {
      const slash = line.indexOf('//');
      if (slash !== -1) line = line.slice(0, slash);
    }
    out.push(line);
  }
  return out;
}

function enclosingMethod(lines: string[], index: number): string {
  for (let j = index; j >= 0; j--) {
    const m = lines[j].match(/^(?:export )?(?:async )?function (\w+)|^ {2}(?:private )?(?:async )?(\w+)\(/);
    if (m) return m[1] ?? m[2];
  }
  return '?';
}

export function checkSource(relPath: string, source: string): Violation[] {
  const out: Violation[] = [];
  const ejs = relPath.endsWith('.ejs');
  const lines = strippedLines(source, ejs);
  const roleAllowed = relPath in ROLE_READ_ALLOWED;
  const routeFile = relPath === 'src/routes/WikiRoutes.ts';
  lines.forEach((line, i) => {
    if (!roleAllowed && ROLE_GATE.test(line)) {
      out.push({
        file: relPath, line: i + 1, rule: 'role-name-gate',
        detail: 'decides by role name. Ask policy — hasPermission / can() / subjectMayDo — with the request\'s own subject; a role check skips deny policies and the token and share ceilings (#1198).'
      });
    }
    if (routeFile && AUTH_FLAG.test(line) && AUTH_DECISION.test(line)) {
      const method = enclosingMethod(lines, i);
      if (!(method in AUTH_FLAG_ALLOWED)) {
        out.push({
          file: relPath, line: i + 1, rule: 'isAuthenticated-allow',
          detail: `${method}() decides on isAuthenticated. Ask permitted(); refuse() chooses the status afterwards (#1198).`
        });
      }
    }
  });
  return out;
}

function walk(dir: string, exts: string[], acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === 'dist') continue;
      walk(full, exts, acc);
    } else if (exts.some((e) => entry.endsWith(e)) && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

export function run(): Violation[] {
  const files = [
    ...SCAN_TS.flatMap((d) => walk(path.join(REPO, d), ['.ts'])),
    ...SCAN_VIEWS.flatMap((d) => walk(path.join(REPO, d), ['.ejs']))
  ];
  const violations = files.flatMap((f) => checkSource(path.relative(REPO, f), readFileSync(f, 'utf8')));
  // A stale exemption would let a gate creep back into a file nobody reads.
  for (const rel of Object.keys(ROLE_READ_ALLOWED)) {
    const full = path.join(REPO, rel);
    const lines = strippedLines(readFileSync(full, 'utf8'), rel.endsWith('.ejs'));
    if (!lines.some((l) => ROLE_GATE.test(l))) {
      violations.push({ file: rel, line: 0, rule: 'stale-allowlist', detail: 'listed as a justified role read but contains none — remove the entry.' });
    }
  }
  return violations;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  console.log('Permission gates (#1198)');
  console.log('========================');
  const violations = run();
  if (violations.length === 0) {
    console.log(`No role-name gate in ${[...SCAN_TS, ...SCAN_VIEWS].join(', ')} and no isAuthenticated allow in src/routes; every remaining read is justified.`);
    process.exit(0);
  }
  for (const v of violations) console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.detail}`);
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}
