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

function makeEngine() {
  const configManager = {
    getProperty: vi.fn((_k: string, d: unknown) => d),
    setRuntimeProperty: vi.fn()
  };
  return {
    engine: { getManager: vi.fn(() => configManager) },
    configManager
  };
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

  test('reports healthy, and says who the addon is for', async () => {
    const status = await demoAddon.status();
    expect(status.healthy).toBe(true);
    expect(status.message).toMatch(/demo/i);
  });

  test('shuts down cleanly', async () => {
    await expect(demoAddon.shutdown()).resolves.toBeUndefined();
  });
});
