/**
 * #1985 — a backup made by v5.25.0 restores with the declared folders, and a
 * backup made now has the same file names and entry shapes.
 *
 * The fixture (`__fixtures__/backup-v5.25.0/`) is a whole-site backup written
 * by the compiled v5.25.0 code itself, before the declarations: each manager
 * and the forms, calendar and feeds add-on managers still called
 * `backupDirectoryPart` / `backupFilePart`. `generate.mjs` beside it is how it
 * was made (`node generate.mjs <v5.25.0 checkout, built> <out> <scratch>`).
 * It is encrypted under the test-only key below.
 *
 * Here the current code — managers that only declare their folders, and the
 * add-ons' dataPath counted for them — restores it on a fresh site and puts
 * every part back: roles, persons, organizations, footnotes, comments, the
 * credentials store, file job state (without its locks), attachment files,
 * the forms, calendar and feeds folders, and the instance .env.
 *
 * Real managers and files in a mkdtemp directory; configuration is a
 * stand-in. Each test removes only its own directory.
 */
vi.unmock('../../providers/BasicAttachmentProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import BackupManager from '../BackupManager';
import BackgroundJobManager from '../BackgroundJobManager';
import OrganizationManager from '../OrganizationManager';
import IdentityManager from '../IdentityManager';
import RoleManager from '../RoleManager';
import AttachmentManager from '../AttachmentManager';
import CommentManager from '../CommentManager';
import FootnoteManager from '../FootnoteManager';
import AuthManager from '../AuthManager';
import { decryptBuffer } from '../../utils/backupCrypto';
import { BACKUP_KEY_ENV } from '../../utils/backupKey';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';
import { applyInstanceEnvAtStart } from '../../utils/instanceEnvBackup';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'backup-v5.25.0');
/** The test-only key the fixture is encrypted under. */
const KEY = 'backup-key-not-a-secret';
const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true };
const CORE = ['BackgroundJobManager', 'OrganizationManager', 'IdentityManager', 'RoleManager', 'AttachmentManager', 'CommentManager', 'FootnoteManager', 'AuthManager'] as const;
/** The entries the core managers are recorded under: IdentityManager keeps v5.25.0's `PersonManager` entry (#2038). */
const ENTRIES = CORE.map((name) => (name === 'IdentityManager' ? 'PersonManager' : name));
const ADDONS = ['forms', 'calendar', 'feeds'] as const;

let dir: string;
let notifications: Array<{ level: string; title: string; message: string }>;
const saved = { backup: process.env[BACKUP_KEY_ENV], credentials: process.env[CREDENTIALS_KEY_ENV] };

const paths = () => {
  const fast = path.join(dir, 'fast');
  const slow = path.join(dir, 'slow');
  return {
    fast, slow,
    roles: path.join(fast, 'roles'), persons: path.join(fast, 'persons'), organizations: path.join(fast, 'organizations'),
    footnotes: path.join(slow, 'footnotes'), comments: path.join(slow, 'comments'), jobs: path.join(fast, 'jobs'),
    credentials: path.join(fast, 'users', 'credentials.json'), forms: path.join(fast, 'forms'), calendar: path.join(fast, 'calendar'),
    feeds: path.join(fast, 'feeds'), backups: path.join(slow, 'backups'), siteRestore: path.join(fast, 'site-restore.json'),
    pool: path.join(slow, 'attachments'), metadata: path.join(slow, 'attachments', 'attachment-metadata.json'), pages: path.join(slow, 'pages')
  };
};

/** One start of the current code: the core managers, BackupManager, then the add-ons' folders (as AddonsManager loads them). */
async function start(): Promise<{ backup: BackupManager; managers: Record<string, unknown> }> {
  const p = paths();
  applyInstanceEnvAtStart(p.fast, p.siteRestore);
  const resolved: Record<string, string> = {
    'ngdpbase.application.roles.storagedir': p.roles, 'ngdpbase.application.persons.storagedir': p.persons,
    'ngdpbase.application.organization.storagedir': p.organizations, 'ngdpbase.footnotes.storagedir': p.footnotes,
    'ngdpbase.comments.storagedir': p.comments, 'ngdpbase.jobs.state.dir': p.jobs, 'ngdpbase.auth.credentials.file': p.credentials,
    'ngdpbase.backup.directory': p.backups, 'ngdpbase.backup.restore-manifest': p.siteRestore,
    'ngdpbase.attachment.provider.basic.storagedir': p.pool, 'ngdpbase.attachment.metadatafile': p.metadata,
    'ngdpbase.page.provider.filesystem.storagedir': p.pages
  };
  const props: Record<string, unknown> = {
    'ngdpbase.backup.max-backups': 10, 'ngdpbase.application-name': 'Test Site', 'ngdpbase.jobs.state.provider': 'file',
    'ngdpbase.attachment.maxsize': 10485760, 'ngdpbase.attachment.allowedtypes': '', 'ngdpbase.default.timezone': 'UTC'
  };
  const addonFolders = ADDONS.map((slug) => ({ slug, dataPath: p[slug], folders: [{ part: slug, folder: p[slug] }] }));
  const managers: Record<string, unknown> = {
    ConfigurationManager: {
      getProperty: (k: string, d: unknown) => (k in props ? props[k] : d),
      getResolvedDataPath: (k: string, d: string) => resolved[k] ?? path.join(p.fast, path.basename(d)),
      getInstanceDataFolder: () => p.fast,
      getAddonDatabaseDeclarations: () => [],
      getCustomProperty: () => undefined,
      isBaseUrlExplicit: () => true,
      getBaseURL: () => 'https://site.example.com',
      setProperty: async (k: string, v: unknown) => { props[k] = v; }
    },
    NotificationManager: { notifyAdmins: async (n: { level: string; title: string; message: string }) => { notifications.push(n); return 'id'; }, getAllNotifications: () => notifications },
    AuditManager: { logAuditEvent: async () => 'id', flushAuditQueue: async () => undefined },
    // The forms, calendar and feeds add-ons are loaded; their dataPath is their folder, and they write no backup code.
    AddonsManager: { addonBackupFolders: () => addonFolders }
  };
  const order: string[] = [];
  const engine = { getManager: (n: string) => managers[n] ?? null, blockConfiguration: () => undefined, getRegisteredManagers: () => order };
  const ctors = { BackgroundJobManager, OrganizationManager, IdentityManager, RoleManager, AttachmentManager, CommentManager, FootnoteManager, AuthManager };
  for (const name of CORE) {
    const m = new ctors[name](engine);
    managers[name] = m;
    order.push(name);
    await m.initialize();
  }
  const backup = new BackupManager(engine);
  managers.BackupManager = backup;
  order.push('BackupManager');
  await backup.initialize();
  for (const { slug, folders } of addonFolders) backup.applyAddonPartsAtStart(slug, folders);
  await backup.reportRestoreAtBoot();
  return { backup, managers };
}

async function stop(site: { managers: Record<string, unknown> }): Promise<void> {
  for (const m of Object.values(site.managers)) await (m as { shutdown?: () => Promise<void> }).shutdown?.();
}

async function documentOf(file: string): Promise<{ managers: Record<string, Record<string, unknown>> }> {
  return JSON.parse(gunzipSync(await decryptBuffer(fs.readFileSync(file), KEY)).toString('utf8'));
}

/** An entry's shape: its keys, and its data's keys with each part record's keys — what a v5.25.0 restore reads. */
function shapeOf(entry: Record<string, unknown> | undefined): unknown {
  const data = entry?.data as Record<string, unknown> | null | undefined;
  const keys = (o: unknown): string[] => (o && typeof o === 'object' ? Object.keys(o).sort() : []);
  return {
    entry: keys(entry).filter((k) => k !== 'timestamp'),
    data: data && typeof data === 'object' ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? keys(v) : typeof v])) : data
  };
}

const read = (...parts: string[]): string => fs.readFileSync(path.join(...parts), 'utf8');

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1985-compat-'));
  notifications = [];
  process.env[BACKUP_KEY_ENV] = KEY;
  process.env[CREDENTIALS_KEY_ENV] = 'credentials-key-not-a-secret';
  const p = paths();
  for (const d of [p.roles, p.persons, p.organizations, p.footnotes, p.comments, p.forms, p.calendar, p.feeds, p.pool, p.pages, p.backups]) fs.mkdirSync(d, { recursive: true });
  // This site has data of its own, which the restore replaces.
  fs.writeFileSync(path.join(p.roles, 'other.json'), JSON.stringify({ '@type': 'OrganizationRole', '@id': 'https://other.example/roles/x#role', namedPosition: 'x', member: [] }));
  fs.writeFileSync(path.join(p.fast, '.env'), `SOME_SETTING=this-site\nNGDPBASE_BACKUP_KEY=${KEY}\n`);
  for (const f of fs.readdirSync(FIXTURE).filter((f) => f.endsWith('.enc'))) fs.copyFileSync(path.join(FIXTURE, f), path.join(p.backups, f));
});

afterEach(() => {
  for (const [env, value] of [[BACKUP_KEY_ENV, saved.backup], [CREDENTIALS_KEY_ENV, saved.credentials]] as const) {
    if (value === undefined) delete process.env[env]; else process.env[env] = value;
  }
  // Only this test's own temp directory.
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('a v5.25.0 backup and the declared folders (#1985)', () => {
  const fixtureDocument = (): string => fs.readdirSync(FIXTURE).find((f) => f.endsWith('-ngdpbase-backup.json.gz.enc'));

  test('a backup made by v5.25.0 restores every part, the add-ons\' folders included', async () => {
    const p = paths();
    const site = await start();
    const results = await site.backup.restoreFromFile(CTX, path.join(p.backups, fixtureDocument()));
    expect(results.failed).toEqual([]);
    expect(results.success).toEqual(expect.arrayContaining([...ENTRIES, 'FormsDataManager', 'CalendarDataManager', 'FeedManager']));
    expect(notifications.map((n) => n.title)).toContain('A site restore is staged');
    await stop(site);

    notifications = [];
    const restarted = await start();
    expect(notifications.map((n) => n.title)).toContain('A site restore was applied');
    expect(fs.readdirSync(p.roles)).toEqual(['editor.json']);
    expect(read(p.roles, 'editor.json')).toContain('alice#person');
    expect(read(p.persons, 'alice.json')).toContain('Alice v5.25.0');
    expect(read(p.organizations, 'acme.json')).toContain('Acme v5.25.0');
    expect(read(p.footnotes, 'page-1.json')).toContain('footnote v5.25.0');
    expect(read(p.comments, 'page-1', 'c1.json')).toContain('comment v5.25.0');
    // The store is the backup's (its rows, signed under another key, are held in quarantine by AuthManager; the next test reads the file itself).
    expect(fs.existsSync(`${p.credentials}.staged`)).toBe(false);
    expect(read(p.jobs, 'runs', 'demo.json')).toContain('jobs v5.25.0');
    expect(fs.existsSync(path.join(p.jobs, 'locks', 'demo.lock'))).toBe(false);
    expect(read(p.pool, `${'b'.repeat(64)}.txt`)).toBe('pool file v5.25.0');
    expect(read(p.forms, 'definitions', 'contact.json')).toContain('Contact v5.25.0');
    expect(read(p.calendar, 'club.json')).toContain('calendar v5.25.0');
    expect(read(p.feeds, 'quakes', 'records.json')).toContain('feeds v5.25.0');
    expect(read(p.fast, '.env')).toContain('SOME_SETTING=v5.25.0');
    await stop(restarted);
  });

  test('the credentials store comes back from a v5.25.0 backup as it was backed up', async () => {
    const p = paths();
    const site = await start();
    await site.backup.restoreFromFile(CTX, path.join(p.backups, fixtureDocument()));
    await stop(site);
    // Applied at the start of AuthManager, before it reads the store: what it then reads is the backup's file.
    const auth = new AuthManager({
      getManager: (n: string) => (n === 'ConfigurationManager'
        ? { getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? p.credentials : k === 'ngdpbase.backup.restore-manifest' ? p.siteRestore : d), getProperty: (_k: string, d: unknown) => d }
        : null),
      getRegisteredManagers: () => ['AuthManager']
    });
    expect(auth.backupFolders()).toEqual([expect.objectContaining({ part: 'credentials', file: p.credentials, requireKey: true })]);
    expect(fs.existsSync(`${p.credentials}.staged`)).toBe(true);
    await (auth as unknown as { applyStagedBackupParts(): Promise<void> }).applyStagedBackupParts();
    expect(read(p.credentials)).toContain('credentials v5.25.0');
  });

  test('a backup made now has v5.25.0\'s file names and entry shapes, so a v5.25.0 site can restore it', async () => {
    const p = paths();
    const site = await start();
    // The same data as the fixture first: restore it, then back the site up with the current code.
    await site.backup.restoreFromFile(CTX, path.join(p.backups, fixtureDocument()));
    await stop(site);
    const restarted = await start();
    const file = await restarted.backup.createBackup(CTX);
    const stem = (name: string): string => name.replace(/\.json\.gz\.enc$/, '');
    const suffixes = (directory: string, document: string): string[] =>
      fs.readdirSync(directory).filter((f) => f.startsWith(`${stem(document)}.`) && f !== document).map((f) => f.slice(stem(document).length)).sort();
    expect(suffixes(p.backups, path.basename(file))).toEqual(suffixes(FIXTURE, fixtureDocument()));

    const now = await documentOf(file);
    const then = await documentOf(path.join(FIXTURE, fixtureDocument()));
    for (const name of [...ENTRIES, 'FormsDataManager', 'CalendarDataManager', 'FeedManager', 'BackupManager']) {
      expect({ name, ...(shapeOf(now.managers[name]) as object) }).toEqual({ name, ...(shapeOf(then.managers[name]) as object) });
    }
    expect(now.managers.RoleManager.data).toMatchObject({ format: 1, archive: `${stem(path.basename(file))}.roles.tar.enc`, files: 1 });
    expect(now.managers.FormsDataManager).toMatchObject({ managerName: 'FormsDataManager', data: { format: 1, archive: `${stem(path.basename(file))}.forms.tar.enc` } });
    await stop(restarted);
  });
});

/** v5.25.0's own site restore record code (`__fixtures__/backup-v5.25.0/siteRestore.v5.25.0.mjs`), for the record's compatibility (#1986). */
interface V5250SiteRestore {
  readSiteRestore(file: string): { state: string; parts: Array<{ manager: string; swaps: Array<{ live: string; staged: string }>; status?: string }> } | null;
  beginSiteRestore(file: string, meta: Record<string, string>): void;
  recordStagedPart(file: string, part: { manager: string; swaps: Array<{ live: string; staged: string }> }): void;
  commitSiteRestore(file: string): unknown;
  applyPartAtStart(file: string, manager: string, options: { allowed: (swap: { live: string }) => boolean }): { applied: unknown[]; refused?: string } | null;
  finishSiteRestoreAtBoot(file: string): { parts: Array<{ manager: string; status?: string }> } | null;
}
const v5250 = async (): Promise<V5250SiteRestore> => await import(path.join(FIXTURE, 'siteRestore.v5.25.0.mjs')) as V5250SiteRestore;

describe('the site restore record and v5.25.0 (#1986)', () => {
  const fixtureDocument = (): string => fs.readdirSync(FIXTURE).find((f) => f.endsWith('-ngdpbase-backup.json.gz.enc'));

  test('the record the current code stages — every part recorded through BackupManager — is read and applied by v5.25.0\'s code', async () => {
    const p = paths();
    const site = await start();
    await site.backup.restoreFromFile(CTX, path.join(p.backups, fixtureDocument()));
    await stop(site);

    const old = await v5250();
    const record = old.readSiteRestore(p.siteRestore);
    expect(record?.state).toBe('staged');
    const managers = record.parts.map((part) => part.manager);
    expect(managers).toEqual(expect.arrayContaining([...ENTRIES, 'FormsDataManager', 'CalendarDataManager', 'FeedManager', 'BackupManager']));
    for (const manager of managers) {
      expect(old.applyPartAtStart(p.siteRestore, manager, { allowed: () => true })).toMatchObject({ applied: expect.any(Array) });
    }
    const finished = old.finishSiteRestoreAtBoot(p.siteRestore);
    expect(finished?.parts.every((part) => part.status === 'applied')).toBe(true);
    expect(read(p.roles, 'editor.json')).toContain('alice#person');
    expect(read(p.pool, `${'b'.repeat(64)}.txt`)).toBe('pool file v5.25.0');
  });

  test('a record v5.25.0\'s code staged is applied by the current code at start: the .env, a declared folder and the attachment files', async () => {
    const p = paths();
    const old = await v5250();
    const swap = (live: string): { live: string; staged: string } => ({ live, staged: `${live}.staged` });
    fs.mkdirSync(`${p.roles}.staged`);
    fs.writeFileSync(path.join(`${p.roles}.staged`, 'staged.json'), JSON.stringify({ '@type': 'OrganizationRole', '@id': 'https://acme.example/roles/staged#role', namedPosition: 'staged', member: [] }));
    fs.writeFileSync(`${path.join(p.fast, '.env')}.staged`, 'SOME_SETTING=staged-by-v5.25.0\n');
    fs.mkdirSync(`${p.pool}.staged`);
    fs.writeFileSync(path.join(`${p.pool}.staged`, 'staged.txt'), 'staged by v5.25.0');
    old.beginSiteRestore(p.siteRestore, { stagedAt: '2026-10-22T00:00:00Z', backup: '2026-10-21T00:00:00Z', source: 'old.json.gz.enc', stagedBy: 'admin' });
    old.recordStagedPart(p.siteRestore, { manager: 'RoleManager', swaps: [swap(p.roles)] });
    old.recordStagedPart(p.siteRestore, { manager: 'BackupManager', swaps: [swap(path.join(p.fast, '.env'))] });
    old.recordStagedPart(p.siteRestore, { manager: 'AttachmentManager', swaps: [swap(p.pool)] });
    old.commitSiteRestore(p.siteRestore);

    const site = await start();
    expect(notifications.map((n) => n.title)).toContain('A site restore was applied');
    expect(fs.readdirSync(p.roles)).toEqual(['staged.json']);
    expect(read(p.fast, '.env')).toContain('SOME_SETTING=staged-by-v5.25.0');
    expect(read(p.fast, '.env')).toContain(`NGDPBASE_BACKUP_KEY=${KEY}`);
    expect(read(p.pool, 'staged.txt')).toBe('staged by v5.25.0');
    expect(JSON.parse(read(`${p.siteRestore}.last`)).parts.map((part: { status: string }) => part.status)).toEqual(['applied', 'applied', 'applied']);
    await stop(site);
  });
});
