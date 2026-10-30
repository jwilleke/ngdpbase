/**
 * FileManager writes (#2148, epic #1851): `placesWritableBy` and `put`, the
 * one write door. A file goes into the place the caller chose, never one a
 * page name decides; the permission for that place is asked first and a
 * refusal stores nothing; a sealed place seals it; the upload is recorded,
 * a sealed place's file by id only (#2048).
 *
 * A real FileManager over a real AttachmentManager and BasicAttachmentProvider
 * in a temp directory, and a real PolicyDecisionPoint over the SHIPPED
 * policies, so each role's answer is the site's own.
 *
 * Sabotaged once each (then restored):
 * - `mayPut` answering true for every place: 13 went red, every
 *   placesWritableBy test and every refusal but anonymous's, which the
 *   uploader check (#1926) still refuses after policy.
 * - `storeInPlace` choosing the vault from `options.pageName` (as the old
 *   page-tied upload did): "a page name never decides the place" went red.
 * - the sealed-store branch of the audit record (filename always recorded):
 *   the sealed vault and shared folder tests went red.
 * - #2149: `put` recording the stored record without what vetting removed:
 *   "an SVG with a script is cleaned" and "a sealed place" went red.
 */

vi.unmock('../../providers/BasicAttachmentProvider');
vi.unmock('../PolicyEvaluator');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import AttachmentManager from '../AttachmentManager';
import FileManager from '../FileManager';
import BasicAttachmentProvider from '../../providers/BasicAttachmentProvider';
import { SHARED_FOLDER_OWNER, storeMetaPath } from '../../utils/privateStorePath';
import { permitsInSharedFolder, setSharedFolderKeySource } from '../../utils/sharedFolderAccess';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
import {
  TEST_PRIVATE_STORE_KDF,
  createEncryptedStore,
  createUserKeys,
  isSealedBytes,
  unwrapDek
} from '../../utils/privateStoreCrypto';
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';
import { pdpOver } from '../../test-support/policyDecisionPoint';
import { coreVetting } from '../../test-support/filesDoor';
import type { ActorContext } from '../../context/ActorContext';
import type { FilePlace } from '../../types/File';

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

const who = (username: string, roles: string[], extra: Record<string, unknown> = {}) =>
  ({ username, roles, isAuthenticated: true, ...extra }) as ActorContext;
const ANONYMOUS = { username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false } as ActorContext;
const reader = () => who('rose', ['reader', 'vault-owner']);
const editor = () => who('ed', ['editor', 'vault-owner']);
const executive = () => who('eve', ['reader', 'vault-owner', 'executive']);
const admin = () => who('ada', ['admin', 'vault-owner']);

const FOLDERS = ['default', 'executive', 'finance'];
const PUBLIC: FilePlace = { kind: 'public' };
const vault = (owner: string, v = 'default'): FilePlace => ({ kind: 'vault', owner, vault: v });
const folder = (name: string): FilePlace => ({ kind: 'shared-folder', folder: name });

describe('FileManager writes (#2148)', () => {
  let tmp: string;
  let pagesDir: string;
  let storageDir: string;
  let files: FileManager;
  let audit: ReturnType<typeof vi.fn>;
  /** Extra site policies, merged over the shipped ones (a site's own config). */
  let sitePolicies: unknown[];
  const keys: Record<string, Buffer> = {};

  async function build() {
    const config: Record<string, unknown> = {
      ...shipped,
      'ngdpbase.access.policies': [...(shipped['ngdpbase.access.policies'] as unknown[]), ...sitePolicies]
    };
    const pdp = await pdpOver(config);
    audit = vi.fn().mockResolvedValue('evt');
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (key: string, def: unknown) => {
          if (key === 'ngdpbase.attachment.maxsize') return 10485760;
          if (key === 'ngdpbase.attachment.allowedtypes') return '';
          return key in config ? config[key] : def;
        },
        getResolvedDataPath: (key: string, def: unknown) => {
          if (key === 'ngdpbase.attachment.provider.basic.storagedir') return storageDir;
          if (key === 'ngdpbase.attachment.metadatafile') return path.join(storageDir, 'attachment-metadata.json');
          if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
          return def;
        }
      },
      PolicyDecisionPoint: pdp,
      // #2149: every file is vetted by the engine before it is kept.
      ImportManager: coreVetting,
      AuditManager: { logAuditEvent: audit, flushAuditQueue: () => Promise.resolve() },
      PolicyInformationPoint: {
        canAccessPrivateContainer: (subject: ActorContext, owner: string) => mayActInPrivateContainer(subject, owner),
        canUserAccessPage: () => Promise.resolve(true)
      },
      PageManager: { getPrivatePageOwner: (name: string) => Promise.resolve(name === 'vaults/ed/default/Notes' ? { creator: 'ed', store: 'default' } : null) },
      SharedFolderManager: {
        folderNames: () => [...FOLDERS],
        mayInFolder: (ctx: ActorContext, action: string, name: string) =>
          Promise.resolve(FOLDERS.includes(name) ? permitsInSharedFolder(pdp, ctx, action, name) : false)
      }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    const attachments = new AttachmentManager(engine);
    const provider = new BasicAttachmentProvider(engine);
    await provider.initialize();
    (attachments as unknown as { attachmentProvider: unknown }).attachmentProvider = provider;
    managers.AttachmentManager = attachments;
    files = new FileManager(engine);
    managers.FileManager = files;
  }

  async function plainVault(user: string, v: string) {
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, user, v)));
    await fs.writeJson(storeMetaPath(pagesDir, user, v), { kind: v, encrypt: false, created: '2026-10-30T00:00:00.000Z' });
  }

  /** A sealed vault for `user`, unlocked in the session `handle`. */
  async function sealedVault(user: string, v: string, handle: string) {
    const { kek } = await createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, user, v)));
    await fs.writeJson(storeMetaPath(pagesDir, user, v), record);
    unlockPrivateStores(handle, user, kek);
    setUnlockedDek(handle, v, unwrapDek(kek, record));
  }

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'files-put-'));
    pagesDir = path.join(tmp, 'pages');
    storageDir = path.join(tmp, 'attachments');
    await fs.ensureDir(storageDir);
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
    sitePolicies = [];
    for (const name of FOLDERS) {
      keys[name] = randomBytes(32);
      await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, SHARED_FOLDER_OWNER, name)));
      await fs.writeJson(storeMetaPath(pagesDir, SHARED_FOLDER_OWNER, name), { kind: 'shared-folder', encrypt: true });
    }
    setSharedFolderKeySource((name) => (keys[name] ? Buffer.from(keys[name]) : undefined));
    await build();
  });

  afterEach(async () => {
    setSharedFolderKeySource(null);
    clearUnlockedPrivateStores();
    // Only the per-test temp directory — never a live data tree.
    await fs.remove(tmp);
  });

  let n = 0;
  const aFile = () => {
    const bytes = Buffer.from(`file number ${++n}`);
    return { bytes, info: { originalName: `f${n}.txt`, mimeType: 'text/plain', size: bytes.length } };
  };
  const poolFiles = async () => (await fs.readdir(storageDir)).filter((f) => f !== 'attachment-metadata.json');
  const storeFiles = async (owner: string, v: string) =>
    fs.readdir(path.join(pagesDir, 'vaults', owner, v, 'attachments')).catch(() => [] as string[]);
  const nothingStored = async () => {
    expect(await poolFiles()).toEqual([]);
    for (const name of FOLDERS) expect(await storeFiles(SHARED_FOLDER_OWNER, name)).toEqual([]);
    for (const user of ['rose', 'ed', 'eve', 'ada']) expect(await storeFiles(user, 'default')).toEqual([]);
  };
  const uploadRecords = () => audit.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((e) => e.eventType === 'asset-upload');

  describe('placesWritableBy', () => {
    test('anonymous: no place at all', async () => {
      expect(await files.placesWritableBy(ANONYMOUS)).toEqual([]);
    });

    test('a reader, shipped: their own vault and the default folder, not the public place', async () => {
      expect(await files.placesWritableBy(reader())).toEqual([vault('rose'), folder('default')]);
    });

    test('a reader on a site whose policy grants them asset-upload also gets the public place', async () => {
      sitePolicies = [{
        id: 'site-reader-uploads', effect: 'allow', priority: 61,
        subjects: [{ type: 'role', value: 'reader' }], resources: [{ type: 'page', pattern: '*' }], actions: ['asset-upload']
      }];
      await build();
      expect(await files.placesWritableBy(reader())).toEqual([PUBLIC, vault('rose'), folder('default')]);
    });

    test('an editor: public, each own vault, and the folders they may file in', async () => {
      await plainVault('ed', 'phr');
      await plainVault('someone', 'default');
      expect(await files.placesWritableBy(editor())).toEqual([PUBLIC, vault('ed'), vault('ed', 'phr'), folder('default')]);
    });

    test('an executive gets shared/executive, never finance, and no public place', async () => {
      expect(await files.placesWritableBy(executive())).toEqual([vault('eve'), folder('default'), folder('executive')]);
    });

    test('a shared-folder-file holder by a site policy gets that folder', async () => {
      sitePolicies = [{
        id: 'site-secretary-files-executive', effect: 'allow', priority: 60,
        subjects: [{ type: 'role', value: 'secretary' }], resources: [{ type: 'shared-folder', pattern: 'shared/executive' }],
        actions: ['shared-folder-read', 'shared-folder-file']
      }];
      await build();
      expect(await files.placesWritableBy(who('sam', ['reader', 'vault-owner', 'secretary'])))
        .toEqual([vault('sam'), folder('default'), folder('executive')]);
    });

    test('an admin: public, own vault, every folder — never another user\'s vault', async () => {
      await plainVault('ed', 'default');
      const places = await files.placesWritableBy(admin());
      expect(places).toEqual([PUBLIC, vault('ada'), folder('default'), folder('executive'), folder('finance')]);
    });

    test('a share visitor gets nothing', async () => {
      const visitor = who('ed', ['anonymous'], { isAuthenticated: false, viaShare: { id: 's1', issuer: 'ed', resources: [], actions: ['page-read', 'asset-read'] } });
      expect(await files.placesWritableBy(visitor)).toEqual([]);
    });
  });

  describe('put refuses a place it may not write, and stores nothing', () => {
    test('the public place without asset-upload', async () => {
      await expect(files.put(reader(), PUBLIC, aFile())).rejects.toThrow(/Permission denied/);
      await nothingStored();
    });

    test('another user\'s vault, even for an admin', async () => {
      await plainVault('ed', 'default');
      await expect(files.put(admin(), vault('ed'), aFile())).rejects.toThrow(/Permission denied/);
      await nothingStored();
    });

    test('a folder without shared-folder-file, and a folder that does not exist', async () => {
      await expect(files.put(executive(), folder('finance'), aFile())).rejects.toThrow(/Permission denied/);
      await expect(files.put(admin(), folder('nosuch'), aFile())).rejects.toThrow(/Permission denied/);
      await nothingStored();
    });

    test('anonymous, anywhere', async () => {
      for (const place of [PUBLIC, vault('Anonymous'), folder('default')]) {
        await expect(files.put(ANONYMOUS, place, aFile())).rejects.toThrow(/Permission denied/);
      }
      await nothingStored();
    });

    test('a vault named by the shared folders\' container is not a place', async () => {
      await expect(files.put(admin(), vault(SHARED_FOLDER_OWNER, 'default'), aFile())).rejects.toThrow(/Not a place/);
      await nothingStored();
    });

    test('nothing is recorded as uploaded', async () => {
      await expect(files.put(reader(), PUBLIC, aFile())).rejects.toThrow(/Permission denied/);
      expect(uploadRecords()).toEqual([]);
    });
  });

  describe('put stores in the chosen place', () => {
    test('the public place: in the pool, recorded with its name', async () => {
      const stored = await files.put(editor(), PUBLIC, aFile());
      expect(await poolFiles()).toHaveLength(1);
      expect(uploadRecords()).toHaveLength(1);
      expect(JSON.stringify(uploadRecords()[0])).toContain(String(stored.name));
    });

    test('a page name never decides the place: put to public with a vault page named stays public', async () => {
      await plainVault('ed', 'default');
      await files.put(editor(), PUBLIC, aFile(), { pageName: 'vaults/ed/default/Notes' });
      expect(await poolFiles()).toHaveLength(1);
      expect(await storeFiles('ed', 'default')).toEqual([]);
    });

    test('a plain vault: in the vault, not the pool, recorded with its name', async () => {
      await plainVault('ed', 'default');
      const file = aFile();
      const stored = await files.put(editor(), vault('ed'), file);
      expect(await storeFiles('ed', 'default')).toEqual([`${stored.identifier}.txt`]);
      expect(await poolFiles()).toEqual([]);
      expect(JSON.stringify(uploadRecords()[0])).toContain(file.info.originalName);
    });

    test('a sealed vault: sealed bytes, and recorded by id and vault only (#2048)', async () => {
      await sealedVault('ed', 'default', 'ed-sid');
      const file = aFile();
      const stored = await files.put(who('ed', ['editor', 'vault-owner'], { privateStoreHandle: 'ed-sid' }), vault('ed'), file);
      const onDisk = await fs.readFile(path.join(pagesDir, 'vaults', 'ed', 'default', 'attachments', `${stored.identifier}.txt`));
      expect(isSealedBytes(onDisk)).toBe(true);
      const record = JSON.stringify(uploadRecords()[0]);
      expect(record).toContain(String(stored.identifier));
      expect(record).not.toContain(file.info.originalName);
    });

    test('a sealed vault without its key in the session is refused, never written in the clear', async () => {
      await sealedVault('ed', 'default', 'ed-sid');
      await expect(files.put(editor(), vault('ed'), aFile())).rejects.toThrow();
      expect(await storeFiles('ed', 'default')).toEqual([]);
      expect(await poolFiles()).toEqual([]);
    });

    test('a shared folder: sealed with the folder\'s key, recorded by id only', async () => {
      const file = aFile();
      const stored = await files.put(executive(), folder('executive'), file);
      const onDisk = await fs.readFile(path.join(pagesDir, 'vaults', SHARED_FOLDER_OWNER, 'executive', 'attachments', `${stored.identifier}.txt`));
      expect(isSealedBytes(onDisk)).toBe(true);
      expect(await poolFiles()).toEqual([]);
      const record = JSON.stringify(uploadRecords()[0]);
      expect(record).toContain(String(stored.identifier));
      expect(record).not.toContain(file.info.originalName);
    });

    test('every place placesWritableBy offers, put accepts', async () => {
      await plainVault('ada', 'default');
      const ada = admin();
      for (const place of await files.placesWritableBy(ada)) {
        await expect(files.put(ada, place, aFile())).resolves.toBeTruthy();
      }
      expect(uploadRecords()).toHaveLength(5);
    });
  });

  describe('the page-tied upload goes through put (#2148)', () => {
    test('uploadAttachment onto a vault page lands in that vault, asked at the door', async () => {
      await plainVault('ed', 'default');
      const attachments = (files as unknown as { engine: { getManager(n: string): AttachmentManager } }).engine.getManager('AttachmentManager');
      const put = vi.spyOn(files, 'put');
      const file = aFile();
      await attachments.uploadAttachment(file.bytes, file.info, editor(), { pageName: 'vaults/ed/default/Notes' });
      expect(put).toHaveBeenCalledWith(expect.anything(), vault('ed'), expect.anything(), expect.objectContaining({ pageName: 'vaults/ed/default/Notes' }));
      expect(await storeFiles('ed', 'default')).toHaveLength(1);
    });

    test('placeForPageUpload: folder page, vault page, Private tick, otherwise public', async () => {
      const ed = editor();
      expect(await files.placeForPageUpload(ed, { pageName: 'shared/executive/Minutes' })).toEqual(folder('executive'));
      expect(await files.placeForPageUpload(ed, { pageName: 'vaults/ed/default/Notes' })).toEqual(vault('ed'));
      expect(await files.placeForPageUpload(ed, { private: true, store: 'phr' })).toEqual(vault('ed', 'phr'));
      expect(await files.placeForPageUpload(ed, { private: true })).toEqual(vault('ed'));
      expect(await files.placeForPageUpload(ed, { pageName: 'Main' })).toEqual(PUBLIC);
    });
  });

  describe('#2149: ICE vets every file put; FileManager records it', () => {
    const named = (originalName: string, mimeType: string, text: string) => {
      const bytes = Buffer.from(text);
      return { bytes, info: { originalName, mimeType, size: bytes.length } };
    };
    const SCRIPTED_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onload="steal()" width="4"/></svg>';
    const poolText = async () => fs.readFile(path.join(storageDir, (await poolFiles())[0]), 'utf8');

    test('an SVG with a script is cleaned: the cleaned copy is kept, the caller told, the record says what', async () => {
      const stored = await files.put(editor(), PUBLIC, named('logo.svg', 'image/svg+xml', SCRIPTED_SVG));
      expect(stored.cleaned).toEqual([expect.stringMatching(/removed 1 script element/), expect.stringMatching(/removed 1 event handler/)]);
      const kept = await poolText();
      expect(kept).not.toMatch(/script|onload|steal/i);
      expect(kept).toContain('<rect width="4"></rect>');
      expect(uploadRecords()).toHaveLength(1);
      expect(uploadRecords()[0].metadata).toMatchObject({ filename: 'logo.svg', cleaned: stored.cleaned });
    });

    test('the type is read from the bytes: an SVG named .png is cleaned as an SVG and stored as one (#1624)', async () => {
      const stored = await files.put(editor(), PUBLIC, named('innocent.png', 'image/png', SCRIPTED_SVG));
      expect(stored.encodingFormat).toBe('image/svg+xml');
      expect(stored.cleaned?.length).toBe(2);
      expect(await poolText()).not.toMatch(/script/i);
    });

    test('a file that needs nothing is kept byte for byte, and neither result nor record mentions cleaning', async () => {
      const clean = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>';
      const stored = await files.put(editor(), PUBLIC, named('dot.svg', 'image/svg+xml', clean));
      expect(stored.cleaned).toBeUndefined();
      expect(await poolText()).toBe(clean);
      expect(uploadRecords()[0].metadata).not.toHaveProperty('cleaned');
    });

    test('a CSV into a vault: HTML and formulas in cells are cleaned, everything else kept', async () => {
      await plainVault('ed', 'default');
      const stored = await files.put(editor(), vault('ed'), named('sheet.csv', 'text/csv', 'name,amount\n<b>Ann</b>,-5\n=HYPERLINK("x"),3\n'));
      const kept = await fs.readFile(path.join(pagesDir, 'vaults', 'ed', 'default', 'attachments', `${stored.identifier}.csv`), 'utf8');
      expect(kept).toBe('name,amount\n"Ann",-5\n"\'=HYPERLINK(""x"")",3\n');
      expect(stored.cleaned).toEqual([expect.stringMatching(/HTML from 1 cell/), expect.stringMatching(/1 cell began with a formula/)]);
    });

    test('a sealed place: the record says what was cleaned, and still never the file\'s name', async () => {
      const stored = await files.put(executive(), folder('executive'), named('secret-plan.svg', 'image/svg+xml', SCRIPTED_SVG));
      const record = uploadRecords()[0];
      expect(record.metadata).toMatchObject({ attachmentId: stored.identifier, sealed: true, cleaned: stored.cleaned });
      expect(JSON.stringify(record)).not.toContain('secret-plan');
    });

    test('a refused put vets nothing: the permission is asked first', async () => {
      const vet = vi.spyOn(coreVetting, 'vetFile');
      try {
        await expect(files.put(reader(), PUBLIC, named('logo.svg', 'image/svg+xml', SCRIPTED_SVG))).rejects.toThrow(/Permission denied/);
        expect(vet).not.toHaveBeenCalled();
      } finally {
        vet.mockRestore();
      }
    });

    test('AttachmentManager stores and records nothing itself: the record is FileManager\'s', async () => {
      const attachments = (files as unknown as { engine: { getManager(n: string): AttachmentManager } }).engine.getManager('AttachmentManager');
      const { record } = await attachments.storeInPlace(editor(), PUBLIC, aFile());
      expect(record).toMatchObject({ filename: expect.stringMatching(/^f\d+\.txt$/) });
      expect(uploadRecords()).toEqual([]);
    });
  });

  describe('#2149: the Upload file dialog\'s places', () => {
    test('only the places put allows, in the user\'s words; the public place first selected elsewhere', async () => {
      const { places, defaultKey } = await files.uploadPlaces(editor(), { path: '/view/Main', pageName: 'Main' });
      expect(places.map((p) => [p.key, p.label])).toEqual([
        ['public', 'Public files'], ['vault:default', 'Your private files'], ['folder:default', 'Shared folder: default']
      ]);
      expect(defaultKey).toBe('public');
      expect(places.map((p) => p.place)).toEqual(await files.placesWritableBy(editor()));
    });

    test('where they are working is selected: a folder\'s list, a folder\'s page, their own vault\'s page', async () => {
      expect((await files.uploadPlaces(executive(), { path: '/shared/executive' })).defaultKey).toBe('folder:executive');
      expect((await files.uploadPlaces(executive(), { path: '/view/x', pageName: 'shared/executive/Minutes' })).defaultKey).toBe('folder:executive');
      expect((await files.uploadPlaces(editor(), { pageName: 'vaults/ed/default/Notes' })).defaultKey).toBe('vault:default');
    });

    test('a place they may not upload to is never selected, even where they are working', async () => {
      // A reader holds no asset-upload and no shared-folder-file on executive: their own vault is first.
      expect((await files.uploadPlaces(reader(), { path: '/shared/executive' })).defaultKey).toBe('vault:default');
      // Another user's vault page selects nothing of theirs.
      expect((await files.uploadPlaces(editor(), { pageName: 'vaults/rose/default/Diary' })).defaultKey).toBe('public');
      expect(await files.uploadPlaces(ANONYMOUS)).toEqual({ places: [], defaultKey: null });
    });

    test('placeForKey answers only a key the dialog would offer this user', async () => {
      expect(await files.placeForKey(editor(), 'vault:default')).toEqual(vault('ed'));
      expect(await files.placeForKey(executive(), 'folder:executive')).toEqual(folder('executive'));
      expect(await files.placeForKey(reader(), 'public')).toBeNull();
      expect(await files.placeForKey(reader(), 'folder:executive')).toBeNull();
      expect(await files.placeForKey(editor(), 'vault:../rose')).toBeNull();
      expect(await files.placeForKey(editor(), '')).toBeNull();
    });
  });
});
