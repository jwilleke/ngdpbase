/**
 * #1198 — allow and deny come from `hasPermission` / `canAccess`, never from
 * a role name (security-posture P2).
 *
 * The routes were held at zero role-name gates by
 * `WikiRoutes.permissionGates.test.ts` and the bundled addons by their own
 * suites. This holds the rest of `src/`. Every remaining role-name read is
 * listed here with the reason it is not an allow/deny — a membership LOOKUP
 * about a named user, a content directive a page author wrote, the evaluator
 * itself, or a type declaration. Anything else is a gate that skips policy,
 * deny rules and the token ceiling. Sabotage: put
 * `WikiContext.userHasRole(userContext, 'admin')` back in a plugin and this
 * goes red.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(process.cwd(), 'src');

/** The honest uses, file by file. A new entry here is a claim that needs the same justification. */
const ALLOWED: Record<string, string> = {
  'context/WikiContext.ts': 'defines hasRole / userHasRole — the lookup, not a gate',
  'managers/UserManager.ts': 'hasRole(username, role) is a lookup about a NAMED user (P2); getContactRecipient and searchUsers filter people, not requests',
  'services/InstallService.ts': 'asks whether the bootstrap admin account exists — a lookup about a named user, before any request',
  'parsers/handlers/WikiTagHandler.ts': "the [{If role='…'}] content directive — a page author's conditional, documented syntax, not a system gate",
  'managers/ACLManager.ts': 'the evaluator itself: tier 0 private-page bypass and the filter that mirrors it',
  'providers/BaseSearchProvider.ts': 'a doc comment',
  'routes/WikiRoutes.ts': "validates a user-update PAYLOAD — whether an external account is being handed 'admin' — not the caller's roles; the routes' own gates are held at zero by WikiRoutes.permissionGates.test.ts"
};

const GATE = /\buserHasRole\(|\.hasRole\(|\broles\??\.includes\(\s*'/;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walk(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('#1198 no role-name gate outside the evaluator and the lookups', () => {
  test('every role-name read in src/ is on the justified list', () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = path.relative(ROOT, file);
      if (rel in ALLOWED) continue;
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((l, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
        if (GATE.test(l)) offenders.push(`${rel}:${i + 1}: ${l.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  test('the justified list names only files that still contain a role-name read', () => {
    // A stale entry would let a gate creep back into a file nobody looks at.
    const stale = Object.keys(ALLOWED).filter((rel) => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      return !GATE.test(src);
    });
    expect(stale).toEqual([]);
  });
});
