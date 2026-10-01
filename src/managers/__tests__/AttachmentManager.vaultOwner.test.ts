/**
 * Files in your own vault answer to vault-owner, not your site-wide role — #1539.
 *
 * A real AttachmentManager over a real BasicAttachmentProvider in a temp
 * directory, and a real PolicyEvaluator + PolicyDecisionPoint over the SHIPPED
 * policies. Uploading into, reading, and deleting a file in your own vault is
 * asked with the vault; a public file is asked site-wide, as before.
 */

vi.unmock('../../providers/BasicAttachmentProvider');
vi.unmock('../PolicyEvaluator');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import AttachmentManager from '../AttachmentManager';
import BasicAttachmentProvider from '../../providers/BasicAttachmentProvider';
import PolicyEvaluator from '../PolicyEvaluator';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import { storeMetaPath } from '../../utils/privateStorePath';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
import { clearUnlockedPrivateStores } from '../../utils/privateStoreUnlock';
import type { ActorContext } from '../../context/ActorContext';

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;
const subject = (username: string, roles: string[]) => ({ username, roles, isAuthenticated: true }) as ActorContext;

describe('vault files answer to vault-owner (#1539)', () => {
  let tmp: string;
  let pagesDir: string;
  let storageDir: string;
  let manager: AttachmentManager;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-owner-files-'));
    pagesDir = path.join(tmp, 'pages');
    storageDir = path.join(tmp, 'attachments');
    await fs.ensureDir(storageDir);
    for (const owner of ['molly', 'bob']) {
      await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, owner, 'default')));
      await fs.writeJson(storeMetaPath(pagesDir, owner, 'default'), { kind: 'default', encrypt: false, created: '2026-10-01T00:00:00.000Z' });
    }
    clearUnlockedPrivateStores();
    const configManager = {
      getProperty: (key: string, def: unknown) => {
        if (key === 'ngdpbase.attachment.maxsize') return 10485760;
        if (key === 'ngdpbase.attachment.allowedtypes') return '';
        return key in shipped ? shipped[key] : def;
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
      AuditManager: { logAuditEvent: vi.fn().mockResolvedValue('evt'), flushAuditQueue: () => Promise.resolve() },
      PageManager: { getPrivatePageOwner: () => Promise.resolve(null), listVaultPages: () => Promise.resolve([]) },
      PolicyInformationPoint: {
        canAccessPrivateContainer: (s: ActorContext, owner: string) => mayActInPrivateContainer(s, owner),
        canUserAccessPage: () => Promise.resolve(true)
      }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    const evaluator = new PolicyEvaluator(engine);
    (evaluator as unknown as { configManager: unknown }).configManager = configManager;
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
    manager = new AttachmentManager(engine);
    const provider = new BasicAttachmentProvider(engine);
    await provider.initialize();
    (manager as unknown as { attachmentProvider: unknown }).attachmentProvider = provider;
  });

  afterEach(async () => {
    // Only the per-test temp directory — never a live data tree.
    await fs.remove(tmp);
  });

  let n = 0;
  const upload = (ctx: ActorContext, opts: { private?: boolean } = { private: true }) => {
    const bytes = Buffer.from(`file ${++n}`);
    return manager.uploadAttachment(bytes, { originalName: `f${n}.txt`, mimeType: 'text/plain', size: bytes.length }, ctx,
      { ...opts, store: 'default', description: 'x' });
  };
  const idOf = (r: unknown) => (r as { identifier?: string; id?: string }).identifier ?? (r as { id: string }).id;

  test('a reader with vault-owner uploads into, reads and deletes in their own vault', async () => {
    const molly = subject('molly', ['reader', 'vault-owner']);
    const id = idOf(await upload(molly));
    expect(await manager.getPrivateStoreAttachment(id, molly)).not.toBeNull();
    expect(await manager.deleteAttachment(id, molly)).toBe(true);
  });

  test('the unused-files list offers Delete exactly when the delete would be allowed (#1535)', async () => {
    await upload(subject('molly', ['reader', 'vault-owner']));
    expect((await manager.listOwnUnusedVaultFiles(subject('molly', ['reader', 'vault-owner'])))[0].canDelete).toBe(true);
    expect((await manager.listOwnUnusedVaultFiles(subject('molly', ['editor'])))[0].canDelete).toBe(false);
  });

  test('…but may not upload a public file', async () => {
    await expect(upload(subject('molly', ['reader', 'vault-owner']), {})).rejects.toThrow(/Permission denied/);
  });

  test('without vault-owner, even an editor is refused in their own vault', async () => {
    await expect(upload(subject('molly', ['editor']))).rejects.toThrow(/Permission denied/);
  });

  test('without vault-owner, a file already in the vault cannot be deleted by its owner’s editor role', async () => {
    const id = idOf(await upload(subject('molly', ['reader', 'vault-owner'])));
    await expect(manager.deleteAttachment(id, subject('molly', ['editor']))).rejects.toThrow(/Permission denied/);
  });

  test('another person cannot delete it, whatever their roles — it is not in their stores', async () => {
    const molly = subject('molly', ['reader', 'vault-owner']);
    const id = idOf(await upload(molly));
    expect(await manager.deleteAttachment(id, subject('bob', ['admin', 'vault-owner']))).toBe(false);
    expect(await manager.getPrivateStoreAttachment(id, molly)).not.toBeNull();
  });
});
