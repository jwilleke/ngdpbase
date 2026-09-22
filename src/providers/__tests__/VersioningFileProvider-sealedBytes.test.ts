/**
 * An encrypted private store is ciphertext at rest (#1415, epic #1382): the
 * live page, its version blobs and its manifest — every byte under
 * `private/{user}/{store}/` except `store.json`. Since #1456 that includes the
 * store's own page index; a sealed page is named by its path and is in no
 * global index.
 */

vi.unmock('../VersioningFileProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import VersioningFileProvider from '../VersioningFileProvider';
import ValidationManager from '../../managers/ValidationManager';
import { actor } from '../../test-support/actors';
import DeltaStorage, { type DiffTuple } from '../../utils/DeltaStorage';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
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
import {
  clearUnlockedPrivateStores,
  lockPrivateStores,
  setUnlockedDek,
  unlockPrivateStores
} from '../../utils/privateStoreUnlock';

const MOLLY = { ...actor('molly'), privateStoreHandle: 'sid' };
const SEALED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const STORE = 'yourphr';
const SECRET_V1 = 'first-secret-body';
const SECRET_V2 = 'second-secret-body';
/** #1456: a private page is named by its path. */
const NAME = formatPrivatePageName('molly', STORE, 'Sealed Diary');
const kdf = TEST_PRIVATE_STORE_KDF;

/** Every regular file under `dir`, recursively. */
async function filesUnder(dir: string): Promise<string[]> {
  if (!await fs.pathExists(dir)) return [];
  const out: string[] = [];
  for (const ent of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    if (ent.isFile()) out.push(path.join(ent.parentPath, ent.name));
  }
  return out;
}

describe('sealed store bytes at rest (#1415)', () => {
  let testDir: string;
  let pagesDir: string;
  let requiredDir: string;
  let indexPath: string;
  let engine: { getManager: (name: string) => unknown };
  let kek: Buffer;

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

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vfp-sealed-bytes-'));
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

    const created = createUserKeys('pw', { kdf });
    kek = created.kek;
    const record = createEncryptedStore(created.kek);
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', STORE), record);
    unlockPrivateStores('sid', 'molly', created.kek);
    setUnlockedDek('sid', STORE, unwrapDek(created.kek, record));
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  const saveTwice = async (provider: VersioningFileProvider): Promise<void> => {
    await provider.savePage(NAME, SECRET_V1, { uuid: SEALED }, MOLLY);
    await provider.savePage(NAME, SECRET_V2, { uuid: SEALED }, MOLLY);
  };

  test('no file under pages/ holds a sealed page\'s text, title or history in the clear', async () => {
    const provider = await newProvider();
    await saveTwice(provider);

    const leaks: string[] = [];
    for (const file of await filesUnder(pagesDir)) {
      const text = await fs.readFile(file, 'utf8');
      if (text.includes(SECRET_V1) || text.includes(SECRET_V2) || text.includes('Sealed Diary')) {
        leaks.push(path.relative(pagesDir, file));
      }
    }
    expect(leaks).toEqual([]);
    // Nor the global page index, which is outside pages/ (#1456).
    const globalIndex = await fs.readFile(indexPath, 'utf8');
    expect(globalIndex).not.toContain(SEALED);
    expect(globalIndex).not.toContain('Sealed Diary');
  });

  test('the page and its history live in the owner\'s store, nowhere else', async () => {
    const provider = await newProvider();
    await saveTwice(provider);

    const storeRoot = path.join(pagesDir, 'private', 'molly', STORE);
    const outside = (await filesUnder(path.join(pagesDir, 'private')))
      .filter(f => !f.startsWith(storeRoot + path.sep))
      .map(f => path.relative(pagesDir, f))
      // The user-level key envelope is the only file beside the store.
      .filter(rel => path.dirname(rel) !== path.join('private', 'molly'));
    expect(outside).toEqual([]);
    expect(await fs.pathExists(path.join(storeRoot, 'versions', SEALED, 'manifest.json'))).toBe(true);
    // #1456: the page is listed in the store's own index; the superseded
    // user-level catalogue is not written.
    expect(await fs.pathExists(storePageIndexPath(pagesDir, 'molly', STORE))).toBe(true);
    expect(await fs.pathExists(privateUserIndexPath(pagesDir, 'molly'))).toBe(false);
  });

  test('every file in the store except store.json is sealed, and opens with the DEK', async () => {
    const provider = await newProvider();
    await saveTwice(provider);

    const storeRoot = path.join(pagesDir, 'private', 'molly', STORE);
    const dek = unwrapDek(kek, await fs.readJson(storeMetaPath(pagesDir, 'molly', STORE)));
    const files = (await filesUnder(storeRoot)).filter(f => path.basename(f) !== 'store.json');
    expect(files.length).toBeGreaterThan(0);
    // The store's own page index is among them (#1456).
    expect(files).toContain(storePageIndexPath(pagesDir, 'molly', STORE));
    for (const file of files) {
      const bytes = await fs.readFile(file);
      expect(isSealedBytes(bytes)).toBe(true);
      expect(() => openBytes(dek, bytes)).not.toThrow();
    }
  });

  test('history keeps both saves: v1 is the first text, v2 a sealed diff to the second', async () => {
    const provider = await newProvider();
    await saveTwice(provider);

    const dek = unwrapDek(kek, await fs.readJson(storeMetaPath(pagesDir, 'molly', STORE)));
    const versionsDir = path.join(pagesDir, 'private', 'molly', STORE, 'versions', SEALED);
    const open = async (rel: string): Promise<string> =>
      openBytes(dek, await fs.readFile(path.join(versionsDir, rel))).toString('utf8');

    const manifest = JSON.parse(await open('manifest.json')) as { currentVersion: number };
    expect(manifest.currentVersion).toBe(2);
    expect(await open('v1/content.md')).toBe(SECRET_V1);
    const diff = JSON.parse(await open('v2/content.diff')) as DiffTuple[];
    expect(DeltaStorage.applyDiff(SECRET_V1, diff)).toBe(SECRET_V2);

    // The owner reaches both versions by the page's name, through their context.
    expect(await provider.getVersionHistory(NAME, MOLLY)).toHaveLength(2);
    expect((await provider.getPageVersion(NAME, 1, MOLLY)).content).toBe(SECRET_V1);
  });

  test('a save without the store key is refused and writes nothing', async () => {
    const provider = await newProvider();
    lockPrivateStores('sid');

    await expect(provider.savePage(NAME, SECRET_V1, { uuid: SEALED }, MOLLY)).rejects.toThrow(/locked/);

    const storeRoot = path.join(pagesDir, 'private', 'molly', STORE);
    const written = (await filesUnder(storeRoot)).filter(f => path.basename(f) !== 'store.json');
    expect(written).toEqual([]);
  });

  test('the owner reads back the current text; without the key nothing opens', async () => {
    const provider = await newProvider();
    await saveTwice(provider);

    expect((await provider.getPage(NAME, MOLLY))?.content).toContain(SECRET_V2);
    // A plain title names a public page only (#1456).
    expect(await provider.getPage('Sealed Diary', MOLLY)).toBeNull();

    lockPrivateStores('sid');
    expect(await provider.getPage(NAME, MOLLY)).toBeNull();
    const fresh = await newProvider();
    expect(await fresh.getPage(NAME, MOLLY)).toBeNull();
  });
});
