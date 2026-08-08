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

import demoAddon, { ADMIN_DEFAULTS } from '../index';

/**
 * Stand-ins for operator-supplied config. Deliberately not credential-shaped:
 * a plausible-looking password literal here is a secret-scanner false positive
 * on every scan, forever, and these assertions only care that the value is
 * carried through unchanged.
 */
const CONFIGURED = {
  username: 'lookaround',
  password: 'configured-password-value',
  email: 'look@example.org',
  displayName: 'Look Around'
};

function makeEngine(overrides: { existingUser?: unknown } = {}) {
  const configManager = {
    getProperty: vi.fn((_k: string, d: unknown) => d),
    setRuntimeProperty: vi.fn()
  };
  const userManager = {
    getUser: vi.fn(() => Promise.resolve(overrides.existingUser)),
    createUser: vi.fn(() => Promise.resolve({}))
  };
  const pluginManager = {
    registerPlugin: vi.fn(() => Promise.resolve())
  };
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'UserManager') return userManager;
      if (name === 'PluginManager') return pluginManager;
      return configManager;
    })
  };
  return { engine, configManager, userManager, pluginManager };
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

  test('registers [{DemoLogin}] so the Welcome page can show live credentials', async () => {
    const { engine, pluginManager } = makeEngine();
    await demoAddon.register(engine, {});

    expect(pluginManager.registerPlugin).toHaveBeenCalledWith('DemoLogin', expect.anything());
  });
});

describe('demo addon shared admin account (#1029)', () => {
  /** The operator-supplied password, as it arrives from NGDPBASE_DEMO_ADMIN_PASSWORD. */
  const SUPPLIED = { 'admin-account': { password: CONFIGURED.password } };

  test('seeds admindemo with demo-admin and a locked profile', async () => {
    const { engine, userManager } = makeEngine();
    await demoAddon.register(engine, SUPPLIED);

    expect(userManager.createUser).toHaveBeenCalledTimes(1);
    const created = userManager.createUser.mock.calls[0][0];
    expect(created.username).toBe(ADMIN_DEFAULTS.username);
    expect(created.password).toBe(CONFIGURED.password);
    expect(created.roles).toEqual(['demo-admin']);
    // Without this the published password is a takeover: a visitor repoints
    // the email at their own inbox and magic-links back in forever.
    expect(created.profileLocked).toBe(true);
  });

  test('seeds nothing when no password is configured', async () => {
    // No fallback by design. An account with a guessable password is worse
    // than no account — that is the whole reason 'admin123' stopped shipping.
    const { engine, userManager } = makeEngine();
    await demoAddon.register(engine, {});

    expect(userManager.createUser).not.toHaveBeenCalled();
  });

  test('treats an unresolved ${VAR} placeholder as no password', async () => {
    // The key ships in the brace form, which is SILENT on a missing variable
    // and leaves the placeholder intact — so "unset" arrives as the literal
    // "${NGDPBASE_DEMO_ADMIN_PASSWORD}". Seeding that as a password would be
    // the worst outcome of all: a real account with a credential anyone can
    // read out of the shipped config.
    const { engine, userManager } = makeEngine();
    await demoAddon.register(engine, {
      'admin-account': { password: '${NGDPBASE_DEMO_ADMIN_PASSWORD}' }
    });

    expect(userManager.createUser).not.toHaveBeenCalled();
  });

  test('a missing password does not stop the addon loading — pages still ship', async () => {
    const { engine } = makeEngine();
    await expect(demoAddon.register(engine, {})).resolves.toBeUndefined();
  });

  test('leaves an existing account alone, so a rotated password survives restart', async () => {
    const { engine, userManager } = makeEngine({
      existingUser: { username: 'admindemo' }
    });
    await demoAddon.register(engine, SUPPLIED);

    expect(userManager.createUser).not.toHaveBeenCalled();
  });

  test('honours configured username, password and email', async () => {
    const { engine, userManager } = makeEngine();
    await demoAddon.register(engine, {
      'admin-account': {
        username: CONFIGURED.username,
        password: CONFIGURED.password,
        email: CONFIGURED.email,
        'display-name': CONFIGURED.displayName
      }
    });

    expect(userManager.createUser.mock.calls[0][0]).toMatchObject(CONFIGURED);
  });

  test('skips seeding when admin-account.enabled is false', async () => {
    const { engine, userManager } = makeEngine();
    await demoAddon.register(engine, { 'admin-account': { enabled: false } });

    expect(userManager.createUser).not.toHaveBeenCalled();
  });

  test('a failed seed does not fail registration — the pages still ship', async () => {
    const { engine, userManager } = makeEngine();
    userManager.createUser.mockRejectedValue(new Error('user store unreachable'));

    // Must supply a password, or seeding short-circuits before createUser and
    // the rejection never fires — the test would pass without proving anything.
    await expect(demoAddon.register(engine, SUPPLIED)).resolves.toBeUndefined();
    expect(userManager.createUser).toHaveBeenCalled();
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
