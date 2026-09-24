/**
 * A private store's own trash — #1459 (epic #1454).
 *
 * Before this, deleting a private page moved its file into the store's
 * `deleted/` folder and dropped it from the store's page index, and recorded
 * nothing anywhere: no list, no restore, no purge. Now the store keeps its own
 * `deleted-index.json`, written through the store's I/O so it is sealed
 * exactly when the store is, and the owner restores or destroys from
 * `/my/trash`.
 *
 * Exercised through the real PageManager and the real VersioningFileProvider,
 * so what is asserted is what a delete, a restore and a purge actually do on
 * disk — including that nothing about a private page reaches the global
 * `page-index.json`, `pages/deleted/` or the admin trash listing.
 */

vi.unmock('../PageManager');
vi.unmock('../../providers/FileSystemProvider');
vi.unmock('../../providers/VersioningFileProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager from '../PageManager';
import ValidationManager from '../../managers/ValidationManager';
import VersioningFileProvider from '../../providers/VersioningFileProvider';
import { actor } from '../../test-support/actors';
import type { ActorContext } from '../../context/ActorContext';
import {
  DEFAULT_PRIVATE_STORE,
  formatPrivatePageName,
  privateDeletedDirectory,
  privateUserKeysPath,
  privateVersionDirectory,
  storeDeletedIndexPath,
  storeMetaPath,
  storePageIndexPath,
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
import type { StoreDeletedEntry, StorePageEntry } from '../../types/Provider';
import type { StoreSearchDocument } from '../../utils/storeSearchIndex';

const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SEALED_STORE = 'vault';

/** The owner, with the handle that reaches her unlocked store keys (#1382). */
const MOLLY: ActorContext = { ...actor('molly'), privateStoreHandle: 'sid' };
/** An admin, with no key of Molly's and no claim on her container (P2). */
const ADMIN: ActorContext = { ...actor('root'), roles: ['admin'] } as ActorContext;

const DIARY = formatPrivatePageName('molly', DEFAULT_PRIVATE_STORE, 'Diary');
const SEALED_DIARY = formatPrivatePageName('molly', SEALED_STORE, 'Merger Notes');

describe('a private store\'s own trash (#1459)', () => {
  let testDir: string;
  let pagesDir: string;
  let indexPath: string;
  let manager: PageManager;
  let provider: VersioningFileProvider;
  let engine: { getManager: (name: string) => unknown };
  let retentionDays: number;
  let dek: Buffer;

  const build = async (): Promise<void> => {
    const config = (): Record<string, unknown> => ({
      'ngdpbase.page.enabled': true,
      'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
      'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
      'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
      'ngdpbase.page.provider.versioning.indexfile': indexPath,
      'ngdpbase.page.provider.versioning.deltastorage': true,
      'ngdpbase.page.provider.versioning.compression': 'none',
      'ngdpbase.page.delete.retentiondays': retentionDays,
      'ngdpbase.system-category': { general: { label: 'general', storageLocation: 'regular' } }
    });
    const configManager = {
      getProperty: vi.fn((key: string, fallback: unknown) => (config()[key] !== undefined ? config()[key] : fallback)),
      getResolvedDataPath: vi.fn((key: string, fallback: string) => {
        if (key === 'ngdpbase.page.provider.versioning.indexfile') return indexPath;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
        if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return path.join(testDir, 'required-pages');
        return fallback;
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
    provider = new VersioningFileProvider(engine);
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

  /** A store's own file, read as the store stores it (plain, or opened with its DEK). */
  const readStoreJson = async <T>(file: string, sealed: boolean): Promise<T | null> => {
    if (!await fs.pathExists(file)) return null;
    const bytes = await fs.readFile(file);
    return JSON.parse((sealed ? openBytes(dek, bytes) : bytes).toString('utf8')) as T;
  };

  const tombstones = async (store = DEFAULT_PRIVATE_STORE): Promise<Record<string, StoreDeletedEntry>> =>
    (await readStoreJson<{ deleted: Record<string, StoreDeletedEntry> }>(
      storeDeletedIndexPath(pagesDir, 'molly', store), store === SEALED_STORE
    ))?.deleted ?? {};

  const storePages = async (store = DEFAULT_PRIVATE_STORE): Promise<Record<string, StorePageEntry>> =>
    (await readStoreJson<{ pages: Record<string, StorePageEntry> }>(
      storePageIndexPath(pagesDir, 'molly', store), store === SEALED_STORE
    ))?.pages ?? {};

  const searchDocs = async (store = DEFAULT_PRIVATE_STORE): Promise<Record<string, StoreSearchDocument>> =>
    (await readStoreJson<{ documents: Record<string, StoreSearchDocument> }>(
      storeSearchIndexPath(pagesDir, 'molly', store), store === SEALED_STORE
    ))?.documents ?? {};

  const globalIndex = async (): Promise<{ pages: Record<string, unknown>; deletedPages?: Record<string, unknown> }> =>
    JSON.parse(await fs.readFile(indexPath, 'utf8'));

  /** Files sitting in the GLOBAL trash, which no private page may ever reach. */
  const globalTrashFiles = async (): Promise<string[]> => {
    const dir = path.join(pagesDir, 'deleted');
    return (await fs.pathExists(dir)) ? fs.readdir(dir) : [];
  };

  const backdateTombstone = async (store: string, uuid: string, daysAgo: number): Promise<void> => {
    const file = storeDeletedIndexPath(pagesDir, 'molly', store);
    const sealed = store === SEALED_STORE;
    const content = await readStoreJson<{ version: number; deleted: Record<string, StoreDeletedEntry> }>(file, sealed);
    if (!content) throw new Error('no tombstone to backdate');
    content.deleted[uuid].deletedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    const text = JSON.stringify(content);
    await fs.writeFile(file, sealed ? (await import('../../utils/privateStoreCrypto')).sealBytes(dek, Buffer.from(text, 'utf8')) : text);
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'private-trash-'));
    pagesDir = path.join(testDir, 'pages');
    indexPath = path.join(testDir, 'data', 'page-index.json');
    retentionDays = 30;
    await fs.ensureDir(pagesDir);
    await build();
  });

  afterEach(async () => {
    provider.shutdown();
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  test('a delete records a tombstone in the store, and nothing in the global trash or page index', async () => {
    await manager.savePage(DIARY, 'apricots in the plain store', { uuid: UUID }, MOLLY);
    expect(await manager.deletePage(DIARY, MOLLY)).toBe(true);

    expect(Object.keys(await tombstones())).toEqual([UUID]);
    expect((await tombstones())[UUID]).toMatchObject({
      uuid: UUID,
      title: 'Diary',
      store: DEFAULT_PRIVATE_STORE,
      creator: 'molly',
      deletedBy: 'molly'
    });
    expect((await tombstones())[UUID].deletedAt).toEqual(expect.any(String));

    // Out of the store's live indexes, and its file is in the store's own trash.
    expect(await storePages()).toEqual({});
    expect(await searchDocs()).toEqual({});
    expect(await fs.pathExists(path.join(privateDeletedDirectory(pagesDir, 'molly'), `${UUID}.md`))).toBe(true);

    // Nothing anywhere shared: not the global trash folder, not the global
    // index, and so not /admin/deleted-pages, which reads only that index.
    expect(await globalTrashFiles()).toEqual([]);
    expect((await globalIndex()).pages[UUID]).toBeUndefined();
    expect((await globalIndex()).deletedPages ?? {}).toEqual({});
    expect(provider.getDeletedPages()).toEqual([]);
  });

  test('delete then restore in a plain store: content and history intact, indexes back in step', async () => {
    await manager.savePage(DIARY, 'apricots, first pressing', { uuid: UUID }, MOLLY);
    await manager.savePage(DIARY, 'apricots, second pressing', { uuid: UUID }, MOLLY);
    const historyBefore = await provider.getVersionHistory(DIARY, MOLLY);
    expect(historyBefore.length).toBe(2);

    expect(await manager.deletePage(DIARY, MOLLY)).toBe(true);
    const listed = await manager.listOwnDeletedPrivatePages(MOLLY);
    expect(listed.map((e) => [e.uuid, e.store, e.title])).toEqual([[UUID, DEFAULT_PRIVATE_STORE, 'Diary']]);

    const result = await manager.restoreOwnPrivatePage(MOLLY, DEFAULT_PRIVATE_STORE, UUID);
    expect(result).toEqual({ ok: true, title: 'Diary', name: DIARY });

    // The page is there again, with its content and its whole history.
    expect((await manager.getPage(DIARY, MOLLY))?.content).toContain('apricots, second pressing');
    expect(await provider.getVersionHistory(DIARY, MOLLY)).toHaveLength(2);
    expect((await provider.getPageVersion(DIARY, 1, MOLLY)).content).toContain('first pressing');

    // Every index the doors keep, back in step; the tombstone gone.
    expect(Object.keys(await storePages())).toEqual([UUID]);
    expect(Object.keys(await searchDocs())).toEqual([UUID]);
    expect(await tombstones()).toEqual({});
    expect(await fs.pathExists(path.join(privateDeletedDirectory(pagesDir, 'molly'), `${UUID}.md`))).toBe(false);

    // Still nothing shared.
    expect(await globalTrashFiles()).toEqual([]);
    expect((await globalIndex()).pages[UUID]).toBeUndefined();
  });

  test('delete then restore in a sealed store (unlocked): content and history intact', async () => {
    await sealVault();
    await manager.savePage(SEALED_DIARY, 'the merger closes on Friday', { uuid: UUID }, MOLLY);
    await manager.savePage(SEALED_DIARY, 'the merger closes on Monday', { uuid: UUID }, MOLLY);

    expect(await manager.deletePage(SEALED_DIARY, MOLLY)).toBe(true);
    expect(Object.keys(await tombstones(SEALED_STORE))).toEqual([UUID]);

    const result = await manager.restoreOwnPrivatePage(MOLLY, SEALED_STORE, UUID);
    expect(result).toEqual({ ok: true, title: 'Merger Notes', name: SEALED_DIARY });

    expect((await manager.getPage(SEALED_DIARY, MOLLY))?.content).toContain('closes on Monday');
    expect(await provider.getVersionHistory(SEALED_DIARY, MOLLY)).toHaveLength(2);
    expect((await provider.getPageVersion(SEALED_DIARY, 1, MOLLY)).content).toContain('closes on Friday');
    expect(Object.keys(await storePages(SEALED_STORE))).toEqual([UUID]);
    expect(Object.keys(await searchDocs(SEALED_STORE))).toEqual([UUID]);
    expect(await tombstones(SEALED_STORE)).toEqual({});
    expect(await globalTrashFiles()).toEqual([]);
    expect((await globalIndex()).pages[UUID]).toBeUndefined();
  });

  test('the tombstone of an encrypted store is sealed at rest and holds no plaintext title', async () => {
    await sealVault();
    await manager.savePage(SEALED_DIARY, 'the merger closes on Friday', { uuid: UUID }, MOLLY);
    await manager.deletePage(SEALED_DIARY, MOLLY);

    const bytes = await fs.readFile(storeDeletedIndexPath(pagesDir, 'molly', SEALED_STORE));
    expect(isSealedBytes(bytes)).toBe(true);
    expect(bytes.toString('latin1')).not.toContain('Merger Notes');
    expect(bytes.toString('latin1')).not.toContain(UUID);

    const opened = JSON.parse(openBytes(dek, bytes).toString('utf8')) as { deleted: Record<string, StoreDeletedEntry> };
    expect(opened.deleted[UUID]).toMatchObject({ title: 'Merger Notes', deletedBy: 'molly' });
  });

  test('a restore is refused, and says why, when the title is taken in that store', async () => {
    await manager.savePage(DIARY, 'the original', { uuid: UUID }, MOLLY);
    await manager.deletePage(DIARY, MOLLY);
    // Someone (the owner) has since made a new page under that title.
    await manager.savePage(DIARY, 'a new page of the same name', { uuid: OTHER_UUID }, MOLLY);

    const result = await manager.restoreOwnPrivatePage(MOLLY, DEFAULT_PRIVATE_STORE, UUID);
    expect(result).toEqual({ ok: false, reason: 'title-conflict', detail: 'Diary' });

    // Nothing was moved or dropped: the trashed page is still restorable later.
    expect(Object.keys(await tombstones())).toEqual([UUID]);
    expect(await fs.pathExists(path.join(privateDeletedDirectory(pagesDir, 'molly'), `${UUID}.md`))).toBe(true);
    expect(Object.keys(await storePages())).toEqual([OTHER_UUID]);
    expect((await manager.getPage(DIARY, MOLLY))?.content).toContain('a new page of the same name');
  });

  test('a purge removes the file, the version history and the tombstone', async () => {
    await manager.savePage(DIARY, 'first', { uuid: UUID }, MOLLY);
    await manager.savePage(DIARY, 'second', { uuid: UUID }, MOLLY);
    const versionsDir = privateVersionDirectory(pagesDir, 'molly', UUID, DEFAULT_PRIVATE_STORE);
    expect(await fs.pathExists(versionsDir)).toBe(true);

    await manager.deletePage(DIARY, MOLLY);
    expect(await manager.purgeOwnPrivatePage(MOLLY, DEFAULT_PRIVATE_STORE, UUID)).toBe(true);

    expect(await fs.pathExists(path.join(privateDeletedDirectory(pagesDir, 'molly'), `${UUID}.md`))).toBe(false);
    expect(await fs.pathExists(versionsDir)).toBe(false);
    expect(await tombstones()).toEqual({});
    expect(await manager.listOwnDeletedPrivatePages(MOLLY)).toEqual([]);
    // A second purge has nothing left to do.
    expect(await manager.purgeOwnPrivatePage(MOLLY, DEFAULT_PRIVATE_STORE, UUID)).toBe(false);
  });

  test('retention expires a plain store\'s tombstone at boot, and a sealed store\'s in its owner\'s session', async () => {
    await sealVault();
    await manager.savePage(DIARY, 'apricots in the plain store', { uuid: UUID }, MOLLY);
    await manager.savePage(SEALED_DIARY, 'apricots in the vault', { uuid: OTHER_UUID }, MOLLY);
    await manager.deletePage(DIARY, MOLLY);
    await manager.deletePage(SEALED_DIARY, MOLLY);

    await backdateTombstone(DEFAULT_PRIVATE_STORE, UUID, 40);
    await backdateTombstone(SEALED_STORE, OTHER_UUID, 40);

    // Boot: the retention pass runs under a job context, which holds no store
    // key, so it reaches the unencrypted store and nothing else.
    provider.shutdown();
    await build();

    expect(await tombstones()).toEqual({});
    expect(await fs.pathExists(path.join(privateDeletedDirectory(pagesDir, 'molly'), `${UUID}.md`))).toBe(false);
    expect(Object.keys(await tombstones(SEALED_STORE))).toEqual([OTHER_UUID]);

    // The owner's session holds the key, so this is where the sealed store's
    // trash expires — the same split as #1457 and #1458.
    expect(await manager.purgeExpiredOwnPrivateTrash(MOLLY)).toBe(1);
    expect(await tombstones(SEALED_STORE)).toEqual({});
    expect(await fs.pathExists(
      path.join(privateDeletedDirectory(pagesDir, 'molly', SEALED_STORE), `${OTHER_UUID}.md`)
    )).toBe(false);
    expect(await fs.pathExists(privateVersionDirectory(pagesDir, 'molly', OTHER_UUID, SEALED_STORE))).toBe(false);
  });

  test('retention of 0 keeps every private tombstone for ever', async () => {
    retentionDays = 0;
    await build();
    await manager.savePage(DIARY, 'apricots', { uuid: UUID }, MOLLY);
    await manager.deletePage(DIARY, MOLLY);
    await backdateTombstone(DEFAULT_PRIVATE_STORE, UUID, 4000);

    provider.shutdown();
    await build();
    expect(Object.keys(await tombstones())).toEqual([UUID]);
    expect(await manager.purgeExpiredOwnPrivateTrash(MOLLY)).toBe(0);
  });

  test('the trash is the requester\'s own: an admin sees only their own items, never another user\'s', async () => {
    await manager.savePage(DIARY, 'apricots', { uuid: UUID }, MOLLY);
    await manager.deletePage(DIARY, MOLLY);
    // The admin has a private page of their own in the trash, so an empty
    // answer here would be indistinguishable from a listing that simply failed.
    const rootDiary = formatPrivatePageName('root', DEFAULT_PRIVATE_STORE, 'Runbook');
    await manager.savePage(rootDiary, 'restart the thing', { uuid: OTHER_UUID }, ADMIN);
    await manager.deletePage(rootDiary, ADMIN);

    expect((await manager.listOwnDeletedPrivatePages(MOLLY)).map((e) => e.uuid)).toEqual([UUID]);
    // No role reaches into another user's container (security-posture P2):
    // the admin's own item, and nothing extra.
    expect((await manager.listOwnDeletedPrivatePages(ADMIN)).map((e) => e.uuid)).toEqual([OTHER_UUID]);
    expect(await manager.restoreOwnPrivatePage(ADMIN, DEFAULT_PRIVATE_STORE, UUID))
      .toEqual({ ok: false, reason: 'not-found' });
    expect(await manager.purgeOwnPrivatePage(ADMIN, DEFAULT_PRIVATE_STORE, UUID)).toBe(false);

    // Molly's page is untouched by any of it.
    expect(Object.keys(await tombstones())).toEqual([UUID]);
    expect(await fs.pathExists(path.join(privateDeletedDirectory(pagesDir, 'molly'), `${UUID}.md`))).toBe(true);
  });

  test('a uuid from a request that is not a tombstone is not found, whatever it spells', async () => {
    await manager.savePage(DIARY, 'apricots', { uuid: UUID }, MOLLY);
    await manager.deletePage(DIARY, MOLLY);

    // `__proto__` and `constructor` answer a truthy value from a plain object
    // lookup; neither is a page, and neither may reach a path.
    for (const notAUuid of ['__proto__', 'constructor', '../../../etc/passwd', 'no-such-uuid']) {
      expect(await manager.restoreOwnPrivatePage(MOLLY, DEFAULT_PRIVATE_STORE, notAUuid))
        .toEqual({ ok: false, reason: 'not-found' });
      expect(await manager.purgeOwnPrivatePage(MOLLY, DEFAULT_PRIVATE_STORE, notAUuid)).toBe(false);
    }
    // A store id that is not a plain slug is refused before any path is built.
    expect(await manager.restoreOwnPrivatePage(MOLLY, '../other', UUID)).toEqual({ ok: false, reason: 'not-found' });
    expect(await manager.purgeOwnPrivatePage(MOLLY, '../other', UUID)).toBe(false);

    // The real tombstone is untouched by any of it.
    expect(Object.keys(await tombstones())).toEqual([UUID]);
  });

  test('a locked sealed store contributes no trash entries at all', async () => {
    await sealVault();
    await manager.savePage(SEALED_DIARY, 'the merger closes on Friday', { uuid: UUID }, MOLLY);
    await manager.deletePage(SEALED_DIARY, MOLLY);
    expect(await manager.listOwnDeletedPrivatePages(MOLLY)).toHaveLength(1);

    clearUnlockedPrivateStores();
    const locked: ActorContext = { ...actor('molly'), privateStoreHandle: 'sid' };
    expect(await manager.listOwnDeletedPrivatePages(locked)).toEqual([]);
    expect(await manager.restoreOwnPrivatePage(locked, SEALED_STORE, UUID))
      .toMatchObject({ ok: false, reason: 'error' });
    expect(await manager.purgeOwnPrivatePage(locked, SEALED_STORE, UUID)).toBe(false);
  });
});
