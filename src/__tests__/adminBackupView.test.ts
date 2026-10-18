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

  test('no safety-backup row when the staged restore names none', async () => {
    const doc = await render({
      stagedRestore: { version: 1, stagedAt: '2026-10-18T09:00:05Z', backup: '', source: 'x.json.gz', stagedBy: 'jim', databases: [{ name: 'application', live: '/d/a.db', staged: '/d/a.db.staged' }] }
    });
    expect(doc.querySelector('#staged-restore')).not.toBeNull();
    expect(doc.querySelector('#safety-backup')).toBeNull();
  });
});
