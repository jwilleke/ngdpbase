/**
 * Accounts may share an email — #2073 (operator, 2026-10-25), reversing #1748's
 * one-email-one-account refusal: a couple, or an older adult and a carer.
 *
 * A shared email is saved on create and on change; compared trimmed and in
 * any case, with no provider rules (plus addressing is a different address).
 * `getUsersByEmail` lists every account on it, `getUserByEmail` still finds
 * nobody for a shared one (never the first), and sharing is no longer
 * reported as a fault at start-up.
 *
 * Sabotaged once each (2026-10-25), and watched go red:
 * - the refusal put back in createUser → "a new account may take an email another has";
 * - getUserByEmail returning the first of several → "finds nobody, never the first";
 * - getUsersByEmail compared without case → "lists every account on it";
 * - the start-up report put back → "is not reported at start-up";
 * - the admin rule skipped for an administrator saving an email → "an
 *   administrator never shares", and for another holder being one → "nor
 *   takes one", and for a role change → "nor becomes one";
 * - the own-email rule skipped → "an account never sets its own email".
 */

import { randomUUID } from 'node:crypto';
import UserManager from '../UserManager';
import RoleManager from '../RoleManager';
import { UserCreateError } from '../../utils/userCreateError';
import type { ActorContext } from '../../context/ActorContext';

const ACTOR = { username: 'admin', isAuthenticated: true, roles: ['admin'] } as ActorContext;

function makeManager(opts: { admins?: string[]; userEdit?: boolean } = {}) {
  const store = new Map<string, Record<string, unknown>>();
  const admins = new Set(opts.admins ?? []);
  const notes: Array<{ level: string; title: string }> = [];
  const provider = {
    getUser: vi.fn((name: string) => Promise.resolve(store.get(name))),
    getAllUsers: vi.fn(() => Promise.resolve(store)),
    createUser: vi.fn((u: Record<string, unknown>) => {
      store.set(u.username as string, u);
      return Promise.resolve(u);
    }),
    updateUser: vi.fn((name: string, u: Record<string, unknown>) => {
      store.set(name, u);
      return Promise.resolve();
    }),
    userExists: vi.fn((n: string) => Promise.resolve(store.has(n)))
  };
  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: vi.fn((_key: string, dflt: unknown) => dflt) },
    RoleManager: {
      applyRoleDiff: vi.fn((name: string, _old: string[], roles: string[]) => { if (roles.includes('admin')) admins.add(name); return Promise.resolve(); }),
      resolveUserRoles: vi.fn((_ctx: unknown, name: string) => Promise.resolve(admins.has(name) ? ['admin'] : [])),
      hasRole: vi.fn((_ctx: unknown, name: string, role: string) => Promise.resolve(role === 'admin' && admins.has(name)))
    },
    // #2073: who holds user-edit (an administrator in Admin → Users) may set an account's email directly.
    PolicyDecisionPoint: { permits: vi.fn((_s: unknown, action: string) => Promise.resolve(action === 'user-edit' && opts.userEdit === true)) },
    PolicyInformationPoint: { isSystemPrincipal: () => false },
    NotificationManager: { addNotification: (n: { level: string; title: string }) => { notes.push(n); return Promise.resolve('n'); } }
  };
  const manager = new UserManager({ getManager: (n: string) => managers[n] ?? null });
  (manager as unknown as { provider: unknown }).provider = provider;
  return { manager, store, notes };
}

const person = (username: string, email: string) => ({ username, email, displayName: username, password: `pw-${randomUUID()}` });

describe('accounts may share an email (#2073)', () => {
  test('a new account may take an email another account has — in any case, with spaces', async () => {
    const { manager, store } = makeManager();
    await manager.createUser(person('alice', 'smiths@example.com'), ACTOR);
    await manager.createUser(person('bob', '  Smiths@Example.COM '), ACTOR);
    expect([...store.keys()]).toEqual(['alice', 'bob']);
    expect(await manager.isEmailShared('smiths@example.com', 'alice')).toBe(true);
    expect(await manager.isEmailShared('other@example.com', null)).toBe(false);
  });

  test('changing an email to another account\'s is saved; the sharing is seen', async () => {
    const { manager, store } = makeManager();
    await manager.createUser(person('alice', 'alice@example.com'), ACTOR);
    await manager.createUser(person('bob', 'bob@example.com'), ACTOR);
    expect(await manager.isEmailShared('bob@example.com', 'bob')).toBe(false);
    await manager.updateUser('bob', { email: 'ALICE@example.com' }, ACTOR);
    expect(store.get('bob')?.email).toBe('ALICE@example.com');
    expect(await manager.isEmailShared('alice@example.com', 'bob')).toBe(true);
    expect([...(await manager.usernamesSharingAnEmail())].sort()).toEqual(['alice', 'bob']);
  });

  test('plus addressing is a different address', async () => {
    const { manager } = makeManager();
    await manager.createUser(person('alice', 'smiths+alice@gmail.com'), ACTOR);
    await manager.createUser(person('bob', 'smiths+bob@gmail.com'), ACTOR);
    expect(await manager.isEmailShared('smiths+alice@gmail.com', 'alice')).toBe(false);
    expect(await manager.usernamesSharingAnEmail()).toEqual(new Set());
  });

  test('accounts without an email share nothing', async () => {
    const { manager, store } = makeManager();
    await manager.createUser(person('alice', ''), ACTOR);
    await manager.createUser(person('bob', ''), ACTOR);
    expect(store.size).toBe(2);
    expect(await manager.getUsersByEmail('')).toEqual([]);
    expect(await manager.usernamesSharingAnEmail()).toEqual(new Set());
  });

  test('getUsersByEmail lists every account on it, in any case, without the password hash', async () => {
    const { manager, store } = makeManager();
    store.set('alice', { username: 'alice', email: 'shared@example.com', password: 'hash' });
    store.set('bob', { username: 'bob', email: ' Shared@Example.com', password: 'hash' });
    store.set('carol', { username: 'carol', email: 'carol@example.com' });
    const found = await manager.getUsersByEmail('SHARED@example.com ');
    expect(found.map((u) => u.username)).toEqual(['alice', 'bob']);
    expect(found.every((u) => !('password' in u))).toBe(true);
  });

  test('getUserByEmail finds nobody for a shared email, never the first', async () => {
    const { manager, store } = makeManager();
    store.set('alice', { username: 'alice', email: 'shared@example.com' });
    store.set('bob', { username: 'bob', email: 'Shared@example.com' });
    store.set('carol', { username: 'carol', email: 'carol@example.com' });
    expect(await manager.getUserByEmail('shared@example.com')).toBeUndefined();
    expect((await manager.getUserByEmail(' CAROL@example.com'))?.username).toBe('carol');
  });

  test('a shared email is not reported at start-up: no degraded state, no notice', async () => {
    const { manager, store, notes } = makeManager();
    store.set('alice', { username: 'alice', email: 'shared@example.com' });
    store.set('bob', { username: 'bob', email: 'shared@example.com' });
    expect((manager as unknown as { reportDuplicateEmails?: unknown }).reportDuplicateEmails).toBeUndefined();
    const state = (manager as unknown as { status?: { state: string } }).status;
    expect(state?.state).not.toBe('degraded');
    expect(notes).toHaveLength(0);
  });

  test('an administrator never shares its email: refused, whoever saves it (#2073)', async () => {
    const { manager, store } = makeManager({ admins: ['root'] });
    store.set('root', { username: 'root', email: 'root@example.com' });
    store.set('ann', { username: 'ann', email: 'ann@example.com' });
    // The administrator takes an address another account holds.
    await expect(manager.updateUser('root', { email: 'ANN@example.com' }, ACTOR)).rejects.toMatchObject({ reason: 'admin-email-shared' });
    expect(store.get('root')?.email).toBe('root@example.com');
    // An admin-role account is created with an address another account holds.
    await expect(manager.createUser({ ...person('boss', 'ann@example.com'), roles: ['admin'] }, ACTOR)).rejects.toMatchObject({ reason: 'admin-email-shared' });
    expect(store.has('boss')).toBe(false);
  });

  test('nor takes one: another account cannot take an administrator\'s email (#2073)', async () => {
    const { manager, store } = makeManager({ admins: ['root'] });
    store.set('root', { username: 'root', email: 'root@example.com' });
    store.set('ann', { username: 'ann', email: 'ann@example.com' });
    await expect(manager.updateUser('ann', { email: 'root@example.com' }, ACTOR)).rejects.toMatchObject({ reason: 'admin-email-shared' });
    await expect(manager.createUser(person('bob', ' Root@Example.com'), ACTOR)).rejects.toMatchObject({ reason: 'admin-email-shared' });
    expect(store.get('ann')?.email).toBe('ann@example.com');
    expect(store.has('bob')).toBe(false);
  });

  test('nor becomes one: the admin role is refused to an account whose email is shared (#2073)', async () => {
    const { manager, store } = makeManager();
    store.set('ann', { username: 'ann', email: 'couple@example.com' });
    store.set('bob', { username: 'bob', email: 'couple@example.com' });
    await expect(manager.updateUser('bob', { roles: ['reader', 'admin'] }, ACTOR)).rejects.toMatchObject({ reason: 'admin-email-shared' });
    // Not shared: the role is given.
    store.set('cal', { username: 'cal', email: 'cal@example.com' });
    await manager.updateUser('cal', { roles: ['reader', 'admin'] }, ACTOR);
  });

  test('an account never sets its own email: only through its link, or by an administrator (#2073)', async () => {
    const { manager, store } = makeManager();
    store.set('ann', { username: 'ann', email: 'ann@example.com' });
    const self = { username: 'ann', isAuthenticated: true, roles: ['reader'] } as ActorContext;
    await expect(manager.updateUser('ann', { email: 'new@example.com' }, self)).rejects.toMatchObject({ reason: 'email-unconfirmed' });
    expect(store.get('ann')?.email).toBe('ann@example.com');
    // Its own case, or other fields, are not a new email.
    await manager.updateUser('ann', { email: 'Ann@Example.com', displayName: 'Ann A' }, self);
    expect(store.get('ann')?.displayName).toBe('Ann A');
    // A self-registration is made without an email; with one it is refused.
    const registrant = { username: 'dee', isAuthenticated: false, roles: [] } as unknown as ActorContext;
    await expect(manager.createUser(person('dee', 'dee@example.com'), registrant)).rejects.toMatchObject({ reason: 'email-unconfirmed' });
    await manager.createUser(person('dee', ''), registrant);
    // An administrator (user-edit) editing their own account is trusted.
    const admin = makeManager({ userEdit: true });
    admin.store.set('root', { username: 'root', email: 'root@example.com' });
    await admin.manager.updateUser('root', { email: 'root2@example.com' }, { username: 'root', isAuthenticated: true, roles: ['admin'] } as ActorContext);
    expect(admin.store.get('root')?.email).toBe('root2@example.com');
  });

  test('nor becomes one through RoleManager: assigning the admin role asks the same rule, and is refused (#2073)', async () => {
    const asked: unknown[] = [];
    const um = {
      getUser: () => Promise.resolve({ username: 'bob', email: 'couple@example.com' }),
      assertAdminEmailUnshared: (...a: unknown[]) => { asked.push(a.slice(0, 2)); const refusal: Error = new UserCreateError('admin-email-shared', 'shared'); return Promise.reject(refusal); }
    };
    const roles = new RoleManager({ getManager: (n: string) => (n === 'UserManager' ? um : n === 'ConfigurationManager'
      ? { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.roles.definitions' ? { admin: { name: 'admin' }, editor: { name: 'editor' } } : d) } : null) });
    const change = vi.spyOn(roles as unknown as { recordedRoleChange: () => Promise<void> }, 'recordedRoleChange').mockResolvedValue(undefined);
    await expect(roles.assignRole('bob', 'admin', ACTOR)).rejects.toMatchObject({ reason: 'admin-email-shared' });
    expect(asked).toEqual([['bob', 'couple@example.com']]);
    expect(change).not.toHaveBeenCalled();
    // Another role asks nothing.
    await roles.assignRole('bob', 'editor', ACTOR);
    expect(asked).toHaveLength(1);
  });
});
