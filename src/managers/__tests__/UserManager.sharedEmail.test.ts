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
 * - the start-up report put back → "is not reported at start-up".
 */

import { randomUUID } from 'node:crypto';
import UserManager from '../UserManager';
import type { ActorContext } from '../../context/ActorContext';

const ACTOR = { username: 'admin', isAuthenticated: true, roles: ['admin'] } as ActorContext;

function makeManager() {
  const store = new Map<string, Record<string, unknown>>();
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
    RoleManager: { applyRoleDiff: vi.fn(() => Promise.resolve()), resolveUserRoles: vi.fn(() => Promise.resolve([])) },
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
});
