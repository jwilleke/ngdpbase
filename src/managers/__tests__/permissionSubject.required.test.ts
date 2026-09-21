/**
 * #1212 — PermissionSubject's authorisation fields are required, except the
 * two delegations.
 *
 * The compiler now refuses `{ username, roles }` and `{ username }` — the
 * rebuilt subjects that dropped `viaToken` / `viaShare` and failed OPEN
 * against the ceilings (#1164, #1179). The lint keeps the other half: a full
 * rebuild with every field present. The #631 job shape, which carries no
 * roles on purpose, says so with `resolveRolesNow: true` instead of by
 * omission. (`requirePermissions`, which read `req.user` that nothing sets,
 * was deleted in #1431 step 14: it had no caller.)
 *
 * The type-level half is asserted against the source, since the test build
 * does not fail on type errors: sabotage by putting `?` back on any of the
 * three and the first test goes red.
 */
vi.unmock('../UserManager');

import fs from 'fs';
import path from 'path';
import { ANONYMOUS_SUBJECT } from '../UserManager';
import { makeDecider } from './__fixtures__/decider';
import type { PermissionSubject, JobSubject } from '../UserManager';
import { toPermissionSubject, jobContextFromRequest } from '../../context/JobContext';

const src = fs.readFileSync(path.join(process.cwd(), 'src', 'managers', 'UserManager.ts'), 'utf8');

function interfaceBody(name: string): string {
  const start = src.indexOf(`export interface ${name} {`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('\n}\n', start));
}

describe('#1212 the type', () => {
  test('username, roles and isAuthenticated are required; viaToken and viaShare are optional', () => {
    const body = interfaceBody('PermissionSubject');
    expect(body).toMatch(/^\s*username: string;/m);
    expect(body).toMatch(/^\s*roles: string\[\];/m);
    expect(body).toMatch(/^\s*isAuthenticated: boolean;/m);
    expect(body).toMatch(/^\s*viaToken\?: AgentTokenGrant;/m);
    expect(body).toMatch(/^\s*viaShare\?: ShareGrant;/m);
    expect(body).not.toMatch(/username\?|roles\?|isAuthenticated\?/);
  });

  test('the job shape asks for live roles on purpose, not by omission', () => {
    const body = interfaceBody('JobSubject');
    expect(body).toMatch(/^\s*resolveRolesNow: true;/m);
    expect(body).not.toMatch(/^\s*roles/m);
  });

  test('the named constants are complete subjects', () => {
    // ASSERTED_SUBJECT was removed in #1435 — nothing produced it, and a
    // cookie-asserted identity discloses a name to whoever holds the machine.
    for (const s of [ANONYMOUS_SUBJECT] as PermissionSubject[]) {
      expect(typeof s.username).toBe('string');
      expect(Array.isArray(s.roles)).toBe(true);
      expect(typeof s.isAuthenticated).toBe('boolean');
    }
  });
});

/**
 * A real decider (#1431 step 14) whose policy allows editors and admins;
 * roles come from `liveRoles`, read at the decision.
 */
function makeManager(liveRoles: Record<string, string[]>) {
  return makeDecider({
    evaluateAccess: ({ userContext }) =>
      Promise.resolve({ allowed: userContext.roles.includes('editor') || userContext.roles.includes('admin') }),
    users: (u) => (u in liveRoles ? { username: u, isActive: true } : null),
    roles: (u) => liveRoles[u] ?? []
  }).pdp;
}

describe('#1212 a JobSubject resolves roles at the decision', () => {
  test('the roles are the ones held NOW, not any carried at enqueue', async () => {
    const live: Record<string, string[]> = { jim: ['editor'] };
    const m = makeManager(live);
    const job: JobSubject = toPermissionSubject(jobContextFromRequest({ username: 'jim' }));
    expect(job.resolveRolesNow).toBe(true);
    expect(await m.permits(job, 'page-edit')).toBe(true);
    live.jim = [];                                   // the operator removed the role
    expect(await m.permits(job, 'page-edit')).toBe(false);
  });

  test('a job triggered through a token is still capped', async () => {
    const m = makeManager({ jim: ['admin'] });
    const job = toPermissionSubject(jobContextFromRequest({ username: 'jim', viaToken: { id: 't', name: 'ro', scopes: ['page-read'] } }));
    expect(await m.permits(job, 'page-edit')).toBe(false);
    expect(await m.permits(job, 'page-read')).toBe(true);
  });

  test('a subject that carries roles is not re-resolved — the request already did that once', async () => {
    const m = makeManager({ jim: [] });
    const request: PermissionSubject = { username: 'jim', roles: ['editor', 'All'], isAuthenticated: true };
    expect(await m.permits(request, 'page-edit')).toBe(true);
  });
});
