/**
 * AddonsManager runs the add-on installer at boot (#1830): the add-ons
 * `ngdpbase.addons.install` names are installed into `<data>/addons`, found by
 * discovery there, and loaded when enabled; nothing else there loads. Outbound
 * HTTP is the guarded client, mocked here with a fake registry, so no socket is
 * opened. The real provenance check is tested with real cryptography in
 * addonProvenance.test.ts; here it is the fake one, and the Sigstore trust root
 * is never fetched. Teardown removes only this test's mkdtemp folder.
 */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { REGISTRY, REPO, fakeRegistry, makeTgz } from '../../test-support/fakeRegistry';

const registry = vi.hoisted(() => ({ handler: undefined }));

vi.mock('../../http/guardedFetch', () => ({
  guardedFetch: vi.fn(async (url: string, opts: { maxBytes: number; headers: Record<string, string> }) => {
    if (!registry.handler) throw new Error('no network in tests');
    const res = await registry.handler(url, { maxBytes: opts.maxBytes, accept: opts.headers.Accept });
    return { ...res, headers: {}, finalUrl: url, chain: [url] };
  })
}));

vi.mock('../../utils/sigstoreTrustedRoot', () => ({ DEFAULT_TUF_MIRROR: 'https://tuf.example.test', fetchTrustedRoot: vi.fn(async () => ({})) }));

vi.mock('../../utils/addonProvenance', async (importOriginal) => {
  // Same rule as fakeProvenance() in test-support (importing it here would be
  // circular: it imports this module).
  const real = await importOriginal<typeof import('../../utils/addonProvenance')>();
  return {
    ...real,
    verifyProvenance: vi.fn((input: Parameters<typeof real.verifyProvenance>[0]) => {
      const att = (input.attestations as { attestations?: Array<{ fakeRepository?: string }> } | null)?.attestations?.[0];
      const repository = real.normaliseRepository(input.repository);
      return att && real.normaliseRepository(att.fakeRepository ?? '') === repository
        ? { ok: true, repository }
        : { ok: false, reason: `the provenance attestation does not verify for ${String(repository)}` };
    })
  };
});

const PKG = '@acme/ledger-addon';
const SPEC = { ledger: { package: PKG, version: '^1', repository: REPO } };
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
    const notificationManager = { notifyAdmins: vi.fn(async (n: Record<string, unknown>) => { notifications.push(n); }) };
    const engine = { getManager: (n: string) => (n === 'ConfigurationManager' ? cm : n === 'NotificationManager' ? notificationManager : null) };
    const manager = new AddonsManager(engine);
    await manager.initialize();
    return manager;
  };

  /** The audit events recorded (no AuditManager here, so they wait in the boot ledger). */
  const recorded = async (): Promise<Array<Record<string, unknown>>> => {
    const { pendingBootActions } = await import('../../context/bootActions');
    return pendingBootActions().map((p) => p.event as unknown as Record<string, unknown>);
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
    expect(await recorded()).toEqual([]);
  });

  test('a configured add-on is installed, discovered in <data>/addons and loaded when enabled', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.2.0': { tgz: ledgerTgz } } });
    registry.handler = reg.fetch;

    const manager = await boot(SPEC, ['ledger']);

    expect(await fs.pathExists(path.join(dataDir, 'addons', 'ledger', 'index.js'))).toBe(true);
    expect(manager.getAddonNames()).toContain('ledger');
    expect(manager.isLoaded('ledger')).toBe(true);
    expect(reloads).toBe(1);
    expect(notifications).toEqual([]);

    // The next start reads the lock and never asks the registry.
    reg.calls.length = 0;
    reg.down = true;
    reloads = 0;
    vi.resetModules();
    const again = await boot(SPEC, ['ledger']);
    expect(reg.calls).toEqual([]);
    expect(again.isLoaded('ledger')).toBe(true);
    expect(reloads).toBe(0);
    expect(await recorded()).toEqual([]);
  });

  test('a successful install is recorded as addon-install, attributed to the system', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.2.0': { tgz: ledgerTgz } } });
    registry.handler = reg.fetch;

    await boot(SPEC, ['ledger']);

    const events = await recorded();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'addon-install',
      resource: 'ledger',
      metadata: expect.objectContaining({ package: PKG, version: '1.2.0', repository: 'github.com/acme/ledger', origin: 'boot' })
    });
  });

  test('registry down on a first install: boot continues, the add-on is absent, admins are told', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.2.0': { tgz: ledgerTgz } } });
    reg.down = true;
    registry.handler = reg.fetch;

    const manager = await boot(SPEC, ['ledger']);

    expect(manager.isInitialized()).toBe(true);
    expect(manager.getAddonNames()).not.toContain('ledger');
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ level: 'error' });
    expect(String(notifications[0].message)).toMatch(/^ledger not installed: registry unreachable/);
    expect(await recorded()).toEqual([]);
  });

  test('provenance from another repository: not installed, addon-verify-failed recorded, admins told', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.2.0': { tgz: ledgerTgz } } });
    registry.handler = reg.fetch;

    const manager = await boot({ ledger: { ...SPEC.ledger, repository: 'github.com/acme/other' } }, ['ledger']);

    expect(manager.getAddonNames()).not.toContain('ledger');
    expect(await recorded()).toEqual([
      expect.objectContaining({ eventType: 'addon-verify-failed', resource: 'ledger', result: 'failure', metadata: expect.objectContaining({ check: 'provenance' }) })
    ]);
    expect(String(notifications[0]?.message)).toMatch(/^ledger not installed: .*does not verify/);
  });

  test('a folder in <data>/addons the installer did not verify is not loaded, and admins are warned', async () => {
    const stray = path.join(dataDir, 'addons', 'stray');
    await fs.ensureDir(stray);
    await fs.writeFile(path.join(stray, 'index.js'), "module.exports = { name: 'stray', register: () => { throw new Error('loaded'); } };\n");
    await fs.writeJson(path.join(stray, 'package.json'), { name: 'stray', ngdpbase: { slug: 'stray' } });

    const manager = await boot({}, ['stray']);

    expect(manager.getAddonNames()).not.toContain('stray');
    expect(notifications).toEqual([expect.objectContaining({ level: 'warning', message: expect.stringMatching(/^stray in .* is not loaded/) })]);
  });

  test('even when addons-path names <data>/addons, only verified add-ons load from it', async () => {
    const stray = path.join(dataDir, 'addons', 'stray');
    await fs.ensureDir(stray);
    await fs.writeFile(path.join(stray, 'index.js'), "module.exports = { name: 'stray', register: () => {} };\n");
    const { default: AddonsManager } = await import('../AddonsManager');
    const cm = {
      getProperty: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.managers.addons-manager.addons-path') return [path.join(dataDir, 'addons')];
        if (key === 'ngdpbase.addons.install') return {};
        if (key === 'ngdpbase.addons.stray.enabled') return true;
        if (key === 'ngdpbase.managers.addons-manager.enabled') return true;
        return def;
      }),
      getInstanceDataFolder: () => dataDir,
      getResolvedDataPath: vi.fn(() => path.join(tmpDir, 'pages'))
    };
    const manager = new AddonsManager({ getManager: (n: string) => (n === 'ConfigurationManager' ? cm : null) });
    await manager.initialize();

    expect(manager.getAddonNames()).not.toContain('stray');
  });
});
