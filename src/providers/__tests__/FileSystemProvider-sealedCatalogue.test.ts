/**
 * A sealed store works on the plain FileSystemProvider too (#1420, epic #1382):
 * the page is recorded in its owner's encrypted catalogue, so it is found again
 * — not only on VersioningFileProvider, which used to be the only writer.
 */

vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import FileSystemProvider from '../FileSystemProvider';
import { actor } from '../../test-support/actors';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { privateUserIndexPath, privateUserKeysPath, storeMetaPath } from '../../utils/privateStorePath';
import { TEST_PRIVATE_STORE_KDF, createEncryptedStore, createUserKeys, unwrapDek } from '../../utils/privateStoreCrypto';
import { readUserCatalog } from '../../utils/privateStoreCatalogs';
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';

const MOLLY = { ...actor('molly'), privateStoreHandle: 'sid' };
const STORE = 'yourphr';

describe('sealed store on FileSystemProvider (#1420)', () => {
  let testDir: string;
  let pagesDir: string;
  let kek: Buffer;

  const newProvider = async (): Promise<FileSystemProvider> => {
    const configManager = {
      getProperty: vi.fn((key: string, def: unknown) => {
        const config: Record<string, unknown> = {
          'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
          'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
          'ngdpbase.page.provider.filesystem.encoding': 'utf-8'
        };
        return config[key] !== undefined ? config[key] : def;
      }),
      getResolvedDataPath: vi.fn((key: string, def: unknown) =>
        key === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir : def
      ),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    const engine = { getManager: vi.fn((name: string) => (name === 'ConfigurationManager' ? configManager : null)) };
    const p = new FileSystemProvider(engine);
    await p.initialize();
    return p;
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fsp-sealed-catalogue-'));
    pagesDir = path.join(testDir, 'pages');
    const created = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    kek = created.kek;
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', STORE), record);
    unlockPrivateStores('sid', 'molly', kek);
    setUnlockedDek('sid', STORE, unwrapDek(kek, record));
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  const storePageFiles = async (): Promise<string[]> =>
    (await fs.readdir(path.join(pagesDir, 'private', 'molly', STORE))).filter(f => f.endsWith('.md'));

  test('a sealed page is catalogued and found again by its owner', async () => {
    const provider = await newProvider();
    await provider.savePage('Sealed Diary', 'first', { private: true, author: 'molly', store: STORE }, MOLLY);

    expect(await fs.pathExists(privateUserIndexPath(pagesDir, 'molly'))).toBe(true);
    const catalog = await readUserCatalog(pagesDir, 'molly', kek, 'index');
    expect(Object.values(catalog.pages).map(p => p.title)).toEqual(['Sealed Diary']);
    expect((await provider.getPage('Sealed Diary', MOLLY))?.content).toContain('first');
  });

  test('saving it again updates the same page — one file, one uuid, created kept', async () => {
    const provider = await newProvider();
    await provider.savePage('Sealed Diary', 'first', { private: true, author: 'molly', store: STORE }, MOLLY);
    const first = await provider.getPage('Sealed Diary', MOLLY);

    await provider.savePage('Sealed Diary', 'second', { private: true, author: 'molly' }, MOLLY);
    const second = await provider.getPage('Sealed Diary', MOLLY);

    expect(await storePageFiles()).toHaveLength(1);
    expect(second?.uuid).toBe(first?.uuid);
    expect(second?.content).toContain('second');
    expect(second?.metadata.created).toBe(first?.metadata.created);
  });
});
