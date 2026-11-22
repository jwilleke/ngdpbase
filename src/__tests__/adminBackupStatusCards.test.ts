/**
 * #2470 — Admin → Backup is six status cards, in the order an admin works through them:
 * Auto Backup, Manual Backup, Backup key, Shared folders key, Restore whole site,
 * Restore databases only. Each has an icon, a name, a grey note giving the state in
 * words, a badge on the right and a coloured edge: green when done or on, amber when
 * it needs the admin, red when broken. A card that is done or on starts collapsed,
 * one that needs the admin starts open, so a page of collapsed cards means all is well.
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

const health = (over: Record<string, unknown> = {}) => ({
  lastGood: { filename: 'x', at: '2026-11-21T08:00:00.000Z', size: 2048, location: '/b' },
  autoBackup: true, nextRun: '2026-11-22T08:00:00.000Z', freeBytes: 1e9, failure: null, staleAfterMs: 1, stale: false, fault: null, ...over
});

/** A site where everything is set up and working. */
const allWell = (): Record<string, unknown> => ({
  status: { config: { enabled: true, time: '03:00', days: 'daily', maxBackups: 10, directory: '/b' }, lastBackup: null },
  backupHealth: health(),
  backupKey: { set: true, fingerprint: 'abcdef0123456789', saved: true },
  envKeys: { names: ['NGDPBASE_BACKUP_KEY'], fingerprint: '0123456789abcdef', recorded: true, added: [], removed: [], holdsBackupKey: true, holdsSharedFoldersKey: true },
  sharedFoldersKey: { set: true, fingerprint: 'fedcba9876543210', saved: true },
  sharedFoldersWords: { madeAt: '2026-11-01T10:00:00.000Z', shownTo: 'jim', pending: [], protectsFolders: true },
  sharedFolderNames: ['default']
});

async function render(over: Record<string, unknown> = {}): Promise<Document> {
  const template = fs.readFileSync(VIEW, 'utf8').replace(/<%- include\('(header|footer)'[^%]*%>/g, '');
  const html = ejs.render(template, {
    success: undefined, error: undefined, csrfToken: 'csrf-value', cspNonce: 'n',
    lockedUnless: () => '', formatBytes: (n: number) => `${n} B`,
    status: { config: { enabled: false, time: '02:00', days: 'daily', maxBackups: 10, directory: '/b' }, lastBackup: null },
    recentBackups: [stored('2026-10-17T02-00-00-000Z-ngdpbase-backup.json.gz', '2026-10-17T02:00:00Z', ['application'])],
    databasesEnabled: true, stagedRestore: null, restoreRunning: false, siteName: 'jimstest',
    ...allWell(),
    ...over
  }, { filename: VIEW });
  return new JSDOM(html).window.document;
}

const text = (el: { textContent: string | null } | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const card = (doc: Document, id: string): Element => doc.querySelector(`#${id}`)!;
const isOpen = (doc: Document, id: string): boolean => card(doc, id).querySelector('details')!.hasAttribute('open');
const statusOf = (doc: Document, id: string): string | null => card(doc, id).getAttribute('data-status');

const ORDER = ['auto-backup-card', 'manual-backup-card', 'backup-key-card', 'shared-folders-key', 'site-restore-card', 'restore-card'];
const stagedDb = { version: 1, stagedAt: '2026-11-21T09:00:05Z', backup: '2026-11-20T02:00:00Z', source: 'x.json.gz', stagedBy: 'jim', databases: [{ name: 'application', live: '/d/a.db', staged: '/d/a.db.staged' }] };

describe('#2470 Admin → Backup status cards', () => {
  test('six cards, in order: Auto Backup, Manual Backup, Backup key, Shared folders key, Restore whole site, Restore databases only', async () => {
    const doc = await render();
    const cards = [...doc.querySelectorAll('.status-card')];
    expect(cards.map(c => c.id)).toEqual(ORDER);
    expect(cards.map(c => text(c.querySelector('summary h6')))).toEqual([
      'Auto Backup', 'Manual Backup', 'Backup key', 'Shared folders key', 'Restore the whole site', 'Restore the databases only'
    ]);
  });

  test('each card has an icon, a name, a grey note in words, a badge on the right and a status', async () => {
    const doc = await render();
    for (const id of ORDER) {
      const summary = card(doc, id).querySelector('details > summary.card-summary')!;
      expect(summary, id).not.toBeNull();
      expect(summary.querySelector(':scope > i.fas'), id).not.toBeNull();
      expect(text(summary.querySelector(':scope > h6')), id).not.toBe('');
      expect(text(summary.querySelector(':scope > span.text-muted')), id).not.toBe('');
      const badge = summary.querySelector(':scope > .badge.ms-auto');
      expect(text(badge), id).not.toBe('');
      expect(['ok', 'attention', 'broken', 'idle'], id).toContain(statusOf(doc, id));
      expect(card(doc, id).querySelector(':scope > .card-body > details > div.mt-3'), id).not.toBeNull();
    }
  });

  test('a site where everything is set up and working has every card green and collapsed', async () => {
    const doc = await render();
    for (const id of ORDER) {
      expect(statusOf(doc, id), id).toBe('ok');
      expect(isOpen(doc, id), id).toBe(false);
      expect(card(doc, id).classList.contains('border-success'), id).toBe(true);
      expect(card(doc, id).querySelector('summary .badge')!.classList.contains('bg-success'), id).toBe(true);
    }
    expect(text(card(doc, 'auto-backup-card').querySelector('summary > span.text-muted'))).toMatch(/^On, last backup /);
  });

  test('Auto Backup: off or no backup yet needs the admin (amber, open); a backup fault is red and open', async () => {
    const off = await render({ status: { config: { enabled: false, time: '03:00', days: 'daily', maxBackups: 10, directory: '/b' }, lastBackup: null }, backupHealth: health({ autoBackup: false, nextRun: null }) });
    expect(statusOf(off, 'auto-backup-card')).toBe('attention');
    expect(isOpen(off, 'auto-backup-card')).toBe(true);
    expect(card(off, 'auto-backup-card').classList.contains('border-warning')).toBe(true);
    expect(card(off, 'auto-backup-card').querySelector('summary .badge')!.classList.contains('bg-warning')).toBe(true);

    const never = await render({ backupHealth: health({ lastGood: null }) });
    expect(statusOf(never, 'auto-backup-card')).toBe('attention');

    const broken = await render({ backupHealth: health({ fault: 'The last backup failed.' }) });
    expect(statusOf(broken, 'auto-backup-card')).toBe('broken');
    expect(isOpen(broken, 'auto-backup-card')).toBe(true);
    expect(card(broken, 'auto-backup-card').classList.contains('border-danger')).toBe(true);
    expect(card(broken, 'auto-backup-card').querySelector('summary .badge')!.classList.contains('bg-danger')).toBe(true);
    // The backup-health status stays inside the card.
    expect(card(broken, 'auto-backup-card').querySelector('#backup-health')).not.toBeNull();
  });

  test('Manual Backup: collapsed once a backup is stored; with none, collapsed while automatic backups work and open while they do not', async () => {
    expect(isOpen(await render(), 'manual-backup-card')).toBe(false);
    const noneAutoOk = await render({ recentBackups: [] });
    expect(statusOf(noneAutoOk, 'manual-backup-card')).toBe('ok');
    expect(isOpen(noneAutoOk, 'manual-backup-card')).toBe(false);
    const noneAutoOff = await render({ recentBackups: [], status: { config: { enabled: false, time: '03:00', days: 'daily', maxBackups: 10, directory: '/b' }, lastBackup: null } });
    expect(statusOf(noneAutoOff, 'manual-backup-card')).toBe('attention');
    expect(isOpen(noneAutoOff, 'manual-backup-card')).toBe(true);
  });

  test('Backup key: collapsed once set up; open and amber until saved or after .env keys changed; red with no key', async () => {
    expect(isOpen(await render(), 'backup-key-card')).toBe(false);

    const unsaved = await render({ backupKey: { set: true, fingerprint: 'abcdef0123456789', saved: false } });
    expect(statusOf(unsaved, 'backup-key-card')).toBe('attention');
    expect(isOpen(unsaved, 'backup-key-card')).toBe(true);

    const changed = await render({ envKeys: { ...(allWell().envKeys as object), added: ['NEW_KEY'] } });
    expect(statusOf(changed, 'backup-key-card')).toBe('attention');
    expect(isOpen(changed, 'backup-key-card')).toBe(true);

    const missing = await render({ backupKey: { set: false, fingerprint: null, saved: false } });
    expect(statusOf(missing, 'backup-key-card')).toBe('broken');
    expect(isOpen(missing, 'backup-key-card')).toBe(true);
  });

  test('Shared folders key: collapsed once set up; open and amber with unconfirmed words or an unsaved .env; red when the keys cannot be used; grey and collapsed when not in use or not available', async () => {
    expect(isOpen(await render(), 'shared-folders-key')).toBe(false);

    const unused = await render({ sharedFoldersWords: null, sharedFolderNames: [] });
    expect(statusOf(unused, 'shared-folders-key')).toBe('idle');
    expect(isOpen(unused, 'shared-folders-key')).toBe(false);
    expect(text(card(unused, 'shared-folders-key').querySelector('summary .badge'))).toBe('Not in use');
    expect(card(unused, 'shared-folders-key').querySelector('summary .badge')!.classList.contains('bg-secondary')).toBe(true);

    const absent = await render({ sharedFoldersWords: null, sharedFolderNames: [], sharedFoldersAbsent: true, sharedFoldersUnavailable: 'Shared folders are not available on this site' });
    expect(statusOf(absent, 'shared-folders-key')).toBe('idle');
    expect(isOpen(absent, 'shared-folders-key')).toBe(false);
    expect(text(card(absent, 'shared-folders-key').querySelector('summary .badge'))).toBe('Not available');

    const pending = await render({ sharedFoldersWords: { madeAt: '2026-11-01T10:00:00.000Z', shownTo: 'jim', pending: ['jim'], protectsFolders: false } });
    expect(statusOf(pending, 'shared-folders-key')).toBe('attention');
    expect(isOpen(pending, 'shared-folders-key')).toBe(true);

    const unsaved = await render({ sharedFoldersKey: { set: true, fingerprint: 'fedcba9876543210', saved: false } });
    expect(statusOf(unsaved, 'shared-folders-key')).toBe('attention');
    expect(isOpen(unsaved, 'shared-folders-key')).toBe(true);

    const broken = await render({ sharedFoldersUnavailable: 'The shared-folders key could not be read' });
    expect(statusOf(broken, 'shared-folders-key')).toBe('broken');
    expect(isOpen(broken, 'shared-folders-key')).toBe(true);
  });

  test('Restore cards open on their own when a restore is pending or a database cannot be opened', async () => {
    const quiet = await render();
    expect(isOpen(quiet, 'site-restore-card')).toBe(false);
    expect(isOpen(quiet, 'restore-card')).toBe(false);

    const siteStaged = await render({ stagedSiteRestore: { state: 'staged', backup: '2026-11-20T02:00:00Z', source: 'x.json.gz', stagedAt: '2026-11-21T09:00:05Z', stagedBy: 'jim' } });
    expect(statusOf(siteStaged, 'site-restore-card')).toBe('attention');
    expect(isOpen(siteStaged, 'site-restore-card')).toBe(true);
    expect(text(card(siteStaged, 'site-restore-card').querySelector('summary > span.text-muted'))).toMatch(/waits for the restart/);

    const dbStaged = await render({ stagedRestore: stagedDb });
    expect(statusOf(dbStaged, 'restore-card')).toBe('attention');
    expect(isOpen(dbStaged, 'restore-card')).toBe(true);

    const unreadable = await render({ stagedSiteRestoreError: 'bad record' });
    expect(statusOf(unreadable, 'site-restore-card')).toBe('broken');
    expect(isOpen(unreadable, 'site-restore-card')).toBe(true);

    const unavailable = await render({ databasesEnabled: false, databaseUnavailable: 'could not be opened' });
    expect(statusOf(unavailable, 'restore-card')).toBe('broken');
    expect(isOpen(unavailable, 'restore-card')).toBe(true);
    expect(card(unavailable, 'restore-card').classList.contains('border-danger')).toBe(true);

    const running = await render({ restoreRunning: true });
    expect(isOpen(running, 'site-restore-card')).toBe(true);
  });
});
