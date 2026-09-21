/**
 * Who is told their private store is locked (#1448).
 *
 * The banner answers from the user's STATE, and only ever to the store's own
 * owner. These pin both halves: it appears for a signed-in owner whose key this
 * session has not unwrapped, and for nobody else — not an anonymous visitor,
 * not a user with no encrypted store, not an owner who is already unlocked.
 *
 * Uses its own mkdtemp directory and removes only that.
 */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { TEST_PRIVATE_STORE_KDF, createUserKeys } from '../privateStoreCrypto';
import { privateUserKeysPath } from '../privateStorePath';
import {
  clearUnlockedPrivateStores,
  hasUnlockedKey,
  lockPrivateStores,
  newPrivateStoreHandle,
  unlockPrivateStores
} from '../privateStoreUnlock';
import { privateStoreLockedFor } from '../privateStoreLock';

describe('#1448 privateStoreLockedFor', () => {
  let tmp: string;
  let pagesDir: string;

  /** Give `username` a key envelope on disk — i.e. an encrypted store exists. */
  async function giveKeys(username: string): Promise<Buffer> {
    const { envelope, kek } = createUserKeys('correct horse', { kdf: TEST_PRIVATE_STORE_KDF });
    const keysPath = privateUserKeysPath(pagesDir, username);
    await fs.ensureDir(path.dirname(keysPath));
    await fs.writeJson(keysPath, envelope);
    return kek;
  }

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'priv-lock-'));
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  test('an owner with keys whose session never unlocked is locked — the restart case', async () => {
    await giveKeys('molly');
    // A handle on the subject, but nothing in the bag behind it: exactly what a
    // surviving session cookie looks like after the process restarted.
    const ctx = { username: 'molly', privateStoreHandle: newPrivateStoreHandle() } as never;
    expect(await privateStoreLockedFor({ ctx, username: 'molly', pagesDirectory: pagesDir })).toBe(true);
  });

  test('an unlocked owner is not locked', async () => {
    const kek = await giveKeys('molly');
    const handle = newPrivateStoreHandle();
    unlockPrivateStores(handle, 'molly', kek);
    const ctx = { username: 'molly', privateStoreHandle: handle } as never;
    expect(await privateStoreLockedFor({ ctx, username: 'molly', pagesDirectory: pagesDir })).toBe(false);
  });

  test('locking again — sign-out — makes it locked', async () => {
    const kek = await giveKeys('molly');
    const handle = newPrivateStoreHandle();
    unlockPrivateStores(handle, 'molly', kek);
    lockPrivateStores(handle);
    const ctx = { username: 'molly', privateStoreHandle: handle } as never;
    expect(await privateStoreLockedFor({ ctx, username: 'molly', pagesDirectory: pagesDir })).toBe(true);
  });

  test('a user with no encrypted store has nothing to unlock', async () => {
    const ctx = { username: 'bob', privateStoreHandle: newPrivateStoreHandle() } as never;
    expect(await privateStoreLockedFor({ ctx, username: 'bob', pagesDirectory: pagesDir })).toBe(false);
  });

  test('anonymous is never told — whatever the spelling', async () => {
    for (const username of ['Anonymous', 'anonymous', ' ANONYMOUS ']) {
      expect(await privateStoreLockedFor({ ctx: undefined, username, pagesDirectory: pagesDir })).toBe(false);
    }
  });

  test('another user\'s store is never reported to someone else', async () => {
    // molly has keys; root is signed in and has none. root must not learn that
    // molly has a store — the check reads only the subject's own key file.
    await giveKeys('molly');
    const ctx = { username: 'root', privateStoreHandle: newPrivateStoreHandle() } as never;
    expect(await privateStoreLockedFor({ ctx, username: 'root', pagesDirectory: pagesDir })).toBe(false);
  });

  test('no username or no page store is not locked', async () => {
    expect(await privateStoreLockedFor({ ctx: undefined, username: undefined, pagesDirectory: pagesDir })).toBe(false);
    expect(await privateStoreLockedFor({ ctx: undefined, username: 'molly', pagesDirectory: undefined })).toBe(false);
  });
});

describe('#1448 hasUnlockedKey', () => {
  beforeEach(() => clearUnlockedPrivateStores());
  afterEach(() => clearUnlockedPrivateStores());

  test('answers yes/no without handing out key bytes', () => {
    const handle = newPrivateStoreHandle();
    const ctx = { username: 'molly', privateStoreHandle: handle } as never;
    expect(hasUnlockedKey(ctx)).toBe(false);
    unlockPrivateStores(handle, 'molly', Buffer.alloc(32, 7));
    expect(hasUnlockedKey(ctx)).toBe(true);
    expect(typeof hasUnlockedKey(ctx)).toBe('boolean');
  });

  test('a context with no handle has no key — a token or share request, say', () => {
    expect(hasUnlockedKey({ username: 'molly' })).toBe(false);
    expect(hasUnlockedKey(undefined)).toBe(false);
  });
});
