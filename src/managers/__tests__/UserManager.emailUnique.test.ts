/**
 * One email, one account — #1748.
 *
 * A duplicate email can't be saved, on create or on change; compared trimmed
 * and in any case, with no provider rules (plus addressing is a different
 * address). An email two accounts already share finds nobody, and is reported
 * at startup: the manager is degraded and admins are notified.
 */

import UserManager from '../UserManager';
import { UserCreateError, safeRegistrationMessage } from '../../utils/userCreateError';
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

const person = (username: string, email: string) => ({ username, email, displayName: username, password: 'pw-123456789' });

describe('one email, one account (#1748)', () => {
  test('a new account cannot take an email another account has — in any case, with spaces', async () => {
    const { manager, store } = makeManager();
    await manager.createUser(person('alice', 'smiths@example.com'), ACTOR);
    const err = await manager.createUser(person('bob', '  Smiths@Example.COM '), ACTOR).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UserCreateError);
    expect((err as UserCreateError).reason).toBe('email-taken');
    expect(store.has('bob')).toBe(false);
  });

  test('plus addressing is a different address: a couple can share one inbox', async () => {
    const { manager, store } = makeManager();
    await manager.createUser(person('alice', 'smiths+alice@gmail.com'), ACTOR);
    await manager.createUser(person('bob', 'smiths+bob@gmail.com'), ACTOR);
    expect([...store.keys()]).toEqual(['alice', 'bob']);
  });

  test('accounts without an email are allowed', async () => {
    const { manager, store } = makeManager();
    await manager.createUser(person('alice', ''), ACTOR);
    await manager.createUser(person('bob', ''), ACTOR);
    expect(store.size).toBe(2);
  });

  test('changing an email to another account\'s is refused; changing your own case, or other fields, is not', async () => {
    const { manager, store } = makeManager();
    await manager.createUser(person('alice', 'alice@example.com'), ACTOR);
    await manager.createUser(person('bob', 'bob@example.com'), ACTOR);
    await expect(manager.updateUser('bob', { email: 'ALICE@example.com' }, ACTOR)).rejects.toMatchObject({ reason: 'email-taken' });
    expect(store.get('bob')?.email).toBe('bob@example.com');
    await manager.updateUser('bob', { email: 'Bob@Example.com' }, ACTOR);
    await manager.updateUser('bob', { displayName: 'Robert', email: 'Bob@Example.com' }, ACTOR);
    expect(store.get('bob')?.displayName).toBe('Robert');
  });

  test('an email two accounts already share finds nobody — never the first one', async () => {
    const { manager, store } = makeManager();
    store.set('alice', { username: 'alice', email: 'shared@example.com' });
    store.set('bob', { username: 'bob', email: 'Shared@example.com' });
    store.set('carol', { username: 'carol', email: 'carol@example.com' });
    expect(await manager.getUserByEmail('shared@example.com')).toBeUndefined();
    expect((await manager.getUserByEmail(' CAROL@example.com'))?.username).toBe('carol');
  });

  test('shared emails saved before the rule are reported at startup: degraded, logged, admins notified', async () => {
    const { manager, store, notes } = makeManager();
    store.set('alice', { username: 'alice', email: 'shared@example.com' });
    store.set('bob', { username: 'bob', email: 'shared@example.com' });
    await (manager as unknown as { reportDuplicateEmails(): Promise<void> }).reportDuplicateEmails();
    const state = (manager as unknown as { status: { state: string; reason?: string } }).status;
    expect(state.state).toBe('degraded');
    expect(state.reason).toMatch(/shared by more than one account/);
    expect(notes).toEqual([expect.objectContaining({ level: 'error', title: 'Accounts share an email address' })]);
  });

  test('no shared emails, nothing reported', async () => {
    const { manager, store, notes } = makeManager();
    store.set('alice', { username: 'alice', email: 'alice@example.com' });
    await (manager as unknown as { reportDuplicateEmails(): Promise<void> }).reportDuplicateEmails();
    expect(notes).toHaveLength(0);
  });

  test('registration tells the visitor plainly, without naming the other account', () => {
    expect(safeRegistrationMessage(new UserCreateError('email-taken', 'Email address is already used by another account (alice)')))
      .toBe('That email address is already used by another account. Please use another.');
  });
});
