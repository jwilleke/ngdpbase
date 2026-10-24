/**
 * One change at a time per account — #2025.
 *
 * Every read-merge-write of an account runs inside a `KeyedSerial` keyed by
 * the normalized username, the read included: `updateUser` (both forms),
 * the sign-in counters and the hash upgrade. The provider here hands out
 * copies, as a database would, so two changes that read the same old record
 * would lose one of them.
 */

import { randomUUID } from 'node:crypto';
import UserManager from '../UserManager';
import type { ActorContext } from '../../context/ActorContext';

const ADMIN = { username: 'admin', isAuthenticated: true, roles: ['admin'] } as ActorContext;

function makeManager() {
  const store = new Map<string, Record<string, unknown>>();
  const audit: Array<Record<string, unknown>> = [];
  const copy = (u: Record<string, unknown> | undefined) => (u ? structuredClone(u) : undefined);
  const provider = {
    getUser: vi.fn(async (name: string) => {
      await new Promise((r) => setTimeout(r, 1));
      return copy(store.get(name.toLowerCase()));
    }),
    getAllUsers: vi.fn(() => Promise.resolve(new Map(store))),
    updateUser: vi.fn(async (name: string, u: Record<string, unknown>) => {
      await new Promise((r) => setTimeout(r, 1));
      store.set(name.toLowerCase(), copy(u));
    }),
    userExists: vi.fn((n: string) => Promise.resolve(store.has(n.toLowerCase())))
  };
  const bump = vi.fn(() => Promise.resolve('v'));
  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: vi.fn((_key: string, dflt: unknown) => dflt) },
    RoleManager: { applyRoleDiff: vi.fn(() => Promise.resolve()), resolveUserRoles: vi.fn(() => Promise.resolve([])) },
    PolicyInformationPoint: { isSystemPrincipal: () => false },
    AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audit.push(e); return Promise.resolve('a'); }, flushAuditQueue: () => Promise.resolve() },
    CacheManager: { bump }
  };
  const manager = new UserManager({ getManager: (n: string) => managers[n] ?? null });
  (manager as unknown as { provider: unknown }).provider = provider;
  store.set('pat', {
    username: 'pat', email: 'pat@example.com', displayName: 'Pat', password: `hash-${randomUUID()}`,
    isActive: true, isExternal: false, loginCount: 0, preferences: {}
  });
  return { manager, store, provider, audit, bump };
}

describe('one change at a time per account (#2025)', () => {
  test('two object-form updates of one user at once both land', async () => {
    const { manager, store } = makeManager();
    await Promise.all([
      manager.updateUser('pat', { a: 1 }, ADMIN),
      manager.updateUser('pat', { b: 2 }, ADMIN)
    ]);
    expect(store.get('pat')).toMatchObject({ a: 1, b: 2 });
  });

  test('the key is the normalized username: Pat and pat are one account', async () => {
    const { manager, store } = makeManager();
    await Promise.all([
      manager.updateUser('Pat', { a: 1 }, ADMIN),
      manager.updateUser('pat', { b: 2 }, ADMIN)
    ]);
    expect(store.get('pat')).toMatchObject({ a: 1, b: 2 });
  });

  test('two function-form updates that each append to a list both land', async () => {
    const { manager, store } = makeManager();
    const append = (place: string) => (current: Record<string, unknown>) => ({
      ownership: [...((current.ownership as string[] | undefined) ?? []), place]
    });
    await Promise.all([
      manager.updateUser('pat', append('cabin'), ADMIN),
      manager.updateUser('pat', append('flat'), ADMIN)
    ]);
    expect((store.get('pat').ownership as string[]).sort()).toEqual(['cabin', 'flat']);
  });

  test('a function returning undefined writes nothing and records nothing', async () => {
    const { manager, store, provider, audit, bump } = makeManager();
    const before = structuredClone(store.get('pat'));
    const result = await manager.updateUser('pat', () => undefined, ADMIN);
    expect(provider.updateUser).not.toHaveBeenCalled();
    expect(bump).not.toHaveBeenCalled();
    expect(audit).toEqual([]);
    expect(store.get('pat')).toEqual(before);
    expect(result.username).toBe('pat');
  });

  test('updateUser never hands the password hash back, in either form or when nothing changes', async () => {
    const { manager, store } = makeManager();
    const hash = String(store.get('pat').password);
    const results = [
      await manager.updateUser('pat', { displayName: 'Patricia' }, ADMIN),
      await manager.updateUser('pat', () => ({ displayName: 'Pat' }), ADMIN),
      await manager.updateUser('pat', () => undefined, ADMIN)
    ];
    for (const result of results) {
      expect(result).not.toHaveProperty('password');
      expect(JSON.stringify(result)).not.toContain(hash);
      expect(result.username).toBe('pat');
    }
    expect(store.get('pat').password).toBe(hash);
  });

  test('the function is handed a copy without the password hash', async () => {
    const { manager, store } = makeManager();
    const hash = store.get('pat').password;
    let seen: Record<string, unknown> | undefined;
    await manager.updateUser('pat', (current) => {
      seen = current;
      (current as Record<string, unknown>).displayName = 'changed through the copy';
      return undefined;
    }, ADMIN);
    expect(seen).toBeDefined();
    expect(seen).not.toHaveProperty('password');
    expect(JSON.stringify(seen)).not.toContain(String(hash));
    expect(seen.username).toBe('pat');
    expect(store.get('pat').displayName).toBe('Pat');
  });

  test('the function form is checked and recorded like the object form', async () => {
    const { manager, audit } = makeManager();
    await manager.updateUser('pat', () => ({ isActive: true, displayName: 'Patricia' }), ADMIN);
    expect(audit).toEqual([expect.objectContaining({ action: 'user-edit', result: 'success', metadata: expect.objectContaining({ fields: ['isActive'] }) })]);
    await expect(manager.updateUser('pat', () => ({ password: 'x', isExternal: true }), ADMIN)).rejects.toThrow(/external OAuth user/);
  });

  test('sign-in counters and an admin edit at the same time both land', async () => {
    const { manager, store } = makeManager();
    await Promise.all([
      manager.recordSignIn('pat'),
      manager.updateUser('pat', { displayName: 'Patricia' }, ADMIN),
      manager.recordSignIn('pat')
    ]);
    expect(store.get('pat')).toMatchObject({ displayName: 'Patricia', loginCount: 2 });
  });

  test('a password-hash upgrade at sign-in and an admin edit at the same time both land', async () => {
    const { manager, store } = makeManager();
    const newHash = `hash-${randomUUID()}`;
    await Promise.all([
      manager.upgradePasswordHash('pat', newHash, false),
      manager.updateUser('pat', { displayName: 'Patricia' }, ADMIN)
    ]);
    expect(store.get('pat')).toMatchObject({ displayName: 'Patricia', password: newHash });
  });
});
