/**
 * An addon states the oldest ngdpbase it runs on (#1757): `package.json` →
 * `ngdpbase.minVersion`. On an older core it is never imported, and its
 * status says which release it needs — instead of failing at import with a
 * missing module and no reason.
 *
 * Real addon folders on disk, loaded by the real AddonsManager; only
 * configuration is a stand-in.
 */

import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { isAtLeast } from '../../utils/version';

describe('AddonsManager — minVersion (#1757)', () => {
  let tmpDir: string;
  let AddonsManager: any;

  const load = async (coreVersion: string): Promise<any> => {
    const cm = {
      getProperty: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.managers.addons-manager.enabled') return true;
        if (key === 'ngdpbase.managers.addons-manager.addons-path') return tmpDir;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(tmpDir, 'pages');
        if (key === 'ngdpbase.addons') return {};
        if (key === 'ngdpbase.version') return coreVersion;
        if (key === 'ngdpbase.addons.ledger.enabled') return true;
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

  /** An addon whose index.js throws if it is ever imported. */
  const writeAddon = async (minVersion: string) => {
    const dir = path.join(tmpDir, 'ledger');
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, 'package.json'), { name: 'ledger', version: '0.4.0', ngdpbase: { minVersion } });
    await fs.writeFile(path.join(dir, 'index.js'),
      "throw new Error('imported on a core it does not support');\n");
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'addons-minversion-'));
    vi.resetModules();
    const mod = await import('../AddonsManager');
    AddonsManager = mod.default ?? mod;
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  test('on an older core the addon is never imported, and its status says what it needs', async () => {
    await writeAddon('5.2.3');
    const manager = await load('5.2.2');

    const ledger = (await manager.getStatus()).find((s: { name: string }) => s.name === 'ledger');
    expect(ledger).toMatchObject({ enabled: true, loaded: false, version: '0.4.0', error: 'needs ngdpbase 5.2.3 or later; this is 5.2.2' });
    expect(manager.storeOwnerState('ledger')).toBe('failed');
  });

  test('a malformed minVersion is reported, not ignored', async () => {
    await writeAddon('5.2');
    const manager = await load('5.2.3');

    const ledger = (await manager.getStatus()).find((s: { name: string }) => s.name === 'ledger');
    expect(ledger?.loaded).toBe(false);
    expect(ledger?.error).toMatch(/minVersion '5\.2'/);
  });

  test('isAtLeast compares x.y.z numerically', () => {
    expect(isAtLeast('5.2.3', '5.2.3')).toBe(true);
    expect(isAtLeast('5.10.0', '5.9.9')).toBe(true);
    expect(isAtLeast('5.2.2', '5.2.3')).toBe(false);
    expect(isAtLeast('4.99.99', '5.0.0')).toBe(false);
  });
});
