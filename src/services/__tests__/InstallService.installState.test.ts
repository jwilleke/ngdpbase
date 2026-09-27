/**
 * #1410: the marker alone says a site is installed. The bootstrap admin and
 * the seeded shipped pages exist from the first start, so a fresh site must
 * still get the wizard; a site set up before the marker is given one at boot.
 */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import InstallService from '../InstallService.js';
import { installCompletePath } from '../../utils/configFiles.js';
import { SEEDED_SHIPPED_PAGES_FILE } from '../../utils/seededShippedPages.js';

interface Page { title: string; uuid: string }

describe('InstallService install state (#1410)', () => {
  let dataDir: string;
  let baseUrlExplicit: boolean;
  let pages: Page[];
  let installOrg: { '@id': string } | null;

  const configManager = {
    getInstanceDataFolder: () => dataDir,
    getInstallCompletePath: () => installCompletePath(dataDir),
    getCustomConfigPath: () => path.join(dataDir, 'config', 'app-custom-config.json'),
    isBaseUrlExplicit: () => baseUrlExplicit,
    getResolvedDataPath: (_key: string, def: string) => path.join(dataDir, def.replace('./data/', ''))
  };
  const pageManager = {
    getAllPages: async () => pages.map((p) => p.title),
    getPageMetadata: async (title: string) => {
      const page = pages.find((p) => p.title === title);
      return page ? { title, uuid: page.uuid } : null;
    }
  };
  const orgManager = { getInstallOrg: async () => installOrg };
  const engine = {
    getManager: (name: string): unknown => ({
      ConfigurationManager: configManager,
      PageManager: pageManager,
      OrganizationManager: orgManager
    } as Record<string, unknown>)[name] ?? null
  };

  const seed = async (...uuids: string[]): Promise<void> => {
    const seeded = Object.fromEntries(uuids.map((u) => [u, '2026-09-27T00:00:00.000Z']));
    await fs.writeJson(path.join(dataDir, SEEDED_SHIPPED_PAGES_FILE), { version: 2, sources: { 'required-pages': { seeded, declined: {} } } });
  };
  const writeCustomConfig = async (): Promise<void> => {
    await fs.outputJson(configManager.getCustomConfigPath(), { 'ngdpbase.application.base-url': 'https://example.test' });
  };

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'install-state-test-'));
    baseUrlExplicit = false;
    pages = [];
    installOrg = null;
  });

  afterEach(async () => {
    // Only the temp directory this test created.
    await fs.remove(dataDir);
  });

  const service = (): InstallService => new InstallService(engine);

  test('a fresh site with the bootstrap admin and seeded pages still needs install', async () => {
    pages = [{ title: 'Welcome', uuid: 'aaaa' }];
    await seed('aaaa');
    expect(await service().isInstallRequired()).toBe(true);
  });

  test('the marker alone says installed', async () => {
    await fs.writeJson(installCompletePath(dataDir), { completedAt: 'x' });
    expect(await service().isInstallRequired()).toBe(false);
  });

  test('a fresh site is not grandfathered: only seeded pages, no custom config', async () => {
    baseUrlExplicit = true;
    pages = [{ title: 'Welcome', uuid: 'AAAA' }];
    await seed('aaaa');
    expect(await service().markExistingSiteInstalled()).toBe(false);
    expect(await fs.pathExists(installCompletePath(dataDir))).toBe(false);
  });

  test('a site with its own custom config is grandfathered, and the reason is recorded', async () => {
    baseUrlExplicit = true;
    await writeCustomConfig();
    expect(await service().markExistingSiteInstalled()).toBe(true);
    const marker = await fs.readJson(installCompletePath(dataDir)) as { inferred?: string };
    expect(marker.inferred).toMatch(/custom config/);
    expect(await service().isInstallRequired()).toBe(false);
  });

  test('a site with a page it did not ship with is grandfathered', async () => {
    baseUrlExplicit = true;
    pages = [{ title: 'Welcome', uuid: 'aaaa' }, { title: 'My Notes', uuid: 'bbbb' }];
    await seed('aaaa');
    expect(await service().markExistingSiteInstalled()).toBe(true);
    const marker = await fs.readJson(installCompletePath(dataDir)) as { inferred?: string };
    expect(marker.inferred).toMatch(/My Notes/);
  });

  test('no marker is written without an explicit base URL: the next start would refuse (#642)', async () => {
    await writeCustomConfig();
    pages = [{ title: 'My Notes', uuid: 'bbbb' }];
    expect(await service().markExistingSiteInstalled()).toBe(false);
    expect(await fs.pathExists(installCompletePath(dataDir))).toBe(false);
  });

  test('an existing marker is left as it is', async () => {
    baseUrlExplicit = true;
    await writeCustomConfig();
    await fs.writeJson(installCompletePath(dataDir), { completedAt: 'original' });
    expect(await service().markExistingSiteInstalled()).toBe(false);
    expect(await fs.readJson(installCompletePath(dataDir))).toEqual({ completedAt: 'original' });
  });

  test('the placeholder organization and bootstrap admin are not a partial install', async () => {
    installOrg = { '@id': 'http://localhost:3000/' };
    expect(await service().detectPartialInstallation()).toEqual({ isPartial: false, steps: { configWritten: false } });
  });

  test('partial install reads the custom config where the wizard writes it', async () => {
    await writeCustomConfig();
    expect(await service().detectPartialInstallation()).toEqual({ isPartial: true, steps: { configWritten: true } });
  });
});
