/**
 * Unused files in your own vaults — #1517.
 *
 * A real AttachmentManager over a real BasicAttachmentProvider in a temp
 * directory. A file is unused when no current page of its vault mentions it.
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

const MOLLY = { username: 'molly', isAuthenticated: true, roles: ['editor'] } as ActorContext;
const BOB = { username: 'bob', isAuthenticated: true, roles: ['editor'] } as ActorContext;
const DIARY = formatPrivatePageName('molly', 'default', 'Diary');

describe('AttachmentManager.listOwnUnusedVaultFiles (#1517)', () => {
  let tmp: string;
  let pagesDir: string;
  let storageDir: string;
  let manager: AttachmentManager;
  let vaultPages: Record<string, string[]>;

  function makeEngine() {
    const configManager = {
      getProperty: (key: string, def: unknown) => (key === 'ngdpbase.attachment.maxsize' ? 10485760 : key === 'ngdpbase.attachment.allowedtypes' ? '' : def),
      getResolvedDataPath: (key: string, def: unknown) => {
        if (key === 'ngdpbase.attachment.provider.basic.storagedir') return storageDir;
        if (key === 'ngdpbase.attachment.metadatafile') return path.join(storageDir, 'attachment-metadata.json');
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
        return def;
      }
    };
    const managers: Record<string, unknown> = {
      ConfigurationManager: configManager,
      PolicyDecisionPoint: { permits: () => Promise.resolve(true), decide: () => Promise.resolve({ permit: true }) },
      AuditManager: { logAuditEvent: vi.fn().mockResolvedValue('evt'), flushAuditQueue: () => Promise.resolve() },
      PageManager: {
        getPrivatePageOwner: (name: string) => Promise.resolve(name === DIARY ? { creator: 'molly', store: 'default' } : null),
        listVaultPages: (_c: ActorContext, owner: string, vault: string) =>
          Promise.resolve((vaultPages[`${owner}/${vault}`] ?? []).map((name) => ({ name, title: name, uuid: name })))
      },
      PolicyInformationPoint: {
        canAccessPrivateContainer: (subject: ActorContext, owner: string) => mayActInPrivateContainer(subject, owner),
        canUserAccessPage: () => Promise.resolve(true)
      }
    };
    return { getManager: (name: string) => managers[name] ?? null } as never;
  }

  let n = 0;
  const upload = (ctx: ActorContext, store: string, pageName?: string) => {
    const bytes = Buffer.from(`file ${++n}`);
    return manager.uploadAttachment(bytes, { originalName: `f${n}.txt`, mimeType: 'text/plain', size: bytes.length }, ctx,
      { private: true, store, description: 'x', ...(pageName ? { pageName } : {}) });
  };
  const idOf = (r: unknown) => (r as { identifier?: string; id?: string }).identifier ?? (r as { id: string }).id;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'unused-vault-files-'));
    pagesDir = path.join(tmp, 'pages');
    storageDir = path.join(tmp, 'attachments');
    await fs.ensureDir(storageDir);
    for (const [owner, store] of [['molly', 'default'], ['bob', 'default']]) {
      await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, owner, store)));
      await fs.writeJson(storeMetaPath(pagesDir, owner, store), { kind: store, encrypt: false, created: '2026-09-30T00:00:00.000Z' });
    }
    vaultPages = { 'molly/default': [DIARY] };
    clearUnlockedPrivateStores();
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

  test('a file no current page of its vault uses is listed; one a page uses is not', async () => {
    await upload(MOLLY, 'default', DIARY);
    const unused = idOf(await upload(MOLLY, 'default'));
    const result = await manager.listOwnUnusedVaultFiles(MOLLY);
    expect(result).toHaveLength(1);
    expect(result[0].vault).toBe('default');
    expect(result[0].files.map((f) => f.id)).toEqual([unused]);
  });

  test('a file whose page is gone from the vault becomes unused', async () => {
    const used = idOf(await upload(MOLLY, 'default', DIARY));
    vaultPages['molly/default'] = [];
    expect((await manager.listOwnUnusedVaultFiles(MOLLY))[0].files.map((f) => f.id)).toEqual([used]);
  });

  test('only the requester\'s own vaults: another user\'s files are never listed', async () => {
    await upload(BOB, 'default');
    expect(await manager.listOwnUnusedVaultFiles(MOLLY)).toEqual([]);
    expect((await manager.listOwnUnusedVaultFiles(BOB))[0].files).toHaveLength(1);
  });

  test('an encrypted vault this session cannot open is reported as locked, not empty', async () => {
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', 'sealed')));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'sealed'), { encrypt: true });
    const result = await manager.listOwnUnusedVaultFiles(MOLLY);
    expect(result).toContainEqual({ vault: 'sealed', locked: true, canDelete: false, files: [] });
  });
});
