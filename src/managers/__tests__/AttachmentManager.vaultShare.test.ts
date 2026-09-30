/**
 * Files through a vault link — #1388 (epic #1382).
 *
 * A real AttachmentManager over a real BasicAttachmentProvider, in a temp
 * directory, with an unencrypted vault. A link serves a file only from the
 * one vault it names, and only when a page it covers uses that file.
 */

vi.unmock('../../providers/BasicAttachmentProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import AttachmentManager from '../AttachmentManager';
import BasicAttachmentProvider from '../../providers/BasicAttachmentProvider';
import { storeMetaPath, formatPrivatePageName } from '../../utils/privateStorePath';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
import { clearUnlockedPrivateStores } from '../../utils/privateStoreUnlock';
import type { ActorContext } from '../../context/ActorContext';

const STORE = 'journal';
const MOLLY = { username: 'molly', isAuthenticated: true, roles: ['reader'] } as ActorContext;
const PNG = Buffer.from('not really a png');
const FILE = { originalName: 'photo.png', mimeType: 'image/png', size: PNG.length };
const DIARY = formatPrivatePageName('molly', STORE, 'Diary');
const NOTES = formatPrivatePageName('molly', STORE, 'Notes');
const UUIDS: Record<string, string> = { [DIARY]: 'u-diary', [NOTES]: 'u-notes' };

/** The subject a link visit carries: nobody, bearing what molly shared. */
const link = (resources: Array<{ type: string; pattern: string }>, issuer = 'molly') => ({
  username: '',
  isAuthenticated: false,
  roles: ['anonymous'],
  viaShare: { id: 's1', issuer, actions: ['page-read', 'asset-read'], resources, expiresAt: null }
}) as never as ActorContext;

describe('AttachmentManager — files through a vault link (#1388)', () => {
  let tmp: string;
  let storageDir: string;
  let pagesDir: string;
  let manager: AttachmentManager;
  let ceilingPermits: boolean;

  function makeEngine() {
    const configManager = {
      getProperty: (key: string, def: unknown) => {
        if (key === 'ngdpbase.attachment.maxsize') return 10485760;
        if (key === 'ngdpbase.attachment.allowedtypes') return '';
        return def;
      },
      getResolvedDataPath: (key: string, def: unknown) => {
        if (key === 'ngdpbase.attachment.provider.basic.storagedir') return storageDir;
        if (key === 'ngdpbase.attachment.metadatafile') return path.join(storageDir, 'attachment-metadata.json');
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
        return def;
      }
    };
    const managers: Record<string, unknown> = {
      ConfigurationManager: configManager,
      PolicyDecisionPoint: {
        permits: () => Promise.resolve(true),
        ceiling: () => Promise.resolve({ permit: ceilingPermits })
      },
      AuditManager: { logAuditEvent: vi.fn().mockResolvedValue('evt'), flushAuditQueue: () => Promise.resolve() },
      PageManager: {
        getPrivatePageOwner: (name: string) => Promise.resolve(UUIDS[name] ? { creator: 'molly', store: STORE } : null),
        getPageMetadata: (name: string) => Promise.resolve(UUIDS[name] ? { uuid: UUIDS[name] } : null)
      },
      PolicyInformationPoint: {
        canAccessPrivateContainer: (subject: ActorContext, owner: string, _r: string, _a: string, vault?: string) =>
          mayActInPrivateContainer(subject, owner, vault === undefined ? {} : { vault }),
        canUserAccessPage: () => Promise.resolve(true)
      }
    };
    return { getManager: (name: string) => managers[name] ?? null } as never;
  }

  // Bytes differ per upload: a store holds one copy of identical bytes (fingerprint), and each test needs its own file.
  let n = 0;
  const upload = (pageName?: string) => {
    const bytes = Buffer.concat([PNG, Buffer.from(String(++n))]);
    return manager.uploadAttachment(bytes, { ...FILE, size: bytes.length }, MOLLY, { private: true, store: STORE, description: 'photo', ...(pageName ? { pageName } : {}) });
  };
  const idOf = (result: unknown) => (result as { identifier?: string; id?: string }).identifier ?? (result as { id: string }).id;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'att-vault-share-'));
    storageDir = path.join(tmp, 'attachments');
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(storageDir);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', STORE), { kind: STORE, encrypt: false, created: '2026-09-30T00:00:00.000Z' });
    clearUnlockedPrivateStores();
    ceilingPermits = true;
    const engine = makeEngine();
    manager = new AttachmentManager(engine);
    const provider = new BasicAttachmentProvider(engine);
    await provider.initialize();
    (manager as unknown as { attachmentProvider: unknown }).attachmentProvider = provider;
  });

  afterEach(async () => {
    // Only the per-test temp directory — never a live data tree.
    await fs.remove(tmp);
  });

  test('a page link serves a file its page uses', async () => {
    const id = idOf(await upload(DIARY));
    const got = await manager.getVaultShareAttachment(id, link([{ type: 'page', pattern: 'vault-page:molly/journal/u-diary' }]));
    expect(got?.buffer.subarray(0, PNG.length).equals(PNG)).toBe(true);
  });

  test('a page link does not serve a file another page uses', async () => {
    const id = idOf(await upload(NOTES));
    expect(await manager.getVaultShareAttachment(id, link([{ type: 'page', pattern: 'vault-page:molly/journal/u-diary' }]))).toBeNull();
  });

  test('a whole-vault link serves files its pages use, but not a file no page uses', async () => {
    const whole = link([{ type: 'page', pattern: 'vault:molly/journal' }]);
    const used = idOf(await upload(NOTES));
    const unused = idOf(await upload());
    expect(await manager.getVaultShareAttachment(used, whole)).not.toBeNull();
    expect(await manager.getVaultShareAttachment(unused, whole)).toBeNull();
  });

  test('a link issued by anyone but the owner, or one the ceiling refuses, serves nothing', async () => {
    const id = idOf(await upload(DIARY));
    expect(await manager.getVaultShareAttachment(id, link([{ type: 'page', pattern: 'vault:molly/journal' }], 'admin'))).toBeNull();
    ceilingPermits = false;
    expect(await manager.getVaultShareAttachment(id, link([{ type: 'page', pattern: 'vault:molly/journal' }]))).toBeNull();
  });

  test('without a link nothing is served here, not even to the owner', async () => {
    const id = idOf(await upload(DIARY));
    expect(await manager.getVaultShareAttachment(id, MOLLY)).toBeNull();
  });
});
