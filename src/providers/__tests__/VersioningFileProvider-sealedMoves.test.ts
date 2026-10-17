/**
 * Every byte that lands in a sealed vault goes through its store I/O — #1836.
 *
 * #1834 closed the save path. Three other paths put bytes into a vault
 * without it, and so wrote plaintext under a `store.json` that says sealed:
 *
 * - a page's history, moved with `fs.move` when the page changes place
 *   (public ↔ vault, vault ↔ vault);
 * - a backup restore, which writes each private file back as it was backed
 *   up — a backup taken before the vault was sealed is plaintext;
 * - a legacy public tombstone whose `deletedFrom` is inside a vault.
 *
 * Exercised through the real VersioningFileProvider, so what is asserted is
 * what lands on disk.
 */

vi.unmock('../VersioningFileProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import VersioningFileProvider from '../VersioningFileProvider';
import ValidationManager from '../../managers/ValidationManager';
import { actor } from '../../test-support/actors';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  formatPrivatePageName,
  privateStoreRoot,
  privateUserKeysPath,
  storeMetaPath
} from '../../utils/privateStorePath';
import {
  TEST_PRIVATE_STORE_KDF,
  createEncryptedStore,
  createUserKeys,
  isSealedBytes,
  openBytes,
  unwrapDek
} from '../../utils/privateStoreCrypto';
import { SealedVaultRefusedError } from '../../utils/privateStoreMeta';
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';

const MOLLY = { ...actor('molly'), privateStoreHandle: 'sid' };
const UUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const V1 = 'cholesterol-240-first';
const V2 = 'cholesterol-180-second';
const V3 = 'cholesterol-160-third';

/** `phr` is sealed by its kind; `notes` is a vault kind that is not. */
const SYSTEM_CATEGORIES = {
  general: { label: 'general', default: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/default/' } },
  phr: { label: 'phr', encrypt: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/phr/' } },
  notes: { label: 'notes', encrypt: false, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/notes/' } }
};

/** Every regular file under `dir`, recursively. */
async function filesUnder(dir: string): Promise<string[]> {
  if (!await fs.pathExists(dir)) return [];
  const out: string[] = [];
  for (const ent of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    if (ent.isFile()) out.push(path.join(ent.parentPath, ent.name));
  }
  return out;
}

describe('bytes moved or restored into a sealed vault are sealed (#1836)', () => {
  let testDir: string;
  let pagesDir: string;
  let requiredDir: string;
  let indexPath: string;
  let engine: { getManager: (name: string) => unknown };
  let kek: Buffer | undefined;
  let unlocked: boolean;

  const config = (): Record<string, unknown> => ({
    'ngdpbase.page.enabled': true,
    'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
    'ngdpbase.page.provider.filesystem.requiredpagesdir': requiredDir,
    'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
    'ngdpbase.page.provider.versioning.indexfile': indexPath,
    'ngdpbase.page.provider.versioning.deltastorage': true,
    'ngdpbase.page.provider.versioning.compression': 'none',
    'ngdpbase.system-category': SYSTEM_CATEGORIES
  });

  const newProvider = async (): Promise<VersioningFileProvider> => {
    const p = new VersioningFileProvider(engine);
    await p.initialize();
    return p;
  };

  /** Molly walks through `store`'s door: a sealed `store.json`, its DEK in her session. */
  const openSealedVault = async (store: string, { unlock = true } = {}): Promise<Buffer> => {
    if (!kek) {
      const created = await createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
      kek = created.kek;
      await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
      await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    }
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', store)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', store), { kind: store, ...record });
    const dek = unwrapDek(kek, record);
    if (unlock) {
      if (!unlocked) unlockPrivateStores('sid', 'molly', kek);
      unlocked = true;
      setUnlockedDek('sid', store, dek);
    }
    return dek;
  };

  const publicHistory = () => path.join(pagesDir, 'versions', UUID);
  const vaultHistory = (store: string) => path.join(privateStoreRoot(pagesDir, 'molly', store), 'versions', UUID);

  /** A public page `Labs` with two versions of history. */
  const publicPageWithHistory = async (provider: VersioningFileProvider): Promise<void> => {
    await provider.savePage('Labs', V1, { uuid: UUID, author: 'molly' }, MOLLY);
    await provider.savePage('Labs', V2, { uuid: UUID, author: 'molly' }, MOLLY);
    expect((await filesUnder(publicHistory())).length).toBeGreaterThan(0);
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vfp-sealed-moves-'));
    pagesDir = path.join(testDir, 'pages');
    requiredDir = path.join(testDir, 'required-pages');
    indexPath = path.join(testDir, 'data', 'page-index.json');
    kek = undefined;
    unlocked = false;
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

  describe('history follows the page through the store I/O', () => {
    test('a public page made private into a sealed vault: its whole history is sealed, none of it in the clear', async () => {
      const provider = await newProvider();
      await publicPageWithHistory(provider);
      const dek = await openSealedVault('phr');

      await provider.savePage('Labs', V3, { uuid: UUID, private: true, store: 'phr', author: 'molly' }, MOLLY);

      expect(await fs.pathExists(publicHistory())).toBe(false);
      const files = await filesUnder(vaultHistory('phr'));
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const bytes = await fs.readFile(file);
        expect(isSealedBytes(bytes), `${path.relative(pagesDir, file)} is sealed`).toBe(true);
        expect(bytes.toString('latin1')).not.toContain('cholesterol');
        openBytes(dek, bytes); // opens with this vault's DEK
      }
      const name = formatPrivatePageName('molly', 'phr', 'Labs');
      expect(await provider.getVersionHistory(name, MOLLY)).toHaveLength(3);
      expect((await provider.getPageVersion(name, 1, MOLLY)).content).toContain(V1);
      expect((await provider.getPageVersion(name, 2, MOLLY)).content).toContain(V2);
    });

    test('a sealed vault whose DEK is not in session: the move is refused and nothing leaves the public area', async () => {
      const provider = await newProvider();
      await publicPageWithHistory(provider);
      await openSealedVault('phr', { unlock: false });
      const before = (await filesUnder(publicHistory())).sort();

      await expect(provider.savePage('Labs', V3, { uuid: UUID, private: true, store: 'phr', author: 'molly' }, MOLLY))
        .rejects.toThrow(/locked/);
      expect((await filesUnder(publicHistory())).sort()).toEqual(before);
      expect(await fs.pathExists(vaultHistory('phr'))).toBe(false);
    });

    test('a sealed kind\'s vault never opened: refused with SealedVaultRefusedError, history stays public', async () => {
      const provider = await newProvider();
      await publicPageWithHistory(provider);

      await expect(provider.savePage('Labs', V3, { uuid: UUID, private: true, store: 'phr', author: 'molly' }, MOLLY))
        .rejects.toBeInstanceOf(SealedVaultRefusedError);
      expect((await filesUnder(publicHistory())).length).toBeGreaterThan(0);
      expect(await fs.pathExists(vaultHistory('phr'))).toBe(false);
    });

    test('a page moved out of a sealed vault to the public area takes a readable plaintext history', async () => {
      await openSealedVault('phr');
      const provider = await newProvider();
      const name = formatPrivatePageName('molly', 'phr', 'Labs');
      await provider.savePage(name, V1, { uuid: UUID, author: 'molly' }, MOLLY);
      await provider.savePage(name, V2, { uuid: UUID, author: 'molly' }, MOLLY);

      await provider.savePage(name, V3, { uuid: UUID, private: false, author: 'molly' }, MOLLY);

      expect(await fs.pathExists(vaultHistory('phr'))).toBe(false);
      const files = await filesUnder(publicHistory());
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) expect(isSealedBytes(await fs.readFile(file))).toBe(false);
      expect(await provider.getVersionHistory('Labs', MOLLY)).toHaveLength(3);
      expect((await provider.getPageVersion('Labs', 1, MOLLY)).content).toContain(V1);

      // And it survives a restart, read as the public history it now is.
      const restarted = await newProvider();
      expect((await restarted.getPageVersion('Labs', 2, MOLLY)).content).toContain(V2);
    });

    test('a page moved between two sealed vaults is re-sealed with the new vault\'s DEK', async () => {
      const dekFrom = await openSealedVault('phr');
      const dekTo = await openSealedVault('archive');
      const provider = await newProvider();
      const from = formatPrivatePageName('molly', 'phr', 'Labs');
      const to = formatPrivatePageName('molly', 'archive', 'Labs');
      await provider.savePage(from, V1, { uuid: UUID, author: 'molly' }, MOLLY);
      await provider.savePage(from, V2, { uuid: UUID, author: 'molly' }, MOLLY);

      await provider.savePage(to, V2, { uuid: UUID, author: 'molly' }, MOLLY, { moveFrom: from });

      expect(await fs.pathExists(vaultHistory('phr'))).toBe(false);
      const files = await filesUnder(vaultHistory('archive'));
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const bytes = await fs.readFile(file);
        expect(() => openBytes(dekTo, bytes)).not.toThrow();
        expect(() => openBytes(dekFrom, bytes)).toThrow();
      }
      expect((await provider.getPageVersion(to, 1, MOLLY)).content).toContain(V1);
    });

    test('a vault that is not sealed is unchanged: the history moves as it is, in the clear', async () => {
      const provider = await newProvider();
      await publicPageWithHistory(provider);

      await provider.savePage('Labs', V3, { uuid: UUID, private: true, store: 'notes', author: 'molly' }, MOLLY);

      expect(await fs.pathExists(publicHistory())).toBe(false);
      const files = await filesUnder(vaultHistory('notes'));
      expect(files.length).toBeGreaterThan(0);
      const text = (await Promise.all(files.map((f) => fs.readFile(f, 'utf8')))).join('\n');
      expect(text).toContain(V1);
      expect((await provider.getPageVersion(formatPrivatePageName('molly', 'notes', 'Labs'), 1, MOLLY)).content).toContain(V1);
    });
  });

  describe('a backup restore never writes plaintext into a sealed vault', () => {
    /** A vault as it was before its door was opened: plaintext page, no store.json. */
    const plaintextVault = async (store: string): Promise<void> => {
      const root = privateStoreRoot(pagesDir, 'molly', store);
      await fs.ensureDir(path.join(root, 'versions', UUID, 'v1'));
      await fs.writeFile(path.join(root, `${UUID}.md`), `---\ntitle: Labs\nuuid: ${UUID}\n---\n${V1}\n`);
      await fs.writeFile(path.join(root, 'versions', UUID, 'v1', 'content.md'), V1);
    };

    test('a backup taken before the vault was sealed: its plaintext files are refused, the sealed store.json kept', async () => {
      await plaintextVault('phr');
      const provider = await newProvider();
      const backup = await provider.backup();
      expect((backup.privateFiles ?? []).some((f) => f.relativePath.includes('/phr/'))).toBe(true);

      // Since then the vault was emptied and its owner opened the door.
      await fs.remove(privateStoreRoot(pagesDir, 'molly', 'phr'));
      await openSealedVault('phr');
      const metaBefore = await fs.readFile(storeMetaPath(pagesDir, 'molly', 'phr'), 'utf8');

      await provider.restore(backup);

      const root = privateStoreRoot(pagesDir, 'molly', 'phr');
      for (const file of await filesUnder(root)) {
        if (path.basename(file) === 'store.json') continue;
        expect(isSealedBytes(await fs.readFile(file)), `${path.relative(pagesDir, file)} is not plaintext`).toBe(true);
      }
      expect(await fs.pathExists(path.join(root, `${UUID}.md`))).toBe(false);
      expect(await fs.readFile(storeMetaPath(pagesDir, 'molly', 'phr'), 'utf8')).toBe(metaBefore);
    });

    test('a backup whose store.json is not sealed does not replace a sealed one', async () => {
      await openSealedVault('archive');
      const provider = await newProvider();
      const backup = await provider.backup();
      const metaBefore = await fs.readFile(storeMetaPath(pagesDir, 'molly', 'archive'), 'utf8');
      backup.privateFiles = [{
        relativePath: 'vaults/molly/archive/store.json',
        base64: Buffer.from(JSON.stringify({ kind: 'archive', encrypt: false })).toString('base64'),
        size: 1,
        mtime: new Date().toISOString()
      }];

      await provider.restore(backup);

      expect(await fs.readFile(storeMetaPath(pagesDir, 'molly', 'archive'), 'utf8')).toBe(metaBefore);
    });

    test('a sealed vault backed up sealed restores as before, byte for byte', async () => {
      await openSealedVault('phr');
      const provider = await newProvider();
      const name = formatPrivatePageName('molly', 'phr', 'Labs');
      await provider.savePage(name, V1, { uuid: UUID, author: 'molly' }, MOLLY);
      const page = path.join(privateStoreRoot(pagesDir, 'molly', 'phr'), `${UUID}.md`);
      const sealedBytes = await fs.readFile(page);
      const backup = await provider.backup();
      await fs.remove(page);

      await provider.restore(backup);

      expect((await fs.readFile(page)).equals(sealedBytes)).toBe(true);
    });

    test('a vault that is not sealed restores its plaintext as before', async () => {
      await plaintextVault('notes');
      const provider = await newProvider();
      const backup = await provider.backup();
      await fs.remove(privateStoreRoot(pagesDir, 'molly', 'notes'));

      await provider.restore(backup);

      expect(await fs.readFile(path.join(privateStoreRoot(pagesDir, 'molly', 'notes'), `${UUID}.md`), 'utf8')).toContain(V1);
    });

    test('a page backup entry naming a file inside a sealed vault is refused', async () => {
      await openSealedVault('phr');
      const provider = await newProvider();
      const backup = await provider.backup();
      backup.pages = [{ relativePath: `vaults/molly/phr/${UUID}.md`, content: `---\ntitle: Labs\n---\n${V1}\n` } as never];

      await provider.restore(backup);

      expect(await fs.pathExists(path.join(privateStoreRoot(pagesDir, 'molly', 'phr'), `${UUID}.md`))).toBe(false);
    });
  });

  test('a legacy public tombstone whose page was in a sealed vault is not restored into it in the clear', async () => {
    await openSealedVault('phr');
    const provider = await newProvider();
    const trash = path.join(pagesDir, 'deleted');
    await fs.ensureDir(trash);
    await fs.writeFile(path.join(trash, `${UUID}.md`), `---\ntitle: Labs\nuuid: ${UUID}\n---\n${V1}\n`);
    const target = path.join(privateStoreRoot(pagesDir, 'molly', 'phr'), `${UUID}.md`);
    const index = (provider as unknown as { pageIndex: { deletedPages?: Record<string, unknown> } }).pageIndex;
    index.deletedPages = {
      [UUID]: { title: 'Labs', uuid: UUID, location: 'pages', deletedFrom: target, deletedAt: new Date().toISOString(), deletedBy: 'molly' }
    };

    const result = await provider.restoreDeletedPage(UUID);

    expect(result.ok).toBe(false);
    expect(await fs.pathExists(target)).toBe(false);
    expect(await fs.pathExists(path.join(trash, `${UUID}.md`))).toBe(true);
  });
});
