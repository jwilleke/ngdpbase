/**
 * #1765: UserManager hands every account turned off or deleted to AuthManager's
 * one deactivation step, and nothing else.
 */
import UserManager from '../UserManager';
import type { ActorContext } from '../../context/ActorContext';

const ACTOR = { username: 'admin', isAuthenticated: true, roles: ['admin'] } as ActorContext;

function makeManager() {
  const store = new Map<string, Record<string, unknown>>([
    ['ann', { username: 'ann', email: 'ann@example.com', isActive: true }]
  ]);
  const closed: string[] = [];
  const provider = {
    getUser: vi.fn((n: string) => Promise.resolve(store.get(n) ? { ...store.get(n) } : undefined)),
    getAllUsers: vi.fn(() => Promise.resolve(store)),
    updateUser: vi.fn((n: string, u: Record<string, unknown>) => { store.set(n, u); return Promise.resolve(); }),
    deleteUser: vi.fn((n: string) => { store.delete(n); return Promise.resolve(); }),
    userExists: vi.fn((n: string) => Promise.resolve(store.has(n)))
  };
  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: vi.fn((_k: string, d: unknown) => d) },
    RoleManager: { applyRoleDiff: vi.fn(() => Promise.resolve()), resolveUserRoles: vi.fn(() => Promise.resolve([])), removeAllMemberships: vi.fn(() => Promise.resolve()) },
    PolicyInformationPoint: { isSystemPrincipal: () => false },
    AuthManager: { closeAccess: vi.fn((u: string, m: string) => { closed.push(`${m}:${u}`); return Promise.resolve(); }) }
  };
  const manager = new UserManager({ getManager: (n: string) => managers[n] ?? null });
  (manager as unknown as { provider: unknown }).provider = provider;
  return { manager, closed };
}

describe('UserManager → AuthManager.closeAccess (#1765)', () => {
  test('deleting an account closes its access', async () => {
    const { manager, closed } = makeManager();
    await manager.deleteUser('ann', ACTOR);
    expect(closed).toEqual(['delete:ann']);
  });

  test('turning an account off closes its access; other edits do not', async () => {
    const { manager, closed } = makeManager();
    await manager.updateUser('ann', { displayName: 'Ann B.' }, ACTOR);
    expect(closed).toEqual([]);
    await manager.updateUser('ann', { isActive: false }, ACTOR);
    expect(closed).toEqual(['disable:ann']);
    await manager.updateUser('ann', { isActive: false }, ACTOR);
    expect(closed).toEqual(['disable:ann']);
  });
});
