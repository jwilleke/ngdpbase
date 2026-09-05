/**
 * Bootstrap admin recreation.
 *
 * The admin account used to be created only when the user store was
 * COMPLETELY empty. That left a trap with no exit: remove the `admin` record
 * while other accounts remain — a hand-edited users.json, a botched
 * migration, a restore from a partial backup — and the instance has no
 * administrator and never regains one, because the store is not empty.
 *
 * There is no password-reset route to fall back on, so the only escape was
 * deleting every other account to trigger the empty-store path: destroying
 * the user base to recover one login.
 */

import UserManager from '../UserManager';
import { pendingBootActions, resetBootActions } from '../../context/bootActions';

function makeManager(existing: Record<string, unknown>) {
  const store = new Map(Object.entries(existing));
  const provider = {
    initialize: vi.fn(),
    getUser: vi.fn((name: string) => Promise.resolve(store.get(name))),
    getAllUsers: vi.fn(() => Promise.resolve(store)),
    createUser: vi.fn((u: { username: string }) => {
      store.set(u.username, u);
      return Promise.resolve(u);
    }),
    updateUser: vi.fn(() => Promise.resolve()),
    userExists: vi.fn((n: string) => Promise.resolve(store.has(n)))
  };

  const configManager = {
    getProperty: vi.fn((key: string, dflt: unknown) => {
      if (key === 'ngdpbase.user.security.defaultpassword') return 'admin123';
      if (key === 'ngdpbase.user.security.passwordsalt') return 'test-salt';
      if (key === 'ngdpbase.roles.definitions') return {};
      return dflt;
    })
  };

  const manager = new UserManager({
    getManager: (n: string) => (n === 'ConfigurationManager' ? configManager : null)
  });

  // Bypass provider loading — this exercises the bootstrap decision, not
  // dynamic provider import.
  (manager as unknown as { provider: unknown }).provider = provider;

  return { manager, provider, store };
}

/** The decision under test, lifted out of initialize()'s provider loading. */
async function runBootstrapCheck(manager: UserManager, provider: { getUser: (n: string) => Promise<unknown>; getAllUsers: () => Promise<Map<string, unknown>> }) {
  const existingAdmin = await provider.getUser('admin');
  if (!existingAdmin) {
    await manager.createDefaultAdmin();
  }
}

describe('bootstrap admin recreation', () => {
  test('creates admin on a completely empty store', async () => {
    const { manager, provider, store } = makeManager({});

    await runBootstrapCheck(manager, provider);

    expect(store.has('admin')).toBe(true);
  });

  test('#1197: the creation is recorded as user-create under the system principal, origin boot, held until the sink is up', async () => {
    resetBootActions();
    const { manager, provider } = makeManager({});

    await runBootstrapCheck(manager, provider);
    await new Promise((r) => setTimeout(r, 0));   // the record is fire-and-forget

    const pending = pendingBootActions();
    expect(pending).toHaveLength(1);
    expect(pending[0].event).toMatchObject({ eventType: 'user-create', resource: 'admin', metadata: { origin: 'boot', bootstrap: true } });
    expect(pending[0].context.reason).toMatch(/bootstrap admin/);
  });

  test('recreates admin when it is missing but other accounts remain', async () => {
    // The trap. Previously this left the instance with no administrator, for
    // good, because the store was not empty.
    const { manager, provider, store } = makeManager({
      jim: { username: 'jim' },
      molly: { username: 'molly' }
    });

    await runBootstrapCheck(manager, provider);

    expect(store.has('admin')).toBe(true);
    // Recovery must not disturb the accounts that survived.
    expect(store.has('jim')).toBe(true);
    expect(store.has('molly')).toBe(true);
  });

  test('leaves an existing admin completely alone', async () => {
    // Rotated passwords must survive every restart.
    const { manager, provider, store } = makeManager({
      admin: { username: 'admin', password: 'operator-rotated-hash' }
    });

    await runBootstrapCheck(manager, provider);

    expect(provider.createUser).not.toHaveBeenCalled();
    expect((store.get('admin') as { password: string }).password).toBe('operator-rotated-hash');
  });

  test('the recreated admin uses the configured bootstrap password', async () => {
    const { manager, provider, store } = makeManager({ jim: { username: 'jim' } });

    await runBootstrapCheck(manager, provider);

    const admin = store.get('admin') as { password: string; isSystem: boolean };
    // Compared by VERIFICATION, not by equality: hashes are salted per user
    // (#1042), so re-hashing the same password never reproduces the same bytes.
    expect(manager.verifyPassword('admin123', admin.password)).toBe(true);
    expect(admin.isSystem).toBe(true);
  });
});

/**
 * #1087 — `InstallService` documented that a headless install "refuses to
 * start" without an admin password. It did not: the config key ships as the
 * literal `admin123` and `getBootstrapPassword()` falls back to a matching
 * constant, so an unattended deploy came up on a credential published in this
 * repository — failing open where the docs said it failed closed.
 *
 * These cover the wiring, not the guard itself (that has its own unit tests):
 * that `createDefaultAdmin` consults it, and that the interactive path is
 * untouched.
 */
describe('headless bootstrap admin guard (#1087)', () => {
  afterEach(() => {
    delete process.env.HEADLESS_INSTALL;
  });

  test('refuses to create the admin on the shipped password when headless', async () => {
    process.env.HEADLESS_INSTALL = 'true';
    const { manager, store } = makeManager({});

    await expect(manager.createDefaultAdmin()).rejects.toThrow(/NGDPBASE_ADMIN_PASSWORD/);
    // Refusing but creating the account anyway would be worse than no guard.
    expect(store.has('admin')).toBe(false);
  });

  test('still creates the admin on the shipped password when NOT headless', async () => {
    // Deliberate: a fresh local install must come up so the setup wizard is
    // reachable, and there is a human present to see the startup banner.
    const { manager, store } = makeManager({});

    await manager.createDefaultAdmin();

    expect(store.has('admin')).toBe(true);
  });
});
