/**
 * Private pages stay out of page-index.json; each store keeps its own page
 * index, sealed when the store is encrypted. The user-level `user-index.json`
 * (#1385) is superseded (#1456): saves no longer write it, and an old one is
 * moved into the stores' own indexes at unlock (adoptUserPageCatalog).
 * #1385, #1456 (epic #1382)
 */

vi.unmock('../VersioningFileProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import VersioningFileProvider from '../VersioningFileProvider';
import ValidationManager from '../../managers/ValidationManager';
import { actor } from '../../test-support/actors';

// The owner writes her own private pages; the handle reaches her unlocked keys (#1382).
const MOLLY = { ...actor('molly'), privateStoreHandle: 'sid' };
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  DEFAULT_PRIVATE_STORE,
  formatPrivatePageName,
  privateUserIndexPath,
  privateUserKeysPath,
  storeMetaPath,
  storePageIndexPath
} from '../../utils/privateStorePath';
import {
  TEST_PRIVATE_STORE_KDF,
  createEncryptedStore,
  createUserKeys,
  isSealedBytes,
  openBytes,
  unwrapDek
} from '../../utils/privateStoreCrypto';
import { upsertUserIndexPage, type UserCatalogPage } from '../../utils/privateStoreCatalogs';
import {
  clearUnlockedPrivateStores,
  lockPrivateStores,
  setUnlockedDek,
  unlockPrivateStores,
  unlockPrivateStoresWithPassword
} from '../../utils/privateStoreUnlock';

const SEALED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OPEN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const kdf = TEST_PRIVATE_STORE_KDF;
/** #1456: a private page is named by its path. */
const SEALED_NAME = formatPrivatePageName('molly', DEFAULT_PRIVATE_STORE, 'Sealed Diary');
const OPEN_NAME = formatPrivatePageName('molly', DEFAULT_PRIVATE_STORE, 'Open Diary');

describe('private pages out of the global index (#1385, #1456)', () => {
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

  const readIndex = async () => JSON.parse(await fs.readFile(indexPath, 'utf8')) as {
    pages: Record<string, { title?: string; store?: string }>;
  };

  /** Molly's default store, encrypted, with her keys on disk; returns the KEK and store DEK. */
  const sealDefaultStore = async (): Promise<{ kek: Buffer; dek: Buffer }> => {
    const created = createUserKeys('pw', { kdf });
    const record = createEncryptedStore(created.kek);
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE), record);
    return { kek: created.kek, dek: unwrapDek(created.kek, record) };
  };

  /** The store's own page index, opened with its DEK. */
  const readSealedStoreIndex = async (dek: Buffer) => JSON.parse(
    openBytes(dek, await fs.readFile(storePageIndexPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE))).toString('utf8')
  ) as { pages: Record<string, UserCatalogPage> };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vfp-user-index-'));
    pagesDir = path.join(testDir, 'pages');
    requiredDir = path.join(testDir, 'required-pages');
    indexPath = path.join(testDir, 'data', 'page-index.json');
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
    // #1456: a private page's slug comes from ValidationManager.
    let validation: unknown = null;
    engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'ValidationManager') return validation;
        return null;
      })
    };
    validation = new ValidationManager(engine);
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  test('unencrypted default/ lands in its own store index, not global page-index.json', async () => {
    const provider = await newProvider();
    // A plain title with the Private box ticked moves into the author's default store.
    await provider.savePage('Open Diary', 'plain', { uuid: OPEN, private: true, author: 'molly' }, MOLLY);

    expect((await readIndex()).pages[OPEN]).toBeUndefined();
    const storeIndex = await fs.readJson(storePageIndexPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE)) as {
      pages: Record<string, UserCatalogPage>;
    };
    expect(storeIndex.pages[OPEN]).toMatchObject({ title: 'Open Diary', store: DEFAULT_PRIVATE_STORE, creator: 'molly' });

    // Found by its private name; a plain title names a public page only.
    expect((await provider.getPage(OPEN_NAME, MOLLY))?.content).toContain('plain');
    expect(await provider.getPage('Open Diary', MOLLY)).toBeNull();
  });

  test('sealed save writes the store\'s sealed index, nothing global; found until lock', async () => {
    const { kek, dek } = await sealDefaultStore();
    unlockPrivateStores('sid', 'molly', kek);
    setUnlockedDek('sid', DEFAULT_PRIVATE_STORE, dek);

    const provider = await newProvider();
    await provider.savePage(SEALED_NAME, 'secret', { uuid: SEALED }, MOLLY);

    const index = await readIndex();
    expect(index.pages[SEALED]).toBeUndefined();
    expect(JSON.stringify(index)).not.toContain('Sealed Diary');

    // The store's own index is sealed with its DEK and lists the page; the
    // superseded user-level catalogue is not written.
    const storeIndexFile = storePageIndexPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE);
    expect(isSealedBytes(await fs.readFile(storeIndexFile))).toBe(true);
    expect((await fs.readFile(storeIndexFile)).toString('latin1')).not.toContain('Sealed Diary');
    expect((await readSealedStoreIndex(dek)).pages[SEALED]).toMatchObject({ title: 'Sealed Diary' });
    expect(await fs.pathExists(privateUserIndexPath(pagesDir, 'molly'))).toBe(false);

    const found = await provider.getPage(SEALED_NAME, MOLLY);
    expect(found?.content).toContain('secret');

    lockPrivateStores('sid');
    expect(await provider.getPage(SEALED_NAME, MOLLY)).toBeNull();
  });

  test('rebuild does not scan a store tree into the global index', async () => {
    const { kek } = createUserKeys('pw', { kdf });
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', 'yourphr')));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'yourphr'), record);
    const sealedFile = path.join(pagesDir, 'private', 'molly', 'yourphr', `${SEALED}.md`);
    await fs.writeFile(
      sealedFile,
      `---\ntitle: 'Sealed Diary'\nuuid: ${SEALED}\nprivate: true\nauthor: molly\n---\nsecret\n`
    );

    const provider = await newProvider();
    await provider.savePage('Open Diary', 'plain', { uuid: OPEN, private: true, author: 'molly' }, MOLLY);
    await provider.refreshPageList();
    await provider.rebuildPageIndexFromDisk();

    // #1456: no private page is in the global index — sealed or not.
    const index = await readIndex();
    expect(index.pages[OPEN]).toBeUndefined();
    expect(index.pages[SEALED]).toBeUndefined();
    expect(JSON.stringify(index)).not.toContain('Sealed Diary');
    expect(JSON.stringify(index)).not.toContain('Open Diary');
    // The plain page is still found through its store's own index.
    expect((await provider.getPage(OPEN_NAME, MOLLY))?.content).toContain('plain');
  });

  test('password login reaches the sealed store index; logout drops the titles', async () => {
    const { kek, dek } = await sealDefaultStore();
    unlockPrivateStores('sid', 'molly', kek);
    setUnlockedDek('sid', DEFAULT_PRIVATE_STORE, dek);

    const provider = await newProvider();
    await provider.savePage(SEALED_NAME, 'secret', { uuid: SEALED }, MOLLY);
    lockPrivateStores('sid');

    await unlockPrivateStoresWithPassword({
      handle: 'sid-2',
      username: 'molly',
      password: 'pw',
      pagesDirectory: pagesDir
    });

    expect(
      (await provider.getPage(SEALED_NAME, { ...MOLLY, privateStoreHandle: 'sid-2' }))?.content
    ).toContain('secret');

    lockPrivateStores('sid-2');
    expect(await provider.getPage(SEALED_NAME, { ...MOLLY, privateStoreHandle: 'sid-2' })).toBeNull();
    expect(await provider.getPage(SEALED_NAME, MOLLY)).toBeNull();
    expect((await readIndex()).pages[SEALED]).toBeUndefined();
  });

  describe('adoptUserPageCatalog: a pre-#1456 user-index.json moves in at unlock', () => {
    /**
     * The layout a pre-#1456 save left behind: the sealed page file in its
     * store, its entry only in the owner's sealed user-index.json.
     */
    const legacyLayout = async (): Promise<{ kek: Buffer; dek: Buffer; provider: VersioningFileProvider }> => {
      const keys = await sealDefaultStore();
      unlockPrivateStores('sid', 'molly', keys.kek);
      setUnlockedDek('sid', DEFAULT_PRIVATE_STORE, keys.dek);
      const provider = await newProvider();
      await provider.savePage(SEALED_NAME, 'secret', { uuid: SEALED }, MOLLY);
      const entry = (await readSealedStoreIndex(keys.dek)).pages[SEALED];
      await fs.remove(storePageIndexPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE));
      await upsertUserIndexPage(pagesDir, 'molly', keys.kek, entry);
      lockPrivateStores('sid');
      return { ...keys, provider };
    };

    const unlock = async (handle: string) => {
      await unlockPrivateStoresWithPassword({ handle, username: 'molly', password: 'pw', pagesDirectory: pagesDir });
      return { ...MOLLY, privateStoreHandle: handle };
    };

    test('the entry lands in the store\'s sealed index and user-index.json is removed', async () => {
      const { dek, provider } = await legacyLayout();
      const ctx = await unlock('sid-2');
      // Before adoption the page is in no index a lookup reads.
      expect(await provider.getPage(SEALED_NAME, ctx)).toBeNull();

      expect(await provider.adoptUserPageCatalog(ctx)).toBe(1);

      expect(await fs.pathExists(privateUserIndexPath(pagesDir, 'molly'))).toBe(false);
      const storeIndexFile = storePageIndexPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE);
      expect(isSealedBytes(await fs.readFile(storeIndexFile))).toBe(true);
      expect((await readSealedStoreIndex(dek)).pages[SEALED]).toMatchObject({ title: 'Sealed Diary', uuid: SEALED });
      expect((await provider.getPage(SEALED_NAME, ctx))?.content).toContain('secret');
      expect((await readIndex()).pages[SEALED]).toBeUndefined();

      lockPrivateStores('sid-2');
      expect(await provider.getPage(SEALED_NAME, ctx)).toBeNull();
    });

    test('is idempotent: a second run moves nothing and leaves one entry', async () => {
      const { dek, provider } = await legacyLayout();
      const ctx = await unlock('sid-2');

      expect(await provider.adoptUserPageCatalog(ctx)).toBe(1);
      expect(await provider.adoptUserPageCatalog(ctx)).toBe(0);

      // A later unlock (catalog file already gone) is a no-op too.
      lockPrivateStores('sid-2');
      const again = await unlock('sid-3');
      expect(await provider.adoptUserPageCatalog(again)).toBe(0);

      expect(Object.keys((await readSealedStoreIndex(dek)).pages)).toEqual([SEALED]);
      expect((await provider.getPage(SEALED_NAME, again))?.content).toContain('secret');
    });

    test('an entry whose page file is gone is dropped, not adopted', async () => {
      const { provider } = await legacyLayout();
      await fs.remove(path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, `${SEALED}.md`));
      const ctx = await unlock('sid-2');

      expect(await provider.adoptUserPageCatalog(ctx)).toBe(0);
      expect(await fs.pathExists(privateUserIndexPath(pagesDir, 'molly'))).toBe(false);
      expect(await fs.pathExists(storePageIndexPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE))).toBe(false);
    });
  });
});
