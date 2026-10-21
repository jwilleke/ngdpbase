/**
 * #1723 D6 — Admin → Backup's Restore Databases card says plainly, before the
 * confirmation, that only the databases are restored, and once a restore is
 * staged names the safety backup it took first.
 *
 * Renders the real view, header and footer left out.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEW = path.join(__dirname, '../../views/admin-backup.ejs');

const stored = (filename: string, created: string, databases: string[]) => ({
  filename, path: `/b/${filename}`, size: 2048, totalSize: 40960, created: new Date(created), modified: new Date(created), databases
});

async function render(over: Record<string, unknown> = {}): Promise<Document> {
  // The page's own markup: the shared header and footer are other tests' business.
  const template = fs.readFileSync(VIEW, 'utf8').replace(/<%- include\('(header|footer)'[^%]*%>/g, '');
  const html = ejs.render(template, {
    success: undefined, error: undefined, csrfToken: 'csrf-value', cspNonce: 'n',
    lockedUnless: () => '',
    status: { config: { enabled: false, time: '02:00', days: 'daily', maxBackups: 10, directory: '/b' }, lastBackup: null },
    recentBackups: [stored('2026-10-17T02-00-00-000Z-ngdpbase-backup.json.gz', '2026-10-17T02:00:00Z', ['application'])],
    databasesEnabled: true, stagedRestore: null, restoreRunning: false, siteName: 'jimstest',
    ...over
  }, { filename: VIEW });
  return new JSDOM(html).window.document;
}

const text = (el: { textContent: string | null } | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('#1723 Admin → Backup, Restore Databases', () => {
  test('says the restore is the databases only, before the confirmation', async () => {
    const doc = await render();
    const scope = doc.querySelector('#restore-scope');
    expect(text(scope)).toBe('Restores the databases only. Pages, users and settings are not changed.');
    const form = doc.querySelector('#restore-form')!;
    expect(scope!.compareDocumentPosition(form) & 4 /* FOLLOWING */).toBeTruthy();
  });

  test('a staged restore names the safety backup taken first, with its date', async () => {
    const safety = '2026-10-18T09-00-00-000Z-ngdpbase-backup.json.gz';
    const doc = await render({
      recentBackups: [stored(safety, '2026-10-18T09:00:00Z', ['application']), stored('2026-10-17T02-00-00-000Z-ngdpbase-backup.json.gz', '2026-10-17T02:00:00Z', ['application'])],
      stagedRestore: { version: 1, stagedAt: '2026-10-18T09:00:05Z', backup: '2026-10-17T02:00:00Z', source: '2026-10-17T02-00-00-000Z-ngdpbase-backup.json.gz', stagedBy: 'jim', safetyBackup: safety, databases: [{ name: 'application', live: '/d/ngdpbase.db', staged: '/d/ngdpbase.db.staged' }] }
    });
    const row = text(doc.querySelector('#safety-backup'));
    expect(row).toContain(`saved as ${safety}`);
    expect(row).toContain(new Date('2026-10-18T09:00:00Z').toLocaleString());
    expect(row).toMatch(/restore it to undo this restore/);
    expect(text(doc.querySelector('#staged-restore'))).toMatch(/Staged by\s*jim/);
  });

  test('#1892 D2: with the application database unavailable the card is shown, and says the safety backup leaves the databases out', async () => {
    const doc = await render({ databasesEnabled: false, databaseUnavailable: 'The application database /d/ngdpbase.db could not be opened safely: file is not a database' });
    expect(doc.querySelector('#restore-form')).not.toBeNull();
    const alert = text(doc.querySelector('#restore-database-unavailable'));
    expect(alert).toMatch(/the fresh backup taken first leaves the databases out/);
    expect(alert).toMatch(/kept beside the restored ones as \*\.pre-restore/);
    expect(alert).toMatch(/needs NGDPBASE_DATABASE_KEY to be set/);
    // The admin-only reason itself is in the notification, not repeated here.
    expect(alert).not.toMatch(/file is not a database/);
  });

  test('#1892 D2: no unavailable notice on a site whose database is open, and no card on one with none', async () => {
    expect((await render()).querySelector('#restore-database-unavailable')).toBeNull();
    expect((await render({ databasesEnabled: false })).querySelector('#restore-card')).toBeNull();
  });

  test('#1892 D2: a staged restore whose safety backup holds no databases says the files are kept instead', async () => {
    const safety = '2026-10-18T09-00-00-000Z-ngdpbase-backup.json.gz';
    const doc = await render({
      databasesEnabled: false, databaseUnavailable: 'reason',
      recentBackups: [stored(safety, '2026-10-18T09:00:00Z', []), stored('2026-10-17T02-00-00-000Z-ngdpbase-backup.json.gz', '2026-10-17T02:00:00Z', ['application'])],
      stagedRestore: { version: 1, stagedAt: '2026-10-18T09:00:05Z', backup: '2026-10-17T02:00:00Z', source: '2026-10-17T02-00-00-000Z-ngdpbase-backup.json.gz', stagedBy: 'jim', safetyBackup: safety, databases: [{ name: 'application', live: '/d/ngdpbase.db', staged: '/d/ngdpbase.db.staged' }] }
    });
    expect(text(doc.querySelector('#safety-backup-no-databases'))).toMatch(/It holds no databases.*kept as \*\.pre-restore at the restart instead\. To undo this restore, put those files back/);
    expect(text(doc.querySelector('#safety-backup'))).not.toMatch(/restore it to undo/);
  });

  test('no safety-backup row when the staged restore names none', async () => {
    const doc = await render({
      stagedRestore: { version: 1, stagedAt: '2026-10-18T09:00:05Z', backup: '', source: 'x.json.gz', stagedBy: 'jim', databases: [{ name: 'application', live: '/d/a.db', staged: '/d/a.db.staged' }] }
    });
    expect(doc.querySelector('#staged-restore')).not.toBeNull();
    expect(doc.querySelector('#safety-backup')).toBeNull();
  });
});

describe('#1876 Admin → Backup, the backup key', () => {
  test('asks for the key to be saved, with its fingerprint and the way to see it, until an admin confirms; never the key', async () => {
    const doc = await render({ backupKey: { set: true, fingerprint: 'abcdef0123456789', saved: false } });
    expect(text(doc.querySelector('#backup-key-fingerprint'))).toBe('abcdef0123456789');
    expect(doc.querySelector('#backup-key-not-saved')).not.toBeNull();
    expect(doc.querySelector('#backup-key-show')?.getAttribute('href')).toBe('/admin/backup/key');
    const saved = await render({ backupKey: { set: true, fingerprint: 'abcdef0123456789', saved: true } });
    expect(saved.querySelector('#backup-key-not-saved')).toBeNull();
    expect(saved.querySelector('#backup-key-saved')).not.toBeNull();
  });

  test('a keyless backup is marked "no sign-in credentials"; an encrypted one is not', async () => {
    const doc = await render({
      backupKey: { set: true, fingerprint: 'f', saved: true },
      recentBackups: [
        { ...stored('2026-10-17T02-00-00-000Z-ngdpbase-backup.json.gz', '2026-10-17T02:00:00Z', ['application']), encrypted: false },
        { ...stored('2026-10-18T02-00-00-000Z-ngdpbase-backup.json.gz.enc', '2026-10-18T02:00:00Z', ['application']), encrypted: true }
      ]
    });
    const marks = [...doc.querySelectorAll('.keyless-backup')];
    expect(marks).toHaveLength(1);
    expect(text(marks[0])).toBe('no sign-in credentials');
    expect(marks[0].closest('tr')?.getAttribute('data-backup')).toBe('2026-10-17T02-00-00-000Z-ngdpbase-backup.json.gz');
  });

  test('a site with no backup key says so on the restore card, plainly, and still asks for the typed confirmation', async () => {
    const doc = await render({ backupKey: { set: false, fingerprint: null, saved: false } });
    const warning = text(doc.querySelector('#restore-no-key'));
    expect(warning).toContain('passwords return to what they were on the backup date');
    expect(warning).toContain('Passkeys and authenticator apps are not restored');
    expect(warning).toContain("won't have admin rights until they set up a passkey again");
    expect(doc.querySelector('#restoreConfirm')).not.toBeNull();
    expect(doc.querySelector('#backup-key-missing')).not.toBeNull();
    expect((await render({ backupKey: { set: true, fingerprint: 'f', saved: true } })).querySelector('#restore-no-key')).toBeNull();
  });
});

describe('#1876 the page that shows the backup key', () => {
  test('shows the key to copy, its fingerprint, and the confirmation it is saved', async () => {
    const page = path.join(__dirname, '../../views/admin-backup-key.ejs');
    const template = fs.readFileSync(page, 'utf8').replace(/<%- include\('(header|footer)'[^%]*%>/g, '');
    const doc = new JSDOM(ejs.render(template, { key: 'the-key-to-copy', fingerprint: 'abcdef0123456789', csrfToken: 'c', lockedUnless: () => '' }, { filename: page })).window.document;
    expect((doc.querySelector('#backup-key-value') as HTMLInputElement).value).toBe('the-key-to-copy');
    expect(doc.querySelector('#backup-key-confirm input[name=fingerprint]')?.getAttribute('value')).toBe('abcdef0123456789');
    expect(doc.querySelector('#backup-key-confirm')?.getAttribute('action')).toBe('/admin/backup/key/saved');
  });
});

