/**
 * The encrypted user page catalog — #1385 (epic #1382)
 *
 * Titles of a sealed store live in user-index.json (user KEK), never in
 * global page-index.json. Login decrypts it into the session bag; logout
 * drops it.
 *
 * #1459 removed its `user-versions.json` and `user-trash.json` siblings,
 * which were written and never read: a store keeps its own versions and its
 * own trash, in the store.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { TEST_PRIVATE_STORE_KDF, createUserKeys } from '../privateStoreCrypto';
import { privateUserIndexPath, privateUserKeysPath } from '../privateStorePath';
import {
  emptyUserCatalog,
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

    const catalog = await readUserCatalog(pagesDir, 'molly', kek);
    expect(catalog.pages[UUID]).toMatchObject({ title: 'Sealed Diary', store: 'yourphr' });
  });

  test('login decrypts catalogs into the session bag; logout drops them', async () => {
    const created = createUserKeys('correct-horse', { kdf });
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await writeUserCatalog(pagesDir, 'molly', created.kek, {
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

});
