/**
 * A sealed store works on the plain FileSystemProvider too (#1420, epic #1382):
 * the page is recorded in its store's own sealed page index (#1456; before
 * that, its owner's encrypted user-index), so it is found again by its private
 * name — not only on VersioningFileProvider, which used to be the only writer.
 */

vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import FileSystemProvider from '../FileSystemProvider';
import ValidationManager from '../../managers/ValidationManager';
import { actor } from '../../test-support/actors';
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
import type { UserCatalogPage } from '../../utils/privateStoreCatalogs';
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';

const MOLLY = { ...actor('molly'), privateStoreHandle: 'sid' };
const STORE = 'yourphr';
/** #1456: a private page is named by its path. */
const NAME = formatPrivatePageName('molly', STORE, 'Sealed Diary');

describe('sealed store on FileSystemProvider (#1420)', () => {
  let testDir: string;
  let pagesDir: string;
  let kek: Buffer;
  let dek: Buffer;

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
    // #1456: a private page's slug comes from ValidationManager.
    let validation: unknown = null;
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'ValidationManager') return validation;
        return null;
      })
    };
    validation = new ValidationManager(engine);
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
    dek = unwrapDek(kek, record);
    setUnlockedDek('sid', STORE, dek);
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  const storePageFiles = async (): Promise<string[]> =>
    (await fs.readdir(path.join(pagesDir, 'private', 'molly', STORE))).filter(f => f.endsWith('.md'));

  test('a sealed page is catalogued in its store and found again by its owner', async () => {
    const provider = await newProvider();
    await provider.savePage(NAME, 'first', {}, MOLLY);

    // #1456: the store's own index, sealed with its DEK — not the user-level catalogue.
    const storeIndexFile = storePageIndexPath(pagesDir, 'molly', STORE);
    const bytes = await fs.readFile(storeIndexFile);
    expect(isSealedBytes(bytes)).toBe(true);
    expect(bytes.toString('latin1')).not.toContain('Sealed Diary');
    const storeIndex = JSON.parse(openBytes(dek, bytes).toString('utf8')) as { pages: Record<string, UserCatalogPage> };
    expect(Object.values(storeIndex.pages).map(p => p.title)).toEqual(['Sealed Diary']);
    expect(await fs.pathExists(privateUserIndexPath(pagesDir, 'molly'))).toBe(false);

    expect((await provider.getPage(NAME, MOLLY))?.content).toContain('first');
    // A plain title names a public page only.
    expect(await provider.getPage('Sealed Diary', MOLLY)).toBeNull();
  });

  test('saving it again updates the same page — one file, one uuid, created kept', async () => {
    const provider = await newProvider();
    await provider.savePage(NAME, 'first', {}, MOLLY);
    const first = await provider.getPage(NAME, MOLLY);

    await provider.savePage(NAME, 'second', {}, MOLLY);
    const second = await provider.getPage(NAME, MOLLY);

    expect(await storePageFiles()).toHaveLength(1);
    expect(second?.uuid).toBe(first?.uuid);
    expect(second?.content).toContain('second');
    expect(second?.metadata.created).toBe(first?.metadata.created);
    const storeIndex = JSON.parse(
      openBytes(dek, await fs.readFile(storePageIndexPath(pagesDir, 'molly', STORE))).toString('utf8')
    ) as { pages: Record<string, UserCatalogPage> };
    expect(Object.keys(storeIndex.pages)).toEqual([first?.uuid]);
  });
});
