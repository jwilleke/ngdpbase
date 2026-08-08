/**
 * Demo addon registration (#1029).
 *
 * The addon adds a role and an access policy at runtime. The dangerous part is
 * that both live under single config keys holding the WHOLE catalogue — so a
 * careless write replaces every shipped role or, worse, every shipped policy
 * including `admin-full-access`, locking the operator out of their own
 * instance. That is precisely why this is done in register() rather than via
 * domainDefaults, which applies whole-key replacement.
 *
 * These tests exist to make that failure impossible to reintroduce quietly.
 */

import demoAddon from '../index';

const SHIPPED_ROLES = {
  admin: { name: 'admin', permissions: ['admin-system'] },
  contributor: { name: 'contributor', permissions: ['page-edit'] },
  reader: { name: 'reader', permissions: ['page-read'] }
};

const SHIPPED_POLICIES = [
  { id: 'admin-full-access', priority: 100, actions: ['admin-system'] },
  { id: 'user-admin-permissions', priority: 95, actions: ['user-read'] }
];

function makeEngine() {
  const store: Record<string, unknown> = {
    'ngdpbase.roles.definitions': structuredClone(SHIPPED_ROLES),
    'ngdpbase.access.policies': structuredClone(SHIPPED_POLICIES)
  };
  const configManager = {
    getProperty: vi.fn((key: string, def: unknown) => (key in store ? store[key] : def)),
    setRuntimeProperty: vi.fn((key: string, value: unknown) => { store[key] = value; })
  };
  return {
    engine: { getManager: vi.fn((n: string) => (n === 'ConfigurationManager' ? configManager : null)) },
    store,
    configManager
  };
}

const roles = (s: Record<string, unknown>) =>
  s['ngdpbase.roles.definitions'] as Record<string, { permissions: string[] }>;
const policies = (s: Record<string, unknown>) =>
  s['ngdpbase.access.policies'] as { id: string; priority: number; actions: string[] }[];

beforeEach(() => vi.clearAllMocks());

describe('demo addon register() (#1029)', () => {
  test('adds demo-admin without disturbing the shipped roles', async () => {
    const { engine, store } = makeEngine();
    await demoAddon.register(engine, {});

    expect(Object.keys(roles(store)).sort()).toEqual(['admin', 'contributor', 'demo-admin', 'reader']);
    expect(roles(store).admin.permissions).toEqual(['admin-system']);
  });

  test('adds its policy without dropping any shipped policy', async () => {
    // The one that would lock the operator out.
    const { engine, store } = makeEngine();
    await demoAddon.register(engine, {});

    const ids = policies(store).map((p) => p.id);
    expect(ids).toContain('admin-full-access');
    expect(ids).toContain('user-admin-permissions');
    expect(ids).toContain('demo-admin-access');
  });

  test('its policy sits below admin-full-access so it can never widen admin', async () => {
    const { engine, store } = makeEngine();
    await demoAddon.register(engine, {});

    const demo = policies(store).find((p) => p.id === 'demo-admin-access');
    const admin = policies(store).find((p) => p.id === 'admin-full-access');
    expect(demo.priority).toBeLessThan(admin.priority);
  });

  test('grants admin-read but NOT admin-system, user-read, admin-roles or page-delete', async () => {
    const { engine, store } = makeEngine();
    await demoAddon.register(engine, {});

    const perms = roles(store)['demo-admin'].permissions;
    expect(perms).toContain('admin-read');
    for (const withheld of ['admin-system', 'user-read', 'admin-roles', 'page-delete']) {
      expect(perms).not.toContain(withheld);
    }
  });

  test('the role and the policy grant exactly the same actions', async () => {
    // Display and enforcement drifting apart is the failure mode the core
    // config warns about; here they come from one constant, so pin it.
    const { engine, store } = makeEngine();
    await demoAddon.register(engine, {});

    const perms = roles(store)['demo-admin'].permissions;
    const actions = policies(store).find((p) => p.id === 'demo-admin-access').actions;
    expect([...actions].sort()).toEqual([...perms].sort());
  });

  test('is idempotent — a reload does not duplicate the policy', async () => {
    const { engine, store } = makeEngine();
    await demoAddon.register(engine, {});
    await demoAddon.register(engine, {});

    expect(policies(store).filter((p) => p.id === 'demo-admin-access')).toHaveLength(1);
  });

  test('degrades quietly when ConfigurationManager is unavailable', async () => {
    const engine = { getManager: vi.fn(() => null) };
    await expect(demoAddon.register(engine as never, {})).resolves.toBeUndefined();
  });
});
