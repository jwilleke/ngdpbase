/**
 * FileManager, the read-only files door (#1852, epic #1851).
 *
 * A real FileManager over a real AttachmentManager and BasicAttachmentProvider
 * in a temp directory: today's attachments shown as file records, the shared
 * pool as the public place and each vault the requester may read. The access
 * rules are the existing ones, asked at the door: `asset-read` for the public
 * place (the PDP), the container rule for a vault (the PIP).
 */

vi.unmock('../../providers/BasicAttachmentProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import AttachmentManager from '../AttachmentManager';
import FileManager from '../FileManager';
import BasicAttachmentProvider from '../../providers/BasicAttachmentProvider';
import { storeMetaPath } from '../../utils/privateStorePath';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
import { clearUnlockedPrivateStores } from '../../utils/privateStoreUnlock';
import type { ActorContext } from '../../context/ActorContext';

const MOLLY = { username: 'molly', isAuthenticated: true, roles: ['editor'] } as ActorContext;
const BOB = { username: 'bob', isAuthenticated: true, roles: ['editor'] } as ActorContext;
const ADMIN = { username: 'admin', isAuthenticated: true, roles: ['admin'] } as ActorContext;
const NOBODY = { username: 'Anonymous', isAuthenticated: false, roles: ['anonymous'] } as ActorContext;

const CATEGORIES = {
  general: { label: 'general', default: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/default/' } },
  phr: { label: 'phr', default: false, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/phr/' } }
};

const PNG = Buffer.from('\x89PNG route map for the walk');
const PDF = Buffer.from('%PDF-1.4 lab results: cholesterol 180');

describe('FileManager — today\'s attachments as file records (#1852)', () => {
  let tmp: string;
  let storageDir: string;
  let pagesDir: string;
  let attachments: AttachmentManager;
  let files: FileManager;
  /** Who the PDP grants `asset-read` to. */
  let mayRead: Set<string>;

  function makeEngine() {
    const configManager = {
      getProperty: (key: string, def: unknown) => {
        if (key === 'ngdpbase.system-category') return CATEGORIES;
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
        permits: (subject: ActorContext, action: string) =>
          Promise.resolve(action === 'asset-upload' || (action === 'asset-read' && mayRead.has(subject.username))),
        decide: () => Promise.resolve({ permit: true })
      },
      AuditManager: { logAuditEvent: vi.fn().mockResolvedValue('evt'), flushAuditQueue: () => Promise.resolve() },
      PageManager: { getPrivatePageOwner: () => Promise.resolve(null) },
      PolicyInformationPoint: {
        canAccessPrivateContainer: (subject: ActorContext, owner: string) => mayActInPrivateContainer(subject, owner),
        canUserAccessPage: () => Promise.resolve(true)
      }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    return { engine, managers };
  }

  async function plainVaultFor(user: string, vault: string) {
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, user, vault)));
    await fs.writeJson(storeMetaPath(pagesDir, user, vault), { kind: vault, encrypt: false, created: '2026-10-20T00:00:00.000Z' });
  }

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'files-door-'));
    storageDir = path.join(tmp, 'attachments');
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(storageDir);
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
    mayRead = new Set(['molly', 'bob', 'admin']);
    const { engine, managers } = makeEngine();
    attachments = new AttachmentManager(engine);
    const provider = new BasicAttachmentProvider(engine);
    await provider.initialize();
    (attachments as unknown as { attachmentProvider: unknown }).attachmentProvider = provider;
    managers.AttachmentManager = attachments;
    files = new FileManager(engine);
    managers.FileManager = files;
    await files.initialize();
    await plainVaultFor('molly', 'default');
    await plainVaultFor('molly', 'phr');
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  /** Pool records as they are stored, then re-read by the provider. */
  async function seedPool(records: Array<{ id: string; name: string; author?: string; editor?: string; type?: string; pages?: string[] }>) {
    await fs.writeJson(path.join(storageDir, 'attachment-metadata.json'), {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'attachments',
      description: 'fixture',
      attachments: records.map((r) => ({
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        identifier: r.id,
        name: r.name,
        description: `about ${r.name}`,
        ...(r.author ? { author: { '@type': 'Person', name: r.author } } : {}),
        ...(r.editor ? { editor: { '@type': 'Person', name: r.editor } } : {}),
        dateCreated: '2026-01-02T03:04:05.000Z',
        dateModified: '2026-02-03T04:05:06.000Z',
        encodingFormat: r.type ?? 'image/png',
        contentSize: 1234,
        url: `/attachments/${r.id}`,
        storageLocation: path.join(storageDir, `${r.id}.png`),
        documentKeywords: ['walk'],
        mentions: (r.pages ?? []).map((name) => ({ '@type': 'WebPage', name, url: `/view/${encodeURIComponent(name)}` }))
      }))
    });
    await (attachments.provider as unknown as BasicAttachmentProvider).initialize();
  }

  test('a pool attachment is a public file: owner, category and the asset record\'s fields', async () => {
    await seedPool([{ id: 'a1', name: 'route.png', author: 'molly', editor: 'bob', pages: ['Walk'] }]);

    // Exactly the record's fields: no provider id, snippet or EXIF bag.
    expect(await files.list(MOLLY)).toEqual([{
      id: 'a1',
      filename: 'route.png',
      description: 'about route.png',
      keywords: ['walk'],
      encodingFormat: 'image/png',
      contentSize: 1234,
      url: '/attachments/a1',
      mentions: ['Walk'],
      dateCreated: '2026-01-02T03:04:05.000Z',
      author: 'molly',
      dateModified: '2026-02-03T04:05:06.000Z',
      editor: 'bob',
      place: { kind: 'public' },
      owner: 'molly',
      systemCategory: 'general'
    }]);
  });

  test('a public record that names no user has no owner', async () => {
    // As legacy records were stored: `Unknown`, an email used as a name, or no author at all.
    await seedPool([
      { id: 'u1', name: 'a.png', author: 'Unknown' },
      { id: 'u2', name: 'b.png', author: 'molly@example.com' },
      { id: 'u3', name: 'c.png' }
    ]);
    expect((await files.list(MOLLY)).map((r) => [r.id, r.author ?? null, r.owner])).toEqual(expect.arrayContaining([
      ['u1', 'Unknown', null],
      ['u2', 'molly@example.com', null],
      ['u3', null, null]
    ]));
  });

  test('a vault attachment is a file in that vault: owned by the vault\'s owner, the category that declares the vault', async () => {
    const labs = await attachments.uploadAttachment(PDF, { originalName: 'labs.pdf', mimeType: 'application/pdf', size: PDF.length }, MOLLY, {
      private: true, store: 'phr', description: 'labs'
    });
    const note = await attachments.uploadAttachment(PNG, { originalName: 'note.png', mimeType: 'image/png', size: PNG.length }, MOLLY, {
      private: true, store: 'default'
    });

    const byId = new Map((await files.list(MOLLY)).map((f) => [f.id, f]));
    expect(byId.get(labs.identifier)).toMatchObject({
      filename: 'labs.pdf',
      encodingFormat: 'application/pdf',
      contentSize: PDF.length,
      place: { kind: 'vault', owner: 'molly', vault: 'phr' },
      owner: 'molly',
      author: 'molly',
      systemCategory: 'phr'
    });
    expect(byId.get(note.identifier)).toMatchObject({ place: { kind: 'vault', owner: 'molly', vault: 'default' }, systemCategory: 'general' });

    expect((await files.list(MOLLY, { place: { kind: 'vault', owner: 'molly', vault: 'phr' } })).map((f) => f.id)).toEqual([labs.identifier]);
    expect(await files.get(labs.identifier, MOLLY)).toMatchObject({ filename: 'labs.pdf' });
    expect((await files.findByName('labs.pdf', MOLLY)).map((f) => f.id)).toEqual([labs.identifier]);
  });

  test('a viewer never sees another person\'s vault: not listed, not by id, not by name', async () => {
    const labs = await attachments.uploadAttachment(PDF, { originalName: 'labs.pdf', mimeType: 'application/pdf', size: PDF.length }, MOLLY, {
      private: true, store: 'phr'
    });
    const pub = await attachments.uploadAttachment(PNG, { originalName: 'route.png', mimeType: 'image/png', size: PNG.length }, MOLLY, {});
    // Bob and the admin have vaults of their own, so "nothing" is the rule at work, not an absent folder.
    await plainVaultFor('bob', 'phr');
    await plainVaultFor('admin', 'phr');

    for (const who of [BOB, ADMIN]) {
      expect((await files.list(who)).map((f) => f.id)).toEqual([pub.identifier]);
      expect(await files.get(labs.identifier, who)).toBeNull();
      expect(await files.findByName('labs.pdf', who)).toEqual([]);
      expect(await files.list(who, { place: { kind: 'vault', owner: 'molly', vault: 'phr' } })).toEqual([]);
    }
  });

  test('without asset-read the public place shows nothing; an anonymous visitor reaches no vault', async () => {
    const pub = await attachments.uploadAttachment(PNG, { originalName: 'route.png', mimeType: 'image/png', size: PNG.length }, MOLLY, {});
    const labs = await attachments.uploadAttachment(PDF, { originalName: 'labs.pdf', mimeType: 'application/pdf', size: PDF.length }, MOLLY, {
      private: true, store: 'phr'
    });

    expect(await files.list(NOBODY)).toEqual([]);
    expect(await files.get(pub.identifier, NOBODY)).toBeNull();

    // Molly without asset-read: her own vault still, the public place not.
    mayRead.delete('molly');
    expect((await files.list(MOLLY)).map((f) => f.id)).toEqual([labs.identifier]);
    expect(await files.findByName('route.png', MOLLY)).toEqual([]);
  });

  test('the operator inventory is not on the engine\'s door', async () => {
    const operator = { username: 'jim', origin: 'operator', reason: 'test', requestedAt: new Date().toISOString() } as ActorContext;
    await expect(files.inventory(operator)).rejects.toThrow(/operator command only/);
    await expect(files.inventory(ADMIN)).rejects.toThrow(/operator command only/);
  });
});
