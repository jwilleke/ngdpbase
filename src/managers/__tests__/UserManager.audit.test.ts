/**
 * #1204 — account lifecycle is recorded at the door.
 *
 * user-create, user-edit and user-delete had registry rows marked
 * `not-implemented`. The emitters now live in UserManager, so an admin form,
 * self-registration and an identity provider's auto-provisioning all leave the
 * same record. user-delete is critical: recorded and flushed BEFORE the
 * delete, refused when the record cannot be written. Sabotage: move the
 * recordAuditEvent call in deleteUser below provider.deleteUser, or wrap it in
 * try/catch, and the refusal test goes red.
 */
import UserManager from '../UserManager';
import RoleManager from '../RoleManager';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';
import type { WikiEngine } from '../../types/WikiEngine';
import { jobContextFromRequestWithReason, jobContextFromSystem } from '../../context/JobContext';

interface Recorded { eventType: string; user: string; ipAddress?: string; metadata: Record<string, unknown> }

function makeManager(opts: { auditFails?: boolean } = {}) {
  const sink: Recorded[] = [];
  const users = new Map<string, Record<string, unknown>>();
  const logAuditEvent = opts.auditFails
    ? vi.fn().mockRejectedValue(new Error('audit disk full'))
    : vi.fn().mockImplementation((e: Recorded) => { sink.push(e); return Promise.resolve('id'); });
  const provider = {
    userExists: vi.fn(async (name: string) => users.has(name)),
    createUser: vi.fn(async (u: Record<string, unknown>) => { users.set(u.username as string, { ...u }); }),
    getUser: vi.fn(async (name: string) => users.get(name) ?? null),
    updateUser: vi.fn(async (name: string, u: Record<string, unknown>) => { users.set(name, { ...u }); }),
    deleteUser: vi.fn(async (name: string) => { users.delete(name); })
  };
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'AuditManager') return { logAuditEvent, flushAuditQueue: () => Promise.resolve() };
      // #1431: the role catalogue is read live from config, so a role that
      // exists is declared here rather than pushed into a private Map.
      if (name === 'ConfigurationManager') return { getProperty: (k: string, d: unknown) => (
        k === 'ngdpbase.system.principal' ? 'system'
          : k === 'ngdpbase.roles.definitions' ? { reader: { name: 'reader' }, editor: { name: 'editor' } }
            : d) };
      if (name === 'RoleManager') return roles;
      if (name === 'PolicyInformationPoint') return pip;
      if (name === 'UserManager') return um;
      return null;
    })
  } as unknown as WikiEngine;
  const um = new UserManager(engine);
  (um as unknown as { provider: unknown }).provider = provider;
  // The Person sync and the user page are other managers' business and are
  // stubbed. Role membership is RoleManager's (#1431 step 12): its storage is
  // kept in a map here, and assignRole / removeRole are its own, so their
  // audit record is exercised for real.
  const rolesByUser = new Map<string, string[]>();
  const roles = new RoleManager(engine);
  // #1431 step 13: the reserved system-principal name is the PIP's.
  const pip = new PolicyInformationPoint(engine);
  Object.assign(roles, {
    resolveUserRoles: async (n: string) => rolesByUser.get(n) ?? ((users.get(n)?.roles as string[] | undefined) ?? []),
    applyRoleDiff: async (n: string, _o: string[], nw: string[]) => { rolesByUser.set(n, [...nw]); },
    removeAllMemberships: async () => undefined,
    addMember: async () => undefined,
    hasRole: async () => true
  });
  (um as unknown as { syncPersonOnCreate: () => Promise<void> }).syncPersonOnCreate = async () => undefined;
  (um as unknown as { syncPersonOnUpdate: () => Promise<void> }).syncPersonOnUpdate = async () => undefined;
  (um as unknown as { syncPersonOnDelete: () => Promise<void> }).syncPersonOnDelete = async () => undefined;
  (um as unknown as { createUserPage: () => Promise<boolean> }).createUserPage = async () => false;
  (um as unknown as { checkDisplayNamePageConflict: () => Promise<void> }).checkDisplayNamePageConflict = async () => undefined;
  return { um, roles, pip, sink, users, provider };
}

// #1179: the request's subject, forwarded as-is; the address rides on it.
const ADMIN = { username: 'root', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };
const ALICE = { username: 'alice', roles: ['reader'], isAuthenticated: true };

describe('#1204 user-create', () => {
  test('an admin creating an account is recorded with the admin as actor', async () => {
    const { um, sink } = makeManager();
    await um.createUser({ username: 'alice', email: 'a@x', displayName: 'Alice', password: 'pw-1234567', roles: ['reader'] }, ADMIN);
    expect(sink.map((e) => e.eventType)).toEqual(['user-create']);
    expect(sink[0]).toMatchObject({ user: 'root', ipAddress: '203.0.113.7', metadata: { origin: 'request', username: 'alice', roles: ['reader'], selfRegistration: false } });
    expect(sink[0].metadata.actorMissing).toBeUndefined();
  });

  test('self-registration names the new account as the actor', async () => {
    const { um, sink } = makeManager();
    // #1179: the new account is not a subject yet — a request-origin context that says so.
    await um.createUser({ username: 'bob', email: 'b@x', displayName: 'Bob', password: 'pw-1234567' }, jobContextFromRequestWithReason({ username: 'bob', ipAddress: '10.0.0.9' }, 'self-registration'));
    expect(sink[0]).toMatchObject({ user: 'bob', ipAddress: '10.0.0.9', metadata: { origin: 'request', reason: 'self-registration', selfRegistration: true } });
  });

  test('a provisioned account names the system principal and the provider, not a person', async () => {
    const { um, pip, sink } = makeManager();
    // #1179: what the auth providers pass — the principal acts, the reason names the provider.
    await um.createUser({ username: 'carol', email: 'c@x', displayName: 'Carol', isExternal: true }, jobContextFromRequestWithReason({ username: pip.systemPrincipalName() }, 'provisioned by google-oidc'));
    expect(sink[0]).toMatchObject({ user: pip.systemPrincipalName(), metadata: { origin: 'request', reason: 'provisioned by google-oidc', isExternal: true, selfRegistration: false } });
  });

  test('#1179 a boot-time account write says the system principal and why — nothing is invented (#1181)', async () => {
    const { um, sink } = makeManager();
    await um.createUser({ username: 'dave', email: 'd@x', displayName: 'Dave', password: 'pw-1234567' }, jobContextFromSystem('System', 'seed the demo account'));
    expect(sink[0]).toMatchObject({ user: 'System', metadata: { origin: 'boot', reason: 'seed the demo account' } });
    expect(sink[0].metadata.actorMissing).toBeUndefined();
    expect(sink[0].ipAddress).toBeUndefined();
  });
});

describe('#1204 user-edit', () => {
  test('a preference change is not recorded', async () => {
    const { um, sink } = makeManager();
    await um.createUser({ username: 'alice', email: 'a@x', displayName: 'Alice', password: 'pw-1234567' }, ADMIN);
    sink.length = 0;
    await um.updateUser('alice', { preferences: { theme: 'dark' } }, ALICE);
    expect(sink).toEqual([]);
  });

  test('a password or role change is recorded by field name, never by value', async () => {
    const { um, sink } = makeManager();
    await um.createUser({ username: 'alice', email: 'a@x', displayName: 'Alice', password: 'pw-1234567', roles: ['reader'] }, ADMIN);
    sink.length = 0;
    await um.updateUser('alice', { password: 'new-secret-99', roles: ['editor'] }, ADMIN);
    expect(sink.map((e) => e.eventType)).toEqual(['user-edit']);
    expect(sink[0].metadata).toMatchObject({ username: 'alice', fields: ['password', 'roles'], roles: { from: ['reader'], to: ['editor'] } });
    expect(JSON.stringify(sink[0])).not.toContain('new-secret-99');
  });

  test('assigning a role is a user-edit', async () => {
    const { um, roles, sink } = makeManager();
    await um.createUser({ username: 'alice', email: 'a@x', displayName: 'Alice', password: 'pw-1234567' }, ADMIN);
    sink.length = 0;
    await roles.assignRole('alice', 'editor', ADMIN);
    expect(sink[0]).toMatchObject({ eventType: 'user-edit', user: 'root', metadata: { fields: ['roles'], role: { assign: 'editor' } } });
  });
});

describe('#1204 user-delete is critical', () => {
  test('recorded before the delete, with the roles the account held', async () => {
    const { um, sink, provider, users } = makeManager();
    await um.createUser({ username: 'alice', email: 'a@x', displayName: 'Alice', password: 'pw-1234567', roles: ['editor'] }, ADMIN);
    sink.length = 0;
    let existedAtRecordTime: boolean | null = null;
    provider.deleteUser.mockImplementationOnce(async (name: string) => { existedAtRecordTime = sink.length === 1; users.delete(name); });
    await um.deleteUser('alice', ADMIN);
    expect(sink[0]).toMatchObject({ eventType: 'user-delete', user: 'root', metadata: { username: 'alice', roles: ['editor'] } });
    expect(existedAtRecordTime).toBe(true);
  });

  test('a delete whose record cannot be written is refused and the account survives', async () => {
    const { um, users, provider } = makeManager({ auditFails: true });
    users.set('alice', { username: 'alice', roles: ['reader'] });
    await expect(um.deleteUser('alice', ADMIN)).rejects.toThrow(/audit disk full/);
    expect(users.has('alice')).toBe(true);
    expect(provider.deleteUser).not.toHaveBeenCalled();
  });
});

describe('#1204 search-user ships switched off', () => {
  test('a search records nothing under the shipped configuration', async () => {
    const { um, sink, users } = makeManager();
    users.set('alice', { username: 'alice', displayName: 'Alice', isActive: true });
    (um as unknown as { getUsers: () => Promise<unknown[]> }).getUsers = async () => [...users.values()];
    await um.searchUsers('ali', {}, ADMIN);
    expect(sink).toEqual([]);
  });

  test('a role added to the configuration after start can be assigned at once (#1431)', async () => {
    // The role catalogue was copied at boot, so a role an administrator added
    // in Configuration was refused — "Role not found" — until a restart.
    const declared: Record<string, unknown> = { reader: { name: 'reader' } };
    const { um, roles, sink } = makeManager();
    (um as unknown as { engine: { getManager: (n: string) => unknown } }).engine.getManager = ((orig) => (n: string) =>
      n === 'ConfigurationManager'
        ? { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.system.principal' ? 'system' : k === 'ngdpbase.roles.definitions' ? declared : d) }
        : orig(n))((um as unknown as { engine: { getManager: (n: string) => unknown } }).engine.getManager);
    await um.createUser({ username: 'alice', email: 'a@x', displayName: 'Alice', password: 'pw-1234567' }, ADMIN);

    await expect(roles.assignRole('alice', 'auditor', ADMIN)).rejects.toThrow('Role not found');

    declared.auditor = { name: 'auditor' };   // an administrator adds it
    sink.length = 0;
    await roles.assignRole('alice', 'auditor', ADMIN);
    expect(sink[0]).toMatchObject({ eventType: 'user-edit', metadata: { role: { assign: 'auditor' } } });
  });
});

describe('#1482 a password change ends the account\'s other sessions', () => {
  test('a new password raises the session generation; any other edit leaves it', async () => {
    const { um, users } = makeManager();
    await um.createUser({ username: 'alice', email: 'a@x', displayName: 'Alice', password: 'pw-1234567', roles: ['reader'] }, ADMIN);
    expect(users.get('alice')?.sessionGeneration).toBeUndefined();

    await um.updateUser('alice', { displayName: 'Alice B' }, ALICE);
    expect(users.get('alice')?.sessionGeneration).toBeUndefined();

    await um.updateUser('alice', { password: 'new-pw-7654321' }, ALICE);
    expect(users.get('alice')?.sessionGeneration).toBe(1);
    await um.updateUser('alice', { password: 'another-pw-1111' }, ADMIN);
    expect(users.get('alice')?.sessionGeneration).toBe(2);
  });
});
