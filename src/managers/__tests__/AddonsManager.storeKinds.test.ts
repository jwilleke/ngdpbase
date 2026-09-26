/**
 * An addon declares its private store kind (#1414 step 2).
 *
 * Real addon folders on disk, loaded by the real AddonsManager; only
 * configuration is a stand-in, so what is asserted is what reaches
 * `setProperty` — the durable write — and what the admin screen and the store
 * door are told.
 */

import os from 'os';
import path from 'path';
import fs from 'fs-extra';

describe('AddonsManager — store kinds an addon declares (#1414)', () => {
  let tmpDir: string;
  let AddonsManager: any;
  let config: Record<string, unknown>;
  let written: Array<{ key: string; value: unknown; reason?: string }>;

  const configManager = () => ({
    getProperty: vi.fn((key: string, def: unknown) => {
      if (key === 'ngdpbase.managers.addons-manager.enabled') return true;
      if (key === 'ngdpbase.managers.addons-manager.addons-path') return tmpDir;
      if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(tmpDir, 'pages');
      if (key === 'ngdpbase.addons') return {};
      return key in config ? config[key] : def;
    }),
    setProperty: vi.fn(async (key: string, value: unknown, ctx: { reason?: string }) => {
      config[key] = value;
      written.push({ key, value, reason: ctx?.reason });
    }),
    getAllProperties: vi.fn(() => ({})),
    getCustomProperty: vi.fn(() => null),
    setRuntimeProperty: vi.fn()
  });

  const load = async (): Promise<any> => {
    const cm = configManager();
    const manager = new AddonsManager({ getManager: (n: string) => (n === 'ConfigurationManager' ? cm : null) });
    await manager.initialize();
    return manager;
  };

  /** An addon folder with a package.json `ngdpbase` block. */
  const writeAddon = async (name: string, ngdpbase: Record<string, unknown>, opts: { throws?: boolean } = {}) => {
    const dir = path.join(tmpDir, name);
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, 'package.json'), { name, ngdpbase });
    await fs.writeFile(path.join(dir, 'index.js'),
      `module.exports = { name: '${name}', version: '1.0.0', register: () => { ${opts.throws ? "throw new Error('boom');" : ''} } };`);
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'addons-storekinds-'));
    config = {};
    written = [];
    vi.resetModules();
    const mod = await import('../AddonsManager');
    AddonsManager = mod.default ?? mod;
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  test('first load saves the kind to configuration, owned by the addon\'s slug', async () => {
    await writeAddon('yourphr', { stores: [{ id: 'yourphr', encrypt: true }] });
    config['ngdpbase.addons.yourphr.enabled'] = true;

    await load();

    expect(written.map(w => [w.key, w.value])).toEqual([
      ['ngdpbase.stores.yourphr.owner', 'yourphr'],
      ['ngdpbase.stores.yourphr.encrypt', true]
    ]);
    // Written by a system context that says why, for the config-change record.
    expect(written[0].reason).toMatch(/yourphr declares private store kind yourphr/);
  });

  test('after that configuration wins: a disagreeing manifest is ignored and reported, and the addon loads', async () => {
    await writeAddon('yourphr', { stores: [{ id: 'yourphr', encrypt: false }] });
    Object.assign(config, {
      'ngdpbase.addons.yourphr.enabled': true,
      'ngdpbase.stores.yourphr.owner': 'yourphr',
      'ngdpbase.stores.yourphr.encrypt': true
    });

    const manager = await load();

    expect(written).toEqual([]);
    expect(config['ngdpbase.stores.yourphr.encrypt']).toBe(true);
    const status = (await manager.getStatus()).find((s: { name: string }) => s.name === 'yourphr');
    expect(status.loaded).toBe(true);
    expect(status.storeNotices.join(' ')).toMatch(/declared encrypt: false.*holds it as encrypt: true.*ignored/);
  });

  test('an id another addon owns is refused, and the rest of the addon still runs', async () => {
    await writeAddon('intruder', { stores: [{ id: 'yourphr', encrypt: false }] });
    Object.assign(config, {
      'ngdpbase.addons.intruder.enabled': true,
      'ngdpbase.stores.yourphr.owner': 'yourphr',
      'ngdpbase.stores.yourphr.encrypt': true
    });

    const manager = await load();

    expect(written).toEqual([]);
    expect(config['ngdpbase.stores.yourphr.owner']).toBe('yourphr');
    const status = (await manager.getStatus()).find((s: { name: string }) => s.name === 'intruder');
    expect(status.loaded).toBe(true);
    expect(status.storeNotices.join(' ')).toMatch(/belongs to add-on yourphr; intruder may not claim it/);
  });

  test('the kind exists even when the addon then fails to load — its door is closed, not missing', async () => {
    await writeAddon('yourphr', { stores: [{ id: 'yourphr', encrypt: true }] }, { throws: true });
    config['ngdpbase.addons.yourphr.enabled'] = true;

    const manager = await load();

    expect(config['ngdpbase.stores.yourphr.owner']).toBe('yourphr');
    expect(manager.storeOwnerState('yourphr')).toBe('failed');
  });

  test('a disabled addon declares nothing, and its owner state says so', async () => {
    await writeAddon('yourphr', { stores: [{ id: 'yourphr', encrypt: true }] });

    const manager = await load();

    expect(written).toEqual([]);
    expect(manager.storeOwnerState('yourphr')).toBe('disabled');
    expect(manager.storeOwnerState('never-installed')).toBe('absent');
  });

  test('a loaded addon\'s kind is served', async () => {
    await writeAddon('yourphr', { stores: [{ id: 'yourphr', encrypt: true }] });
    config['ngdpbase.addons.yourphr.enabled'] = true;

    const manager = await load();

    expect(manager.storeOwnerState('yourphr')).toBe('loaded');
  });
});
