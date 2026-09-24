/**
 * The shared pool takes no private file (#1460; destination was #1386).
 *
 * #1386 sent a private upload's BYTES to the store tree but left its original
 * NAME in the global `attachment-metadata.json`, and #1400 removed the name
 * only for an ENCRYPTED store. #1460 gives every private store its own file
 * index, so `storeAttachment` — the shared pool's door — refuses a private
 * destination outright rather than half-honouring it. `storeFileInStore` is
 * where a private file goes; `AttachmentManager.plainStoreFiles` and
 * `.sealedFiles` cover it end to end.
 */

vi.unmock('../BasicAttachmentProvider');

import crypto from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import BasicAttachmentProvider from '../BasicAttachmentProvider';
import { DEFAULT_PRIVATE_STORE, storeMetaPath } from '../../utils/privateStorePath';
import {
  TEST_PRIVATE_STORE_KDF,
  createEncryptedStore,
  createUserKeys
} from '../../utils/privateStoreCrypto';

function makeEngine(storageDir: string, pagesDir: string) {
  const configManager = {
    getProperty: vi.fn((key: string, defaultValue: unknown) => {
      if (key === 'ngdpbase.attachment.maxsize') return 10485760;
      if (key === 'ngdpbase.attachment.allowedtypes') return '';
      if (key === 'ngdpbase.attachment.provider.basic.hashmethod') return 'sha256';
      return defaultValue;
    }),
    getResolvedDataPath: vi.fn((key: string, defaultValue: unknown) => {
      if (key === 'ngdpbase.attachment.provider.basic.storagedir') return storageDir;
      if (key === 'ngdpbase.attachment.metadatafile') {
        return path.join(storageDir, 'attachment-metadata.json');
      }
      if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
      return defaultValue;
    })
  };

  return {
    getManager: vi.fn((name: string) => {
      if (name === 'ConfigurationManager') return configManager;
      return null;
    })
  };
}

function hashName(buf: Buffer, ext: string): string {
  return `${crypto.createHash('sha256').update(buf).digest('hex')}${ext}`;
}

describe('BasicAttachmentProvider — the shared pool takes no private file (#1460)', () => {
  let tmp: string;
  let storageDir: string;
  let pagesDir: string;
  let provider: BasicAttachmentProvider;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'att-store-dest-'));
    storageDir = path.join(tmp, 'attachments');
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(storageDir);
    await fs.ensureDir(pagesDir);
    provider = new BasicAttachmentProvider(makeEngine(storageDir, pagesDir));
    await provider.initialize();
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  /** The shared index as text — '' when the refusal meant it was never written. */
  const sharedIndex = async () => {
    const file = path.join(storageDir, 'attachment-metadata.json');
    return (await fs.pathExists(file)) ? await fs.readFile(file, 'utf8') : '';
  };

  const privateUpload = (buf: Buffer, originalName: string, store: string) =>
    provider.storeAttachment(
      buf,
      { originalName, mimeType: 'application/pdf', size: buf.length },
      { isPrivatePage: true, pageCreator: 'molly', store },
      { username: 'molly' }
    );

  test('an unencrypted private destination is refused — nothing is written anywhere', async () => {
    const buf = Buffer.from('lab-results');
    const originalName = 'labs.pdf';

    await expect(privateUpload(buf, originalName, DEFAULT_PRIVATE_STORE))
      .rejects.toThrow(/storeFileInStore/);

    // Not in the shared pool's folder, not in the store's, not in the index.
    expect(await fs.pathExists(path.join(storageDir, hashName(buf, '.pdf')))).toBe(false);
    expect(await fs.pathExists(
      path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, 'attachments', hashName(buf, '.pdf'))
    )).toBe(false);
    expect(await sharedIndex()).not.toContain(originalName);
    expect(await provider.getAllAttachments()).toEqual([]);
  });

  test('a named store is refused the same way — the store id does not make it acceptable', async () => {
    const buf = Buffer.from('fhir');
    await expect(privateUpload(buf, 'patient.pdf', 'yourphr')).rejects.toThrow(/storeFileInStore/);
    expect(await fs.pathExists(
      path.join(pagesDir, 'private', 'molly', 'yourphr', 'attachments', hashName(buf, '.pdf'))
    )).toBe(false);
  });

  test('an encrypted store is refused too — and its name never reaches the shared index', async () => {
    const { kek } = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE), record);

    const buf = Buffer.from('tax');
    const originalName = 'tax-return.pdf';
    await expect(privateUpload(buf, originalName, DEFAULT_PRIVATE_STORE)).rejects.toThrow(/storeFileInStore/);

    expect(await sharedIndex()).not.toContain(originalName);
    expect(await provider.getAllAttachments()).toEqual([]);
  });

  test('public upload still writes the attachments directory', async () => {
    const buf = Buffer.from('public-doc');
    await provider.storeAttachment(
      buf,
      { originalName: 'notice.pdf', mimeType: 'application/pdf', size: buf.length },
      {},
      { username: 'molly' }
    );

    expect(await fs.pathExists(path.join(storageDir, hashName(buf, '.pdf')))).toBe(true);
    expect(await fs.pathExists(
      path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, 'attachments', hashName(buf, '.pdf'))
    )).toBe(false);
  });
});
