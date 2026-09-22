/**
 * Encrypt-on attachment writes refuse a missing session DEK. #1394
 *
 * The manager door calls the shared helper; keys are not on PageManager.
 * Destination is the store (#1386). #1400: an encrypted store keeps the file
 * itself, sealed, in its own index — the provider's storeFileInStore.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import AttachmentManager from '../AttachmentManager';
import {
  TEST_PRIVATE_STORE_KDF,
  createEncryptedStore,
  createUserKeys,
  unwrapDek
} from '../../utils/privateStoreCrypto';
import { DEFAULT_PRIVATE_STORE, storeMetaPath } from '../../utils/privateStorePath';
import {
  clearUnlockedPrivateStores,
  setUnlockedDek,
  unlockPrivateStores
} from '../../utils/privateStoreUnlock';

const CTX = { username: 'molly', isAuthenticated: true, roles: ['editor'] };
const FILE = { originalName: 'note.pdf', mimeType: 'application/pdf', size: 4 };
const kdf = TEST_PRIVATE_STORE_KDF;

function makeManager(pagesDir: string, stored: unknown[]) {
  const engine = {
    getManager: (name: string) => {
      // #1431 step 14: decisions are the PDP's.
      if (name === 'PolicyDecisionPoint') {
        return { permits: () => Promise.resolve(true) };
      }
      if (name === 'AuditManager') {
        return { logAuditEvent: vi.fn().mockResolvedValue('id'), flushAuditQueue: () => Promise.resolve() };
      }
      if (name === 'ConfigurationManager') {
        return {
          getProperty: (_k: string, d: unknown) => d,
          getResolvedDataPath: (k: string, d: string) =>
            k === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir : d
        };
      }
      return null;
    }
  } as never;
  const m = new AttachmentManager(engine);
  (m as unknown as { attachmentProvider: unknown }).attachmentProvider = {
    storeAttachment: (...args: unknown[]) => {
      stored.push(args);
      return Promise.resolve({ identifier: 'att-1', name: FILE.originalName });
    },
    storeFileInStore: (...args: unknown[]) => {
      stored.push(['sealed', ...args]);
      return Promise.resolve({
        id: 'sealed-1', fileName: 'sealed-1.pdf', name: FILE.originalName, encodingFormat: FILE.mimeType,
        contentSize: 1, fingerprint: 'f', description: '', dateCreated: '', dateModified: '', mentions: []
      });
    }
  };
  return m;
}

describe('AttachmentManager encrypt-on write (#1394)', () => {
  let tmp: string;
  let pagesDir: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'att-priv-enc-'));
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  test('encrypt-off (missing store.json) still uploads', async () => {
    const stored: unknown[] = [];
    const m = makeManager(pagesDir, stored);
    await expect(
      m.uploadAttachment(Buffer.from('x'), FILE, CTX, { private: true })
    ).resolves.toMatchObject({ identifier: 'att-1' });
    expect(stored).toHaveLength(1);
    const metadata = (stored[0] as unknown[])[2] as { store?: string; pageCreator?: string };
    expect(metadata.store).toBe(DEFAULT_PRIVATE_STORE);
    expect(metadata.pageCreator).toBe('molly');
  });

  test('encrypt-on upload refuses without a session DEK', async () => {
    const { kek } = createUserKeys('pw', { kdf });
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE), record);

    const stored: unknown[] = [];
    const m = makeManager(pagesDir, stored);
    await expect(
      m.uploadAttachment(Buffer.from('x'), FILE, CTX, { private: true })
    ).rejects.toThrow(/locked|DEK/i);
    expect(stored).toHaveLength(0);
  });

  test('encrypt-on upload proceeds when the session bag has the DEK', async () => {
    const { kek } = createUserKeys('pw', { kdf });
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE), record);

    unlockPrivateStores('sid', 'molly', kek);
    setUnlockedDek('sid', DEFAULT_PRIVATE_STORE, unwrapDek(kek, record));

    const stored: unknown[] = [];
    const m = makeManager(pagesDir, stored);
    await expect(
      m.uploadAttachment(Buffer.from('x'), FILE, { ...CTX, privateStoreHandle: 'sid' }, { private: true })
    ).resolves.toMatchObject({ identifier: 'sealed-1', isPrivate: true });
    // #1400: into the store's own index, sealed — never the global pool.
    expect(stored).toHaveLength(1);
    expect((stored[0] as unknown[])[0]).toBe('sealed');
  });
});
