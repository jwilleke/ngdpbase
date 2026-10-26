/**
 * #1876 slice 1 — a backup holds the site's files as well as its records, and
 * a restore puts them back staged, at the next start, all or nothing:
 * attachment files (the shared pool and every vault's, as stored), role
 * membership, persons, organizations, and the footnotes and comments of
 * public pages, together with the databases (#1723).
 *
 * Real managers, real files, a real SQLite database; each test works in its
 * own temp directory and removes only that.
 */
vi.unmock('../../providers/SqliteDatabaseProvider');
vi.unmock('../../providers/BasicAttachmentProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decryptBuffer } from '../../utils/backupCrypto';
import { listTreeArchive, writeTreeArchive } from '../../utils/treeArchive';
import Database from 'better-sqlite3-multiple-ciphers';
import { applyInstanceEnvAtStart } from '../../utils/instanceEnvBackup';
import BackupManager from '../BackupManager';
import DatabaseManager, { BACKUP_KEY_ENV, DATABASE_KEY_ENV } from '../DatabaseManager';
import RoleManager from '../RoleManager';
import IdentityManager from '../IdentityManager';
import OrganizationManager from '../OrganizationManager';
import FootnoteManager from '../FootnoteManager';
import CommentManager from '../CommentManager';
import AttachmentManager from '../AttachmentManager';
import { sealBytes } from '../../utils/privateStoreCrypto';
import { manifestPath } from '../../providers/sqliteBackup';

const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };
type Db = InstanceType<typeof Database>;

/** Bytes no text encoding survives, sealed as a vault file is: what must come back unchanged. */
const SEALED = sealBytes(Buffer.alloc(32, 7), Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x01, 0x92, 0xc3, 0x28]));
const POOL_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10, 0x20]);
const ATTACHMENT_ID = 'a'.repeat(64);

const FILE_MANAGERS = ['OrganizationManager', 'IdentityManager', 'RoleManager', 'AttachmentManager', 'CommentManager', 'FootnoteManager'] as const;
/** The entries they are recorded under: IdentityManager keeps its `PersonManager` entry (#2038). */
const FILE_ENTRIES = FILE_MANAGERS.map((name) => (name === 'IdentityManager' ? 'PersonManager' : name));

describe('a site restore stages every part together (#1876)', () => {
  let dir: string;
  let fast: string;
  let slow: string;
  let notifications: Array<{ level: string; title: string; message: string }>;
  let audits: Array<Record<string, unknown>>;
  let auditDown: boolean;
  const saved = { db: process.env[DATABASE_KEY_ENV], backup: process.env[BACKUP_KEY_ENV] };

  const paths = () => ({
    roles: path.join(fast, 'roles'),
    persons: path.join(fast, 'persons'),
    organizations: path.join(fast, 'organizations'),
    footnotes: path.join(slow, 'footnotes'),
    comments: path.join(slow, 'comments'),
    pool: path.join(slow, 'attachments'),
    metadata: path.join(slow, 'attachments', 'attachment-metadata.json'),
    pages: path.join(slow, 'pages'),
    backups: path.join(slow, 'backups'),
    db: path.join(fast, 'ngdpbase.db'),
    siteRestore: path.join(fast, 'site-restore.json'),
    sealedVault: path.join(slow, 'pages', 'vaults', 'molly', 'health'),
    plainVault: path.join(slow, 'pages', 'vaults', 'molly', 'default')
  });

  /** A fresh set of managers over the same folders: one start of the site. */
  async function start(): Promise<{ managers: Record<string, unknown>; backup: BackupManager; database: DatabaseManager }> {
    const p = paths();
    // What bootstrap-env does before any manager: a staged .env goes in first (#1876).
    applyInstanceEnvAtStart(fast, p.siteRestore);
    const resolved: Record<string, string> = {
      'ngdpbase.application.roles.storagedir': p.roles,
      'ngdpbase.application.persons.storagedir': p.persons,
      'ngdpbase.application.organization.storagedir': p.organizations,
      'ngdpbase.footnotes.storagedir': p.footnotes,
      'ngdpbase.comments.storagedir': p.comments,
      'ngdpbase.attachment.provider.basic.storagedir': p.pool,
      'ngdpbase.attachment.metadatafile': p.metadata,
      'ngdpbase.page.provider.filesystem.storagedir': p.pages,
      'ngdpbase.backup.directory': p.backups,
      'ngdpbase.database.file': p.db,
      'ngdpbase.backup.restore-manifest': p.siteRestore
    };
    const props: Record<string, unknown> = {
      'ngdpbase.database.provider': 'sqlite',
      'ngdpbase.backup.max-backups': 10,
      'ngdpbase.attachment.maxsize': 10485760,
      'ngdpbase.attachment.allowedtypes': '',
      'ngdpbase.application-name': 'Test Site'
    };
    const configManager = {
      getProperty: (key: string, def: unknown) => (key in props ? props[key] : def),
      getResolvedDataPath: (key: string, def: string) => resolved[key] ?? path.join(fast, path.basename(def)),
      getInstanceDataFolder: () => fast,
      getAddonDatabaseDeclarations: () => [],
      setProperty: async () => undefined
    };
    const managers: Record<string, unknown> = {
      ConfigurationManager: configManager,
      NotificationManager: { notifyAdmins: async (n: { level: string; title: string; message: string }) => { notifications.push(n); return 'id'; } },
      AuditManager: {
        logAuditEvent: async (e: Record<string, unknown>) => { if (auditDown) throw new Error('audit sink down'); audits.push(e); return 'id'; },
        flushAuditQueue: async () => undefined
      }
    };
    const engine = {
      getManager: (n: string) => managers[n] ?? null,
      blockConfiguration: () => undefined,
      getRegisteredManagers: () => Object.keys(managers).filter((n) => !['ConfigurationManager', 'NotificationManager', 'AuditManager'].includes(n))
    };
    const database = new DatabaseManager(engine);
    managers.DatabaseManager = database;
    await database.initialize();
    const ctors = { OrganizationManager, IdentityManager, RoleManager, AttachmentManager, CommentManager, FootnoteManager };
    for (const name of FILE_MANAGERS) {
      const manager = new ctors[name](engine);
      managers[name] = manager;
      await manager.initialize();
    }
    const backup = new BackupManager(engine);
    managers.BackupManager = backup;
    await backup.initialize();
    await backup.reportRestoreAtBoot();
    return { managers, backup, database };
  }

  async function stop(site: { managers: Record<string, unknown> }): Promise<void> {
    for (const m of Object.values(site.managers)) await (m as { shutdown?: () => Promise<void> }).shutdown?.();
  }

  /** The site as it was when backed up: one of everything. */
  function seed(): void {
    const p = paths();
    for (const d of [p.roles, p.persons, p.organizations, p.footnotes, p.comments, p.pool, p.backups, p.sealedVault, p.plainVault]) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(p.organizations, 'acme.json'), JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', '@id': 'https://acme.example/#org', name: 'Acme' }));
    fs.writeFileSync(path.join(p.persons, 'alice.json'), JSON.stringify({ '@context': 'https://schema.org', '@type': 'Person', '@id': 'https://acme.example/people/alice#person', identifier: 'alice', name: 'Alice' }));
    fs.writeFileSync(path.join(p.roles, 'editor.json'), JSON.stringify({ '@context': 'https://schema.org', '@type': 'OrganizationRole', '@id': 'https://acme.example/roles/editor#role', namedPosition: 'editor', organization: { '@id': 'https://acme.example/#org' }, member: [{ '@id': 'https://acme.example/people/alice#person' }] }));
    fs.writeFileSync(path.join(p.footnotes, 'page-1.json'), JSON.stringify({ f1: { id: 'f1', display: '1', url: '', note: 'the original note', createdBy: 'alice', createdAt: '2026-10-01T00:00:00Z' } }));
    fs.mkdirSync(path.join(p.comments, 'page-1'));
    fs.writeFileSync(path.join(p.comments, 'page-1', 'c1.json'), JSON.stringify({ id: 'c1', pageUuid: 'page-1', author: 'alice', authorDisplayName: 'Alice', content: 'the original comment', createdAt: '2026-10-01T00:00:00Z' }));
    // The shared pool: a file, its metadata and a thumbnail (made again on demand, so not backed up).
    fs.writeFileSync(path.join(p.pool, `${ATTACHMENT_ID}.png`), POOL_BYTES);
    fs.mkdirSync(path.join(p.pool, '.thumbs'));
    fs.writeFileSync(path.join(p.pool, '.thumbs', `${ATTACHMENT_ID}-thumb.jpg`), 'thumb');
    fs.writeFileSync(p.metadata, JSON.stringify({
      '@context': 'https://schema.org', '@type': 'ItemList', name: 'ngdpbase Attachments', description: '',
      attachments: [{ '@context': 'https://schema.org', '@type': 'CreativeWork', identifier: ATTACHMENT_ID, name: 'logo.png', dateCreated: '2026-10-01T00:00:00Z', dateModified: '2026-10-01T00:00:00Z', encodingFormat: 'image/png', contentSize: POOL_BYTES.length, storageLocation: path.join(p.pool, `${ATTACHMENT_ID}.png`), mentions: [] }]
    }));
    // A sealed vault's file and index: sealed bytes, never decrypted.
    fs.writeFileSync(path.join(p.sealedVault, 'store.json'), JSON.stringify({ kind: 'vault', encrypt: true }));
    fs.mkdirSync(path.join(p.sealedVault, 'attachments'));
    fs.writeFileSync(path.join(p.sealedVault, 'attachments', 'scan.pdf'), SEALED);
    fs.writeFileSync(path.join(p.sealedVault, 'files-index.json'), SEALED);
    // A plain vault's file.
    fs.writeFileSync(path.join(p.plainVault, 'store.json'), JSON.stringify({ kind: 'vault', encrypt: false }));
    fs.mkdirSync(path.join(p.plainVault, 'attachments'));
    fs.writeFileSync(path.join(p.plainVault, 'attachments', 'note.txt'), 'plain vault file');
  }

  /** What happens after the backup: everything changes, so a restore has something to undo. */
  function change(site: { database: DatabaseManager }): void {
    const p = paths();
    fs.writeFileSync(path.join(p.roles, 'editor.json'), JSON.stringify({ '@context': 'https://schema.org', '@type': 'OrganizationRole', '@id': 'https://acme.example/roles/editor#role', namedPosition: 'editor', organization: { '@id': 'https://acme.example/#org' }, member: [] }));
    fs.writeFileSync(path.join(p.persons, 'mallory.json'), JSON.stringify({ '@type': 'Person', '@id': 'https://acme.example/people/mallory#person', identifier: 'mallory' }));
    fs.writeFileSync(path.join(p.organizations, 'other.json'), JSON.stringify({ '@type': 'Organization', '@id': 'https://other.example/#org', name: 'Other' }));
    fs.writeFileSync(path.join(p.footnotes, 'page-1.json'), JSON.stringify({}));
    fs.rmSync(path.join(p.comments, 'page-1'), { recursive: true });
    fs.rmSync(path.join(p.pool, `${ATTACHMENT_ID}.png`));
    fs.writeFileSync(path.join(p.sealedVault, 'attachments', 'scan.pdf'), sealBytes(Buffer.alloc(32, 9), Buffer.from('later')));
    site.database.getHandle<Db>().prepare('INSERT INTO notes (body) VALUES (?)').run('after the backup');
  }

  /** Every staged, set-aside or kept path anywhere under the test's folders. */
  function leftovers(suffix: RegExp): string[] {
    return (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => suffix.test(f)).sort();
  }

  /** The backup document as text: decrypted under the backup key (#1561), then unzipped. */
  async function documentText(file: string): Promise<string> {
    return gunzipSync(await decryptBuffer(fs.readFileSync(file), process.env[BACKUP_KEY_ENV])).toString('utf8');
  }

  async function backupDocument(file: string): Promise<{ managers: Record<string, Record<string, unknown>> }> {
    return JSON.parse(await documentText(file));
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1876-'));
    fast = path.join(dir, 'fast');
    slow = path.join(dir, 'slow');
    fs.mkdirSync(fast);
    fs.mkdirSync(slow);
    notifications = [];
    audits = [];
    auditDown = false;
    process.env[DATABASE_KEY_ENV] = 'database-key-not-a-secret';
    process.env[BACKUP_KEY_ENV] = 'backup-key-not-a-secret';
    seed();
  });

  afterEach(() => {
    for (const [env, value] of [[DATABASE_KEY_ENV, saved.db], [BACKUP_KEY_ENV, saved.backup]] as const) {
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
    // Only this test's own temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function backedUp(): Promise<{ site: Awaited<ReturnType<typeof start>>; file: string }> {
    const site = await start();
    site.database.getHandle<Db>().exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
    site.database.getHandle<Db>().prepare('INSERT INTO notes (body) VALUES (?)').run('in the backup');
    const file = await site.backup.createBackup(CTX, { filename: '2026-10-19T00-00-00-000Z-ngdpbase-backup.json.gz' });
    return { site, file };
  }

  test('each part is in the backup, as files beside the document — never in it', async () => {
    const { site, file } = await backedUp();
    const p = paths();
    const doc = await backupDocument(file);
    const stem = '2026-10-19T00-00-00-000Z-ngdpbase-backup';
    for (const [manager, part] of [['RoleManager', 'roles'], ['PersonManager', 'persons'], ['OrganizationManager', 'organizations'], ['FootnoteManager', 'footnotes'], ['CommentManager', 'comments']]) {
      expect(doc.managers[manager].data).toMatchObject({ format: 1, archive: `${stem}.${part}.tar.enc`, keyFingerprint: expect.any(String) });
    }
    expect(doc.managers.AttachmentManager.files).toMatchObject({ pool: { archive: `${stem}.attachments.tar.enc`, files: 1 }, vaults: { archive: `${stem}.vault-attachments.tar.enc`, stores: ['molly/default', 'molly/health'] } });
    // No file's bytes in the document: no base64 of any of them.
    const text = await documentText(file);
    for (const bytes of [POOL_BYTES, SEALED]) expect(text).not.toContain(bytes.toString('base64'));
    expect(text).not.toContain('the original comment');

    const entries = async (archive: string): Promise<string[]> => {
      const out: string[] = [];
      await listTreeArchive(path.join(p.backups, archive), (e) => { out.push(e.path); }, { backupKey: process.env[BACKUP_KEY_ENV] });
      return out.sort();
    };
    expect(await entries(`${stem}.roles.tar.enc`)).toEqual(['editor.json']);
    expect(await entries(`${stem}.comments.tar.enc`)).toEqual(['page-1/', 'page-1/c1.json']);
    // The pool without its thumbnails or the metadata the document already holds.
    expect(await entries(`${stem}.attachments.tar.enc`)).toEqual([`${ATTACHMENT_ID}.png`]);
    expect(await entries(`${stem}.vault-attachments.tar.enc`)).toEqual([
      'vaults/molly/default/attachments/', 'vaults/molly/default/attachments/note.txt',
      'vaults/molly/health/attachments/', 'vaults/molly/health/attachments/scan.pdf', 'vaults/molly/health/files-index.json'
    ]);
    // Listed with the backup, downloaded with it, pruned with it.
    const stored = await site.backup.findStoredBackup(path.basename(file));
    expect(stored?.parts).toEqual(['attachments', 'comments', 'env', 'footnotes', 'organizations', 'persons', 'roles', 'vault-attachments']);
    expect(stored?.databases).toEqual(['application']);
    const tarEntries: string[] = [];
    const { stream } = await site.backup.backupArchive(path.basename(file));
    const { Parser } = await import('tar');
    await new Promise<void>((resolve, reject) => {
      const parser = new Parser({ onReadEntry: (e) => { tarEntries.push(e.path); e.resume(); } });
      parser.on('end', () => resolve());
      parser.on('error', reject);
      stream.pipe(parser);
    });
    expect(tarEntries).toEqual(expect.arrayContaining([path.basename(file), `${stem}.attachments.tar.enc`, `${stem}.roles.tar.enc`, `${stem}.vault-attachments.tar.enc`, `${stem}.application.db`]));
    await stop(site);
  });

  test('a restore stages every part, changes nothing live, and the next start applies them all — vault bytes unchanged', async () => {
    const { site, file } = await backedUp();
    const p = paths();
    change(site);
    const results = await site.backup.restoreFromFile(CTX, file);
    expect(results.failed).toEqual([]);
    expect(results.success).toEqual(expect.arrayContaining(['DatabaseManager', ...FILE_ENTRIES]));
    expect(notifications.map((n) => n.title)).toContain('A site restore is staged');
    // Staged, not applied: the live data still has every change.
    expect(JSON.parse(fs.readFileSync(path.join(p.roles, 'editor.json'), 'utf8')).member).toEqual([]);
    expect(fs.existsSync(path.join(p.pool, `${ATTACHMENT_ID}.png`))).toBe(false);
    expect(fs.existsSync(`${p.roles}.staged`)).toBe(true);
    expect(JSON.parse(fs.readFileSync(p.siteRestore, 'utf8'))).toMatchObject({ state: 'staged' });
    await stop(site);

    const restarted = await start();
    expect(JSON.parse(fs.readFileSync(path.join(p.roles, 'editor.json'), 'utf8')).member).toEqual([{ '@id': 'https://acme.example/people/alice#person' }]);
    const roles = await (restarted.managers.RoleManager as RoleManager).list();
    expect(roles.map((r) => r.namedPosition)).toEqual(['editor']);
    expect(fs.readdirSync(p.persons)).toEqual(['alice.json']);
    expect(fs.readdirSync(p.organizations)).toEqual(['acme.json']);
    expect(JSON.parse(fs.readFileSync(path.join(p.footnotes, 'page-1.json'), 'utf8')).f1.note).toBe('the original note');
    expect(JSON.parse(fs.readFileSync(path.join(p.comments, 'page-1', 'c1.json'), 'utf8')).content).toBe('the original comment');
    expect(fs.readFileSync(path.join(p.pool, `${ATTACHMENT_ID}.png`)).equals(POOL_BYTES)).toBe(true);
    expect(JSON.parse(fs.readFileSync(p.metadata, 'utf8')).attachments[0].identifier).toBe(ATTACHMENT_ID);
    // The vault's file comes back byte for byte, still sealed.
    expect(fs.readFileSync(path.join(p.sealedVault, 'attachments', 'scan.pdf')).equals(SEALED)).toBe(true);
    expect(fs.readFileSync(path.join(p.sealedVault, 'files-index.json')).equals(SEALED)).toBe(true);
    expect(fs.readFileSync(path.join(p.plainVault, 'attachments', 'note.txt'), 'utf8')).toBe('plain vault file');
    expect(restarted.database.getHandle<Db>().prepare('SELECT body FROM notes').all()).toEqual([{ body: 'in the backup' }]);
    // What was replaced is kept; nothing is left staged; the start said so.
    expect(fs.readdirSync(`${p.persons}.pre-restore`).sort()).toEqual(['alice.json', 'mallory.json']);
    expect(leftovers(/\.staged$/)).toEqual([]);
    expect(fs.existsSync(p.siteRestore)).toBe(false);
    expect(fs.existsSync(`${p.siteRestore}.last`)).toBe(true);
    expect(notifications.at(-1)).toMatchObject({ level: 'success', title: 'A site restore was applied' });
    await stop(restarted);
  });

  test('a part that cannot be staged stages nothing at all — the databases included', async () => {
    const { site, file } = await backedUp();
    const p = paths();
    // Sabotage: one part's archive is gone from beside the document.
    fs.rmSync(path.join(p.backups, '2026-10-19T00-00-00-000Z-ngdpbase-backup.comments.tar.enc'));
    await expect(site.backup.restoreFromFile(CTX, file)).rejects.toThrow(/site restore was not staged, and nothing was changed: .*comments\.tar\.enc is missing/);
    expect(leftovers(/\.staged$/)).toEqual([]);
    expect(fs.existsSync(p.siteRestore)).toBe(false);
    expect(fs.existsSync(manifestPath(p.db))).toBe(false);
    expect(site.database.getStagedRestore()).toBeNull();
    await stop(site);
  });

  test('a staged set that lost a part applies none of it at the next start', async () => {
    const { site, file } = await backedUp();
    const p = paths();
    change(site);
    await site.backup.restoreFromFile(CTX, file);
    await stop(site);
    // Sabotage: one staged part disappears before the restart.
    fs.rmSync(`${p.footnotes}.staged`, { recursive: true });

    const restarted = await start();
    expect(JSON.parse(fs.readFileSync(path.join(p.roles, 'editor.json'), 'utf8')).member).toEqual([]);
    expect(fs.existsSync(path.join(p.pool, `${ATTACHMENT_ID}.png`))).toBe(false);
    expect(restarted.database.getHandle<Db>().prepare('SELECT COUNT(*) AS n FROM notes').get()).toEqual({ n: 2 });
    expect(leftovers(/\.staged$/)).toEqual([]);
    expect(leftovers(/\.pre-restore$/)).toEqual([]);
    expect(fs.existsSync(`${p.roles}.staged.incomplete`)).toBe(true);
    expect(notifications.map((n) => n.title)).toContain('A site restore was not applied');
    await stop(restarted);
  });

  test('plaintext is never staged into a sealed vault (#1836)', async () => {
    const { site, file } = await backedUp();
    const p = paths();
    // Sabotage: the backup's vault files are plaintext, the vault on this site is sealed.
    const stem = '2026-10-19T00-00-00-000Z-ngdpbase-backup';
    const archive = path.join(p.backups, `${stem}.vault-attachments.tar.enc`);
    const work = path.join(dir, 'forge');
    fs.mkdirSync(path.join(work, 'vaults', 'molly', 'health', 'attachments'), { recursive: true });
    fs.writeFileSync(path.join(work, 'vaults', 'molly', 'health', 'attachments', 'scan.pdf'), 'PLAINTEXT');
    fs.rmSync(archive);
    await writeTreeArchive(archive, work, { entries: ['vaults'], backupKey: process.env[BACKUP_KEY_ENV] });
    await expect(site.backup.restoreFromFile(CTX, file)).rejects.toThrow(/must be sealed.*never puts plaintext into a sealed vault/);
    expect(leftovers(/\.staged$/)).toEqual([]);
    expect(fs.existsSync(p.siteRestore)).toBe(false);
    await stop(site);
  });

  // ── #1945: the whole-site restore from Admin → Backup ──────────────────────

  /** A manager with a live restore and data in every backup, as PageManager is: what a site restore must never write. */
  function liveManager(): { backup: () => Promise<unknown>; restore: ReturnType<typeof vi.fn> } {
    return { backup: async () => ({ managerName: 'PageManager', timestamp: new Date().toISOString(), data: { pages: ['a'] } }), restore: vi.fn() };
  }

  test('startRestore scope site: recorded first, then staged in the background, all of it, and admins are told', async () => {
    const site = await start();
    const p = paths();
    const pages = liveManager();
    site.managers.PageManager = pages;
    site.database.getHandle<Db>().exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
    const file = await site.backup.createBackup(CTX, { filename: '2026-10-19T00-00-00-000Z-ngdpbase-backup.json.gz' });
    change(site);
    audits = [];
    const { done } = await site.backup.startRestore(CTX, path.basename(file), { scope: 'site' });
    // Recorded before the staging, naming the scope.
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ eventType: 'backup-restore', action: 'backup-restore', resource: path.basename(file), metadata: expect.objectContaining({ scope: 'site', databases: ['application'] }) });
    expect(site.backup.isRestoreRunning()).toBe(true);
    const results = await done;
    expect(site.backup.isRestoreRunning()).toBe(false);
    expect(results?.success).toEqual(expect.arrayContaining(['DatabaseManager', ...FILE_ENTRIES]));
    expect(JSON.parse(fs.readFileSync(p.siteRestore, 'utf8'))).toMatchObject({ state: 'staged', source: path.basename(file), stagedBy: 'admin' });
    expect(notifications.map((n) => n.title)).toContain('A site restore is staged');
    // Nothing is restored live from the page: a manager without a staged restore is left out, and named afterwards.
    expect(pages.restore).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(`${p.siteRestore}.report.json`, 'utf8')).notRestored).toContain('PageManager');
    expect(JSON.parse(fs.readFileSync(path.join(p.roles, 'editor.json'), 'utf8')).member).toEqual([]);
    expect(site.backup.getStagedRestore()).toEqual({ scope: 'site', source: path.basename(file), stagedBy: 'admin' });
    await stop(site);
  });

  test('startRestore scope site: a staged restore of either kind is never replaced silently; replace and cancel are recorded', async () => {
    const { site, file } = await backedUp();
    const name = path.basename(file);
    // A databases-only restore staged first.
    await (await site.backup.startRestore(CTX, name)).done;
    expect(site.backup.getStagedRestore()).toMatchObject({ scope: 'databases' });
    await expect(site.backup.startRestore(CTX, name, { scope: 'site' })).rejects.toThrow(/already staged; cancel it or replace it/);
    // Replaced by a site restore only when asked.
    audits = [];
    await (await site.backup.startRestore(CTX, name, { scope: 'site', replace: true })).done;
    expect(audits[0]).toMatchObject({ eventType: 'backup-restore-replace', metadata: expect.objectContaining({ scope: 'site', replaces: name }) });
    expect(site.backup.getStagedRestore()).toMatchObject({ scope: 'site' });
    await expect(site.backup.startRestore(CTX, name, { scope: 'site' })).rejects.toThrow(/already staged; cancel it or replace it/);
    await expect(site.backup.startRestore(CTX, name)).rejects.toThrow(/site restore .* is staged/);
    // One cancel for whichever is staged.
    audits = [];
    expect(await site.backup.cancelStagedRestore(CTX)).toEqual({ scope: 'site', source: name });
    expect(audits[0]).toMatchObject({ eventType: 'backup-restore-cancel' });
    expect(site.backup.getStagedRestore()).toBeNull();
    expect(leftovers(/\.staged$/)).toEqual([]);
    await expect(site.backup.cancelStagedRestore(CTX)).rejects.toThrow(/No restore is staged/);
    await expect(site.backup.startRestore(CTX, name, { scope: 'site', replace: true })).rejects.toThrow(/no staged restore to replace/);
    await stop(site);
  });

  test('startRestore scope site: cancelStagedRestore cancels a databases-only restore too', async () => {
    const { site, file } = await backedUp();
    await (await site.backup.startRestore(CTX, path.basename(file))).done;
    expect(await site.backup.cancelStagedRestore(CTX)).toEqual({ scope: 'databases', source: path.basename(file) });
    expect(site.database.getStagedRestore()).toBeNull();
    await stop(site);
  });

  test('startRestore scope site: refused when it cannot be recorded, and for a backup not in the backup folder', async () => {
    const { site, file } = await backedUp();
    auditDown = true;
    await expect(site.backup.startRestore(CTX, path.basename(file), { scope: 'site' })).rejects.toThrow(/audit sink down/);
    expect(site.backup.isRestoreRunning()).toBe(false);
    expect(fs.existsSync(paths().siteRestore)).toBe(false);
    auditDown = false;
    await expect(site.backup.startRestore(CTX, '../../etc/passwd', { scope: 'site' })).rejects.toThrow(/No backup named/);
    await expect(site.backup.startRestore(CTX, path.basename(file), { scope: 'everything' as 'site' })).rejects.toThrow(/Unknown restore scope/);
    await stop(site);
  });

  test('startRestore scope site: a restore that cannot be staged changes nothing, and admins are told why', async () => {
    const { site, file } = await backedUp();
    fs.rmSync(path.join(paths().backups, '2026-10-19T00-00-00-000Z-ngdpbase-backup.comments.tar.enc'));
    const results = await (await site.backup.startRestore(CTX, path.basename(file), { scope: 'site' })).done;
    expect(results).toBeNull();
    const failed = notifications.find((n) => n.title === `Restore of ${path.basename(file)} was not staged`);
    expect(failed?.level).toBe('error');
    expect(failed?.message).toMatch(/comments\.tar\.enc is missing.*The site's data stays as it is\./);
    expect(site.backup.getStagedRestore()).toBeNull();
    expect(leftovers(/\.staged$/)).toEqual([]);
    await stop(site);
  });

  test('siteRestoreScope names what a site restore puts back and what it does not, in the notification\'s words', async () => {
    const site = await start();
    site.managers.PageManager = liveManager();
    site.managers.UserManager = { backup: async () => ({}) };
    const { restored, notRestored } = site.backup.siteRestoreScope();
    expect(restored).toEqual(expect.arrayContaining(['the databases', 'attachment files', 'role membership', 'identity records (of users and contacts)', 'organizations', 'footnotes on public pages', 'comments on public pages']));
    expect(restored).not.toContain('pages (with their history, trash and private stores)');
    expect(notRestored).toEqual(expect.arrayContaining(['pages (with their history, trash and private stores)', 'user accounts', 'settings', 'sign-in sessions', 'TLS certificate files']));
    expect(notRestored).not.toContain('attachment files');
    // A manager this site does not have is not named.
    expect(notRestored).not.toContain('agent tokens');
    await stop(site);
  });

  test('a second restore is refused while one is staged, and a databases-only restore is refused while a site restore is staged', async () => {
    const { site, file } = await backedUp();
    await site.backup.restoreFromFile(CTX, file);
    await expect(site.backup.restoreFromFile(CTX, file)).rejects.toThrow(/already staged; cancel it or replace it/);
    await expect(site.backup.startRestore(CTX, path.basename(file), { replace: true })).rejects.toThrow(/site restore .* is staged/);
    const cancelled = await site.backup.cancelStagedSiteRestore(CTX);
    expect(cancelled.parts.map((p) => p.manager)).toEqual(expect.arrayContaining(['DatabaseManager', ...FILE_ENTRIES]));
    expect(leftovers(/\.staged$/)).toEqual([]);
    expect(site.database.getStagedRestore()).toBeNull();
    await stop(site);
  });
});
