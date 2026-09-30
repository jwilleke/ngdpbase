/**
 * Store file I/O and the sealed-file format — #1415 (epic #1382).
 */

import { randomBytes } from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { actor } from '../../test-support/actors';
import {
  TEST_PRIVATE_STORE_KDF,
  createEncryptedStore,
  createUserKeys,
  isItemSealedBytes,
  isSealedBytes,
  itemKeyOf,
  newItemKey,
  openBytes,
  openItemBytes,
  sealBytes,
  sealItemBytes,
  unwrapDek
} from '../privateStoreCrypto';
import { PLAIN_FILE_IO, convertStoreToItemFiles, storeFileIO, storeFileIOForPath } from '../privateStoreFiles';
import { parsePrivateStoreRel, storeMetaPath } from '../privateStorePath';
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../privateStoreUnlock';

const MOLLY = { ...actor('molly'), privateStoreHandle: 'sid' };
const BOB = { ...actor('bob'), privateStoreHandle: 'bob-sid' };

describe('sealed store files (#1415)', () => {
  describe('sealBytes / openBytes', () => {
    const dek = randomBytes(32);

    test('round-trips, and the ciphertext does not contain the plaintext', () => {
      const plain = Buffer.from('---\ntitle: Diary\n---\nsecret body\n');
      const sealed = sealBytes(dek, plain);
      expect(isSealedBytes(sealed)).toBe(true);
      expect(sealed.includes(Buffer.from('secret body'))).toBe(false);
      expect(sealed.includes(Buffer.from('Diary'))).toBe(false);
      expect(openBytes(dek, sealed)).toEqual(plain);
    });

    test('two seals of the same bytes differ (fresh IV)', () => {
      const plain = Buffer.from('same');
      expect(sealBytes(dek, plain).equals(sealBytes(dek, plain))).toBe(false);
    });

    test('the wrong key, a flipped byte, or plaintext does not open', () => {
      const sealed = sealBytes(dek, Buffer.from('secret'));
      expect(() => openBytes(randomBytes(32), sealed)).toThrow('cannot open sealed store file');
      const tampered = Buffer.from(sealed);
      tampered[tampered.length - 1] ^= 1;
      expect(() => openBytes(dek, tampered)).toThrow('cannot open sealed store file');
      expect(() => openBytes(dek, Buffer.from('plain markdown'))).toThrow('not a sealed store file');
    });

    test('a key of the wrong length is refused', () => {
      expect(() => sealBytes(Buffer.alloc(16), Buffer.from('x'))).toThrow(/locked/);
    });
  });

  // #1388, slice 2: a page or file of an encrypted vault has a key of its own.
  describe('item files', () => {
    const dek = randomBytes(32);

    test('an item opens with the vault DEK, and with its own key alone', () => {
      const itemKey = newItemKey();
      const sealed = sealItemBytes(dek, itemKey, Buffer.from('secret page'));
      expect(isSealedBytes(sealed)).toBe(true);
      expect(isItemSealedBytes(sealed)).toBe(true);
      expect(sealed.includes(Buffer.from('secret page'))).toBe(false);
      expect(openBytes(dek, sealed).toString()).toBe('secret page');
      expect(openItemBytes(itemKey, sealed).toString()).toBe('secret page');
      expect(itemKeyOf(dek, sealed)?.equals(itemKey)).toBe(true);
    });

    test('an item\'s key opens that item and nothing else: not another item, not a DEK-sealed file', () => {
      const keyA = newItemKey();
      const b = sealItemBytes(dek, newItemKey(), Buffer.from('page B'));
      const history = sealBytes(dek, Buffer.from('an old version'));
      expect(() => openItemBytes(keyA, b)).toThrow('cannot open sealed store file');
      expect(() => openItemBytes(keyA, history)).toThrow('not an item file');
      expect(itemKeyOf(dek, history)).toBeNull();
    });

    test('the wrong DEK cannot reach an item\'s key', () => {
      const sealed = sealItemBytes(dek, newItemKey(), Buffer.from('x'));
      expect(() => itemKeyOf(randomBytes(32), sealed)).toThrow('cannot open sealed store file');
      expect(() => openBytes(randomBytes(32), sealed)).toThrow('cannot open sealed store file');
    });
  });

  describe('parsePrivateStoreRel', () => {
    test('finds the store at any depth, and nothing beside the stores', () => {
      expect(parsePrivateStoreRel(['vaults', 'molly', 'yourphr', 'a.md'])).toEqual({ creator: 'molly', store: 'yourphr' });
      expect(parsePrivateStoreRel(['vaults', 'molly', 'yourphr', 'versions', 'u', 'v1', 'content.md']))
        .toEqual({ creator: 'molly', store: 'yourphr' });
      expect(parsePrivateStoreRel(['vaults', 'molly', 'user-index.json'])).toBeNull();
      expect(parsePrivateStoreRel(['a.md'])).toBeNull();
      expect(parsePrivateStoreRel(['vaults', 'molly', '..', 'x.md'])).toBeNull();
    });
  });

  describe('storeFileIO', () => {
    let pagesDir: string;
    let dek: Buffer;

    beforeEach(async () => {
      pagesDir = path.join(os.tmpdir(), `store-files-${Date.now()}-${Math.random().toString(36).slice(2)}`, 'pages');
      const { kek } = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
      const record = createEncryptedStore(kek);
      await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', 'yourphr')));
      await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'yourphr'), record);
      dek = unwrapDek(kek, record);
      unlockPrivateStores('sid', 'molly', kek);
      setUnlockedDek('sid', 'yourphr', dek);
    });

    afterEach(async () => {
      clearUnlockedPrivateStores();
      await fs.remove(path.dirname(pagesDir));
    });

    test('a store without store.json, and a file in no store, are plain', async () => {
      expect(await storeFileIO(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store: 'default' })).toBe(PLAIN_FILE_IO);
      expect(await storeFileIOForPath(undefined, { pagesDirectory: pagesDir, file: path.join(pagesDir, 'x.md') }))
        .toBe(PLAIN_FILE_IO);
    });

    test('the owner writes ciphertext and reads back the text', async () => {
      const file = path.join(pagesDir, 'vaults', 'molly', 'yourphr', 'versions', 'u', 'v1', 'content.md');
      await fs.ensureDir(path.dirname(file));
      const io = await storeFileIOForPath(MOLLY, { pagesDirectory: pagesDir, file });
      expect(io.sealed).toBe(true);
      await io.writeText(file, 'secret body');
      const onDisk = await fs.readFile(file);
      expect(isSealedBytes(onDisk)).toBe(true);
      expect(openBytes(dek, onDisk).toString('utf8')).toBe('secret body');
      expect(await io.readText(file)).toBe('secret body');
    });

    test('no context, or another user\'s session, is refused — never plain', async () => {
      const args = { pagesDirectory: pagesDir, owner: 'molly', store: 'yourphr' };
      await expect(storeFileIO(undefined, args)).rejects.toThrow(/locked/);
      unlockPrivateStores('bob-sid', 'bob', randomBytes(32));
      await expect(storeFileIO(BOB, args)).rejects.toThrow(/locked/);
    });

    test('a page is written with a key of its own, and keeps it across every save (#1388)', async () => {
      const file = path.join(pagesDir, 'vaults', 'molly', 'yourphr', 'u1.md');
      await fs.ensureDir(path.dirname(file));
      const io = await storeFileIOForPath(MOLLY, { pagesDirectory: pagesDir, file });
      await io.writeItemText(file, 'first');
      const first = await io.itemKey(file);
      expect(first).not.toBeNull();
      expect(isItemSealedBytes(await fs.readFile(file))).toBe(true);
      await io.writeItemText(file, 'second');
      expect((await io.itemKey(file))?.equals(first as Buffer)).toBe(true);
      expect(await io.readText(file)).toBe('second');
      // What a share link will hold: that one key opens the page.
      expect(openItemBytes(first as Buffer, await fs.readFile(file)).toString()).toBe('second');
    });

    test('a page first written with the vault key becomes an item file at its next save (#1388)', async () => {
      const file = path.join(pagesDir, 'vaults', 'molly', 'yourphr', 'u2.md');
      await fs.ensureDir(path.dirname(file));
      const io = await storeFileIOForPath(MOLLY, { pagesDirectory: pagesDir, file });
      await io.writeText(file, 'old format');
      expect(await io.itemKey(file)).toBeNull();
      expect(await io.readText(file)).toBe('old format');
      await io.writeItemText(file, 'new format');
      expect(await io.itemKey(file)).not.toBeNull();
      expect(await io.readText(file)).toBe('new format');
    });

    test('outside an encrypted vault an item is written as it is, and has no key', async () => {
      const file = path.join(pagesDir, 'plain.md');
      await fs.ensureDir(pagesDir);
      await PLAIN_FILE_IO.writeItemText(file, 'plain');
      expect(await fs.readFile(file, 'utf8')).toBe('plain');
      expect(await PLAIN_FILE_IO.itemKey(file)).toBeNull();
    });

    test('a vault\'s old pages, then its old files, become item files; history stays; a second run writes nothing (#1388)', async () => {
      const where = { pagesDirectory: pagesDir, owner: 'molly', store: 'yourphr' };
      const vault = path.join(pagesDir, 'vaults', 'molly', 'yourphr');
      const page = path.join(vault, 'u1.md');
      const file = path.join(vault, 'attachments', 'f1.png');
      const history = path.join(vault, 'versions', 'u1', 'v1', 'content.md');
      for (const f of [page, file, history]) await fs.ensureDir(path.dirname(f));
      const io = await storeFileIO(MOLLY, where);
      await io.writeText(page, 'old page');
      await io.writeBytes(file, Buffer.from('old file'));
      await io.writeText(history, 'old version');

      expect(await convertStoreToItemFiles(MOLLY, 'pages', where)).toBe(1);
      expect(isItemSealedBytes(await fs.readFile(page))).toBe(true);
      expect(isItemSealedBytes(await fs.readFile(file))).toBe(false);
      expect(await io.readText(page)).toBe('old page');

      expect(await convertStoreToItemFiles(MOLLY, 'files', where)).toBe(1);
      expect(isItemSealedBytes(await fs.readFile(file))).toBe(true);
      expect((await io.readBytes(file)).toString()).toBe('old file');

      expect(isItemSealedBytes(await fs.readFile(history))).toBe(false);
      expect(await convertStoreToItemFiles(MOLLY, 'pages', where)).toBe(0);
      expect(await convertStoreToItemFiles(MOLLY, 'files', where)).toBe(0);
    });

    test('a vault that is not encrypted has nothing to convert', async () => {
      expect(await convertStoreToItemFiles(MOLLY, 'pages', { pagesDirectory: pagesDir, owner: 'molly', store: 'default' })).toBe(0);
    });
  });
});
