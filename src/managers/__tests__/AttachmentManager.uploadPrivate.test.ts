/**
 * Explicit private-store attach door. #1396
 *
 * Destination is the store (#1386). Sealed writes need a session DEK (#1394).
 * Does not infer privacy from a page. Public uploadAttachment is unchanged.
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
import { storeMetaPath } from '../../utils/privateStorePath';
import {
  clearUnlockedPrivateStores,
  runWithPrivateStoreSession,
  setUnlockedDek,
  unlockPrivateStores
} from '../../utils/privateStoreUnlock';

const CTX = { username: 'molly', isAuthenticated: true, roles: ['editor'] };
const FILE = { originalName: 'labs.pdf', mimeType: 'application/pdf', size: 4 };
const kdf = TEST_PRIVATE_STORE_KDF;

type StoredCall = unknown[];

function makeManager(opts: {
  pagesDir: string;
  stored: StoredCall[];
  getProperty?: (key: string, fallback: unknown) => unknown;
  allow?: boolean;
  noConfig?: boolean;
  pageGet?: ReturnType<typeof vi.fn>;
}): AttachmentManager {
  const getProperty = opts.getProperty ?? ((_key: string, fallback: unknown) => fallback);
  const pageGet = opts.pageGet ?? vi.fn();
  const engine = {
    getManager: (name: string) => {
      if (name === 'UserManager') {
        return { hasPermission: () => Promise.resolve(opts.allow !== false) };
      }
      if (name === 'AuditManager') {
        return { logAuditEvent: vi.fn().mockResolvedValue('id'), flushAuditQueue: () => Promise.resolve() };
      }
      if (name === 'ConfigurationManager') {
        if (opts.noConfig) return null;
        return {
          getProperty,
          getResolvedDataPath: (k: string, d: string) =>
            k === 'ngdpbase.page.provider.filesystem.storagedir' ? opts.pagesDir : d
        };
      }
      if (name === 'PageManager') {
        return { getPage: pageGet };
      }
      return null;
    }
  } as never;
  const m = new AttachmentManager(engine);
  (m as unknown as { attachmentProvider: unknown }).attachmentProvider = {
    storeAttachment: (...args: unknown[]) => {
      opts.stored.push(args);
      return Promise.resolve({ identifier: 'att-priv-1', name: FILE.originalName });
    },
    getAttachmentMetadata: () => Promise.resolve({ identifier: 'att-priv-1', mentions: [] }),
    updateAttachmentMetadata: vi.fn().mockResolvedValue(true)
  };
  return m;
}

function storedMeta(stored: StoredCall[]): {
  isPrivatePage?: boolean;
  pageCreator?: string;
  store?: string;
} {
  return (stored[0] as unknown[])[2] as {
    isPrivatePage?: boolean;
    pageCreator?: string;
    store?: string;
  };
}

describe('AttachmentManager.uploadPrivateAttachment (#1396)', () => {
  let tmp: string;
  let pagesDir: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'att-upload-priv-'));
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  test('sets private metadata from ctx; store from config defaultstoreid; does not read a page', async () => {
    const stored: StoredCall[] = [];
    const getProperty = vi.fn((key: string, fallback: unknown) => {
      if (key === 'ngdpbase.page.provider.filesystem.defaultstoreid') return 'vault';
      return fallback;
    });
    const pageGet = vi.fn();
    const m = makeManager({ pagesDir, stored, getProperty, pageGet });

    await expect(
      m.uploadPrivateAttachment(Buffer.from('x'), FILE, CTX)
    ).resolves.toMatchObject({ identifier: 'att-priv-1' });

    expect(pageGet).not.toHaveBeenCalled();
    expect(getProperty).toHaveBeenCalledWith(
      'ngdpbase.page.provider.filesystem.defaultstoreid',
      expect.any(String)
    );
    expect(storedMeta(stored)).toEqual({
      description: '',
      isFamilyFriendly: true,
      isPrivatePage: true,
      pageCreator: 'molly',
      store: 'vault'
    });
  });

  test('options.store overrides the config default', async () => {
    const stored: StoredCall[] = [];
    const getProperty = vi.fn((key: string, fallback: unknown) => {
      if (key === 'ngdpbase.page.provider.filesystem.defaultstoreid') return 'vault';
      return fallback;
    });
    const m = makeManager({ pagesDir, stored, getProperty });

    await m.uploadPrivateAttachment(Buffer.from('x'), FILE, CTX, { store: 'yourphr' });
    expect(storedMeta(stored).store).toBe('yourphr');
  });

  test('pageName links via attachToPage and does not change owner or destination', async () => {
    const stored: StoredCall[] = [];
    const m = makeManager({ pagesDir, stored });
    const provider = (m as unknown as {
      attachmentProvider: { updateAttachmentMetadata: ReturnType<typeof vi.fn> };
    }).attachmentProvider;

    await m.uploadPrivateAttachment(Buffer.from('x'), FILE, CTX, { pageName: 'Diary' });

    expect(storedMeta(stored).pageCreator).toBe('molly');
    expect(storedMeta(stored).isPrivatePage).toBe(true);
    expect(provider.updateAttachmentMetadata).toHaveBeenCalledWith(
      'att-priv-1',
      expect.objectContaining({
        mentions: [expect.objectContaining({ name: 'Diary' })]
      })
    );
  });

  test('omitted pageName does not attach to a page', async () => {
    const stored: StoredCall[] = [];
    const m = makeManager({ pagesDir, stored });
    const provider = (m as unknown as {
      attachmentProvider: { updateAttachmentMetadata: ReturnType<typeof vi.fn> };
    }).attachmentProvider;

    await m.uploadPrivateAttachment(Buffer.from('x'), FILE, CTX);
    expect(provider.updateAttachmentMetadata).not.toHaveBeenCalled();
  });

  test('uploadAttachment without a page still uses the public pool', async () => {
    const stored: StoredCall[] = [];
    const m = makeManager({ pagesDir, stored });
    await m.uploadAttachment(Buffer.from('x'), FILE, CTX);
    const meta = storedMeta(stored);
    expect(meta.isPrivatePage).toBe(false);
    expect(meta.store).toBeUndefined();
    expect(meta.pageCreator).toBeUndefined();
  });

  test('permission denied refuses before store', async () => {
    const stored: StoredCall[] = [];
    const m = makeManager({ pagesDir, stored, allow: false });
    await expect(
      m.uploadPrivateAttachment(Buffer.from('x'), FILE, CTX)
    ).rejects.toThrow(/permission denied/i);
    expect(stored).toHaveLength(0);
  });

  test('requires ConfigurationManager from the engine', async () => {
    const stored: StoredCall[] = [];
    const m = makeManager({ pagesDir, stored, noConfig: true });
    await expect(
      m.uploadPrivateAttachment(Buffer.from('x'), FILE, CTX)
    ).rejects.toThrow(/ConfigurationManager/);
    expect(stored).toHaveLength(0);
  });

  test('encrypt-on refuses without a session DEK', async () => {
    const { kek } = createUserKeys('pw', { kdf });
    const record = createEncryptedStore(kek);
    const storeId = 'vault';
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', storeId)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', storeId), record);

    const stored: StoredCall[] = [];
    const m = makeManager({
      pagesDir,
      stored,
      getProperty: (key, fallback) =>
        key === 'ngdpbase.page.provider.filesystem.defaultstoreid' ? storeId : fallback
    });
    await expect(
      m.uploadPrivateAttachment(Buffer.from('x'), FILE, CTX)
    ).rejects.toThrow(/locked|DEK/i);
    expect(stored).toHaveLength(0);
  });

  test('encrypt-on proceeds when the session bag has the DEK', async () => {
    const { kek } = createUserKeys('pw', { kdf });
    const record = createEncryptedStore(kek);
    const storeId = 'vault';
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', storeId)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', storeId), record);

    unlockPrivateStores('sid', 'molly', kek);
    setUnlockedDek('sid', storeId, unwrapDek(kek, record));

    const stored: StoredCall[] = [];
    const m = makeManager({
      pagesDir,
      stored,
      getProperty: (key, fallback) =>
        key === 'ngdpbase.page.provider.filesystem.defaultstoreid' ? storeId : fallback
    });
    await expect(
      runWithPrivateStoreSession('sid', () =>
        m.uploadPrivateAttachment(Buffer.from('x'), FILE, CTX)
      )
    ).resolves.toMatchObject({ identifier: 'att-priv-1' });
    expect(stored).toHaveLength(1);
  });
});
