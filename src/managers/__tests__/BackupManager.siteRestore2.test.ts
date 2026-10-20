/**
 * #1876 slice 2 — the credentials store, file job state and add-on files are
 * in the backup and restore staged with the rest of the site; the document
 * and every file archive are encrypted under NGDPBASE_BACKUP_KEY (#1561); a
 * live restore is refused while a site restore is staged; and after a
 * restore admins get a critical notification naming what it did not bring
 * back, with the job runs between the backup and the restore.
 *
 * Real managers (BackupManager, AuthManager with its credentials store,
 * BackgroundJobManager on files, the forms add-on's FormsDataManager), real
 * files in a temp directory; each test removes only that directory.
 */
vi.unmock('../../providers/FileCredentialsProvider');
vi.unmock('../BackgroundJobManager');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { applyInstanceEnvAtStart } from '../../utils/instanceEnvBackup';
import BackupManager, { BACKUP_KEY_MISSING, BACKUP_KEY_MISSING_TITLE, describeNotRestored } from '../BackupManager';
import AuthManager from '../AuthManager';
import BackgroundJobManager from '../BackgroundJobManager';
import FileCredentialsProvider from '../../providers/FileCredentialsProvider';
import FileJobStateProvider from '../../providers/FileJobStateProvider';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';
import { BACKUP_KEY_ENV } from '../../utils/backupKey';
import { decryptBuffer, isEncryptedBackup } from '../../utils/backupCrypto';
import FormsDataManager from '../../../addons/forms/managers/FormsDataManager';

const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };
const KEY = 'backup-key-not-a-secret';
const CREDENTIALS_KEY = 'credentials-key-not-a-secret';
const PASSKEY = { id: 'cred-1', username: 'alice', kind: 'passkey' as const, subject: 'pk-1', secret: 'public-key', label: 'Phone', createdAt: '2026-10-01T00:00:00.000Z' };

describe('slice 2 of the site restore (#1876)', () => {
  let dir: string;
  let notifications: Array<{ level: string; title: string; message: string }>;
  let userRestores: number;
  let userBackupFails: boolean;
  let savedConfig: Record<string, unknown>;
  let audits: Array<Record<string, unknown>>;
  const saved = { backup: process.env[BACKUP_KEY_ENV], credentials: process.env[CREDENTIALS_KEY_ENV] };

  const paths = () => ({
    credentials: path.join(dir, 'fast', 'users', 'credentials.json'),
    jobs: path.join(dir, 'fast', 'jobs'),
    forms: path.join(dir, 'fast', 'forms'),
    backups: path.join(dir, 'slow', 'backups'),
    siteRestore: path.join(dir, 'fast', 'site-restore.json')
  });

  /** One start of the site. */
  async function start(): Promise<{ backup: BackupManager; jobs: BackgroundJobManager; managers: Record<string, unknown> }> {
    const p = paths();
    // What bootstrap-env does before any manager: a staged .env goes in first (#1876).
    applyInstanceEnvAtStart(path.join(dir, 'fast'), p.siteRestore);
    const resolved: Record<string, string> = {
      'ngdpbase.auth.credentials.file': p.credentials,
      'ngdpbase.jobs.state.dir': p.jobs,
      'ngdpbase.backup.directory': p.backups,
      'ngdpbase.backup.restore-manifest': p.siteRestore
    };
    const props: Record<string, unknown> = { 'ngdpbase.jobs.state.provider': 'file', 'ngdpbase.backup.max-backups': 10, 'ngdpbase.default.timezone': 'UTC', ...savedConfig };
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (key: string, def: unknown) => (key in props ? props[key] : def),
        getResolvedDataPath: (key: string, def: string) => resolved[key] ?? path.join(dir, 'fast', path.basename(def)),
        getCustomProperty: () => undefined,
        isBaseUrlExplicit: () => true,
        getBaseURL: () => 'https://site.example.com',
        getInstanceDataFolder: () => path.join(dir, 'fast'),
        // What an admin saves outlives a restart, as app-custom-config.json does.
        setProperty: async (key: string, value: unknown) => { props[key] = value; savedConfig[key] = value; }
      },
      // Stored notifications outlive a restart, as NotificationManager's do: the one-time backup-key notice is deduplicated against them.
      NotificationManager: {
        addNotification: async (n: { level: string; title: string; message: string }) => { notifications.push(n); return 'id'; },
        getAllNotifications: () => notifications
      },
      AuditManager: { logAuditEvent: async (e: Record<string, unknown>) => { audits.push(e); return 'evt'; }, flushAuditQueue: async () => undefined },
      // Restores live only: never while a site restore is staged.
      UserManager: {
        backup: async () => {
          if (userBackupFails) throw new Error('the user store could not be read');
          return { managerName: 'UserManager', timestamp: new Date().toISOString(), data: null, providerBackup: { users: ['alice'] } };
        },
        restore: async () => { userRestores++; },
        getUser: async () => null,
        hasPassword: async () => false
      }
    };
    const engine = {
      getManager: (n: string) => managers[n] ?? null,
      getRegisteredManagers: () => Object.keys(managers).filter((n) => !['ConfigurationManager', 'NotificationManager', 'AuditManager'].includes(n))
    };
    const jobs = new BackgroundJobManager(engine);
    managers.BackgroundJobManager = jobs;
    await jobs.initialize();
    jobs.registerJob({ id: 'demo.nightly', displayName: 'Nightly demo', run: async () => ({ success: true }) });
    const auth = new AuthManager(engine);
    managers.AuthManager = auth;
    await auth.initialize();
    const forms = new FormsDataManager(engine, p.forms);
    managers.FormsDataManager = forms;
    await forms.initialize();
    const backup = new BackupManager(engine);
    managers.BackupManager = backup;
    await backup.initialize();
    await backup.reportRestoreAtBoot();
    return { backup, jobs, managers };
  }

  async function stop(site: { managers: Record<string, unknown> }): Promise<void> {
    for (const m of Object.values(site.managers)) await (m as { shutdown?: () => Promise<void> }).shutdown?.();
  }

  async function seed(): Promise<void> {
    fs.mkdirSync(path.join(dir, 'fast'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'fast', '.env'), `SMTP_PASSWORD=smtp-password-in-env\nNGDPBASE_CREDENTIALS_KEY=${CREDENTIALS_KEY}\nNGDPBASE_BACKUP_KEY=${KEY}\nNGDPBASE_DATABASE_KEY=db-key-at-backup\n`, { mode: 0o600 });
    const store = new FileCredentialsProvider(paths().credentials, CREDENTIALS_KEY);
    await store.initialize(() => undefined);
    await store.add(PASSKEY);
    fs.mkdirSync(path.join(paths().forms, 'definitions'), { recursive: true });
    fs.writeFileSync(path.join(paths().forms, 'definitions', 'contact.json'), JSON.stringify({ id: 'contact', title: 'Contact (as backed up)', fields: [] }));
  }

  /** The backup document as JSON, decrypted under the backup key when it is encrypted. */
  async function documentOf(file: string): Promise<{ managers: Record<string, { data?: unknown; warnings?: string[] }> }> {
    const raw = fs.readFileSync(file);
    const plain = isEncryptedBackup(raw) ? await decryptBuffer(raw, KEY) : raw;
    return JSON.parse(gunzipSync(plain).toString('utf8'));
  }

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1876-s2-'));
    notifications = [];
    userRestores = 0;
    userBackupFails = false;
    savedConfig = {};
    audits = [];
    process.env[BACKUP_KEY_ENV] = KEY;
    process.env[CREDENTIALS_KEY_ENV] = CREDENTIALS_KEY;
    await seed();
  });

  afterEach(() => {
    for (const [env, value] of [[BACKUP_KEY_ENV, saved.backup], [CREDENTIALS_KEY_ENV, saved.credentials]] as const) {
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
    // Only this test's own temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('every part is encrypted under the backup key, the document included, and none holds plaintext', async () => {
    const site = await start();
    const file = await site.backup.createBackup(CTX);
    expect(path.basename(file)).toMatch(/-ngdpbase-backup\.json\.gz\.enc$/);
    const stem = path.basename(file).replace(/\.json\.gz\.enc$/, '');
    const companions = fs.readdirSync(paths().backups).filter((f) => f.startsWith(`${stem}.`) && f !== path.basename(file)).sort();
    expect(companions).toEqual([`${stem}.credentials.tar.enc`, `${stem}.env.tar.enc`, `${stem}.forms.tar.enc`, `${stem}.jobs.tar.enc`]);
    for (const f of [path.basename(file), ...companions]) {
      const raw = fs.readFileSync(path.join(paths().backups, f));
      expect(isEncryptedBackup(raw)).toBe(true);
      for (const secret of ['public-key', 'Contact (as backed up)', '"users"', 'smtp-password-in-env']) expect(raw.includes(Buffer.from(secret))).toBe(false);
    }
    const doc = await documentOf(file);
    expect(doc.managers.AuthManager.data).toMatchObject({ credentials: { archive: `${stem}.credentials.tar.enc`, files: 1, keyFingerprint: expect.any(String) } });
    expect(doc.managers.BackgroundJobManager.data).toMatchObject({ archive: `${stem}.jobs.tar.enc` });
    expect(doc.managers.FormsDataManager.data).toMatchObject({ archive: `${stem}.forms.tar.enc` });
    // Listed, downloaded and pruned with the document.
    const stored = await site.backup.findStoredBackup(path.basename(file));
    expect(stored).toMatchObject({ encrypted: true, parts: ['credentials', 'env', 'forms', 'jobs'], files: companions });
    expect(notifications.filter((n) => n.level === 'error')).toEqual([]);
    await stop(site);
  });

  test('a restore stages them, refuses a live restore while staged, and the next start applies them and says what it did not bring back', async () => {
    const site = await start();
    const file = await site.backup.createBackup(CTX);
    // The site goes on: a credential added, a form edited, a job run — all after the backup.
    const store = new FileCredentialsProvider(paths().credentials, CREDENTIALS_KEY);
    await store.initialize(() => undefined);
    await store.add({ ...PASSKEY, id: 'cred-2', subject: 'pk-2', label: 'Laptop' });
    fs.writeFileSync(path.join(paths().forms, 'definitions', 'contact.json'), JSON.stringify({ id: 'contact', title: 'Contact (edited later)', fields: [] }));
    const later = new Date(Date.now() + 1000).toISOString();
    await new FileJobStateProvider(paths().jobs).recordRun('demo.nightly', { runId: 'r-after', slot: null, startedAt: later, completedAt: later, attempt: 1, status: 'failed', error: 'feed down', requestedBy: null });

    // The .env changes too: a new secret, and a database key line that must be kept.
    fs.writeFileSync(path.join(dir, 'fast', '.env'), `SMTP_PASSWORD=changed-later\nNGDPBASE_CREDENTIALS_KEY=${CREDENTIALS_KEY}\nNGDPBASE_BACKUP_KEY=${KEY}\nNGDPBASE_DATABASE_KEY=db-key-live\n`);
    const results = await site.backup.restoreFromFile(CTX, file);
    expect(results.success).toEqual(expect.arrayContaining(['AuthManager', 'BackgroundJobManager', 'FormsDataManager']));
    // Staged without the backup key's line; the live .env is untouched until the restart.
    expect(fs.readFileSync(path.join(dir, 'fast', '.env.staged'), 'utf8')).not.toContain('NGDPBASE_BACKUP_KEY');
    expect(fs.readFileSync(path.join(dir, 'fast', '.env'), 'utf8')).toContain('changed-later');
    // Users have no staged restore: left out, never written live.
    expect(results.skipped).toContain('UserManager');
    expect(userRestores).toBe(0);
    // Nothing live changed yet.
    expect(fs.readFileSync(path.join(paths().forms, 'definitions', 'contact.json'), 'utf8')).toContain('edited later');
    // While it is staged, a live restore of anything is refused.
    await expect(site.backup.restoreFromFile(CTX, file, { managerFilter: ['UserManager'] })).rejects.toThrow(/site restore from .* is staged, so UserManager can't be restored now/);
    expect(userRestores).toBe(0);
    await stop(site);

    notifications = [];
    const restarted = await start();
    const back = new FileCredentialsProvider(paths().credentials, CREDENTIALS_KEY);
    await back.initialize(() => undefined);
    expect(back.list('alice').map((c) => c.label)).toEqual(['Phone']);
    expect(fs.readFileSync(path.join(paths().forms, 'definitions', 'contact.json'), 'utf8')).toContain('as backed up');
    expect((await new FileJobStateProvider(paths().jobs).listRuns('demo.nightly')).map((r) => r.runId)).not.toContain('r-after');
    expect(fs.existsSync(`${paths().credentials}.pre-restore`)).toBe(true);
    // The .env came back from the backup, with this site's backup and database key lines kept.
    const env = fs.readFileSync(path.join(dir, 'fast', '.env'), 'utf8');
    expect(env).toContain('SMTP_PASSWORD=smtp-password-in-env');
    expect(env).not.toContain('changed-later');
    expect(env).toContain(`NGDPBASE_BACKUP_KEY=${KEY}`);
    expect(env).toContain('NGDPBASE_DATABASE_KEY=db-key-live');
    expect(env).not.toContain('db-key-at-backup');
    expect(fs.readFileSync(path.join(dir, 'fast', '.env.pre-restore'), 'utf8')).toContain('changed-later');

    const critical = notifications.find((n) => n.title.startsWith('Critical:'));
    expect(critical).toMatchObject({ level: 'error', title: 'Critical: a restore did not bring everything back' });
    expect(critical.message).toContain('user accounts');
    expect(critical.message).toMatch(/shares .*notifications/);
    expect(critical.message).toMatch(/Nightly demo — last ran .*, failed: feed down/);
    expect(critical.message).toContain('they are not run again');
    expect(notifications.map((n) => n.title)).toContain('A site restore was applied');
    // The restored audit log says a restore happened, which backup, and who started it (operator-approved event).
    expect(audits.find((e) => e.eventType === 'backup-restore-applied')).toMatchObject({
      action: 'backup-restore-applied', resource: path.basename(file),
      metadata: expect.objectContaining({ source: path.basename(file), startedBy: 'admin', kind: 'site', applied: expect.arrayContaining(['AuthManager', 'BackupManager']) })
    });
    // The report is read once.
    expect(fs.existsSync(`${paths().siteRestore}.report.json`)).toBe(false);
    await stop(restarted);
  });

  test('without the backup key: the credentials store is left out, nothing is encrypted, and both are said loudly; a site restore is refused', async () => {
    delete process.env[BACKUP_KEY_ENV];
    const site = await start();
    const file = await site.backup.createBackup(CTX);
    expect(path.basename(file)).toMatch(/\.json\.gz$/);
    const doc = await documentOf(file);
    expect((doc.managers.AuthManager.data as { credentials: unknown }).credentials).toBeNull();
    expect(doc.managers.AuthManager.warnings?.[0]).toMatch(/NGDPBASE_BACKUP_KEY is not set, so the credentials store was left out/);
    expect(fs.existsSync(file.replace(/\.json\.gz$/, '.forms.tar'))).toBe(true);
    // Left out only for want of the key: no per-backup notice (#1912); the one-time notice names what is left out.
    expect(notifications.filter((n) => n.title === 'A backup is incomplete')).toEqual([]);
    expect(notifications.find((n) => n.title === BACKUP_KEY_MISSING_TITLE)?.message).toMatch(/the credentials store, the databases and the instance \.env are left out/);
    // A restore needs a complete safety backup first, which can't be taken without the key.
    await expect(site.backup.restoreFromFile(CTX, file)).rejects.toThrow(/credentials store was left out/);
    expect(fs.existsSync(paths().siteRestore)).toBe(false);
    await stop(site);
  });

  test('without the backup key: a persistent banner and ONE notification across backups and restarts; with the key the banner goes', async () => {
    delete process.env[BACKUP_KEY_ENV];
    const site = await start();
    expect(site.backup.getManagerStatus()).toMatchObject({ state: 'degraded', reason: BACKUP_KEY_MISSING, configKey: BACKUP_KEY_ENV });
    await site.backup.createBackup(CTX, { filename: '2026-01-01T00-00-00-000Z-ngdpbase-backup.json.gz' });
    await site.backup.createBackup(CTX, { filename: '2026-01-02T00-00-00-000Z-ngdpbase-backup.json.gz' });
    await stop(site);
    const restarted = await start();
    await restarted.backup.createBackup(CTX, { filename: '2026-01-03T00-00-00-000Z-ngdpbase-backup.json.gz' });
    const keyNotices = notifications.filter((n) => n.title === BACKUP_KEY_MISSING_TITLE);
    expect(keyNotices).toHaveLength(1);
    expect(keyNotices[0]).toMatchObject({ level: 'error', message: expect.stringMatching(/NGDPBASE_BACKUP_KEY is not set, so backups are NOT encrypted.*the only notification/) });
    // No per-backup notice at all: what the missing key leaves out is the one-time notice's to say (#1912).
    expect(notifications.filter((n) => /not encrypted/i.test(n.title) && n.title !== BACKUP_KEY_MISSING_TITLE)).toEqual([]);
    expect(notifications.filter((n) => n.title === 'A backup is incomplete')).toEqual([]);
    expect(restarted.backup.getManagerStatus().state).toBe('degraded');
    // The key is read at each backup: once it is set the banner goes, without a restart.
    process.env[BACKUP_KEY_ENV] = KEY;
    await restarted.backup.createBackup(CTX, { filename: '2026-01-04T00-00-00-000Z-ngdpbase-backup.json.gz' });
    // The missing-key banner gives way to the one asking for the key to be saved (#1876).
    expect(restarted.backup.getManagerStatus().reason).toMatch(/^Save the backup key off this server/);
    await stop(restarted);

    process.env[BACKUP_KEY_ENV] = KEY;
    const keyed = await start();
    expect(keyed.backup.getManagerStatus().reason).not.toBe(BACKUP_KEY_MISSING);
    await keyed.backup.createBackup(CTX);
    expect(notifications.filter((n) => n.title === BACKUP_KEY_MISSING_TITLE)).toHaveLength(1);
    await stop(keyed);
  });

  test('without the backup key, a part that fails for another reason is still said at every backup — and only that part', async () => {
    delete process.env[BACKUP_KEY_ENV];
    const site = await start();
    userBackupFails = true;
    await site.backup.createBackup(CTX, { filename: '2026-01-01T00-00-00-000Z-ngdpbase-backup.json.gz' });
    await site.backup.createBackup(CTX, { filename: '2026-01-02T00-00-00-000Z-ngdpbase-backup.json.gz' });
    const incomplete = notifications.filter((n) => n.title === 'A backup is incomplete');
    expect(incomplete).toHaveLength(2);
    expect(incomplete[0].message).toMatch(/without: UserManager: the user store could not be read$/);
    expect(incomplete[0].message).not.toMatch(/credentials store/);
    expect(notifications.filter((n) => n.title === BACKUP_KEY_MISSING_TITLE)).toHaveLength(1);
    await stop(site);
  });

  test('the backup key: a banner with its fingerprint until an admin confirms it is saved, recorded across restarts; a new key asks again', async () => {
    const { backupKeyFingerprint } = await import('../../utils/backupKey');
    const site = await start();
    const info = site.backup.backupKeyInfo();
    expect(info).toEqual({ set: true, fingerprint: backupKeyFingerprint(KEY), saved: false });
    expect(site.backup.getManagerStatus()).toMatchObject({ state: 'degraded', reason: expect.stringContaining(`fingerprint ${info.fingerprint}`) });
    expect(site.backup.getManagerStatus().reason).not.toContain(KEY);
    await expect(site.backup.confirmBackupKeySaved(CTX, 'not-the-fingerprint')).rejects.toThrow(/not the fingerprint of the current backup key/);
    await site.backup.confirmBackupKeySaved(CTX, info.fingerprint);
    expect(site.backup.getManagerStatus()).toEqual({ state: 'ready' });
    await stop(site);
    const restarted = await start();
    expect(restarted.backup.getManagerStatus()).toEqual({ state: 'ready' });
    await stop(restarted);
    process.env[BACKUP_KEY_ENV] = 'a-new-backup-key';
    const rekeyed = await start();
    expect(rekeyed.backup.backupKeyInfo().saved).toBe(false);
    expect(rekeyed.backup.getManagerStatus().state).toBe('degraded');
    await stop(rekeyed);
  });

  test('a backup made under another backup key is refused before anything is staged', async () => {
    const site = await start();
    const file = await site.backup.createBackup(CTX);
    process.env[BACKUP_KEY_ENV] = 'a-different-backup-key';
    await expect(site.backup.restoreFromFile(CTX, file)).rejects.toThrow(/different backup key/);
    expect(fs.existsSync(paths().siteRestore)).toBe(false);
    expect((fs.readdirSync(path.join(dir, 'fast'), { recursive: true }) as string[]).filter((f) => f.endsWith('.staged'))).toEqual([]);
    await stop(site);
  });
});

describe('the "not restored" notification (#1876)', () => {
  test('names what was put back, what was not, what no backup holds, and per job its last run and result', () => {
    const message = describeNotRestored({
      source: 'b1.json.gz.enc',
      backup: '2026-10-19T10:00:00.000Z',
      applied: ['the databases', 'attachment files'],
      notRestored: ['user accounts', 'settings'],
      jobRuns: [
        { jobId: 'backup.auto', startedAt: '2026-10-19T11:00:00.000Z', completedAt: '2026-10-19T11:01:00.000Z', status: 'completed' },
        { jobId: 'backup.auto', startedAt: '2026-10-19T12:00:00.000Z', completedAt: '2026-10-19T12:01:00.000Z', status: 'completed' },
        { jobId: 'feeds.poll', startedAt: '2026-10-19T11:30:00.000Z', status: 'failed', error: 'timeout' }
      ],
      nameOf: (id) => (id === 'backup.auto' ? 'Automatic backup' : id)
    });
    expect(message).toContain('was applied: the databases, attachment files.');
    expect(message).toMatch(/Not restored — still as they were before the restore: user accounts; settings; shares .*; notifications; sign-in sessions; the backup key itself, and the database key .*; TLS certificate files; the media library and its index\./);
    expect(message).toContain(`Automatic backup — last ran ${new Date('2026-10-19T12:01:00.000Z').toLocaleString()}, completed (2 runs since the backup)`);
    expect(message).toContain('feeds.poll — last ran');
    expect(message).toContain('failed: timeout');
  });

  test('says so when no job ran in between', () => {
    expect(describeNotRestored({ source: 'b', backup: '', applied: ['the databases'], notRestored: [], jobRuns: [], nameOf: (id) => id }))
      .toContain('No scheduled job ran between the backup and the restore.');
  });
});
