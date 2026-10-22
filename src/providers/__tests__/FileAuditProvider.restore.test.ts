/**
 * #1876 slice 2 — the audit log is in the backup and restores staged with the
 * rest of the site, its hash chain intact. Only the audit files go in (never
 * the application logs beside them); the restore swaps the whole set, newer
 * archives included, keeps the files from before in `audit.log.pre-restore/`
 * and the chain resumes from the backup's last record.
 *
 * Real files in a temp directory; each test removes only that.
 */
vi.unmock('../FileAuditProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import FileAuditProvider from '../FileAuditProvider';
import { verifyChain } from '../../utils/auditChain';
import { beginSiteRestore, commitSiteRestore, readSiteRestore } from '../../utils/siteRestore';
import { BACKUP_KEY_ENV } from '../../utils/backupKey';
import { listTreeArchive, writeTreeArchive } from '../../utils/treeArchive';
// BackupManager names and checks each archive, and hands the provider the means in its options (#1985).
import { archiveReader, archiveWriter } from '../../utils/directoryBackup';

const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true };
let dir: string;
let logs: string;
let backups: string;
let siteFile: string;
const savedKey = process.env[BACKUP_KEY_ENV];

function makeProvider(): FileAuditProvider {
  const config: Record<string, unknown> = {
    'ngdpbase.audit.provider.file.auditfilename': 'audit.log',
    'ngdpbase.audit.provider.file.archivefilename': 'audit-archive.log',
    'ngdpbase.audit.provider.file.maxfilesize': '10MB',
    'ngdpbase.audit.provider.file.maxfiles': 10,
    'ngdpbase.audit.flushinterval': 100000
  };
  const engine = {
    getManager: (name: string) => (name === 'ConfigurationManager'
      ? {
        getProperty: (k: string, d: unknown) => (k in config ? config[k] : d),
        getResolvedDataPath: (k: string) => (k === 'ngdpbase.backup.restore-manifest' ? siteFile : logs)
      }
      : null)
  } as never;
  return new FileAuditProvider(engine);
}

const records = async (file: string): Promise<Record<string, unknown>[]> =>
  (await fs.readFile(file, 'utf8')).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as Record<string, unknown>);

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdpbase-1876-audit-'));
  logs = path.join(dir, 'logs');
  backups = path.join(dir, 'backups');
  siteFile = path.join(dir, 'site-restore.json');
  await fs.ensureDir(logs);
  await fs.ensureDir(backups);
  process.env[BACKUP_KEY_ENV] = 'backup-key-not-a-secret';
});

afterEach(async () => {
  if (savedKey === undefined) delete process.env[BACKUP_KEY_ENV]; else process.env[BACKUP_KEY_ENV] = savedKey;
  // Only this test's own temp directory.
  await fs.remove(dir);
});

async function stage(p: FileAuditProvider, data: Awaited<ReturnType<FileAuditProvider['backupFiles']>>['data']): Promise<void> {
  beginSiteRestore(siteFile, { stagedAt: new Date().toISOString(), backup: new Date().toISOString(), source: 'b1.json.gz.enc', stagedBy: 'admin' });
  await p.stageRestore(data, { ctx: CTX, directory: backups, siteRestore: siteFile, readArchive: archiveReader(backups) });
  commitSiteRestore(siteFile);
}

describe('the audit log in a backup (#1876)', () => {
  test('backs up the audit files only, encrypted; restores them at the next start with the chain intact', async () => {
    await fs.writeFile(path.join(logs, 'app.log'), 'application log line\n');
    const p = makeProvider();
    await p.initialize();
    for (let i = 0; i < 3; i++) await p.logAuditEvent({ eventType: 'page-edit', user: `before-${i}` });
    const { data } = await p.backupFiles({ ctx: CTX, directory: backups, stem: 'b1', archive: archiveWriter(backups, 'b1') });
    expect(data).toMatchObject({ archive: 'b1.audit.tar.enc', files: 1, keyFingerprint: expect.any(String) });
    const entries: string[] = [];
    await listTreeArchive(path.join(backups, data.archive), (e) => entries.push(e.path), { backupKey: process.env[BACKUP_KEY_ENV] });
    expect(entries).toEqual(['audit.log']);

    // After the backup: more records, and a rotation to an archive the backup never saw.
    for (let i = 0; i < 2; i++) await p.logAuditEvent({ eventType: 'page-edit', user: `after-${i}` });
    await p.flush();
    await fs.writeFile(path.join(logs, 'audit-archive.log.2099-01-01T00-00-00-000Z'), '');
    await stage(p, data);
    // Staging touches nothing live.
    expect((await records(path.join(logs, 'audit.log'))).length).toBe(5);
    await p.close();

    const restarted = makeProvider();
    await restarted.initialize();
    expect(readSiteRestore(siteFile)).toBeNull();
    const restored = await records(path.join(logs, 'audit.log'));
    expect(restored.map((r) => r.user)).toEqual(['before-0', 'before-1', 'before-2']);
    expect(verifyChain(restored)).toEqual({ ok: true, checked: 3 });
    // Everything from before is kept, newer archive included, and still verifies.
    const kept = path.join(logs, 'audit.log.pre-restore');
    expect((await fs.readdir(kept)).sort()).toEqual(['audit-archive.log.2099-01-01T00-00-00-000Z', 'audit.log']);
    expect(verifyChain(await records(path.join(kept, 'audit.log')))).toEqual({ ok: true, checked: 5 });
    expect(await fs.pathExists(path.join(logs, 'audit-archive.log.2099-01-01T00-00-00-000Z'))).toBe(false);
    expect(await fs.readFile(path.join(logs, 'app.log'), 'utf8')).toBe('application log line\n');

    // The chain resumes from the backup's last record.
    await restarted.logAuditEvent({ eventType: 'page-edit', user: 'after-restore' });
    await restarted.flush();
    const now = await records(path.join(logs, 'audit.log'));
    expect(verifyChain(now)).toEqual({ ok: true, checked: 4 });
    expect(now.at(-1)).toMatchObject({ seq: 4, prevHash: restored.at(-1).hash });
    await restarted.close();
  });

  test('an archive holding anything but audit files stages nothing', async () => {
    const p = makeProvider();
    await p.initialize();
    const work = path.join(dir, 'forge');
    await fs.ensureDir(work);
    await fs.writeFile(path.join(work, 'app.log'), 'not an audit file');
    await writeTreeArchive(path.join(backups, 'b1.audit.tar.enc'), work, { backupKey: process.env[BACKUP_KEY_ENV] });
    const { backupKeyFingerprint } = await import('../../utils/backupKey');
    beginSiteRestore(siteFile, { stagedAt: '', backup: '', source: 'b1', stagedBy: 'admin' });
    await expect(p.stageRestore({ format: 1, archive: 'b1.audit.tar.enc', files: 1, bytes: 1, keyFingerprint: backupKeyFingerprint(process.env[BACKUP_KEY_ENV]) }, { ctx: CTX, directory: backups, siteRestore: siteFile, readArchive: archiveReader(backups) }))
      .rejects.toThrow(/not audit files/);
    expect(await fs.pathExists(path.join(logs, 'audit.log.staged'))).toBe(false);
    await p.close();
  });
});
