/**
 * #1876 ("one thing to save") — the instance .env is in the backup without the
 * backup key's line, and a staged restore of it keeps the live backup and
 * database key lines. Each test works in its own temp directory and removes
 * only that.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyInstanceEnvAtStart, envForBackup, INSTANCE_ENV_PART, mergeRestoredEnv, siteRestoreFileAtBoot } from '../instanceEnvBackup';
import { beginSiteRestore, commitSiteRestore, recordStagedPart, readSiteRestore } from '../siteRestore';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-envpart-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('the instance .env in a backup (#1876)', () => {
  test('the backup copy has every line but the backup key', () => {
    const out = envForBackup('# a comment\nNGDPBASE_SESSION_SECRET=s\nNGDPBASE_BACKUP_KEY=the-backup-key\nexport NGDPBASE_BACKUP_KEY=again\nSMTP_PASSWORD=p\n');
    expect(out).not.toContain('the-backup-key');
    expect(out).not.toContain('again');
    expect(out).toContain('NGDPBASE_SESSION_SECRET=s');
    expect(out).toContain('SMTP_PASSWORD=p');
  });

  test('a restore takes the backup\'s lines but keeps the live backup and database key lines', () => {
    const merged = mergeRestoredEnv('SMTP_PASSWORD=old\nNGDPBASE_DATABASE_KEY=from-backup\n', 'SMTP_PASSWORD=new\nNGDPBASE_BACKUP_KEY=live-backup-key\nNGDPBASE_DATABASE_KEY=live-db-key\n');
    expect(merged).toContain('SMTP_PASSWORD=old');
    expect(merged).not.toContain('SMTP_PASSWORD=new');
    expect(merged).toContain('NGDPBASE_BACKUP_KEY=live-backup-key');
    expect(merged).toContain('NGDPBASE_DATABASE_KEY=live-db-key');
    expect(merged).not.toContain('from-backup');
    // A key the live file doesn't set stays unset.
    expect(mergeRestoredEnv('NGDPBASE_DATABASE_KEY=from-backup\nA=1\n', 'B=2\n')).toBe('A=1\n');
  });

  test('the manifest is found before the configuration is loaded: the default, a custom path, ./data', () => {
    expect(siteRestoreFileAtBoot(dir, {}, dir)).toBe(path.join(dir, 'site-restore.json'));
    fs.mkdirSync(path.join(dir, 'config'));
    fs.writeFileSync(path.join(dir, 'config', 'app-custom-config.json'), JSON.stringify({ 'ngdpbase.backup.restore-manifest': '${FAST_STORAGE}/restore/site.json' }));
    expect(siteRestoreFileAtBoot(dir, {}, dir)).toBe(path.join(dir, 'restore', 'site.json'));
    fs.writeFileSync(path.join(dir, 'config', 'app-custom-config.json'), JSON.stringify({ 'ngdpbase.backup.restore-manifest': './data/x.json' }));
    expect(siteRestoreFileAtBoot(dir, {}, dir)).toBe(path.join(dir, 'x.json'));
  });

  function stage(content: string): string {
    const site = path.join(dir, 'site-restore.json');
    fs.writeFileSync(path.join(dir, '.env.staged'), content);
    beginSiteRestore(site, { stagedAt: '', backup: '', source: 'b1', stagedBy: 'admin' });
    recordStagedPart(site, { manager: INSTANCE_ENV_PART, swaps: [{ live: path.join(dir, '.env'), staged: path.join(dir, '.env.staged') }] });
    commitSiteRestore(site);
    return site;
  }

  test('applied at start: the merged file takes the live one\'s place, the old one kept', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SMTP_PASSWORD=live\nNGDPBASE_BACKUP_KEY=live-key\n');
    const site = stage('SMTP_PASSWORD=backed-up\n');
    const outcome = applyInstanceEnvAtStart(dir, site);
    expect(outcome?.applied?.before).toContain('SMTP_PASSWORD=live');
    const now = fs.readFileSync(path.join(dir, '.env'), 'utf8');
    expect(now).toContain('SMTP_PASSWORD=backed-up');
    expect(now).toContain('NGDPBASE_BACKUP_KEY=live-key');
    expect(fs.readFileSync(path.join(dir, '.env.pre-restore'), 'utf8')).toContain('SMTP_PASSWORD=live');
    expect(readSiteRestore(site)).toBeNull();
    // Nothing staged: nothing to do.
    expect(applyInstanceEnvAtStart(dir, site)).toBeNull();
  });

  test('a staged .env with no site restore naming it is set aside, never applied', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'A=live\n');
    fs.writeFileSync(path.join(dir, '.env.staged'), 'A=planted\n');
    const outcome = applyInstanceEnvAtStart(dir, path.join(dir, 'site-restore.json'));
    expect(outcome?.refused).toMatch(/no site restore naming them/);
    expect(fs.readFileSync(path.join(dir, '.env'), 'utf8')).toBe('A=live\n');
    expect(fs.existsSync(path.join(dir, '.env.staged.incomplete'))).toBe(true);
  });
});
