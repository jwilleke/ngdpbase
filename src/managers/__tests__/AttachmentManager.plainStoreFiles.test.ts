/**
 * Files in an UNENCRYPTED private store — #1460 (epic #1454).
 *
 * #1400 gave an encrypted store its own file catalogue; this is the same for a
 * store that is not encrypted. A real AttachmentManager over a real
 * BasicAttachmentProvider, in a temp directory.
 *
 * The point the assertions keep coming back to: there is no key here. The
 * bytes sit readable on disk, so nothing may serve them on the strength of the
 * file existing — ownership is the whole of the decision, through the
 * container rule (`mayActInPrivateContainer` / the PIP), exactly as the page
 * door decides a private page. Another user and an admin get the same nothing.
 */

vi.unmock('../../providers/BasicAttachmentProvider');

import crypto from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import AttachmentManager from '../AttachmentManager';
import BasicAttachmentProvider from '../../providers/BasicAttachmentProvider';
import { storeFileIndexPath, storeMetaPath, formatPrivatePageName } from '../../utils/privateStorePath';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
import { clearUnlockedPrivateStores } from '../../utils/privateStoreUnlock';
import type { ActorContext } from '../../context/ActorContext';

const STORE = 'vault';
const MOLLY = { username: 'molly', isAuthenticated: true, roles: ['editor'] } as ActorContext;
const BOB = { username: 'bob', isAuthenticated: true, roles: ['editor'] } as ActorContext;
const ADMIN = { username: 'admin', isAuthenticated: true, roles: ['admin'] } as ActorContext;
const PDF = Buffer.from('%PDF-1.4 lab results: cholesterol 180');
const FILE = { originalName: 'labs.pdf', mimeType: 'application/pdf', size: PDF.length };
const DIARY = formatPrivatePageName('molly', STORE, 'Diary');

describe('AttachmentManager — files in an unencrypted private store (#1460)', () => {
  let tmp: string;
  let storageDir: string;
  let pagesDir: string;
  let manager: AttachmentManager;
  let provider: BasicAttachmentProvider;
  let audit: ReturnType<typeof vi.fn>;

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
    audit = vi.fn().mockResolvedValue('evt');
    const pageOwner = (name: string) =>
      (name === DIARY ? { creator: 'molly', store: STORE } : null);
    const managers: Record<string, unknown> = {
      ConfigurationManager: configManager,
      PolicyDecisionPoint: { permits: () => Promise.resolve(true) },
      AuditManager: { logAuditEvent: audit, flushAuditQueue: () => Promise.resolve() },
      PageManager: { getPrivatePageOwner: (name: string) => Promise.resolve(pageOwner(name)) },
      // The container rule itself — owner or delegate, never a role.
      PolicyInformationPoint: {
        canAccessPrivateContainer: (subject: ActorContext, owner: string) => mayActInPrivateContainer(subject, owner),
        canUserAccessPage: (subject: ActorContext, name: string) => {
          const where = pageOwner(name);
          return Promise.resolve(where ? mayActInPrivateContainer(subject, where.creator) : true);
        }
      }
    };
    return { getManager: (name: string) => managers[name] ?? null } as never;
  }

  /** A store for `user` with `encrypt: false` — no key anywhere. */
  async function plainStoreFor(user: string) {
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, user, STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, user, STORE), { kind: STORE, encrypt: false, created: '2026-09-24T00:00:00.000Z' });
  }

  const upload = (bytes = PDF, ctx = MOLLY, pageName?: string) =>
    manager.uploadAttachment(bytes, { ...FILE, size: bytes.length }, ctx, {
      private: true,
      store: STORE,
      description: 'labs',
      ...(pageName ? { pageName } : {})
    });

  const attachmentsDir = (user = 'molly') => path.join(pagesDir, 'private', user, STORE, 'attachments');
  const globalMetadata = async () => {
    const file = path.join(storageDir, 'attachment-metadata.json');
    return (await fs.pathExists(file)) ? await fs.readFile(file, 'utf8') : '';
  };

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'att-plain-'));
    storageDir = path.join(tmp, 'attachments');
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(storageDir);
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
    const engine = makeEngine();
    manager = new AttachmentManager(engine);
    provider = new BasicAttachmentProvider(engine);
    await provider.initialize();
    (manager as unknown as { attachmentProvider: unknown }).attachmentProvider = provider;
    await plainStoreFor('molly');
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  test('an upload onto a private page lands in that store, named in no global index', async () => {
    const stored = await manager.uploadAttachment(PDF, FILE, MOLLY, { pageName: DIARY, description: 'labs' });

    // A {uuid}.ext name in the store's own attachments folder, not a content hash.
    expect(stored.identifier).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(await fs.readdir(attachmentsDir())).toEqual([`${stored.identifier}.pdf`]);
    expect(await fs.readdir(storageDir)).not.toContain(`${stored.identifier}.pdf`);

    // Listed in the store's own index, and in no global file.
    const index = JSON.parse(await fs.readFile(storeFileIndexPath(pagesDir, 'molly', STORE), 'utf8')) as {
      files: Record<string, { name: string; mentions: string[] }>;
    };
    expect(index.files[stored.identifier]).toMatchObject({ name: 'labs.pdf', mentions: [DIARY] });
    const global = await globalMetadata();
    expect(global.includes('labs.pdf')).toBe(false);
    expect(global.includes(stored.identifier)).toBe(false);
    expect(await provider.getAttachmentMetadata(stored.identifier)).toBeNull();
  });

  test('the owner browses, searches and downloads it — another user and an admin cannot', async () => {
    const stored = await upload(PDF, MOLLY, DIARY);
    // Bob has a plain store of his own, so "sees nothing" is the container
    // rule at work and not simply an absent folder.
    await plainStoreFor('bob');
    await plainStoreFor('admin');

    // Browse / list.
    expect((await manager.getAllAttachments(MOLLY)).map((a) => a.identifier)).toEqual([stored.identifier]);
    expect(await manager.getAllAttachments(BOB)).toEqual([]);
    expect(await manager.getAllAttachments(ADMIN)).toEqual([]);

    // The page's attached files.
    expect((await manager.getAttachmentsForPage(DIARY, MOLLY)).map((a) => a.identifier)).toEqual([stored.identifier]);
    expect(await manager.getAttachmentsForPage(DIARY, BOB)).toEqual([]);
    expect(await manager.getAttachmentsForPage(DIARY, ADMIN)).toEqual([]);

    // Asset search.
    expect((await manager.searchPrivateStoreAttachments({ query: 'labs' }, MOLLY)).map((r) => r.id))
      .toEqual([stored.identifier]);
    expect(await manager.searchPrivateStoreAttachments({ query: 'labs' }, BOB)).toEqual([]);
    expect(await manager.searchPrivateStoreAttachments({ query: 'labs' }, ADMIN)).toEqual([]);

    // Download — the bytes themselves.
    expect((await manager.getPrivateStoreAttachment(stored.identifier, MOLLY))?.buffer.equals(PDF)).toBe(true);
    expect(await manager.getPrivateStoreAttachment(stored.identifier, BOB)).toBeNull();
    expect(await manager.getPrivateStoreAttachment(stored.identifier, ADMIN)).toBeNull();

    // And the shared pool never learns of it, for anyone.
    expect(await manager.getSharedPoolAttachments()).toEqual([]);
    expect(await manager.getAttachmentByFilename('labs.pdf', BOB)).toBeNull();
    expect(await manager.getAttachmentByFilename('labs.pdf', ADMIN)).toBeNull();
  });

  test('ownership is the whole of it: an anonymous visitor and a share visitor reach nothing', async () => {
    const stored = await upload(PDF, MOLLY, DIARY);
    const anonymous = { username: 'molly', isAuthenticated: false, roles: ['anonymous'] } as ActorContext;
    const shareVisitor = {
      username: 'Anonymous',
      isAuthenticated: false,
      roles: ['anonymous'],
      viaShare: { id: 's1', issuer: 'molly', actions: ['asset-read'], resources: [] }
    } as unknown as ActorContext;

    // A plain store's bytes are readable on disk — the only thing between them
    // and a caller is the container rule, so a caller who does not own the
    // container gets nothing even while naming its owner.
    for (const who of [anonymous, shareVisitor]) {
      expect(await manager.getPrivateStoreAttachment(stored.identifier, who)).toBeNull();
      expect(await manager.getAllAttachments(who)).toEqual([]);
      expect(await manager.getAttachmentsForPage(DIARY, who)).toEqual([]);
    }
  });

  test('a private upload of bytes that already exist publicly lands in the store, not the public record', async () => {
    const publicCopy = await manager.uploadAttachment(PDF, FILE, MOLLY, { description: 'public copy' });
    expect(publicCopy.identifier).toBe(crypto.createHash('sha256').update(PDF).digest('hex'));

    const priv = await upload();

    // A new record in the store, not the public one handed back.
    expect(priv.identifier).not.toBe(publicCopy.identifier);
    expect((await fs.readdir(attachmentsDir())).map((f) => f.replace(/\.pdf$/, ''))).toEqual([priv.identifier]);
    expect((await manager.getPrivateStoreAttachment(priv.identifier, MOLLY))?.buffer.equals(PDF)).toBe(true);

    // The public record is untouched, and the store's file is not named beside it.
    expect((await manager.getSharedPoolAttachments()).map((a) => a.identifier)).toEqual([publicCopy.identifier]);
    expect((await globalMetadata()).includes(priv.identifier)).toBe(false);
  });

  test('the same bytes twice in one store: one file, one id', async () => {
    const first = await upload();
    const second = await upload();

    expect(second.identifier).toBe(first.identifier);
    expect(await fs.readdir(attachmentsDir())).toHaveLength(1);
  });

  test('delete removes the bytes and the store index entry — and nobody else can', async () => {
    const stored = await upload(PDF, MOLLY, DIARY);

    expect(await manager.deleteAttachment(stored.identifier, BOB)).toBe(false);
    expect(await manager.deleteAttachment(stored.identifier, ADMIN)).toBe(false);
    expect(await fs.readdir(attachmentsDir())).toHaveLength(1);

    audit.mockClear();
    expect(await manager.deleteAttachment(stored.identifier, MOLLY)).toBe(true);
    expect(await fs.readdir(attachmentsDir())).toEqual([]);
    expect(await manager.getPrivateStoreAttachment(stored.identifier, MOLLY)).toBeNull();
    const index = JSON.parse(await fs.readFile(storeFileIndexPath(pagesDir, 'molly', STORE), 'utf8')) as {
      files: Record<string, unknown>;
    };
    expect(index.files).toEqual({});
    expect(audit).toHaveBeenCalled();
  });

  test('a thumbnail of a private file is rendered for its owner only, and never cached in the shared folder', async () => {
    const png = await (await import('sharp')).default({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } }
    }).png().toBuffer();
    const stored = await manager.uploadAttachment(
      png,
      { originalName: 'chart.png', mimeType: 'image/png', size: png.length },
      MOLLY,
      { private: true, store: STORE, description: 'chart' }
    );

    const thumb = await manager.getThumbnail(stored.identifier, '16x16', MOLLY);
    expect(thumb && thumb.length > 0).toBe(true);
    expect(await manager.getThumbnail(stored.identifier, '16x16', BOB)).toBeNull();
    expect(await manager.getThumbnail(stored.identifier, '16x16', ADMIN)).toBeNull();

    // The shared .thumbs folder holds nothing of it.
    const thumbs = path.join(storageDir, '.thumbs');
    const cached = (await fs.pathExists(thumbs)) ? await fs.readdir(thumbs) : [];
    expect(cached.filter((f) => f.startsWith(stored.identifier))).toEqual([]);
  });
});

describe('AttachmentManager — the move out of the shared index (#1460 migration)', () => {
  let tmp: string;
  let storageDir: string;
  let pagesDir: string;
  let manager: AttachmentManager;
  let provider: BasicAttachmentProvider;

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
      PolicyDecisionPoint: { permits: () => Promise.resolve(true) },
      AuditManager: { logAuditEvent: vi.fn().mockResolvedValue('evt'), flushAuditQueue: () => Promise.resolve() },
      PageManager: {
        getPrivatePageOwner: (name: string) =>
          Promise.resolve(name === DIARY ? { creator: 'molly', store: STORE } : null)
      },
      PolicyInformationPoint: {
        canAccessPrivateContainer: (subject: ActorContext, owner: string) => mayActInPrivateContainer(subject, owner)
      }
    };
    return { getManager: (name: string) => managers[name] ?? null } as never;
  }

  /**
   * A pre-#1460 world: the record in the shared index.
   *
   * `flagged` is #1398's `isPrivate`/`creator`/`store`, and with it #1386 had
   * already put the bytes in the store folder — so the migration moves the
   * record and leaves the file alone. Without it the record looks public, so
   * its bytes are in the shared storage folder and the migration has to move
   * them too, under the name they already have.
   */
  async function legacyPrivateRecord(opts: { flagged: boolean }) {
    const id = crypto.createHash('sha256').update(PDF).digest('hex');
    const fileName = `${id}.pdf`;
    const bytesAt = opts.flagged
      ? path.join(pagesDir, 'private', 'molly', STORE, 'attachments', fileName)
      : path.join(storageDir, fileName);
    await fs.ensureDir(path.dirname(bytesAt));
    await fs.writeFile(bytesAt, PDF);
    await fs.writeJson(path.join(storageDir, 'attachment-metadata.json'), {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'ngdpbase Attachments',
      description: 'Metadata for all attachments in the wiki',
      attachments: [{
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        identifier: id,
        name: 'labs.pdf',
        description: 'labs',
        author: { '@type': 'Person', name: 'molly' },
        dateCreated: '2026-01-01T00:00:00.000Z',
        dateModified: '2026-01-02T00:00:00.000Z',
        encodingFormat: 'application/pdf',
        contentSize: PDF.length,
        url: `/attachments/${id}`,
        storageLocation: bytesAt,
        mentions: [{ '@type': 'Thing', name: DIARY, url: `/view/${encodeURIComponent(DIARY)}` }],
        ...(opts.flagged ? { isPrivate: true, creator: 'molly', store: STORE } : {})
      }]
    });
    return { id, fileName };
  }

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'att-migrate-'));
    storageDir = path.join(tmp, 'attachments');
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(storageDir);
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
    await fs.ensureDir(path.join(pagesDir, 'private', 'molly', STORE));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', STORE), { kind: STORE, encrypt: false, created: '2026-01-01T00:00:00.000Z' });
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  async function start() {
    const engine = makeEngine();
    manager = new AttachmentManager(engine);
    provider = new BasicAttachmentProvider(engine);
    await provider.initialize();
    (manager as unknown as { attachmentProvider: unknown }).attachmentProvider = provider;
  }

  test('moves the record into its store, keeps the file name, and is idempotent', async () => {
    const { id, fileName } = await legacyPrivateRecord({ flagged: true });
    await start();

    expect(await manager.migratePrivateFilesIntoStores(MOLLY)).toBe(1);

    // Out of the shared index, in the store's own — under the id it already had.
    const global = await fs.readFile(path.join(storageDir, 'attachment-metadata.json'), 'utf8');
    expect(global.includes('labs.pdf')).toBe(false);
    expect(global.includes(id)).toBe(false);
    const index = JSON.parse(await fs.readFile(storeFileIndexPath(pagesDir, 'molly', STORE), 'utf8')) as {
      files: Record<string, { fileName: string; name: string; mentions: string[]; description: string; author?: string }>;
    };
    expect(index.files[id]).toMatchObject({
      fileName, name: 'labs.pdf', description: 'labs', author: 'molly', mentions: [DIARY]
    });

    // The file on disk keeps the name it had — nothing was renamed.
    expect(await fs.readdir(path.join(pagesDir, 'private', 'molly', STORE, 'attachments'))).toEqual([fileName]);

    // And the owner reaches it by the same id its `/attachments/{id}` URL uses.
    expect((await manager.getPrivateStoreAttachment(id, MOLLY))?.buffer.equals(PDF)).toBe(true);
    expect(await manager.getPrivateStoreAttachment(id, BOB)).toBeNull();

    // Idempotent: a second run has nothing left to move and changes nothing.
    expect(await manager.migratePrivateFilesIntoStores(MOLLY)).toBe(0);
    expect(await fs.readdir(path.join(pagesDir, 'private', 'molly', STORE, 'attachments'))).toEqual([fileName]);
    const again = JSON.parse(await fs.readFile(storeFileIndexPath(pagesDir, 'molly', STORE), 'utf8')) as {
      files: Record<string, unknown>;
    };
    expect(Object.keys(again.files)).toEqual([id]);
  });

  test('a record with no isPrivate flag is placed from the private page it is attached to, bytes and all', async () => {
    const { id, fileName } = await legacyPrivateRecord({ flagged: false });
    await start();
    expect(await fs.readdir(storageDir)).toContain(fileName);

    expect(await manager.migratePrivateFilesIntoStores(MOLLY)).toBe(1);

    const index = JSON.parse(await fs.readFile(storeFileIndexPath(pagesDir, 'molly', STORE), 'utf8')) as {
      files: Record<string, { fileName: string }>;
    };
    expect(index.files[id]).toMatchObject({ fileName });
    expect((await fs.readFile(path.join(storageDir, 'attachment-metadata.json'), 'utf8')).includes(id)).toBe(false);

    // The bytes moved into the store under the name they already had, and the
    // shared storage folder no longer holds them.
    expect(await fs.readdir(path.join(pagesDir, 'private', 'molly', STORE, 'attachments'))).toEqual([fileName]);
    expect(await fs.readdir(storageDir)).not.toContain(fileName);
    expect((await manager.getPrivateStoreAttachment(id, MOLLY))?.buffer.equals(PDF)).toBe(true);
  });

  test('a public attachment stays in the shared pool', async () => {
    const id = crypto.createHash('sha256').update(PDF).digest('hex');
    await fs.writeFile(path.join(storageDir, `${id}.pdf`), PDF);
    await fs.writeJson(path.join(storageDir, 'attachment-metadata.json'), {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'ngdpbase Attachments',
      description: 'Metadata for all attachments in the wiki',
      attachments: [{
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        identifier: id,
        name: 'public.pdf',
        dateCreated: '2026-01-01T00:00:00.000Z',
        dateModified: '2026-01-01T00:00:00.000Z',
        encodingFormat: 'application/pdf',
        contentSize: PDF.length,
        url: `/attachments/${id}`,
        storageLocation: path.join(storageDir, `${id}.pdf`),
        mentions: [{ '@type': 'Thing', name: 'Welcome', url: '/view/Welcome' }]
      }]
    });
    await start();

    expect(await manager.migratePrivateFilesIntoStores(MOLLY)).toBe(0);
    expect((await manager.getSharedPoolAttachments()).map((a) => a.identifier)).toEqual([id]);
    expect(await fs.readdir(storageDir)).toContain(`${id}.pdf`);
    // No store was touched: nothing public goes into anybody's container.
    expect(await fs.pathExists(storeFileIndexPath(pagesDir, 'molly', STORE))).toBe(false);
  });
});
