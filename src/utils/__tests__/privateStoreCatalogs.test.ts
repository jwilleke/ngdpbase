/**
 * Encrypted user-index / versions / trash catalogs — #1385 (epic #1382)
 *
 * Titles of a sealed store live in user-index.json (user KEK), never in
 * global page-index.json. Login merges in memory; logout drops the merge.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { TEST_PRIVATE_STORE_KDF, createUserKeys } from '../privateStoreCrypto';
import {
  privateUserIndexPath,
  privateUserKeysPath,
  privateUserTrashPath,
  privateUserVersionsPath
} from '../privateStorePath';
import {
  emptyUserCatalog,
  mergeIndexPages,
  readUserCatalog,
  upsertUserIndexPage,
  writeUserCatalog
} from '../privateStoreCatalogs';
import {
  clearUnlockedPrivateStores,
  getSessionUserIndex,
  lockPrivateStores,
  unlockPrivateStoresWithPassword
} from '../privateStoreUnlock';

const kdf = TEST_PRIVATE_STORE_KDF;
const UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('private store catalogs (#1385)', () => {
  let tmp: string;
  let pagesDir: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'priv-catalog-'));
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  test('user-index round-trip encrypts titles; the file has no plaintext title', async () => {
    const { kek } = createUserKeys('pw', { kdf });
    await upsertUserIndexPage(pagesDir, 'molly', kek, {
      uuid: UUID,
      title: 'Sealed Diary',
      store: 'yourphr',
      creator: 'molly',
      location: 'private',
      currentVersion: 1,
      lastModified: '2026-09-14T00:00:00.000Z',
      editor: 'molly',
      hasVersions: true,
      isPrivate: true
    });

    const onDisk = await fs.readFile(privateUserIndexPath(pagesDir, 'molly'), 'utf8');
    expect(onDisk).not.toContain('Sealed Diary');
    expect(onDisk).not.toContain(UUID);

    const catalog = await readUserCatalog(pagesDir, 'molly', kek, 'index');
    expect(catalog.pages[UUID]).toMatchObject({ title: 'Sealed Diary', store: 'yourphr' });
  });

  test('merge overlay does not mutate the global pages map', () => {
    const global = { 'public-1': { title: 'Public', uuid: 'public-1' } };
    const overlay = {
      [UUID]: { title: 'Sealed Diary', uuid: UUID, store: 'yourphr', location: 'private' as const }
    };
    const merged = mergeIndexPages(global, overlay);
    expect(merged[UUID]?.title).toBe('Sealed Diary');
    expect(merged['public-1']?.title).toBe('Public');
    expect(global[UUID]).toBeUndefined();
  });

  test('login decrypts catalogs into the session bag; logout drops them', async () => {
    const created = createUserKeys('correct-horse', { kdf });
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await writeUserCatalog(pagesDir, 'molly', created.kek, 'index', {
      ...emptyUserCatalog(),
      pages: {
        [UUID]: {
          uuid: UUID,
          title: 'Sealed Diary',
          store: 'yourphr',
          creator: 'molly',
          location: 'private',
          currentVersion: 1,
          lastModified: '2026-09-14T00:00:00.000Z',
          editor: 'molly',
          hasVersions: false,
          isPrivate: true
        }
      }
    });

    await unlockPrivateStoresWithPassword({
      handle: 'sid-1',
      username: 'molly',
      password: 'correct-horse',
      pagesDirectory: pagesDir
    });

    expect(getSessionUserIndex('sid-1')?.pages[UUID]?.title).toBe('Sealed Diary');

    lockPrivateStores('sid-1');
    expect(getSessionUserIndex('sid-1')).toBeUndefined();
  });

  test('versions and trash catalogs are the same wrap as user-index', async () => {
    const { kek } = createUserKeys('pw', { kdf });
    await writeUserCatalog(pagesDir, 'molly', kek, 'versions', {
      ...emptyUserCatalog(),
      pages: {
        [UUID]: {
          uuid: UUID,
          title: 'Sealed Diary',
          store: 'yourphr',
          creator: 'molly',
          location: 'private',
          currentVersion: 2,
          lastModified: '2026-09-14T00:00:00.000Z',
          editor: 'molly',
          hasVersions: true,
          isPrivate: true
        }
      }
    });
    await writeUserCatalog(pagesDir, 'molly', kek, 'trash', {
      ...emptyUserCatalog(),
      pages: {
        [UUID]: {
          uuid: UUID,
          title: 'Sealed Diary',
          store: 'yourphr',
          creator: 'molly',
          location: 'private',
          currentVersion: 1,
          lastModified: '2026-09-14T00:00:00.000Z',
          editor: 'molly',
          hasVersions: true,
          isPrivate: true,
          deletedAt: '2026-09-14T01:00:00.000Z',
          deletedBy: 'molly',
          deletedFrom: '/tmp/x.md'
        }
      }
    });

    expect(await fs.readFile(privateUserVersionsPath(pagesDir, 'molly'), 'utf8')).not.toContain('Sealed Diary');
    expect(await fs.readFile(privateUserTrashPath(pagesDir, 'molly'), 'utf8')).not.toContain('Sealed Diary');
    expect((await readUserCatalog(pagesDir, 'molly', kek, 'versions')).pages[UUID]?.currentVersion).toBe(2);
    expect((await readUserCatalog(pagesDir, 'molly', kek, 'trash')).pages[UUID]).toMatchObject({
      deletedBy: 'molly',
      title: 'Sealed Diary'
    });
  });
});
