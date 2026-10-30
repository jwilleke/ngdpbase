/**
 * A file uploaded from inside /shared/<name> goes into that folder (#2125,
 * operator 2026-10-29): where the user is working decides, not whether the
 * page is saved yet, and never the public pool. It needs `shared-folder-file`
 * on the folder, refused before any bytes are stored.
 *
 * A real AttachmentManager over a real BasicAttachmentProvider in a temp
 * directory, and a real PolicyDecisionPoint over the SHIPPED policies. No page
 * is ever saved here: PageManager answers that no page exists.
 *
 * Sabotaged once (then restored): the shared-folder destination in
 * uploadAttachment, now FileManager.placeForPageUpload (#2148) (removed, so the page owner came from getPrivatePageOwner
 * alone): all three went red — every upload went to the public pool, let in
 * by site-wide asset-upload.
 */

vi.unmock('../../providers/BasicAttachmentProvider');
vi.unmock('../PolicyEvaluator');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import AttachmentManager from '../AttachmentManager';
import { withFilesDoor } from '../../test-support/filesDoor';
import BasicAttachmentProvider from '../../providers/BasicAttachmentProvider';
import { formatPrivatePageName, SHARED_FOLDER_OWNER, storeMetaPath } from '../../utils/privateStorePath';
import { permitsInSharedFolder, setSharedFolderKeySource } from '../../utils/sharedFolderAccess';
import { isSealedBytes } from '../../utils/privateStoreCrypto';
import { pdpOver } from '../../test-support/policyDecisionPoint';
import type { ActorContext } from '../../context/ActorContext';

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;
const subject = (username: string, roles: string[]) => ({ username, roles, isAuthenticated: true }) as ActorContext;

describe('an upload from inside a shared folder goes into the folder (#2125)', () => {
  let tmp: string;
  let pagesDir: string;
  let storageDir: string;
  let manager: AttachmentManager;
  const keys: Record<string, Buffer> = {};

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'shared-folder-files-'));
    pagesDir = path.join(tmp, 'pages');
    storageDir = path.join(tmp, 'attachments');
    await fs.ensureDir(storageDir);
    for (const folder of ['default', 'executive', 'finance']) {
      keys[folder] = randomBytes(32);
      await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, SHARED_FOLDER_OWNER, folder)));
      await fs.writeJson(storeMetaPath(pagesDir, SHARED_FOLDER_OWNER, folder), { kind: 'shared-folder', encrypt: true });
    }
    setSharedFolderKeySource((folder) => (keys[folder] ? Buffer.from(keys[folder]) : undefined));
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
    const pdp = await pdpOver(shipped);
    const managers: Record<string, unknown> = {
      ConfigurationManager: configManager,
      AuditManager: { logAuditEvent: vi.fn().mockResolvedValue('evt'), flushAuditQueue: () => Promise.resolve() },
      // No page is saved: there is no private page owner to find.
      PageManager: { getPrivatePageOwner: () => Promise.resolve(null), listVaultPages: () => Promise.resolve([]) },
      PolicyInformationPoint: { canUserAccessPage: () => Promise.resolve(false) },
      PolicyDecisionPoint: pdp,
      // #2148: FileManager's door asks the folder's own question (SharedFolderManager.mayInFolder).
      SharedFolderManager: {
        folderNames: () => Object.keys(keys),
        mayInFolder: (ctx: ActorContext, action: string, folder: string) =>
          Promise.resolve(folder in keys ? permitsInSharedFolder(pdp, ctx, action, folder) : false)
      }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    manager = withFilesDoor(new AttachmentManager(engine));
    const provider = new BasicAttachmentProvider(engine);
    await provider.initialize();
    (manager as unknown as { attachmentProvider: unknown }).attachmentProvider = provider;
  });

  afterEach(async () => {
    setSharedFolderKeySource(null);
    // Only the per-test temp directory — never a live data tree.
    await fs.remove(tmp);
  });

  let n = 0;
  const upload = (ctx: ActorContext, folder: string) => {
    const bytes = Buffer.from(`file ${++n}`);
    return manager.uploadAttachment(bytes, { originalName: `f${n}.txt`, mimeType: 'text/plain', size: bytes.length }, ctx,
      { pageName: formatPrivatePageName(SHARED_FOLDER_OWNER, folder, `Not saved ${n}`), description: 'x' });
  };
  const idOf = (r: unknown) => (r as { identifier?: string; id?: string }).identifier ?? (r as { id: string }).id;
  const folderFiles = async (folder: string) => fs.readdir(path.join(pagesDir, 'vaults', SHARED_FOLDER_OWNER, folder, 'attachments')).catch(() => [] as string[]);
  const publicFiles = async () => (await fs.readdir(storageDir)).filter((f) => f !== 'attachment-metadata.json');

  test('from an unsaved page in /shared/default, the file lands in the folder, never the public pool', async () => {
    const rita = subject('rita', ['editor', 'vault-owner']);
    expect(idOf(await upload(rita, 'default'))).toBeTruthy();
    const stored = (await folderFiles('default')).filter((f) => f.endsWith('.txt'));
    expect(stored).toHaveLength(1);
    // Sealed with the folder's key, as every folder file is.
    expect(isSealedBytes(await fs.readFile(path.join(pagesDir, 'vaults', SHARED_FOLDER_OWNER, 'default', 'attachments', stored[0])))).toBe(true);
    expect(await publicFiles()).toEqual([]);
  });

  test('in a folder without shared-folder-file it is refused, and nothing is stored anywhere', async () => {
    await expect(upload(subject('rita', ['editor', 'vault-owner']), 'executive')).rejects.toThrow(/Permission denied/);
    expect(await folderFiles('executive')).toEqual([]);
    expect(await publicFiles()).toEqual([]);
  });

  test('an executive, who reads every folder, is refused in any but executive: reading is not filing (#2095)', async () => {
    const eve = subject('eve', ['reader', 'vault-owner', 'executive']);
    await expect(upload(eve, 'finance')).rejects.toThrow(/Permission denied/);
    expect(await folderFiles('finance')).toEqual([]);
    expect(await publicFiles()).toEqual([]);
    // In shared/executive the executive files.
    expect(idOf(await upload(eve, 'executive'))).toBeTruthy();
    expect((await folderFiles('executive')).filter((f) => f.endsWith('.txt'))).toHaveLength(1);
  });

  test('an admin files in every folder (#2095)', async () => {
    const ada = subject('ada', ['admin', 'vault-owner']);
    for (const folder of ['executive', 'finance']) {
      expect(idOf(await upload(ada, folder))).toBeTruthy();
      expect((await folderFiles(folder)).filter((f) => f.endsWith('.txt'))).toHaveLength(1);
    }
    expect(await publicFiles()).toEqual([]);
  });
});
