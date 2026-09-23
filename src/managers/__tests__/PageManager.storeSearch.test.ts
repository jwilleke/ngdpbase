/**
 * A private store's own saved search index — #1458 (epic #1454).
 *
 * A private page is in no shared index (#1456), so its owner could not search
 * their own pages at all. Each store keeps a search index beside its page
 * index, sealed when the store is, and the page door keeps it in step: a save
 * puts the page's document there and nowhere else, a delete takes it out, and
 * a store that has no index yet gets one built from its pages.
 *
 * Exercised through the real PageManager and the real FileSystemProvider, so
 * what is asserted is what a save actually writes to disk.
 */

vi.unmock('../PageManager');
vi.unmock('../../providers/FileSystemProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager from '../PageManager';
import ValidationManager from '../../managers/ValidationManager';
import FileSystemProvider from '../../providers/FileSystemProvider';
import { actor } from '../../test-support/actors';
import type { ActorContext } from '../../context/ActorContext';
import { jobContextFromSystem } from '../../context/JobContext';
import {
  DEFAULT_PRIVATE_STORE,
  formatPrivatePageName,
  privateUserKeysPath,
  storeMetaPath,
  storeSearchIndexPath
} from '../../utils/privateStorePath';
import {
  TEST_PRIVATE_STORE_KDF,
  createEncryptedStore,
  createUserKeys,
  isSealedBytes,
  openBytes,
  unwrapDek
} from '../../utils/privateStoreCrypto';
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';
import type { StoreSearchDocument } from '../../utils/storeSearchIndex';

const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SEALED_STORE = 'vault';

/** The owner, with the handle that reaches her unlocked store keys (#1382). */
const MOLLY: ActorContext = { ...actor('molly'), privateStoreHandle: 'sid' };
/** The boot pass: the system principal, which holds no store key. */
const BOOT: ActorContext = jobContextFromSystem('system', 'per-store search index at boot');

const DIARY = formatPrivatePageName('molly', DEFAULT_PRIVATE_STORE, 'Diary');
const SEALED_DIARY = formatPrivatePageName('molly', SEALED_STORE, 'Merger Notes');

describe('a private store\'s own saved search index (#1458)', () => {
  let testDir: string;
  let pagesDir: string;
  let manager: PageManager;
  let provider: FileSystemProvider;
  let searchManager: { updatePageInIndex: ReturnType<typeof vi.fn>; removePageFromIndex: ReturnType<typeof vi.fn> };
  let dek: Buffer;

  const build = async (): Promise<void> => {
    const configManager = {
      getProperty: vi.fn((key: string, fallback: unknown) => {
        const config: Record<string, unknown> = {
          'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
          'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
          'ngdpbase.page.provider.filesystem.encoding': 'utf-8'
        };
        return config[key] !== undefined ? config[key] : fallback;
      }),
      getResolvedDataPath: vi.fn((key: string, fallback: string) =>
        (key === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir : fallback)),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    searchManager = { updatePageInIndex: vi.fn(), removePageFromIndex: vi.fn() };
    let validation: unknown = null;
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'ValidationManager') return validation;
        if (name === 'SearchManager') return searchManager;
        return null;
      })
    };
    validation = new ValidationManager(engine);
    provider = new FileSystemProvider(engine);
    await provider.initialize();
    manager = new PageManager(engine);
    (manager as unknown as { provider: unknown }).provider = provider;
  };

  /** Make `molly`'s `vault` an encrypted store and unlock it for her session. */
  const sealVault = async (): Promise<void> => {
    const created = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(created.kek);
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', SEALED_STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', SEALED_STORE), record);
    unlockPrivateStores('sid', 'molly', created.kek);
    dek = unwrapDek(created.kek, record);
    setUnlockedDek('sid', SEALED_STORE, dek);
  };

  const plainIndex = async (store = DEFAULT_PRIVATE_STORE): Promise<Record<string, StoreSearchDocument>> => {
    const file = storeSearchIndexPath(pagesDir, 'molly', store);
    if (!await fs.pathExists(file)) return {};
    return ((await fs.readJson(file)) as { documents: Record<string, StoreSearchDocument> }).documents;
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-search-'));
    pagesDir = path.join(testDir, 'pages');
    await fs.ensureDir(pagesDir);
    await build();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  test('a private save puts the page in its store\'s search index and in no shared one', async () => {
    await manager.savePage(DIARY, 'The apricot harvest was thin this year.', {
      uuid: UUID,
      tags: ['garden'],
      'system-category': 'personal'
    }, MOLLY);

    const documents = await plainIndex();
    expect(Object.keys(documents)).toEqual([UUID]);
    expect(documents[UUID]).toMatchObject({
      uuid: UUID,
      title: 'Diary',
      text: 'The apricot harvest was thin this year.',
      tags: ['garden'],
      category: 'personal'
    });
    expect(documents[UUID].lastModified).toEqual(expect.any(String));

    // The shared index is never told about it (#1456).
    expect(searchManager.updatePageInIndex).not.toHaveBeenCalled();
  });

  test('a public save writes no store search index at all', async () => {
    await manager.savePage('Notes', 'public body', { uuid: UUID }, MOLLY);
    expect(await fs.pathExists(storeSearchIndexPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE))).toBe(false);
    expect(searchManager.updatePageInIndex).toHaveBeenCalledWith('Notes', expect.anything());
  });

  test('a delete removes the page\'s document from its store\'s search index', async () => {
    await manager.savePage(DIARY, 'apricots', { uuid: UUID }, MOLLY);
    await manager.savePage(
      formatPrivatePageName('molly', DEFAULT_PRIVATE_STORE, 'Recipes'),
      'plum jam',
      { uuid: OTHER_UUID },
      MOLLY
    );
    expect(Object.keys(await plainIndex()).sort()).toEqual([UUID, OTHER_UUID].sort());

    expect(await manager.deletePage(DIARY, MOLLY)).toBe(true);
    expect(Object.keys(await plainIndex())).toEqual([OTHER_UUID]);
  });

  test('an encrypted store\'s search index is sealed at rest and holds no plaintext', async () => {
    await sealVault();
    await manager.savePage(SEALED_DIARY, 'The apricot merger closes on Friday.', { uuid: UUID }, MOLLY);

    const bytes = await fs.readFile(storeSearchIndexPath(pagesDir, 'molly', SEALED_STORE));
    expect(isSealedBytes(bytes)).toBe(true);
    expect(bytes.toString('latin1')).not.toContain('apricot');
    expect(bytes.toString('latin1')).not.toContain('Merger Notes');

    const opened = JSON.parse(openBytes(dek, bytes).toString('utf8')) as { documents: Record<string, StoreSearchDocument> };
    expect(opened.documents[UUID].text).toBe('The apricot merger closes on Friday.');
  });

  test('a store with no index yet gets one built at boot — unencrypted stores only', async () => {
    await sealVault();
    await manager.savePage(DIARY, 'apricots in the plain store', { uuid: UUID }, MOLLY);
    await manager.savePage(SEALED_DIARY, 'apricots in the vault', { uuid: OTHER_UUID }, MOLLY);

    // Both indexes are lost — the state a store that pre-dates #1458 is in.
    await fs.remove(storeSearchIndexPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE));
    await fs.remove(storeSearchIndexPath(pagesDir, 'molly', SEALED_STORE));

    expect(await manager.buildMissingStoreSearchIndexes(BOOT)).toBe(1);
    // A rebuild reads the page back through the door, so the body is the
    // stored one — with the newline `gray-matter` keeps after the frontmatter.
    expect(Object.values(await plainIndex()).map((d) => d.text.trim())).toEqual(['apricots in the plain store']);
    // The boot pass holds no key, so the sealed store is untouched.
    expect(await fs.pathExists(storeSearchIndexPath(pagesDir, 'molly', SEALED_STORE))).toBe(false);
  });

  test('a sealed store with no index gets one at its owner\'s unlock', async () => {
    await sealVault();
    await manager.savePage(SEALED_DIARY, 'apricots in the vault', { uuid: UUID }, MOLLY);
    await fs.remove(storeSearchIndexPath(pagesDir, 'molly', SEALED_STORE));

    expect(await manager.buildMissingStoreSearchIndexes(MOLLY, 'molly')).toBe(1);

    const bytes = await fs.readFile(storeSearchIndexPath(pagesDir, 'molly', SEALED_STORE));
    expect(isSealedBytes(bytes)).toBe(true);
    const opened = JSON.parse(openBytes(dek, bytes).toString('utf8')) as { documents: Record<string, StoreSearchDocument> };
    expect(opened.documents[UUID].text.trim()).toBe('apricots in the vault');
  });

  test('a store that already has an index is not rebuilt', async () => {
    await manager.savePage(DIARY, 'apricots', { uuid: UUID }, MOLLY);
    expect(await manager.buildMissingStoreSearchIndexes(BOOT)).toBe(0);
  });

  test('rebuildStoreSearchIndex repairs a stale index from the store\'s pages', async () => {
    await manager.savePage(DIARY, 'apricots', { uuid: UUID }, MOLLY);
    // A stale index: a document for a page that is gone, and none for the one there.
    await fs.writeJson(storeSearchIndexPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE), {
      version: 1,
      documents: { 'ghost-uuid': { uuid: 'ghost-uuid', title: 'Ghost', text: 'x', tags: [], category: '', lastModified: '' } }
    });

    expect(await manager.rebuildStoreSearchIndex(MOLLY, 'molly', DEFAULT_PRIVATE_STORE)).toBe(1);
    const documents = await plainIndex();
    expect(Object.keys(documents)).toEqual([UUID]);
    expect(documents[UUID].text.trim()).toBe('apricots');
  });

  test('the owner finds their private page by title and by body text', async () => {
    await manager.savePage(DIARY, 'The apricot harvest was thin.', { uuid: UUID }, MOLLY);

    const byTitle = await manager.searchOwnPrivatePages(MOLLY, { query: 'Diary' });
    expect(byTitle.map((m) => m.name)).toEqual([DIARY]);

    const byText = await manager.searchOwnPrivatePages(MOLLY, { query: 'apricot' });
    expect(byText.map((m) => m.name)).toEqual([DIARY]);
    expect(byText[0].snippet).toContain('<mark>apricot</mark>');
  });

  test('another user and an admin find none of it', async () => {
    await manager.savePage(DIARY, 'The apricot harvest was thin.', { uuid: UUID }, MOLLY);

    const bob = actor('bob');
    const admin = { ...actor('root'), roles: ['admin'], principals: ['admin', 'Authenticated'] } as ActorContext;

    expect(await manager.searchOwnPrivatePages(bob, { query: 'apricot' })).toEqual([]);
    expect(await manager.searchOwnPrivatePages(admin, { query: 'apricot' })).toEqual([]);
  });

  test('a locked encrypted store yields nothing — never a plaintext read', async () => {
    await sealVault();
    await manager.savePage(SEALED_DIARY, 'The apricot merger closes on Friday.', { uuid: UUID }, MOLLY);

    // The owner, signed in, but with no unlocked store keys.
    const locked: ActorContext = { ...actor('molly'), privateStoreHandle: 'no-such-handle' };
    expect(await manager.searchOwnPrivatePages(locked, { query: 'apricot' })).toEqual([]);
  });
});
