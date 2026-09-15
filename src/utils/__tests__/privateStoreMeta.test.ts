/**
 * store.json encrypt flag — #1384 (epic #1382)
 *
 * Missing file means encrypt off. `default/` stays plaintext unless enabled.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { DEFAULT_PRIVATE_STORE, storeMetaPath } from '../privateStorePath';
import { readStoreMeta, writeStoreMeta } from '../privateStoreMeta';
import { TEST_PRIVATE_STORE_KDF, createEncryptedStore, createUserKeys } from '../privateStoreCrypto';

describe('private store meta (#1384)', () => {
  let tmp: string;
  let pages: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'store-meta-'));
    pages = path.join(tmp, 'pages');
    await fs.ensureDir(pages);
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  test('missing store.json is encrypt off', async () => {
    const meta = await readStoreMeta(pages, 'molly', DEFAULT_PRIVATE_STORE);
    expect(meta.encrypt).toBe(false);
    expect(await fs.pathExists(storeMetaPath(pages, 'molly', DEFAULT_PRIVATE_STORE))).toBe(false);
  });

  test('written encrypt-off round-trips', async () => {
    await writeStoreMeta(pages, 'molly', DEFAULT_PRIVATE_STORE, { encrypt: false });
    const meta = await readStoreMeta(pages, 'molly', DEFAULT_PRIVATE_STORE);
    expect(meta).toEqual({ encrypt: false });
  });

  test('written encrypt-on keeps the DEK wrap', async () => {
    const { kek } = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(kek);
    await writeStoreMeta(pages, 'molly', 'yourphr', record);
    const meta = await readStoreMeta(pages, 'molly', 'yourphr');
    expect(meta.encrypt).toBe(true);
    if (meta.encrypt) {
      expect(meta.dekWrap).toEqual(record.dekWrap);
    }
  });
});
