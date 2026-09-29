/**
 * A vault an addon owns (#1414, #1505): its owner state for the door, and the
 * warning shown before turning the addon off. The vault is a system-category
 * entry whose `owner` is the addon's slug (#1505); addons no longer declare
 * kinds in `package.json`.
 *
 * Real addon folders on disk, loaded by the real AddonsManager; only
 * configuration is a stand-in.
 */

import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { vaultKindCategories } from '../../test-support/vaults';

describe('AddonsManager — a vault an addon owns (#1414, #1505)', () => {
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
    getAllProperties: vi.fn(() => ({ ...config })),
    getResolvedDataPath: vi.fn(() => path.join(tmpDir, 'pages')),
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
    config = { 'ngdpbase.system-category': vaultKindCategories({ default: {}, yourphr: { owner: 'yourphr', encrypt: true } }) };
    written = [];
    vi.resetModules();
    const mod = await import('../AddonsManager');
    AddonsManager = mod.default ?? mod;
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  test('a disabled addon\'s owner state says so, and so does one never installed', async () => {
    await writeAddon('yourphr', {});

    const manager = await load();

    expect(written).toEqual([]);
    expect(manager.storeOwnerState('yourphr')).toBe('disabled');
    expect(manager.storeOwnerState('never-installed')).toBe('absent');
  });

  test('a loaded addon\'s owner state is loaded', async () => {
    await writeAddon('yourphr', {});
    config['ngdpbase.addons.yourphr.enabled'] = true;

    const manager = await load();

    expect(manager.storeOwnerState('yourphr')).toBe('loaded');
  });

  test('turning the owner off is warned with how many users hold data, never refused', async () => {
    await writeAddon('yourphr', {});
    config['ngdpbase.addons.yourphr.enabled'] = true;
    // Two users walked through the door; a third has only the default store.
    for (const [user, store] of [['molly', 'yourphr'], ['jim', 'yourphr'], ['ann', 'default']]) {
      await fs.outputJson(path.join(tmpDir, 'pages', 'vaults', user, store, 'store.json'), { kind: store });
    }

    const manager = await load();

    const warnings = await manager.storeDisableWarnings('yourphr');
    expect(warnings).toEqual([expect.stringMatching(/^2 users have data in store "yourphr".*nothing is deleted/)]);
    expect(manager.canDisable('yourphr')).toEqual({ ok: true });
    const status = (await manager.getStatus()).find((s: { name: string }) => s.name === 'yourphr');
    expect(status.disableWarnings).toEqual(warnings);
  });

  test('no warning when nobody has entered the store', async () => {
    await writeAddon('yourphr', {});
    config['ngdpbase.addons.yourphr.enabled'] = true;

    const manager = await load();

    expect(await manager.storeDisableWarnings('yourphr')).toEqual([]);
  });

  test('loading an addon writes nothing about vaults to configuration (#1505)', async () => {
    await writeAddon('yourphr', { stores: [{ id: 'yourphr', encrypt: true }] });
    config['ngdpbase.addons.yourphr.enabled'] = true;

    await load();

    expect(written.filter((w) => w.key.startsWith('ngdpbase.stores.'))).toEqual([]);
  });
});
