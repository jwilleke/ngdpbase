/**
 * Demo addon registration (#1029).
 *
 * The addon deliberately registers NOTHING at runtime. The `demo-admin` role
 * and its access policy live in `config/app-default-config.json`, which is both
 * where custom roles belong (`UserManager.createRole()` says so) and the only
 * place that works: `UserManager` snapshots `ngdpbase.roles.definitions` during
 * `initialize()`, long before `AddonsManager` loads, so a role injected at
 * runtime is enforced by PolicyEvaluator yet never appears in the user-edit
 * role picker — a symptom with no visible cause.
 *
 * An earlier revision did inject it, and that is exactly what happened.
 */

import demoAddon from '../index';

function makeEngine(overrides: { existingUser?: unknown } = {}) {
  const configManager = {
    getProperty: vi.fn((_k: string, d: unknown) => d),
    setRuntimeProperty: vi.fn()
  };
  const userManager = {
    getUser: vi.fn(() => Promise.resolve(overrides.existingUser)),
    createUser: vi.fn(() => Promise.resolve({}))
  };
  const engine = {
    getManager: vi.fn((name: string) =>
      name === 'UserManager' ? userManager : configManager
    )
  };
  return { engine, configManager, userManager };
}

beforeEach(() => vi.clearAllMocks());

describe('demo addon register() (#1029)', () => {
  test('writes no configuration at runtime', async () => {
    // The regression guard. Runtime role injection looks like it works —
    // policy evaluation honours it — while the role is invisible in the UI.
    const { engine, configManager } = makeEngine();
    await demoAddon.register(engine, {});

    expect(configManager.setRuntimeProperty).not.toHaveBeenCalled();
  });

  test('resolves without an engine of any kind', async () => {
    const engine = { getManager: vi.fn(() => null) };
    await expect(demoAddon.register(engine as never, {})).resolves.toBeUndefined();
  });
});

describe('demo addon shared admin account (#1029)', () => {
  test('seeds admindemo with demo-admin and a locked profile', async () => {
    const { engine, userManager } = makeEngine();
    await demoAddon.register(engine, {});

    expect(userManager.createUser).toHaveBeenCalledTimes(1);
    const created = userManager.createUser.mock.calls[0][0];
    expect(created.username).toBe('admindemo');
    expect(created.password).toBe('admin123');
    expect(created.roles).toEqual(['demo-admin']);
    // Without this the published password is a takeover: a visitor repoints
    // the email at their own inbox and magic-links back in forever.
    expect(created.profileLocked).toBe(true);
  });

  test('leaves an existing account alone, so a rotated password survives restart', async () => {
    const { engine, userManager } = makeEngine({
      existingUser: { username: 'admindemo' }
    });
    await demoAddon.register(engine, {});

    expect(userManager.createUser).not.toHaveBeenCalled();
  });

  test('honours configured username, password and email', async () => {
    const { engine, userManager } = makeEngine();
    await demoAddon.register(engine, {
      'admin-account': {
        username: 'lookaround',
        password: 'seekrit',
        email: 'look@example.org',
        'display-name': 'Look Around'
      }
    });

    const created = userManager.createUser.mock.calls[0][0];
    expect(created).toMatchObject({
      username: 'lookaround',
      password: 'seekrit',
      email: 'look@example.org',
      displayName: 'Look Around'
    });
  });

  test('skips seeding when admin-account.enabled is false', async () => {
    const { engine, userManager } = makeEngine();
    await demoAddon.register(engine, { 'admin-account': { enabled: false } });

    expect(userManager.createUser).not.toHaveBeenCalled();
  });

  test('a failed seed does not fail registration — the pages still ship', async () => {
    const { engine, userManager } = makeEngine();
    userManager.createUser.mockRejectedValue(new Error('user store unreachable'));

    await expect(demoAddon.register(engine, {})).resolves.toBeUndefined();
  });

  test('reports healthy, and says who the addon is for', async () => {
    const status = await demoAddon.status();
    expect(status.healthy).toBe(true);
    expect(status.message).toMatch(/demo/i);
  });

  test('shuts down cleanly', async () => {
    await expect(demoAddon.shutdown()).resolves.toBeUndefined();
  });
});
