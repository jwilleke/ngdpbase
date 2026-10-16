/**
 * AddonsManager runs the add-on installer at boot (#1830, slice 1): the add-ons
 * `ngdpbase.addons.install` names are installed into `<data>/addons`, found by
 * discovery there, and loaded when enabled. Outbound HTTP is the guarded client,
 * mocked here with a fake registry, so no socket is opened. Teardown removes
 * only this test's mkdtemp folder.
 */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { REGISTRY, fakeRegistry, makeTgz } from '../../test-support/fakeRegistry';

const registry = vi.hoisted(() => ({ handler: undefined }));

vi.mock('../../http/guardedFetch', () => ({
  guardedFetch: vi.fn(async (url: string, opts: { maxBytes: number; headers: Record<string, string> }) => {
    if (!registry.handler) throw new Error('no network in tests');
    const res = await registry.handler(url, { maxBytes: opts.maxBytes, accept: opts.headers.Accept });
    return { ...res, headers: {}, finalUrl: url, chain: [url] };
  })
}));

const PKG = '@acme/ledger-addon';
const ledgerTgz = makeTgz([
  { name: 'package/package.json', data: JSON.stringify({ name: PKG, version: '1.2.0', ngdpbase: { slug: 'ledger' } }) },
  { name: 'package/index.js', data: "module.exports = { name: 'ledger', version: '1.2.0', register: () => {} };\n" }
]);

describe('AddonsManager — installed add-ons (#1830)', () => {
  let tmpDir: string;
  let dataDir: string;
  let notifications: Array<Record<string, unknown>>;
  let reloads: number;

  const boot = async (install: Record<string, unknown>, enabled: string[] = []): Promise<any> => {
    const { default: AddonsManager } = await import('../AddonsManager');
    const cm = {
      getProperty: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.managers.addons-manager.enabled') return true;
        if (key === 'ngdpbase.managers.addons-manager.addons-path') return path.join(tmpDir, 'addons');
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(tmpDir, 'pages');
        if (key === 'ngdpbase.addons.install') return install;
        if (key === 'ngdpbase.managers.addons-manager.install.registry') return REGISTRY;
        if (key === 'ngdpbase.version') return '5.13.0';
        if (key === 'ngdpbase.addons') return {};
        const m = /^ngdpbase\.addons\.([^.]+)\.enabled$/.exec(key);
        if (m) return enabled.includes(m[1]);
        return def;
      }),
      getInstanceDataFolder: () => dataDir,
      reload: vi.fn(async () => { reloads++; }),
      setProperty: vi.fn(async () => {}),
      getAllProperties: vi.fn(() => ({})),
      getResolvedDataPath: vi.fn(() => path.join(tmpDir, 'pages')),
      getCustomProperty: vi.fn(() => null),
      setRuntimeProperty: vi.fn()
    };
    const notificationManager = { createNotification: vi.fn(async (n: Record<string, unknown>) => { notifications.push(n); }) };
    const engine = { getManager: (n: string) => (n === 'ConfigurationManager' ? cm : n === 'NotificationManager' ? notificationManager : null) };
    const manager = new AddonsManager(engine);
    await manager.initialize();
    return manager;
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'addons-install-'));
    dataDir = path.join(tmpDir, 'data');
    notifications = [];
    reloads = 0;
    registry.handler = undefined;
    vi.resetModules();
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  test('an empty install map changes nothing: no request, no folder', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.2.0': { tgz: ledgerTgz } } });
    registry.handler = reg.fetch;

    const manager = await boot({});

    expect(reg.calls).toEqual([]);
    expect(await fs.pathExists(path.join(dataDir, 'addons'))).toBe(false);
    expect(manager.getAddonNames()).toEqual([]);
    expect(reloads).toBe(0);
  });

  test('a configured add-on is installed, discovered in <data>/addons and loaded when enabled', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.2.0': { tgz: ledgerTgz } } });
    registry.handler = reg.fetch;

    const manager = await boot({ ledger: { package: PKG, version: '^1' } }, ['ledger']);

    expect(await fs.pathExists(path.join(dataDir, 'addons', 'ledger', 'index.js'))).toBe(true);
    expect(manager.getAddonNames()).toContain('ledger');
    expect(manager.isLoaded('ledger')).toBe(true);
    expect(reloads).toBe(1);
    expect(notifications).toEqual([]);

    // The next start reads the lock and never asks the registry.
    reg.calls.length = 0;
    reg.down = true;
    reloads = 0;
    const again = await boot({ ledger: { package: PKG, version: '^1' } }, ['ledger']);
    expect(reg.calls).toEqual([]);
    expect(again.isLoaded('ledger')).toBe(true);
    expect(reloads).toBe(0);
  });

  test('registry down on a first install: boot continues, the add-on is absent, admins are told', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.2.0': { tgz: ledgerTgz } } });
    reg.down = true;
    registry.handler = reg.fetch;

    const manager = await boot({ ledger: { package: PKG, version: '^1' } }, ['ledger']);

    expect(manager.isInitialized()).toBe(true);
    expect(manager.getAddonNames()).not.toContain('ledger');
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: 'system', level: 'error' });
    expect(String(notifications[0].message)).toMatch(/^ledger not installed: registry unreachable/);
  });
});
