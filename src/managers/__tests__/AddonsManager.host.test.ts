/**
 * Add-ons reach core through a host, not ../../dist imports (#1813 slice 1).
 *
 * Real addon folders in a mkdtemp directory, loaded by the real AddonsManager;
 * only configuration is a stand-in. Each addon's register() parks what it was
 * handed on globalThis so the test can inspect it.
 */

import os from 'os';
import path from 'path';
import fs from 'fs-extra';

const SLOT = '__addonHostTest';

const HOST_KEYS = [
  'ApiContext', 'ApiError', 'sendApiError',
  'recordAuditEvent', 'addonAuditEventName', 'actorOf',
  'jobContextFromRequest', 'jobContextFromSystem',
  'logger', 'guardedFetch', 'setEnabledForPerson'
].sort();

describe('AddonsManager — host passed to register (#1813)', () => {
  let tmpDir: string;
  let AddonsManager: any;
  let calls: Record<string, unknown[]>;

  /** What the ledger addon's own default-config.json declares. */
  const ledgerDefaults = {
    'ngdpbase.permissions.definitions': {
      'ledger-post': { description: 'Post to the ledger', audit: { 'on-failure': 'continue', description: 'Ledger posted' } }
    },
    'ngdpbase.audit.events': {
      'ledger-close': { 'on-failure': 'continue', description: 'Ledger period closed' }
    }
  };

  const load = async (): Promise<any> => {
    const cm = {
      getProperty: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.managers.addons-manager.enabled') return true;
        if (key === 'ngdpbase.managers.addons-manager.addons-path') return tmpDir;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(tmpDir, 'pages');
        if (key === 'ngdpbase.addons') return {};
        if (key === 'ngdpbase.version') return '99.0.0';
        if (key === 'ngdpbase.addons.ledger.enabled') return true;
        if (key === 'ngdpbase.addons.legacy.enabled') return true;
        return def;
      }),
      getAddonDeclaredDefaults: vi.fn((slug: string) => (slug === 'ledger' ? ledgerDefaults : {})),
      setProperty: vi.fn(async () => {}),
      getAllProperties: vi.fn(() => ({})),
      getResolvedDataPath: vi.fn(() => path.join(tmpDir, 'pages')),
      getCustomProperty: vi.fn(() => null),
      setRuntimeProperty: vi.fn()
    };
    const manager = new AddonsManager({ getManager: (n: string) => (n === 'ConfigurationManager' ? cm : null) });
    await manager.initialize();
    return manager;
  };

  const writeAddon = async (slug: string, registerSource: string) => {
    const dir = path.join(tmpDir, slug);
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, 'package.json'), { name: slug, version: '1.0.0' });
    await fs.writeFile(path.join(dir, 'index.js'),
      `module.exports = { name: '${slug}', version: '1.0.0', register: ${registerSource} };\n`);
  };

  const hostOf = (slug: string): any => calls[slug][2];

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'addons-host-'));
    calls = {};
    (globalThis as any)[SLOT] = calls;
    vi.resetModules();
    const mod = await import('../AddonsManager');
    AddonsManager = mod.default ?? mod;

    await writeAddon('ledger',
      `function (engine, config, host) { globalThis['${SLOT}'].ledger = [engine, config, host]; }`);
    await writeAddon('legacy',
      `function (engine, config) { globalThis['${SLOT}'].legacy = [engine, config]; }`);
  });

  afterEach(async () => {
    delete (globalThis as any)[SLOT];
    await fs.remove(tmpDir).catch(() => {});
  });

  test('a three-argument add-on receives the host with all eleven values', async () => {
    const manager = await load();
    expect((await manager.getStatus()).find((s: any) => s.name === 'ledger')).toMatchObject({ loaded: true, error: null });

    const host = hostOf('ledger');
    expect(Object.keys(host).sort()).toEqual(HOST_KEYS);

    const ctx = await import('../../context/ApiContext');
    const jobs = await import('../../context/JobContext');
    const actor = await import('../../context/ActorContext');
    const http = await import('../../http/guardedFetch');
    expect(host.ApiContext).toBe(ctx.ApiContext);
    expect(host.ApiError).toBe(ctx.ApiError);
    expect(host.sendApiError).toBe(ctx.sendApiError);
    expect(host.actorOf).toBe(actor.actorOf);
    expect(host.jobContextFromRequest).toBe(jobs.jobContextFromRequest);
    expect(host.jobContextFromSystem).toBe(jobs.jobContextFromSystem);
    expect(host.guardedFetch).toBe(http.guardedFetch);
    expect(typeof host.recordAuditEvent).toBe('function');
    expect(typeof host.addonAuditEventName).toBe('function');
    expect(typeof host.logger.info).toBe('function');
  });

  test('a two-argument add-on still loads', async () => {
    const manager = await load();
    const legacy = (await manager.getStatus()).find((s: any) => s.name === 'legacy');
    expect(legacy).toMatchObject({ loaded: true, error: null });
    expect(calls.legacy).toHaveLength(2);
  });

  test('the host is frozen', async () => {
    await load();
    const host = hostOf('ledger');
    expect(Object.isFrozen(host)).toBe(true);
    expect(() => { host.guardedFetch = () => null; }).toThrow(TypeError);
  });

  test('each add-on gets its own host', async () => {
    await writeAddon('legacy',
      `function (engine, config, host) { globalThis['${SLOT}'].legacy = [engine, config, host]; }`);
    await load();
    expect(hostOf('legacy')).not.toBe(hostOf('ledger'));
  });

  test('the logger is a child of core\'s logger, tagged with the add-on slug', async () => {
    // The logger is mocked globally (vitest.setup.ts); winston's child() adds
    // its argument as metadata to every line, which FileLoggingProvider renders.
    const { default: logger } = await import('../../utils/logger');
    const child = vi.mocked(logger.child);
    child.mockClear();
    await load();
    const call = child.mock.calls.findIndex(([meta]) => (meta as { addon?: string }).addon === 'ledger');
    expect(call).toBeGreaterThanOrEqual(0);
    expect(child.mock.calls[call][0]).toEqual({ addon: 'ledger' });
    expect(hostOf('ledger').logger).toBe(child.mock.results[call].value);
  });

  test('the audit helpers accept the add-on\'s declared events', async () => {
    await load();
    const host = hostOf('ledger');
    expect(host.addonAuditEventName('ledger-post')).toBe('ledger-post');
    expect(host.addonAuditEventName('ledger-close')).toBe('ledger-close');
  });

  test('an undeclared audit event is refused through the host', async () => {
    await load();
    const host = hostOf('ledger');
    const sink = { logAuditEvent: vi.fn(async () => {}) };

    expect(() => host.addonAuditEventName('journal-entry-create')).toThrow(/Add-on 'ledger' may record only the audit events it declares/);
    await expect(host.recordAuditEvent(sink, { eventType: 'journal-entry-create', user: 'system' }))
      .rejects.toThrow(/'journal-entry-create' is not one of them/);
    // a core event is not this add-on's either
    await expect(host.recordAuditEvent(sink, { eventType: 'page-edit', user: 'system' }))
      .rejects.toThrow(/may record only the audit events it declares/);
    expect(sink.logAuditEvent).not.toHaveBeenCalled();
  });
});
