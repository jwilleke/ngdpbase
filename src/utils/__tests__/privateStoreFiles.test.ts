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
  isSealedBytes,
  openBytes,
  sealBytes,
  unwrapDek
} from '../privateStoreCrypto';
import { PLAIN_FILE_IO, storeFileIO, storeFileIOForPath } from '../privateStoreFiles';
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

  describe('parsePrivateStoreRel', () => {
    test('finds the store at any depth, and nothing beside the stores', () => {
      expect(parsePrivateStoreRel(['private', 'molly', 'yourphr', 'a.md'])).toEqual({ creator: 'molly', store: 'yourphr' });
      expect(parsePrivateStoreRel(['private', 'molly', 'yourphr', 'versions', 'u', 'v1', 'content.md']))
        .toEqual({ creator: 'molly', store: 'yourphr' });
      expect(parsePrivateStoreRel(['private', 'molly', 'user-index.json'])).toBeNull();
      expect(parsePrivateStoreRel(['a.md'])).toBeNull();
      expect(parsePrivateStoreRel(['private', 'molly', '..', 'x.md'])).toBeNull();
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
      const file = path.join(pagesDir, 'private', 'molly', 'yourphr', 'versions', 'u', 'v1', 'content.md');
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
  });
});
