/**
 * An add-on's installed version (#1973): the `version` in its package.json,
 * which the forms add-on records on every form the add-on provides. The
 * module's own `version` is the fallback for a package.json without one.
 *
 * Real add-on folders on disk, loaded by the real AddonsManager; only
 * configuration is a stand-in. Works in its own mkdtemp folder and removes
 * only that folder.
 */

import os from 'os';
import path from 'path';
import fs from 'fs-extra';

describe('AddonsManager.getAddonVersion (#1973)', () => {
  let tmpDir: string;
  let AddonsManager: any;

  const load = async (): Promise<any> => {
    const cm = {
      getProperty: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.managers.addons-manager.enabled') return true;
        if (key === 'ngdpbase.managers.addons-manager.addons-path') return tmpDir;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(tmpDir, 'pages');
        if (key === 'ngdpbase.addons') return {};
        return def;
      }),
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

  const writeAddon = async (slug: string, pkg: Record<string, unknown>) => {
    const dir = path.join(tmpDir, slug);
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, 'package.json'), { name: slug, ...pkg });
    await fs.writeFile(path.join(dir, 'index.js'),
      `export default { name: '${slug}', version: '1.0.0', async register() {} };\n`);
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'addons-version-'));
    vi.resetModules();
    const mod = await import('../AddonsManager');
    AddonsManager = mod.default ?? mod;
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  test('the package.json version, else the module version; undefined for an add-on not discovered', async () => {
    await writeAddon('ledger', { version: '2.3.4' });
    await writeAddon('plain', {});
    const manager = await load();
    expect(manager.getAddonVersion('ledger')).toBe('2.3.4');
    expect(manager.getAddonVersion('plain')).toBe('1.0.0');
    expect(manager.getAddonVersion('nobody')).toBeUndefined();
  });
});
