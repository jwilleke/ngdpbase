/**
 * An encrypted private store is ciphertext at rest (#1415, epic #1382): the
 * live page, its version blobs and its manifest — every byte under
 * `private/{user}/{store}/` except `store.json`.
 */

vi.unmock('../VersioningFileProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import VersioningFileProvider from '../VersioningFileProvider';
import { actor } from '../../test-support/actors';
import DeltaStorage, { type DiffTuple } from '../../utils/DeltaStorage';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { privateUserKeysPath, storeMetaPath } from '../../utils/privateStorePath';
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
    testDir = path.join(os.tmpdir(), `vfp-sealed-bytes-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
    const meta = { uuid: SEALED, private: true, author: 'molly', store: STORE };
    await provider.savePage('Sealed Diary', SECRET_V1, meta, MOLLY);
    await provider.savePage('Sealed Diary', SECRET_V2, meta, MOLLY);
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
  });

  test('the page and its history live in the owner\'s store, nowhere else', async () => {
    const provider = await newProvider();
    await saveTwice(provider);

    const storeRoot = path.join(pagesDir, 'private', 'molly', STORE);
    const outside = (await filesUnder(path.join(pagesDir, 'private')))
      .filter(f => !f.startsWith(storeRoot + path.sep))
      .map(f => path.relative(pagesDir, f))
      // The user-level key envelope and catalogues are the only files beside the store.
      .filter(rel => path.dirname(rel) !== path.join('private', 'molly'));
    expect(outside).toEqual([]);
    expect(await fs.pathExists(path.join(storeRoot, 'versions', SEALED, 'manifest.json'))).toBe(true);
  });

  test('every file in the store except store.json is sealed, and opens with the DEK', async () => {
    const provider = await newProvider();
    await saveTwice(provider);

    const storeRoot = path.join(pagesDir, 'private', 'molly', STORE);
    const dek = unwrapDek(kek, await fs.readJson(storeMetaPath(pagesDir, 'molly', STORE)));
    const files = (await filesUnder(storeRoot)).filter(f => path.basename(f) !== 'store.json');
    expect(files.length).toBeGreaterThan(0);
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
  });

  test('a save without the store key is refused and writes nothing', async () => {
    const provider = await newProvider();
    lockPrivateStores('sid');

    await expect(provider.savePage('Sealed Diary', SECRET_V1, {
      uuid: SEALED, private: true, author: 'molly', store: STORE
    }, MOLLY)).rejects.toThrow(/locked/);

    const storeRoot = path.join(pagesDir, 'private', 'molly', STORE);
    const written = (await filesUnder(storeRoot)).filter(f => path.basename(f) !== 'store.json');
    expect(written).toEqual([]);
  });

  test('the owner reads back the current text; without the key nothing opens', async () => {
    const provider = await newProvider();
    await saveTwice(provider);

    expect((await provider.getPage('Sealed Diary', MOLLY))?.content).toContain(SECRET_V2);

    lockPrivateStores('sid');
    const fresh = await newProvider();
    expect(await fresh.getPage('Sealed Diary', MOLLY)).toBeNull();
  });
});
