/**
 * #1965: AddonsManager.listedAddons() — what the add-on listings show. Real
 * addon folders in a mkdtemp directory, loaded by the real AddonsManager;
 * configuration is a stand-in.
 */

import os from 'os';
import path from 'path';
import fs from 'fs-extra';

describe('AddonsManager.listedAddons() (#1965)', () => {
  let tmpDir: string;
  let AddonsManager: any;
  let config: Record<string, unknown>;

  const load = async (): Promise<any> => {
    const cm = {
      getProperty: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.managers.addons-manager.enabled') return true;
        if (key === 'ngdpbase.managers.addons-manager.addons-path') return tmpDir;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(tmpDir, 'pages');
        if (key === 'ngdpbase.addons') return {};
        if (key === 'ngdpbase.version') return '5.0.0';
        return key in config ? config[key] : def;
      }),
      getAddonDeclaredDefaults: vi.fn(() => ({})),
      getAllProperties: vi.fn(() => ({})),
      getResolvedDataPath: vi.fn(() => path.join(tmpDir, 'pages')),
      getCustomProperty: vi.fn(() => null),
      setRuntimeProperty: vi.fn()
    };
    const manager = new AddonsManager({ getManager: (n: string) => (n === 'ConfigurationManager' ? cm : null) });
    await manager.initialize();
    return manager;
  };

  const writeAddon = async (slug: string, manifest: Record<string, unknown>, description = `${slug} does things`) => {
    const dir = path.join(tmpDir, slug);
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, 'package.json'), { name: slug, version: '2.0.0', ngdpbase: manifest });
    await fs.writeFile(path.join(dir, 'index.js'),
      `module.exports = { name: '${slug}', version: '2.0.0', description: ${JSON.stringify(description)}, register() {} };\n`);
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'addons-listing-'));
    config = {};
    for (const slug of ['accounting', 'accounting-dues', 'elasticsearch', 'phr', 'future']) config[`ngdpbase.addons.${slug}.enabled`] = true;
    vi.resetModules();
    const mod = await import('../AddonsManager');
    AddonsManager = mod.default ?? mod;

    await writeAddon('accounting', { family: 'Accounting', aboutPage: 'accounting-about' });
    await writeAddon('accounting-dues', { family: ' Accounting ' });
    await writeAddon('elasticsearch', { listed: false });
    await writeAddon('phr', { perPerson: true, aboutPage: '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b' });
    await writeAddon('calendar', {});                    // not enabled
    await writeAddon('future', { minVersion: '9.0.0' }); // enabled, refused
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  const bySlug = (listing: Array<{ slug: string }>) => Object.fromEntries(listing.map((e) => [e.slug, e]));

  test('lists enabled add-ons only, and never one that says listed: false', async () => {
    const listing = (await load()).listedAddons();
    expect(listing.map((e: { slug: string }) => e.slug).sort()).toEqual(['accounting', 'accounting-dues', 'future', 'phr']);
  });

  test('carries description, family, per-person, version and load state', async () => {
    const entries = bySlug((await load()).listedAddons());
    expect(entries.accounting).toEqual({
      slug: 'accounting', description: 'accounting does things', family: 'Accounting', aboutPage: 'accounting-about',
      perPerson: false, version: '2.0.0', loaded: true, error: null
    });
    expect(entries['accounting-dues'].family).toBe('Accounting');
    expect(entries.phr).toMatchObject({ perPerson: true, family: null, aboutPage: '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b' });
    expect(entries.future).toMatchObject({ loaded: false, error: expect.stringMatching(/needs ngdpbase 9\.0\.0/) });
  });

  test('the site overrides the About page with ngdpbase.addons.<slug>.about-page', async () => {
    config['ngdpbase.addons.accounting.about-page'] = 'Our Books';
    config['ngdpbase.addons.accounting-dues.about-page'] = 'dues-explained';
    config['ngdpbase.addons.phr.about-page'] = '   ';
    const entries = bySlug((await load()).listedAddons());
    expect(entries.accounting.aboutPage).toBe('Our Books');
    expect(entries['accounting-dues'].aboutPage).toBe('dues-explained');
    // A blank override is no override
    expect(entries.phr.aboutPage).toBe('6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b');
  });
});
