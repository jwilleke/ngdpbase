/**
 * #1212 — PermissionSubject's authorisation fields are required, except the
 * two delegations.
 *
 * The compiler now refuses `{ username, roles }` and `{ username }` — the
 * rebuilt subjects that dropped `viaToken` / `viaShare` and failed OPEN
 * against the ceilings (#1164, #1179). The lint keeps the other half: a full
 * rebuild with every field present. The #631 job shape, which carries no
 * roles on purpose, says so with `resolveRolesNow: true` instead of by
 * omission. And `requirePermissions` reads the request's own context — it
 * read `req.user`, which nothing sets, so every caller was anonymous.
 *
 * The type-level half is asserted against the source, since the test build
 * does not fail on type errors: sabotage by putting `?` back on any of the
 * three and the first test goes red.
 */
vi.unmock('../UserManager');

import fs from 'fs';
import path from 'path';
import UserManager, { ANONYMOUS_SUBJECT, ASSERTED_SUBJECT } from '../UserManager';
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
    for (const s of [ANONYMOUS_SUBJECT, ASSERTED_SUBJECT] as PermissionSubject[]) {
      expect(typeof s.username).toBe('string');
      expect(Array.isArray(s.roles)).toBe(true);
      expect(typeof s.isAuthenticated).toBe('boolean');
    }
  });
});

/** A UserManager whose policy allows editors and admins; roles come from the provider, live. */
function makeManager(liveRoles: Record<string, string[]>) {
  const m = new UserManager({
    getManager: (n: string) => {
      if (n === 'PolicyEvaluator') {
        return { evaluateAccess: ({ userContext }: { userContext: { roles: string[] } }) =>
          Promise.resolve({ allowed: userContext.roles.includes('editor') || userContext.roles.includes('admin') }) };
      }
      // #631: live resolution first asks whether the name is the system principal.
      if (n === 'ConfigurationManager') {
        return { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.system.principal' ? 'svc-ngdpbase' : k === 'ngdpbase.system.roles' ? ['admin'] : d) };
      }
      return null;
    }
  });
  const um = m as unknown as { provider: unknown; resolveUserRoles: (u: string) => Promise<string[]> };
  um.provider = { getUser: (u: string) => Promise.resolve(u in liveRoles ? { username: u, isActive: true, roles: liveRoles[u] } : null) };
  um.resolveUserRoles = (u: string) => Promise.resolve(liveRoles[u] ?? []);
  return m;
}

describe('#1212 a JobSubject resolves roles at the decision', () => {
  test('the roles are the ones held NOW, not any carried at enqueue', async () => {
    const live: Record<string, string[]> = { jim: ['editor'] };
    const m = makeManager(live);
    const job: JobSubject = toPermissionSubject(jobContextFromRequest({ username: 'jim' }));
    expect(job.resolveRolesNow).toBe(true);
    expect(await m.hasPermission(job, 'page-edit')).toBe(true);
    live.jim = [];                                   // the operator removed the role
    expect(await m.hasPermission(job, 'page-edit')).toBe(false);
  });

  test('a job triggered through a token is still capped', async () => {
    const m = makeManager({ jim: ['admin'] });
    const job = toPermissionSubject(jobContextFromRequest({ username: 'jim', viaToken: { id: 't', name: 'ro', scopes: ['page-read'] } }));
    expect(await m.hasPermission(job, 'page-edit')).toBe(false);
    expect(await m.hasPermission(job, 'page-read')).toBe(true);
  });

  test('a subject that carries roles is not re-resolved — the request already did that once', async () => {
    const m = makeManager({ jim: [] });
    const request: PermissionSubject = { username: 'jim', roles: ['editor', 'All'], isAuthenticated: true };
    expect(await m.hasPermission(request, 'page-edit')).toBe(true);
  });
});

describe('#1212 requirePermissions reads the request\'s own context', () => {
  const run = (m: UserManager, req: Record<string, unknown>) => new Promise<{ next: boolean; status?: number }>((resolve) => {
    const res = { status: (n: number) => ({ json: () => resolve({ next: false, status: n }), send: () => resolve({ next: false, status: n }) }) };
    m.requirePermissions(['page-edit'])(req, res, () => resolve({ next: true }));
  });

  test('an editor session passes; it used to be evaluated as anonymous', async () => {
    const m = makeManager({ ed: ['editor'] });
    expect(await run(m, { userContext: { username: 'ed', roles: ['editor', 'All'], isAuthenticated: true } })).toEqual({ next: true });
  });

  test('a read-only token on an editor is refused — the ceiling reaches the middleware', async () => {
    const m = makeManager({ ed: ['editor'] });
    const r = await run(m, { userContext: { username: 'ed', roles: ['editor', 'All'], isAuthenticated: true, viaToken: { id: 't', name: 'ro', scopes: ['page-read'] } } });
    expect(r.next).toBe(false);
    expect(r.status).toBe(403);
  });

  test('no context is anonymous: 401', async () => {
    const m = makeManager({});
    const r = await run(m, {});
    expect(r.next).toBe(false);
    expect(r.status).toBe(401);
  });
});
