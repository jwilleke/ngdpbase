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
  assertContextCanWriteStore,
  dekFor,
  newPrivateStoreHandle,
  userIndexFor,
  clearUnlockedPrivateStores,
  getUnlockedDek,
  getUnlockedKek,
  lockPrivateStores,
  setUnlockedDek,
  unlockPrivateStores,
  unlockPrivateStoresWithMnemonic,
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
      handle: 'sid-1',
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
        handle: 'sid-1',
        username: 'molly',
        password: 'wrong',
        pagesDirectory: pagesDir
      })
    ).rejects.toThrow(/password/i);

    expect(getUnlockedKek('sid-1')).toBeUndefined();
  });

  test('missing envelope is a no-op so password login still works', async () => {
    await unlockPrivateStoresWithPassword({
      handle: 'sid-1',
      username: 'molly',
      password: 'any',
      pagesDirectory: pagesDir
    });
    expect(getUnlockedKek('sid-1')).toBeUndefined();
  });
});

describe('assertContextCanWriteStore owner check (#1394, #1398)', () => {
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

    const admin = { username: 'admin', roles: ['admin'], isAuthenticated: true, privateStoreHandle: 'admin-sid' };
    await expect(assertContextCanWriteStore(admin, {
      pagesDirectory: pagesDir, owner: 'alice', store: 'default'
    })).rejects.toThrow(/locked|DEK/i);
  });
});

describe('keys through the context handle (#1382, security-posture P1)', () => {
  let tmp: string;
  let pagesDir: string;
  const molly = (handle?: string) => ({
    username: 'molly', roles: ['editor'], isAuthenticated: true, ...(handle ? { privateStoreHandle: handle } : {})
  });

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'priv-ctx-'));
    pagesDir = path.join(tmp, 'pages');
    clearUnlockedPrivateStores();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  test('a handle is random and fresh each time', () => {
    const a = newPrivateStoreHandle();
    const b = newPrivateStoreHandle();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });

  test('dekFor returns the DEK only from the owner\'s own bag, reached by the context\'s handle', async () => {
    const { kek } = createUserKeys('pw', { kdf });
    const store = createEncryptedStore(kek);
    const dek = unwrapDek(kek, store);
    unlockPrivateStores('h-molly', 'molly', kek);
    setUnlockedDek('h-molly', 'default', dek);

    expect(dekFor(molly('h-molly'), 'molly', 'default')).toEqual(dek);
    // No handle: nothing, even though a bag exists.
    expect(dekFor(molly(), 'molly', 'default')).toBeUndefined();
    // Someone else's store id match is not ownership.
    expect(dekFor(molly('h-molly'), 'alice', 'default')).toBeUndefined();
    // A job carries no handle, so it reaches no keys.
    const job = { username: 'molly', origin: 'schedule', requestedAt: '2026-09-15T00:00:00Z' } as never;
    expect(dekFor(job, 'molly', 'default')).toBeUndefined();
    // After logout the handle reaches nothing.
    lockPrivateStores('h-molly');
    expect(dekFor(molly('h-molly'), 'molly', 'default')).toBeUndefined();
  });

  test('assertContextCanWriteStore refuses an encrypted store without the owner\'s DEK, allows it with', async () => {
    const { kek } = createUserKeys('pw', { kdf });
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', 'default')));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'default'), record);

    await expect(assertContextCanWriteStore(molly('h-molly'), {
      pagesDirectory: pagesDir, owner: 'molly', store: 'default'
    })).rejects.toThrow(/locked|DEK/i);

    unlockPrivateStores('h-molly', 'molly', kek);
    setUnlockedDek('h-molly', 'default', unwrapDek(kek, record));
    await expect(assertContextCanWriteStore(molly('h-molly'), {
      pagesDirectory: pagesDir, owner: 'molly', store: 'default'
    })).resolves.toBeUndefined();
    // An unencrypted store needs no key.
    await expect(assertContextCanWriteStore(molly(), {
      pagesDirectory: pagesDir, owner: 'molly', store: 'plain'
    })).resolves.toBeUndefined();
  });

  test('userIndexFor reads only the handle\'s own catalog', () => {
    unlockPrivateStores('h-molly', 'molly', Buffer.alloc(32, 1));
    expect(userIndexFor(molly('h-molly'))).toBeDefined();
    expect(userIndexFor(molly())).toBeUndefined();
    expect(userIndexFor(molly('h-other'))).toBeUndefined();
  });
});

describe('unlockPrivateStoresWithMnemonic (#1453)', () => {
  let tmp: string;
  let pagesDir: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'priv-unlock-words-'));
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  async function mollyWithSealedStore() {
    const created = createUserKeys('correct-horse', { kdf });
    const store = createEncryptedStore(created.kek);
    await fs.outputJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await fs.outputJson(storeMetaPath(pagesDir, 'molly', 'yourphr'), store);
    return { created, store };
  }

  test('the words open the same key and the same store keys the password does', async () => {
    const { created, store } = await mollyWithSealedStore();

    const ok = await unlockPrivateStoresWithMnemonic({
      handle: 'sid-w', username: 'molly', words: created.mnemonic, pagesDirectory: pagesDir
    });

    expect(ok).toBe(true);
    expect(Buffer.compare(getUnlockedKek('sid-w'), created.kek)).toBe(0);
    expect(Buffer.compare(getUnlockedDek('sid-w', 'yourphr'), unwrapDek(created.kek, store))).toBe(0);
  });

  test('the words as people type them — capitals, extra spaces, a line break — still work', async () => {
    const { created } = await mollyWithSealedStore();
    const typed = '  ' + created.mnemonic.toUpperCase().split(' ').join('   ').replace(/ ([A-Z]+) /, '\n$1\n') + '  ';

    expect(await unlockPrivateStoresWithMnemonic({ handle: 'sid-t', username: 'molly', words: typed, pagesDirectory: pagesDir }))
      .toBe(true);
  });

  test('wrong words unlock nothing and say so, without throwing', async () => {
    const { created } = await mollyWithSealedStore();
    const wrong = created.mnemonic.split(' ').reverse().join(' ');

    expect(await unlockPrivateStoresWithMnemonic({ handle: 'sid-x', username: 'molly', words: wrong, pagesDirectory: pagesDir }))
      .toBe(false);
    expect(getUnlockedKek('sid-x')).toBeUndefined();
  });

  test('a user with no keys is not unlocked', async () => {
    expect(await unlockPrivateStoresWithMnemonic({ handle: 'sid-n', username: 'nobody', words: 'a b c', pagesDirectory: pagesDir }))
      .toBe(false);
  });
});

