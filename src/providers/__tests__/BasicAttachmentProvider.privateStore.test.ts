/**
 * Private-store files live in the store tree, not attachments/private (#1386).
 *
 * Ciphertext of those bytes is a later issue; this suite is destination +
 * sealed-name omission from global attachment-metadata.json.
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

describe('BasicAttachmentProvider private-store destination (#1386)', () => {
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

  test('encrypt-off private upload writes into the store, not attachments/private', async () => {
    const buf = Buffer.from('lab-results');
    const originalName = 'labs.pdf';
    await provider.storeAttachment(
      buf,
      { originalName, mimeType: 'application/pdf', size: buf.length },
      { isPrivatePage: true, pageCreator: 'molly', store: DEFAULT_PRIVATE_STORE },
      { username: 'molly' }
    );

    const dest = path.join(
      pagesDir,
      'private',
      'molly',
      DEFAULT_PRIVATE_STORE,
      'attachments',
      hashName(buf, '.pdf')
    );
    expect(await fs.pathExists(dest)).toBe(true);
    expect(await fs.readFile(dest)).toEqual(buf);
    expect(await fs.pathExists(path.join(storageDir, 'private', 'molly'))).toBe(false);
    expect(await fs.pathExists(path.join(storageDir, hashName(buf, '.pdf')))).toBe(false);

    const metaRaw = await fs.readFile(path.join(storageDir, 'attachment-metadata.json'), 'utf8');
    expect(metaRaw).toContain(originalName);
  });

  test('named store uses that store segment', async () => {
    const buf = Buffer.from('fhir');
    await provider.storeAttachment(
      buf,
      { originalName: 'patient.json', mimeType: 'application/json', size: buf.length },
      { isPrivatePage: true, pageCreator: 'molly', store: 'yourphr' },
      { username: 'molly' }
    );

    expect(await fs.pathExists(
      path.join(pagesDir, 'private', 'molly', 'yourphr', 'attachments', hashName(buf, '.json'))
    )).toBe(true);
  });

  test('sealed-store original filename is omitted from global attachment-metadata.json', async () => {
    const { kek } = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE), record);

    const buf = Buffer.from('tax');
    const originalName = 'tax-return.pdf';
    await provider.storeAttachment(
      buf,
      { originalName, mimeType: 'application/pdf', size: buf.length },
      { isPrivatePage: true, pageCreator: 'molly', store: DEFAULT_PRIVATE_STORE },
      { username: 'molly' }
    );

    const dest = path.join(
      pagesDir,
      'private',
      'molly',
      DEFAULT_PRIVATE_STORE,
      'attachments',
      hashName(buf, '.pdf')
    );
    expect(await fs.pathExists(dest)).toBe(true);

    const metaRaw = await fs.readFile(path.join(storageDir, 'attachment-metadata.json'), 'utf8');
    expect(metaRaw).not.toContain(originalName);
    expect(JSON.parse(metaRaw).attachments).toEqual([]);
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
