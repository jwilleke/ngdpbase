/**
 * #2470 — Admin → Backup is six status cards, in the order an admin works through them:
 * Auto Backup, Manual Backup, Backup key, Shared folders key, Restore whole site,
 * Restore databases only. Each has an icon, a name, a grey note giving the state in
 * words, a badge on the right and a left edge. A card takes one of three states: plain (no
 * colour, all is well), amber (degraded) or red (failed); there is no green and no grey.
 * A plain card starts collapsed, an amber or red one starts open, so a page of collapsed
 * cards means all is well.
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

function renderHtml(over: Record<string, unknown> = {}): string {
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
  return html;
}

async function render(over: Record<string, unknown> = {}): Promise<Document> {
  return new JSDOM(renderHtml(over)).window.document;
}

/** The page with its own script run, opened at the given URL fragment. */
function renderAt(hash: string, over: Record<string, unknown> = {}): JSDOM {
  return new JSDOM(renderHtml(over), { url: `http://localhost/admin/backup${hash}`, runScripts: 'dangerously' });
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
      // Icons share one width so every name starts at the same left edge.
      expect(summary.querySelector(':scope > i.fas')!.classList.contains('fa-fw'), id).toBe(true);
      // A chevron after the badge says the card opens; it turns when open (CSS).
      const chevron = summary.querySelector(':scope > i.card-summary-chevron');
      expect(chevron, id).not.toBeNull();
      expect(summary.lastElementChild, id).toBe(chevron);
      expect(chevron!.previousElementSibling!.classList.contains('badge'), id).toBe(true);
      expect(text(summary.querySelector(':scope > h6')), id).not.toBe('');
      expect(text(summary.querySelector(':scope > span.text-muted')), id).not.toBe('');
      const badge = summary.querySelector(':scope > .badge.ms-auto');
      expect(text(badge), id).not.toBe('');
      expect(['plain', 'amber', 'red'], id).toContain(statusOf(doc, id));
      expect(card(doc, id).querySelector(':scope > .card-body > details > div.mt-3'), id).not.toBeNull();
    }
  });

  test('a site where everything is set up and working has every card plain (no colour) and collapsed', async () => {
    const doc = await render();
    for (const id of ORDER) {
      expect(statusOf(doc, id), id).toBe('plain');
      expect(isOpen(doc, id), id).toBe(false);
      expect(card(doc, id).classList.contains('status-card-plain'), id).toBe(true);
      expect(card(doc, id).querySelector('summary .badge')!.classList.contains('status-badge-plain'), id).toBe(true);
      // No green and no grey badge: a plain badge takes no background colour class.
      expect(card(doc, id).querySelector('summary .badge')!.className, id).not.toMatch(/\bbg-/);
      // A coloured left edge only: Bootstrap's border-4 / border-<colour> would frame all four sides.
      expect(card(doc, id).classList.contains('border-4'), id).toBe(false);
      expect(card(doc, id).classList.contains('border-success'), id).toBe(false);
    }
    expect(text(card(doc, 'auto-backup-card').querySelector('summary > span.text-muted'))).toMatch(/^On, last backup /);
  });

  test('Auto Backup follows the real backup health: off with a recent backup is amber and open; no recent backup, or none at all, is red and open', async () => {
    const offConfig = { config: { enabled: false, time: '03:00', days: 'daily', maxBackups: 10, directory: '/b' }, lastBackup: null };
    // Off, but the last good backup is still inside the window: no fault, so amber.
    const off = await render({ status: offConfig, backupHealth: health({ autoBackup: false, nextRun: null }) });
    expect(statusOf(off, 'auto-backup-card')).toBe('amber');
    expect(isOpen(off, 'auto-backup-card')).toBe(true);
    expect(text(card(off, 'auto-backup-card').querySelector('summary .badge'))).toBe('Off');
    expect(card(off, 'auto-backup-card').classList.contains('status-card-amber')).toBe(true);
    expect(card(off, 'auto-backup-card').querySelector('summary .badge')!.classList.contains('status-badge-amber')).toBe(true);

    // Off, and the last good backup is older than the window: BackupManager sets the fault, so red.
    const offStale = await render({ status: offConfig, backupHealth: health({ autoBackup: false, nextRun: null, stale: true, fault: 'No good backup since Nov 1 (automatic backups are off). Make one from Admin → Backup' }) });
    expect(statusOf(offStale, 'auto-backup-card')).toBe('red');

    // A new site with no backup at all: lastGood is null and the same fault is set, so red, never amber.
    const never = await render({ backupHealth: health({ lastGood: null, stale: true, fault: 'No good backup since: never — this site has no backup (automatic backups are on, but none has succeeded). Make one from Admin → Backup' }) });
    expect(statusOf(never, 'auto-backup-card')).toBe('red');
    expect(isOpen(never, 'auto-backup-card')).toBe(true);
    expect(text(never.querySelector('#auto-backup-card summary .badge'))).not.toBe('No backup yet');

    const broken = await render({ backupHealth: health({ fault: 'The last backup failed.' }) });
    expect(statusOf(broken, 'auto-backup-card')).toBe('red');
    expect(isOpen(broken, 'auto-backup-card')).toBe(true);
    expect(card(broken, 'auto-backup-card').classList.contains('status-card-red')).toBe(true);
    expect(card(broken, 'auto-backup-card').querySelector('summary .badge')!.classList.contains('status-badge-red')).toBe(true);
    // The backup-health status stays inside the card.
    expect(card(broken, 'auto-backup-card').querySelector('#backup-health')).not.toBeNull();
  });

  test('Manual Backup: collapsed once a backup is stored; with none, collapsed while automatic backups work and open while they do not', async () => {
    expect(isOpen(await render(), 'manual-backup-card')).toBe(false);
    const noneAutoOk = await render({ recentBackups: [] });
    expect(statusOf(noneAutoOk, 'manual-backup-card')).toBe('plain');
    expect(isOpen(noneAutoOk, 'manual-backup-card')).toBe(false);
    const noneAutoOff = await render({ recentBackups: [], status: { config: { enabled: false, time: '03:00', days: 'daily', maxBackups: 10, directory: '/b' }, lastBackup: null } });
    expect(statusOf(noneAutoOff, 'manual-backup-card')).toBe('amber');
    expect(isOpen(noneAutoOff, 'manual-backup-card')).toBe(true);
  });

  test('Backup key: collapsed once set up; open and amber until saved or after .env keys changed; red with no key', async () => {
    expect(isOpen(await render(), 'backup-key-card')).toBe(false);

    const unsaved = await render({ backupKey: { set: true, fingerprint: 'abcdef0123456789', saved: false } });
    expect(statusOf(unsaved, 'backup-key-card')).toBe('amber');
    expect(isOpen(unsaved, 'backup-key-card')).toBe(true);

    const changed = await render({ envKeys: { ...(allWell().envKeys as object), added: ['NEW_KEY'] } });
    expect(statusOf(changed, 'backup-key-card')).toBe('amber');
    expect(isOpen(changed, 'backup-key-card')).toBe(true);

    const missing = await render({ backupKey: { set: false, fingerprint: null, saved: false } });
    expect(statusOf(missing, 'backup-key-card')).toBe('red');
    expect(isOpen(missing, 'backup-key-card')).toBe(true);
  });

  test('Backup key: the card holding the "I have saved .env" button is amber and open whenever that button is shown', async () => {
    const all = allWell();
    const variants: Record<string, Record<string, unknown>> = {
      'backup key unsaved': { backupKey: { set: true, fingerprint: 'abcdef0123456789', saved: false } },
      '.env keys changed': { envKeys: { ...(all.envKeys as object), added: ['NEW_KEY'] } },
      'shared folders key unsaved, backup key saved': { sharedFoldersKey: { set: true, fingerprint: 'fedcba9876543210', saved: false } }
    };
    for (const [name, over] of Object.entries(variants)) {
      const doc = await render(over);
      expect(doc.querySelector('#backup-env-confirm'), name).not.toBeNull();
      expect(card(doc, 'backup-key-card').querySelector('#backup-env-confirm'), name).not.toBeNull();
      expect(statusOf(doc, 'backup-key-card'), name).toBe('amber');
      expect(isOpen(doc, 'backup-key-card'), name).toBe(true);
    }
    const quiet = await render();
    expect(quiet.querySelector('#backup-env-confirm')).toBeNull();
    expect(isOpen(quiet, 'backup-key-card')).toBe(false);
  });

  test('Shared folders key: collapsed once set up; open and amber with unconfirmed words or an unsaved .env; red when the keys cannot be used; plain and collapsed when not in use or not available', async () => {
    expect(isOpen(await render(), 'shared-folders-key')).toBe(false);

    const unused = await render({ sharedFoldersWords: null, sharedFolderNames: [] });
    expect(statusOf(unused, 'shared-folders-key')).toBe('plain');
    expect(isOpen(unused, 'shared-folders-key')).toBe(false);
    expect(text(card(unused, 'shared-folders-key').querySelector('summary .badge'))).toBe('Not in use');
    expect(card(unused, 'shared-folders-key').querySelector('summary .badge')!.className).not.toMatch(/\bbg-/);
    expect(text(card(unused, 'shared-folders-key').querySelector('summary > span.text-muted'))).not.toBe('');

    const absent = await render({ sharedFoldersWords: null, sharedFolderNames: [], sharedFoldersAbsent: true, sharedFoldersUnavailable: 'Shared folders are not available on this site' });
    expect(statusOf(absent, 'shared-folders-key')).toBe('plain');
    expect(isOpen(absent, 'shared-folders-key')).toBe(false);
    expect(text(card(absent, 'shared-folders-key').querySelector('summary .badge'))).toBe('Not available');

    const pending = await render({ sharedFoldersWords: { madeAt: '2026-11-01T10:00:00.000Z', shownTo: 'jim', pending: ['jim'], protectsFolders: false } });
    expect(statusOf(pending, 'shared-folders-key')).toBe('amber');
    expect(isOpen(pending, 'shared-folders-key')).toBe(true);

    const unsaved = await render({ sharedFoldersKey: { set: true, fingerprint: 'fedcba9876543210', saved: false } });
    expect(statusOf(unsaved, 'shared-folders-key')).toBe('amber');
    expect(isOpen(unsaved, 'shared-folders-key')).toBe(true);

    const broken = await render({ sharedFoldersUnavailable: 'The shared-folders key could not be read' });
    expect(statusOf(broken, 'shared-folders-key')).toBe('red');
    expect(isOpen(broken, 'shared-folders-key')).toBe(true);
  });

  test('Restore cards open on their own when a restore is pending or a database cannot be opened', async () => {
    const quiet = await render();
    expect(isOpen(quiet, 'site-restore-card')).toBe(false);
    expect(isOpen(quiet, 'restore-card')).toBe(false);

    const siteStaged = await render({ stagedSiteRestore: { state: 'staged', backup: '2026-11-20T02:00:00Z', source: 'x.json.gz', stagedAt: '2026-11-21T09:00:05Z', stagedBy: 'jim' } });
    expect(statusOf(siteStaged, 'site-restore-card')).toBe('amber');
    expect(isOpen(siteStaged, 'site-restore-card')).toBe(true);
    expect(text(card(siteStaged, 'site-restore-card').querySelector('summary > span.text-muted'))).toMatch(/waits for the restart/);

    // A whole-site restore includes the databases, so the databases card must not say nothing is waiting.
    expect(text(card(siteStaged, 'restore-card').querySelector('summary > span.text-muted'))).not.toMatch(/No restore waiting/);

    const dbStaged = await render({ stagedRestore: stagedDb });
    expect(statusOf(dbStaged, 'restore-card')).toBe('amber');
    expect(isOpen(dbStaged, 'restore-card')).toBe(true);

    const unreadable = await render({ stagedSiteRestoreError: 'bad record' });
    expect(statusOf(unreadable, 'site-restore-card')).toBe('red');
    expect(isOpen(unreadable, 'site-restore-card')).toBe(true);

    const unavailable = await render({ databasesEnabled: false, databaseUnavailable: 'could not be opened' });
    expect(statusOf(unavailable, 'restore-card')).toBe('red');
    expect(isOpen(unavailable, 'restore-card')).toBe(true);
    expect(card(unavailable, 'restore-card').classList.contains('status-card-red')).toBe(true);

    const running = await render({ restoreRunning: true });
    expect(isOpen(running, 'site-restore-card')).toBe(true);
  });

  test('the shared status card takes a state: plain (no colour), amber or red, and nothing else', () => {
    const CARD = path.join(__dirname, '../../views/_status-card.ejs');
    const CARD_SUMMARY_DIR = path.join(__dirname, '../../views');
    const cardOf = (state: string): Element => {
      const html = ejs.render(fs.readFileSync(CARD, 'utf8'), { part: 'start', id: 'c', icon: 'fa-clock', title: 'T', state, badge: 'B', hint: 'h' }, { filename: path.join(CARD_SUMMARY_DIR, '_status-card.ejs') });
      return new JSDOM(html).window.document.querySelector('#c')!;
    };
    const plain = cardOf('plain');
    const amber = cardOf('amber');
    const red = cardOf('red');
    expect([plain, amber, red].map(c => c.getAttribute('data-status'))).toEqual(['plain', 'amber', 'red']);
    expect([plain, amber, red].map(c => c.querySelector('details')!.hasAttribute('open'))).toEqual([false, true, true]);
    expect(plain.className).toMatch(/status-card-plain/);
    expect(amber.className).toMatch(/status-card-amber/);
    expect(red.className).toMatch(/status-card-red/);
    expect(plain.querySelector('.badge')!.className).toMatch(/status-badge-plain/);
    expect(amber.querySelector('.badge')!.className).toMatch(/status-badge-amber/);
    expect(red.querySelector('.badge')!.className).toMatch(/status-badge-red/);
    for (const c of [plain, amber, red]) expect(c.outerHTML).not.toMatch(/success|secondary|bg-/);
  });

  describe('a URL fragment opens the card it names', () => {
    const closed = { sharedFoldersWords: null, sharedFolderNames: [] };

    test('/admin/backup#shared-folders-key opens the plain, collapsed Shared folders key card', () => {
      expect(isOpen(new JSDOM(renderHtml(closed)).window.document, 'shared-folders-key')).toBe(false);
      const dom = renderAt('#shared-folders-key', closed);
      expect(isOpen(dom.window.document, 'shared-folders-key')).toBe(true);
      // Only that card.
      expect(isOpen(dom.window.document, 'manual-backup-card')).toBe(false);
    });

    test('an element inside a card opens the card that holds it', () => {
      const dom = renderAt('#backup-env-download');
      expect(isOpen(dom.window.document, 'backup-key-card')).toBe(true);
    });

    test('no fragment, or one that names nothing, leaves every card as it was', () => {
      for (const hash of ['', '#nothing-here']) {
        const doc = renderAt(hash).window.document;
        for (const id of ORDER) expect(isOpen(doc, id), `${hash} ${id}`).toBe(false);
      }
    });

    test('a fragment that cannot be decoded changes nothing and does not stop the rest of the page script', () => {
      const dom = renderAt('#%E0%A4%A');
      const doc = dom.window.document;
      for (const id of ORDER) expect(isOpen(doc, id), id).toBe(false);
      // The script after it still ran: the Custom days handler builds the value on submit.
      const custom = doc.getElementById('days_custom') as HTMLInputElement;
      expect(custom).not.toBeNull();
      custom.checked = true;
      custom.value = 'unchanged';
      doc.getElementById('auto-backup-form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
      expect(custom.value).toBe('daily');
    });

    test('moving to a card after the page loaded opens it too', async () => {
      const dom = renderAt('', closed);
      dom.window.location.hash = '#shared-folders-key';
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(isOpen(dom.window.document, 'shared-folders-key')).toBe(true);
    });
  });

  test('the style sheet gives a status card a 4px coloured left edge, a turning chevron and a visible focus ring', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../themes/core.css'), 'utf8');
    expect(css).toMatch(/\.status-card\s*\{[^}]*border-left-width:\s*4px/);
    for (const tone of ['amber', 'red']) expect(css).toMatch(new RegExp(`\\.status-card-${tone}\\s*\\{[^}]*border-left-color`));
    // A plain card has no colour on its edge and no green or grey states exist.
    expect(css).toMatch(/\.status-card-plain\s*\{[^}]*border-left-width:\s*1px/);
    expect(css).not.toMatch(/\.status-card-(success|secondary|warning|danger)\b/);
    expect(css).toMatch(/\.status-badge-plain\s*\{[^}]*background:\s*transparent/);
    expect(css).toMatch(/details\[open\][^{]*\.card-summary-chevron\s*\{[^}]*rotate\(180deg\)/);
    // Below 576px the grey note drops to its own full-width line under the title, badge and chevron.
    expect(css).toMatch(/@media \(max-width: 575\.98px\)\s*\{[^@]*\.status-card \.card-summary\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/@media \(max-width: 575\.98px\)\s*\{[^@]*\.status-card \.card-summary > span\.text-muted\s*\{[^}]*flex-basis:\s*100%/);
    expect(css).toMatch(/\.card-summary:focus-visible\s*\{[^}]*outline/);
  });

  test('below 576px the title wraps inside its own column and the badge and chevron never leave the first line', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../themes/core.css'), 'utf8');
    const narrow = (css.match(/@media \(max-width: 575\.98px\)\s*\{[^@]*\}\s*\}/) || [''])[0];
    expect(narrow).toMatch(/\.status-card \.card-summary > h6\s*\{[^}]*flex:\s*1 1 0[^}]*min-width:\s*0/);
    expect(narrow).toMatch(/\.status-card \.card-summary > \.badge,\s*\.status-card \.card-summary > \.card-summary-chevron\s*\{[^}]*flex:\s*0 0 auto/);
  });
});
