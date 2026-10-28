/**
 * The admin Update through AddonsManager (#2100): the door asks the PDP, the
 * Update is recorded as `addon-update` (who, the add-on, from and to) before
 * anything is written, the release runs from the next start, and a release
 * that does not load falls back to the previous one. Outbound HTTP is the
 * guarded client, mocked with a fake registry, so no socket is opened.
 * Teardown removes only this test's mkdtemp folder.
 */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { REGISTRY, REPO, fakeRegistry, makeTgz } from '../../test-support/fakeRegistry';
import { readLockSync } from '../../utils/addonLock';

const registry = vi.hoisted((): { handler?: (url: string, o: { maxBytes: number; accept: string }) => Promise<{ status: number; body: Buffer }> } => ({}));

vi.mock('../../http/guardedFetch', () => ({
  guardedFetch: vi.fn(async (url: string, opts: { maxBytes: number; headers: Record<string, string> }) => {
    if (!registry.handler) throw new Error('no network in tests');
    const res = await registry.handler(url, { maxBytes: opts.maxBytes, accept: opts.headers.Accept });
    return { ...res, headers: {}, finalUrl: url, chain: [url] };
  })
}));

vi.mock('../../utils/sigstoreTrustedRoot', () => ({ DEFAULT_TUF_MIRROR: 'https://tuf.example.test', fetchTrustedRoot: vi.fn(async () => ({})) }));

vi.mock('../../utils/addonProvenance', async (importOriginal) => {
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
/**
 * One index.js for every release: Node caches an add-on module by its path for
 * the life of the test process, so a release that fails says so with a file it
 * ships (`boom`), which register() looks for, not with different code.
 */
const ledger = (version: string, fails = false): Buffer => makeTgz([
  { name: 'package/package.json', data: JSON.stringify({ name: PKG, version, ngdpbase: { slug: 'ledger' } }) },
  { name: 'package/index.js', data: "const fs = require('fs'); const path = require('path');\nmodule.exports = { name: 'ledger', register: () => { if (fs.existsSync(path.join(__dirname, 'boom'))) throw new Error('boom in this release'); } };\n" },
  ...(fails ? [{ name: 'package/boom', data: 'x' }] : [])
]);
const shipped = JSON.parse(fs.readFileSync('./config/app-default-config.json', 'utf8')) as Record<string, unknown>;

const ADMIN = { username: 'alice', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };

describe('AddonsManager — admin Update of installed add-ons (#2100)', () => {
  let tmpDir: string;
  let dataDir: string;
  let notifications: Array<Record<string, unknown>>;
  let audit: Array<Record<string, unknown>>;
  let granted: string[];
  let sinkDown: boolean;

  const boot = async (enabled: string[] = ['ledger']): Promise<any> => {
    vi.resetModules();
    // A fresh module graph has an unbound audit registry; bind it to the shipped declarations as vitest.setup does.
    const { bindAuditEvents } = await import('../../utils/auditRegistry');
    bindAuditEvents((key, fallback) => (key in shipped ? shipped[key] : fallback));
    const { default: AddonsManager } = await import('../AddonsManager');
    const cm = {
      getProperty: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.managers.addons-manager.enabled') return true;
        if (key === 'ngdpbase.managers.addons-manager.addons-path') return path.join(tmpDir, 'addons');
        if (key === 'ngdpbase.addons.install') return SPEC;
        if (key === 'ngdpbase.managers.addons-manager.install.registry') return REGISTRY;
        if (key === 'ngdpbase.version') return '5.13.0';
        if (key === 'ngdpbase.addons') return {};
        const m = /^ngdpbase\.addons\.([^.]+)\.enabled$/.exec(key);
        if (m) return enabled.includes(m[1]);
        return def;
      }),
      getInstanceDataFolder: () => dataDir,
      reload: vi.fn(async () => {}),
      setProperty: vi.fn(async () => {}),
      getAllProperties: vi.fn(() => ({})),
      getResolvedDataPath: vi.fn(() => path.join(tmpDir, 'pages')),
      getCustomProperty: vi.fn(() => null),
      setRuntimeProperty: vi.fn()
    };
    const managers: Record<string, unknown> = {
      ConfigurationManager: cm,
      NotificationManager: { notifyAdmins: vi.fn(async (n: Record<string, unknown>) => { notifications.push(n); }) },
      PolicyDecisionPoint: { permits: vi.fn(async (_ctx: unknown, permission: string) => granted.includes(permission)) },
      AuditManager: {
        logAuditEvent: vi.fn(async (e: Record<string, unknown>) => {
          if (sinkDown) throw new Error('audit device full');
          audit.push(e);
        }),
        flushAuditQueue: vi.fn(async () => {})
      }
    };
    const manager = new AddonsManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    return manager;
  };

  const addonsDir = (): string => path.join(dataDir, 'addons');
  /** Boot with 1.0.0 installed (the only release then), then let the registry hold `later` too. */
  const bootAt100 = async (later: Record<string, { tgz: Buffer }>): Promise<{ manager: any; reg: ReturnType<typeof fakeRegistry> }> => {
    registry.handler = fakeRegistry({ [PKG]: { '1.0.0': { tgz: ledger('1.0.0') } } }).fetch;
    const manager = await boot();
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: ledger('1.0.0') }, ...later } });
    registry.handler = reg.fetch;
    return { manager, reg };
  };
  const installedVersion = async (): Promise<string> => JSON.parse(await fs.readFile(path.join(addonsDir(), 'ledger', 'package.json'), 'utf8')).version as string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'addons-update-'));
    dataDir = path.join(tmpDir, 'data');
    notifications = [];
    audit = [];
    granted = ['admin-system', 'admin-read', 'config-manage'];
    sinkDown = false;
    registry.handler = undefined;
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  test('check: an admin sees the pinned release and the newer one in range', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: ledger('1.0.0') } } });
    registry.handler = reg.fetch;
    await boot();
    const later = fakeRegistry({ [PKG]: { '1.0.0': { tgz: ledger('1.0.0') }, '1.1.0': { tgz: ledger('1.1.0') } } });
    registry.handler = later.fetch;
    const manager = await boot();
    expect(later.calls).toEqual([]);   // the restart asked npm nothing

    const [check] = await manager.checkInstalledUpdates(ADMIN);

    expect(check).toMatchObject({ slug: 'ledger', pinned: '1.0.0', range: '^1', newest: '1.1.0', available: '1.1.0' });
  });

  test('check: refused by the PDP without admin-read or admin-system; the registry is not asked', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: ledger('1.0.0') } } });
    registry.handler = reg.fetch;
    const manager = await boot();
    reg.calls.length = 0;
    granted = [];

    await expect(manager.checkInstalledUpdates(ADMIN)).rejects.toThrow(/needs admin-read or admin-system/);
    expect(reg.calls).toEqual([]);
  });

  test('update: refused by the PDP without config-manage, whatever the role says; nothing staged', async () => {
    const { manager } = await bootAt100({ '1.1.0': { tgz: ledger('1.1.0') } });
    granted = ['admin-system', 'admin-read'];   // role "admin", but policy does not grant config-manage

    // Sabotage: making requireAddonPermission return without asking staged 1.1.0 (red).
    await expect(manager.updateInstalledAddon(ADMIN, 'ledger', '1.1.0')).rejects.toThrow(/needs config-manage/);
    expect(readLockSync(addonsDir()).addons.ledger.pending).toBeUndefined();
    expect(audit.filter((e) => e.eventType === 'addon-update')).toEqual([]);
  });

  test('update: staged, recorded as addon-update with who and from/to; the running add-on is untouched', async () => {
    const { manager } = await bootAt100({ '1.1.0': { tgz: ledger('1.1.0') } });

    const outcome = await manager.updateInstalledAddon(ADMIN, 'ledger', '1.1.0');

    expect(outcome).toMatchObject({ status: 'staged', version: '1.1.0', previousVersion: '1.0.0' });
    // Sabotage: removing the beforeInstall hook from updateInstalledAddon left no record (red).
    expect(audit.filter((e) => e.eventType === 'addon-update')).toEqual([expect.objectContaining({
      user: 'alice',
      ipAddress: '203.0.113.7',
      resource: 'ledger',
      result: 'success',
      metadata: expect.objectContaining({ origin: 'request', package: PKG, fromVersion: '1.0.0', toVersion: '1.1.0' })
    })]);
    expect(await installedVersion()).toBe('1.0.0');
    expect(manager.isLoaded('ledger')).toBe(true);
  });

  test('update: a record that cannot be written stops it; nothing staged', async () => {
    const { manager } = await bootAt100({ '1.1.0': { tgz: ledger('1.1.0') } });
    sinkDown = true;

    await expect(manager.updateInstalledAddon(ADMIN, 'ledger', '1.1.0')).rejects.toThrow();
    expect(readLockSync(addonsDir()).addons.ledger.pending).toBeUndefined();
    expect(await fs.pathExists(path.join(addonsDir(), '.packages', 'ledger-1.1.0.tgz'))).toBe(false);
  });

  test('update with npm unreachable: refused as registryUnreachable; the site stays on its version', async () => {
    const { manager, reg } = await bootAt100({ '1.1.0': { tgz: ledger('1.1.0') } });
    reg.down = true;

    const outcome = await manager.updateInstalledAddon(ADMIN, 'ledger', '1.1.0');

    expect(outcome).toMatchObject({ status: 'refused', registryUnreachable: true });
    expect(readLockSync(addonsDir()).addons.ledger).toMatchObject({ version: '1.0.0' });
  });

  test('the next start runs the new release and removes the previous one', async () => {
    const { manager: first, reg } = await bootAt100({ '1.1.0': { tgz: ledger('1.1.0') } });
    await first.updateInstalledAddon(ADMIN, 'ledger', '1.1.0');
    reg.down = true;

    const manager = await boot();

    expect(manager.isLoaded('ledger')).toBe(true);
    expect(await installedVersion()).toBe('1.1.0');
    const entry = readLockSync(addonsDir()).addons.ledger;
    expect(entry.version).toBe('1.1.0');
    // Sabotage: not calling settleUpdatedAddons left `previous` in the lock (red).
    expect(entry.previous).toBeUndefined();
    expect(await fs.pathExists(path.join(addonsDir(), '.previous-ledger'))).toBe(false);
    expect(await fs.pathExists(path.join(addonsDir(), '.packages', 'ledger-1.0.0.tgz'))).toBe(false);
  });

  test('a new release that does not load falls back: the previous one is restored for the next start, admins told, recorded', async () => {
    const { manager: first, reg } = await bootAt100({ '1.1.0': { tgz: ledger('1.1.0', true) } });
    await first.updateInstalledAddon(ADMIN, 'ledger', '1.1.0');
    reg.down = true;
    audit = [];

    const failed = await boot();

    expect(failed.isLoaded('ledger')).toBe(false);
    // Sabotage: confirming every switched add-on regardless of load kept 1.1.0 (red).
    expect(readLockSync(addonsDir()).addons.ledger).toMatchObject({ version: '1.0.0' });
    expect(await installedVersion()).toBe('1.0.0');
    expect(notifications).toContainEqual(expect.objectContaining({
      level: 'error',
      message: expect.stringMatching(/^ledger 1\.1\.0 did not load \(.*boom in this release.*\)\. ledger 1\.0\.0 is restored and runs after the next restart/)
    }));
    expect(audit).toContainEqual(expect.objectContaining({
      eventType: 'addon-update',
      result: 'failure',
      resource: 'ledger',
      metadata: expect.objectContaining({ fromVersion: '1.1.0', toVersion: '1.0.0', fallback: true })
    }));

    // The start after that runs 1.0.0 again, verified from its kept tarball, with no registry.
    const again = await boot();
    expect(again.isLoaded('ledger')).toBe(true);
    expect(reg.calls.filter((u) => u.includes('1.0.0.tgz'))).toEqual([]);
  });
});
