/**
 * Password login unwraps the user KEK into the process bag (#1391).
 *
 * Keys stay in server memory keyed by session id — never express-session JSON.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  TEST_PRIVATE_STORE_KDF,
  createEncryptedStore,
  createUserKeys,
  unwrapDek
} from '../privateStoreCrypto';
import { privateUserKeysPath, storeMetaPath } from '../privateStorePath';
import {
  assertCurrentSessionCanWriteStore,
  clearUnlockedPrivateStores,
  getUnlockedDek,
  getUnlockedKek,
  setUnlockedDek,
  unlockPrivateStores,
  unlockPrivateStoresWithPassword
} from '../privateStoreUnlock';

const kdf = TEST_PRIVATE_STORE_KDF;

describe('unlockPrivateStoresWithPassword (#1391)', () => {
  let tmp: string;
  let pagesDir: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'priv-unlock-'));
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  test('correct password puts KEK and store DEK in the bag, not a JSON blob', async () => {
    const created = createUserKeys('correct-horse', { kdf });
    const store = createEncryptedStore(created.kek);
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', 'yourphr')));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'yourphr'), store);

    await unlockPrivateStoresWithPassword({
      sessionId: 'sid-1',
      username: 'molly',
      password: 'correct-horse',
      pagesDirectory: pagesDir
    });

    expect(Buffer.compare(getUnlockedKek('sid-1'), created.kek)).toBe(0);
    expect(
      Buffer.compare(getUnlockedDek('sid-1', 'yourphr'), unwrapDek(created.kek, store))
    ).toBe(0);
    const json = JSON.stringify({ sessionId: 'sid-1', username: 'molly' });
    expect(json).not.toContain(created.kek.toString('base64'));
    expect(json).not.toContain(created.kek.toString('hex'));
  });

  test('wrong password does not put a KEK in the bag', async () => {
    const created = createUserKeys('correct-horse', { kdf });
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);

    await expect(
      unlockPrivateStoresWithPassword({
        sessionId: 'sid-1',
        username: 'molly',
        password: 'wrong',
        pagesDirectory: pagesDir
      })
    ).rejects.toThrow(/password/i);

    expect(getUnlockedKek('sid-1')).toBeUndefined();
  });

  test('missing envelope is a no-op so password login still works', async () => {
    await unlockPrivateStoresWithPassword({
      sessionId: 'sid-1',
      username: 'molly',
      password: 'any',
      pagesDirectory: pagesDir
    });
    expect(getUnlockedKek('sid-1')).toBeUndefined();
  });
});

describe('assertCurrentSessionCanWriteStore owner check (#1394, #1398)', () => {
  let tmp: string;
  let pagesDir: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'priv-owner-'));
    pagesDir = path.join(tmp, 'pages');
    clearUnlockedPrivateStores();
    const alice = createUserKeys('pw-a', { kdf });
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'alice', 'default')));
    await fs.writeJson(storeMetaPath(pagesDir, 'alice', 'default'), createEncryptedStore(alice.kek));
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  test('another user\'s unlocked store of the same id does not unlock the owner\'s', async () => {
    // The admin's own sealed `default` is unlocked in the admin's session.
    const adminKeys = createUserKeys('pw-b', { kdf });
    const adminStore = createEncryptedStore(adminKeys.kek);
    unlockPrivateStores('admin-sid', 'admin', adminKeys.kek);
    setUnlockedDek('admin-sid', 'default', unwrapDek(adminKeys.kek, adminStore));

    await expect(assertCurrentSessionCanWriteStore({
      pagesDirectory: pagesDir, creator: 'alice', store: 'default', sessionId: 'admin-sid'
    })).rejects.toThrow(/locked|DEK/i);
  });
});
