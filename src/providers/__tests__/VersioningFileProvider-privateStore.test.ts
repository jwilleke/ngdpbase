/**
 * Private pages live under private/{user}/{store}/ — #1383 (epic #1382)
 */

vi.unmock('../VersioningFileProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import VersioningFileProvider from '../VersioningFileProvider';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { DEFAULT_PRIVATE_STORE, storeMetaPath } from '../../utils/privateStorePath';
import { TEST_PRIVATE_STORE_KDF, createEncryptedStore, createUserKeys, unwrapDek } from '../../utils/privateStoreCrypto';
import {
  clearUnlockedPrivateStores,
  runWithPrivateStoreSession,
  setUnlockedDek,
  unlockPrivateStores
} from '../../utils/privateStoreUnlock';

const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('private store default/ (#1383)', () => {
  let testDir: string;
  let pagesDir: string;
  let requiredDir: string;
  let indexPath: string;
  let engine: { getManager: (name: string) => unknown };

  const config = (): Record<string, unknown> => ({
    'ngdpbase.page.enabled': true,
    'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
    'ngdpbase.page.provider.filesystem.requiredpagesdir': requiredDir,
    'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
    'ngdpbase.page.provider.versioning.indexfile': indexPath,
    'ngdpbase.page.provider.versioning.deltastorage': true,
    'ngdpbase.page.provider.versioning.compression': 'none',
    'ngdpbase.system-category': {
      general: { label: 'general', storageLocation: 'regular' }
    }
  });

  const newProvider = async (): Promise<VersioningFileProvider> => {
    const p = new VersioningFileProvider(engine);
    await p.initialize();
    return p;
  };

  const readIndex = async () => JSON.parse(await fs.readFile(indexPath, 'utf8'));

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `vfp-priv-store-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    pagesDir = path.join(testDir, 'pages');
    requiredDir = path.join(testDir, 'required-pages');
    indexPath = path.join(testDir, 'data', 'page-index.json');
    await fs.ensureDir(testDir);
    const configManager = {
      getProperty: vi.fn((key: string, def: unknown) => (config()[key] !== undefined ? config()[key] : def)),
      getResolvedDataPath: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.page.provider.versioning.indexfile') return indexPath;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
        if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return requiredDir;
        return def;
      }),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    engine = { getManager: vi.fn((name: string) => (name === 'ConfigurationManager' ? configManager : null)) };
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  test('a private save writes private/{author}/default/{uuid}.md and records store default', async () => {
    const provider = await newProvider();
    await provider.savePage('Diary', 'secret', { uuid: UUID, private: true, author: 'molly' });

    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(true);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', `${UUID}.md`))).toBe(false);
    expect((await readIndex()).pages[UUID]).toMatchObject({
      location: 'private',
      creator: 'molly',
      store: DEFAULT_PRIVATE_STORE
    });
  });

  test('boot moves a legacy private/{user}/{uuid}.md into default/ and still loads the page', async () => {
    const legacy = path.join(pagesDir, 'private', 'molly', `${UUID}.md`);
    await fs.ensureDir(path.dirname(legacy));
    await fs.writeFile(
      legacy,
      `---\ntitle: 'Diary'\nuuid: ${UUID}\nprivate: true\nauthor: molly\n---\nsecret\n`
    );

    const provider = await newProvider();
    expect(await fs.pathExists(legacy)).toBe(false);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', 'default', `${UUID}.md`))).toBe(true);
    expect((await provider.getPage('Diary'))?.content).toContain('secret');
    expect((await readIndex()).pages[UUID]).toMatchObject({
      location: 'private',
      creator: 'molly',
      store: DEFAULT_PRIVATE_STORE
    });
  });

  test('rebuild records store default and does not invent a page named default', async () => {
    const provider = await newProvider();
    await provider.savePage('Diary', 'secret', { uuid: UUID, private: true, author: 'molly' });
    await provider.refreshPageList();
    const result = await provider.rebuildPageIndexFromDisk();

    const rebuilt = await readIndex();
    expect(rebuilt.pages[UUID]).toMatchObject({
      location: 'private',
      creator: 'molly',
      store: DEFAULT_PRIVATE_STORE
    });
    expect(Object.values(rebuilt.pages).some((p: { title?: string }) => p.title === 'default')).toBe(false);
    expect(result.pages).toBe(1);
  });

  test('version history lives under the store, not pages/versions/private/{uuid}', async () => {
    const provider = await newProvider();
    await provider.savePage('Diary', 'v1', { uuid: UUID, private: true, author: 'molly' });
    await provider.savePage('Diary', 'v2', { uuid: UUID, private: true, author: 'molly' });

    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', 'default', 'versions', UUID, 'manifest.json'))).toBe(true);
    expect(await fs.pathExists(path.join(pagesDir, 'versions', 'private', UUID))).toBe(false);
  });

  test('boot moves pages/versions/private/{uuid} into the store', async () => {
    const live = path.join(pagesDir, 'private', 'molly', 'default', `${UUID}.md`);
    await fs.ensureDir(path.dirname(live));
    await fs.writeFile(
      live,
      `---\ntitle: 'Diary'\nuuid: ${UUID}\nprivate: true\nauthor: molly\n---\nv2\n`
    );
    const legacyVer = path.join(pagesDir, 'versions', 'private', UUID);
    await fs.ensureDir(legacyVer);
    await fs.writeJson(path.join(legacyVer, 'manifest.json'), {
      pageId: UUID,
      pageName: 'Diary',
      currentVersion: 1,
      versions: [{ version: 1 }]
    });

    await newProvider();
    expect(await fs.pathExists(legacyVer)).toBe(false);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', 'default', 'versions', UUID, 'manifest.json'))).toBe(true);
  });

  test('encrypt-on save refuses when the session has no DEK (#1394)', async () => {
    const { kek } = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE), record);

    const provider = await newProvider();
    await expect(
      provider.savePage('Diary', 'secret', { uuid: UUID, private: true, author: 'molly' })
    ).rejects.toThrow(/locked|DEK/i);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(false);
  });

  test('encrypt-on save proceeds when the session bag has the DEK (#1394)', async () => {
    const { kek } = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE), record);

    unlockPrivateStores('sid', 'molly', kek);
    setUnlockedDek('sid', DEFAULT_PRIVATE_STORE, unwrapDek(kek, record));

    const provider = await newProvider();
    await runWithPrivateStoreSession('sid', () =>
      provider.savePage('Diary', 'secret', { uuid: UUID, private: true, author: 'molly' })
    );

    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(true);
  });

  test('config privateroot sealed joins versions as versions/sealed and writes under sealed/', async () => {
    const configManager = {
      getProperty: vi.fn((key: string, def: unknown) => {
        const cfg = {
          ...config(),
          'ngdpbase.page.provider.filesystem.privateroot': 'sealed'
        };
        return cfg[key] !== undefined ? cfg[key] : def;
      }),
      getResolvedDataPath: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.page.provider.versioning.indexfile') return indexPath;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
        if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return requiredDir;
        return def;
      }),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    engine = { getManager: vi.fn((name: string) => (name === 'ConfigurationManager' ? configManager : null)) };

    const provider = await newProvider();
    await provider.savePage('Diary', 'secret', { uuid: UUID, private: true, author: 'molly' });

    expect(await fs.pathExists(path.join(pagesDir, 'sealed', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(true);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(false);
    expect(await fs.pathExists(path.join(pagesDir, 'versions', 'sealed'))).toBe(true);
    expect(await fs.pathExists(path.join(pagesDir, 'versions', 'private'))).toBe(false);
  });
});
