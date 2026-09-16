/**
 * Encrypted user-index merged at login; sealed titles stay out of page-index.json.
 * #1385 (epic #1382)
 */

vi.unmock('../VersioningFileProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import VersioningFileProvider from '../VersioningFileProvider';
import { actor } from '../../test-support/actors';

// The owner writes her own private pages; the handle reaches her unlocked keys (#1382).
const MOLLY = { ...actor('molly'), privateStoreHandle: 'sid' };
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { DEFAULT_PRIVATE_STORE, privateUserKeysPath, storeMetaPath } from '../../utils/privateStorePath';
import { TEST_PRIVATE_STORE_KDF, createEncryptedStore, createUserKeys, unwrapDek } from '../../utils/privateStoreCrypto';
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

describe('encrypted user-index (#1385)', () => {
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

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `vfp-user-index-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  test('unencrypted default/ still lands in global page-index.json', async () => {
    const provider = await newProvider();
    await provider.savePage('Open Diary', 'plain', { uuid: OPEN, private: true, author: 'molly' }, MOLLY);
    const index = await readIndex();
    expect(index.pages[OPEN]).toMatchObject({ title: 'Open Diary', store: DEFAULT_PRIVATE_STORE });
  });

  test('sealed save writes user-index, not global page-index; merge works until logout', async () => {
    const created = createUserKeys('pw', { kdf });
    const record = createEncryptedStore(created.kek);
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE), record);

    unlockPrivateStores('sid', 'molly', created.kek);
    setUnlockedDek('sid', DEFAULT_PRIVATE_STORE, unwrapDek(created.kek, record));

    const provider = await newProvider();
    await provider.savePage('Sealed Diary', 'secret', {
      uuid: SEALED,
      private: true,
      author: 'molly'
    }, MOLLY);

    const index = await readIndex();
    expect(index.pages[SEALED]).toBeUndefined();
    expect(JSON.stringify(index)).not.toContain('Sealed Diary');

    const found = await provider.getPage('Sealed Diary', MOLLY);
    expect(found?.content).toContain('secret');

    lockPrivateStores('sid');
    expect(await provider.getPage('Sealed Diary', MOLLY)).toBeNull();
  });

  test('rebuild does not scan a sealed store tree into the global index', async () => {
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

    const index = await readIndex();
    expect(index.pages[OPEN]).toMatchObject({ title: 'Open Diary' });
    expect(index.pages[SEALED]).toBeUndefined();
    expect(JSON.stringify(index)).not.toContain('Sealed Diary');
  });

  test('password login merges user-index; logout drops the titles', async () => {
    const created = createUserKeys('pw', { kdf });
    const record = createEncryptedStore(created.kek);
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE), record);

    unlockPrivateStores('sid', 'molly', created.kek);
    setUnlockedDek('sid', DEFAULT_PRIVATE_STORE, unwrapDek(created.kek, record));

    const provider = await newProvider();
    await provider.savePage('Sealed Diary', 'secret', {
      uuid: SEALED,
      private: true,
      author: 'molly'
    }, MOLLY);
    lockPrivateStores('sid');

    await unlockPrivateStoresWithPassword({
      handle: 'sid-2',
      username: 'molly',
      password: 'pw',
      pagesDirectory: pagesDir
    });

    expect(
      (await provider.getPage('Sealed Diary', { ...MOLLY, privateStoreHandle: 'sid-2' }))?.content
    ).toContain('secret');

    lockPrivateStores('sid-2');
    expect(await provider.getPage('Sealed Diary', MOLLY)).toBeNull();
    expect((await readIndex()).pages[SEALED]).toBeUndefined();
  });
});
