/**
 * Private destination on uploadAttachment. #1396, #1398
 *
 * A new upload onto a private page is always private, in that page's author's
 * store — the author owns the page and every attachment uploaded onto it.
 * With no private page, options.private === true writes the uploader's store;
 * absent/false stays the public pool. Sealed writes need the owner's DEK (#1394).
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
  pageOwner?: ReturnType<typeof vi.fn>;
}): AttachmentManager {
  const getProperty = opts.getProperty ?? ((_key: string, fallback: unknown) => fallback);
  const pageOwner = opts.pageOwner ?? vi.fn().mockResolvedValue(null);
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
        return { getPrivatePageOwner: pageOwner };
      }
      return null;
    }
  } as never;
  const m = new AttachmentManager(engine);
  (m as unknown as { attachmentProvider: unknown }).attachmentProvider = {
    storeAttachment: (...args: unknown[]) => {
      opts.stored.push(args);
      return Promise.resolve({ identifier: 'att-priv-1', name: FILE.originalName });
    }
  };
  return m;
}

function storedMeta(stored: StoredCall[]): {
  isPrivatePage?: boolean;
  pageCreator?: string;
  store?: string;
} {
  return (stored[0])[2];
}

describe('AttachmentManager.uploadAttachment options.private (#1396)', () => {
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

  test('private true without pageName: owner is ctx; store from config; does not read a page', async () => {
    const stored: StoredCall[] = [];
    const getProperty = vi.fn((key: string, fallback: unknown) => {
      if (key === 'ngdpbase.page.provider.filesystem.defaultstoreid') return 'vault';
      return fallback;
    });
    const pageOwner = vi.fn().mockResolvedValue(null);
    const m = makeManager({ pagesDir, stored, getProperty, pageOwner });

    await expect(
      m.uploadAttachment(Buffer.from('x'), FILE, CTX, { private: true })
    ).resolves.toMatchObject({ identifier: 'att-priv-1' });

    expect(pageOwner).not.toHaveBeenCalled();
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

  test('private true onto a public page: the uploader\'s store', async () => {
    const stored: StoredCall[] = [];
    const getProperty = vi.fn((key: string, fallback: unknown) => {
      if (key === 'ngdpbase.page.provider.filesystem.defaultstoreid') return 'vault';
      return fallback;
    });
    const pageOwner = vi.fn().mockResolvedValue(null);
    const m = makeManager({ pagesDir, stored, getProperty, pageOwner });

    await m.uploadAttachment(Buffer.from('x'), FILE, CTX, { private: true, pageName: 'Main' });

    expect(pageOwner).toHaveBeenCalledWith('Main');
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

    await m.uploadAttachment(Buffer.from('x'), FILE, CTX, { private: true, store: 'yourphr' });
    expect(storedMeta(stored).store).toBe('yourphr');
  });

  test('absent private onto a public page stays the public pool', async () => {
    const stored: StoredCall[] = [];
    const pageOwner = vi.fn().mockResolvedValue(null);
    const m = makeManager({ pagesDir, stored, pageOwner });

    await m.uploadAttachment(Buffer.from('x'), FILE, CTX, { pageName: 'Main' });

    expect(pageOwner).toHaveBeenCalledWith('Main');
    const meta = storedMeta(stored);
    expect(meta.isPrivatePage).toBe(false);
    expect(meta.store).toBeUndefined();
    expect(meta.pageCreator).toBeUndefined();
  });

  test('#1398: upload onto a private page is forced private, into the page author\'s store', async () => {
    const stored: StoredCall[] = [];
    const pageOwner = vi.fn().mockResolvedValue({ creator: 'molly', store: 'yourphr' });
    const m = makeManager({ pagesDir, stored, pageOwner });

    // Box unticked (absent) and explicitly false both still land private.
    await m.uploadAttachment(Buffer.from('x'), FILE, CTX, { pageName: 'Diary' });
    await m.uploadAttachment(Buffer.from('y'), FILE, CTX, { pageName: 'Diary', private: false });

    for (const call of stored) {
      expect((call)[2]).toMatchObject({
        isPrivatePage: true,
        pageCreator: 'molly',
        store: 'yourphr'
      });
    }
    expect(stored).toHaveLength(2);
  });

  test('#1398: the owner\'s own store id wins over options.store', async () => {
    const stored: StoredCall[] = [];
    const pageOwner = vi.fn().mockResolvedValue({ creator: 'molly', store: 'default' });
    const m = makeManager({ pagesDir, stored, pageOwner });

    await m.uploadAttachment(Buffer.from('x'), FILE, CTX, {
      pageName: 'Diary',
      private: true,
      store: 'elsewhere'
    });

    expect(storedMeta(stored)).toMatchObject({ pageCreator: 'molly', store: 'default' });
  });

  test('private container: nobody but the owner uploads onto a private page — admin included', async () => {
    const pageOwner = vi.fn().mockResolvedValue({ creator: 'alice', store: 'default' });
    for (const who of [
      { username: 'admin', isAuthenticated: true, roles: ['admin'] },
      { username: 'bob', isAuthenticated: true, roles: ['editor'] }
    ]) {
      const stored: StoredCall[] = [];
      const m = makeManager({ pagesDir, stored, pageOwner });
      await expect(
        m.uploadAttachment(Buffer.from('x'), FILE, who, { pageName: 'Diary' })
      ).rejects.toThrow(/permission denied/i);
      expect(stored).toHaveLength(0);
    }
  });

  test('private container: a share visitor is refused until the store\'s Share switch exists (#1388)', async () => {
    const pageOwner = vi.fn().mockResolvedValue({ creator: 'alice', store: 'default' });
    const shareVisitor = {
      username: 'Anonymous',
      isAuthenticated: false,
      roles: ['anonymous'],
      viaShare: { id: 's1', issuer: 'alice', actions: ['asset-upload'], resources: [] }
    };
    const stored: StoredCall[] = [];
    const m = makeManager({ pagesDir, stored, pageOwner });
    await expect(
      m.uploadAttachment(Buffer.from('x'), FILE, shareVisitor as never, { pageName: 'Diary' })
    ).rejects.toThrow(/permission denied/i);
    await expect(
      m.uploadAttachment(Buffer.from('x'), FILE, shareVisitor as never, { private: true })
    ).rejects.toThrow(/permission denied/i);
    expect(stored).toHaveLength(0);
  });

  test('#1398: a failed page lookup refuses the upload rather than falling back to the public pool', async () => {
    const stored: StoredCall[] = [];
    const pageOwner = vi.fn().mockRejectedValue(new Error('index unavailable'));
    const m = makeManager({ pagesDir, stored, pageOwner });

    await expect(
      m.uploadAttachment(Buffer.from('x'), FILE, CTX, { pageName: 'Diary' })
    ).rejects.toThrow(/index unavailable/);
    expect(stored).toHaveLength(0);
  });

  test('private false stays the public pool', async () => {
    const stored: StoredCall[] = [];
    const m = makeManager({ pagesDir, stored });
    await m.uploadAttachment(Buffer.from('x'), FILE, CTX, { private: false });
    const meta = storedMeta(stored);
    expect(meta.isPrivatePage).toBe(false);
    expect(meta.store).toBeUndefined();
  });

  test('permission denied refuses before store', async () => {
    const stored: StoredCall[] = [];
    const m = makeManager({ pagesDir, stored, allow: false });
    await expect(
      m.uploadAttachment(Buffer.from('x'), FILE, CTX, { private: true })
    ).rejects.toThrow(/permission denied/i);
    expect(stored).toHaveLength(0);
  });

  test('private true requires ConfigurationManager from the engine', async () => {
    const stored: StoredCall[] = [];
    const m = makeManager({ pagesDir, stored, noConfig: true });
    await expect(
      m.uploadAttachment(Buffer.from('x'), FILE, CTX, { private: true })
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
      m.uploadAttachment(Buffer.from('x'), FILE, CTX, { private: true })
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
        m.uploadAttachment(Buffer.from('x'), FILE, CTX, { private: true })
      )
    ).resolves.toMatchObject({ identifier: 'att-priv-1' });
    expect(stored).toHaveLength(1);
  });
});
