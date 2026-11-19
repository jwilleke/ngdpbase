/**
 * #1918 — one look and one Sync flow for shipped content: Admin → Required
 * Pages draws its status words, badges and Sync / Force Sync through core's
 * shared partials. Force Sync always asks first; nothing carries an inline
 * handler. (Forms an add-on provides no longer sync: #1973.)
 *
 * Renders the real partials, as Express does.
 */
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const VIEWS = path.join(ROOT, 'views');

async function partial(name: string, syncItem: Record<string, unknown>): Promise<Document> {
  const html = await ejs.renderFile(path.join(VIEWS, `${name}.ejs`), { syncItem });
  return new JSDOM(`<body>${html}</body>`).window.document;
}

/** The words a status cell shows, in order. */
function statuses(doc: { querySelectorAll(selectors: string): ArrayLike<{ getAttribute(name: string): string | null }> }): string[] {
  return Array.from(doc.querySelectorAll('[data-sync-status]')).map((el) => el.getAttribute('data-sync-status') ?? '');
}

describe('#2389 _sync-status: the plain state words', () => {
  const label = async (item: Record<string, unknown>) => (await partial('_sync-status', item)).body.textContent?.replace(/\s+/g, ' ').trim();

  test('New, and the four states slice 1 can tell', async () => {
    expect(statuses(await partial('_sync-status', { status: 'new', userModified: false }))).toEqual(['new']);
    expect(statuses(await partial('_sync-status', { status: 'current', syncState: 'same-as-shipped', userModified: false }))).toEqual(['same-as-shipped']);
    expect(statuses(await partial('_sync-status', { status: 'modified', syncState: 'update-ready', userModified: false }))).toEqual(['update-ready']);
    expect(statuses(await partial('_sync-status', { status: 'modified', syncState: 'edited-not-confirmed', userModified: true }))).toEqual(['edited-not-confirmed']);
    expect(statuses(await partial('_sync-status', { status: 'modified', syncState: 'both-changed', userModified: true }))).toEqual(['both-changed']);
  });

  test("the labels are the design's words, and never Modified, Current or User Edited", async () => {
    expect(await label({ status: 'current', syncState: 'same-as-shipped', userModified: false })).toBe('Same as shipped');
    expect(await label({ status: 'modified', syncState: 'update-ready', userModified: false })).toBe('Update ready');
    expect(await label({ status: 'modified', syncState: 'edited-not-confirmed', userModified: true })).toBe('Edited here, not confirmed');
    expect(await label({ status: 'modified', syncState: 'both-changed', userModified: true })).toBe('Edited here, and a newer version is available');
  });
});

describe('#2389 slice 2 _sync-status: the two kept states', () => {
  const label = async (item: Record<string, unknown>) => (await partial('_sync-status', item)).body.textContent?.replace(/\s+/g, ' ').trim();

  test('Kept for this site, and the quiet "newer version available" line only when one shipped', async () => {
    const plain = { status: 'modified', syncState: 'kept-for-site', userModified: true };
    expect(statuses(await partial('_sync-status', plain))).toEqual(['kept-for-site']);
    expect(await label(plain)).toBe('Kept for this site');
    expect(await label({ ...plain, newerAvailable: true })).toBe('Kept for this site A newer version is available');
  });

  test('Kept, needs your review, lists what the newer version changes', async () => {
    const item = { status: 'modified', syncState: 'kept-needs-review', userModified: true, workingChanges: ['The shipped page now adds Calendar (calendars=family).'] };
    expect(statuses(await partial('_sync-status', item))).toEqual(['kept-needs-review']);
    const text = await label(item);
    expect(text).toContain('Kept, needs your review');
    expect(text).toContain('The shipped page now adds Calendar (calendars=family).');
  });
});

describe('#2389 _sync-status: "Same as shipped" only for same-as-shipped', () => {
  test('a row with no syncState does not read as Same as shipped', async () => {
    expect(statuses(await partial('_sync-status', { status: 'modified', userModified: false }))).not.toContain('same-as-shipped');
  });
});

describe('#2389 _sync-counts: Update ready and Edited here are counted apart', () => {
  test('two badges, no "Not same as shipped"', async () => {
    const html = await ejs.renderFile(path.join(VIEWS, '_sync-counts.ejs'), {
      syncCounts: { new: 1, outdatedSyncable: 2, outdatedUserEdited: 3, current: 4 }
    });
    const doc = new JSDOM(`<body>${html}</body>`).window.document;
    const text = (kind: string) => doc.querySelector(`[data-sync-count="${kind}"]`)?.textContent?.trim();
    expect(text('new')).toBe('1 New');
    expect(text('update-ready')).toBe('2 Update ready');
    expect(text('edited-here')).toBe('3 Edited here');
    expect(text('current')).toBe('4 Same as shipped');
    expect(doc.body.textContent).not.toContain('Not same as shipped');
  });
});

describe('#2414 _sync-summary: what needs a decision and what Sync All updates, per table', () => {
  const line = async (outdatedUserEdited: number, outdatedSyncable: number) => {
    const html = await ejs.renderFile(path.join(VIEWS, '_sync-summary.ejs'), {
      syncSummary: { counts: { outdatedSyncable, outdatedUserEdited }, testId: 'x-summary' }
    });
    const el = new JSDOM(`<body>${html}</body>`).window.document.querySelector('[data-testid="x-summary"]');
    return el?.textContent?.replace(/\s+/g, ' ').trim();
  };

  test('says "N need a decision; Sync All updates M"', async () => {
    expect(await line(3, 6)).toBe('3 need a decision; Sync All updates 6');
    expect(await line(1, 1)).toBe('1 needs a decision; Sync All updates 1');
  });

  test('says so when nothing needs a decision or nothing is ready, never "(0)"', async () => {
    expect(await line(0, 2)).toBe('Nothing needs a decision; Sync All updates 2');
    expect(await line(2, 0)).toBe('2 need a decision; Sync All has nothing to update');
    expect(await line(0, 0)).toBe('Nothing needs a decision; Sync All has nothing to update');
  });
});

describe('#2414 _sync-status: an unreadable header', () => {
  test('Update ready on such a page carries a short note, other pages do not', async () => {
    const withNote = await partial('_sync-status', { status: 'modified', syncState: 'update-ready', userModified: false, headerUnreadable: true });
    expect(statuses(withNote)).toEqual(['update-ready']);
    const note = withNote.querySelector('[data-sync-note="header-unreadable"]');
    expect(note?.textContent?.trim()).toBe("Page header couldn't be read");
    expect(note?.getAttribute('title')).toContain('Updating the page repairs it');

    const without = await partial('_sync-status', { status: 'modified', syncState: 'update-ready', userModified: false });
    expect(without.querySelector('[data-sync-note]')).toBeNull();
  });
});

describe('#1918 _sync-button', () => {
  test('Sync carries the id and asks nothing', async () => {
    const b = (await partial('_sync-button', { userModified: false, id: 'u-1', name: 'Page' })).querySelector('button')!;
    expect(b.getAttribute('data-action')).toBe('sync');
    expect(b.getAttribute('data-sync-id')).toBe('u-1');
    expect(b.hasAttribute('data-confirm')).toBe(false);
    expect(b.textContent?.trim()).toBe('Update');
  });

  test('a page that is not on the site yet still reads Sync', async () => {
    const b = (await partial('_sync-button', { userModified: false, status: 'new', id: 'u-1', name: 'Page' })).querySelector('button')!;
    expect(b.textContent?.trim()).toBe('Sync');
  });

  test('Use shipped version for an edited copy always asks first, naming the item', async () => {
    const b = (await partial('_sync-button', { userModified: true, id: 'u-1', name: 'Page "A"' })).querySelector('button')!;
    expect(b.getAttribute('data-action')).toBe('force-sync');
    expect(b.textContent?.trim()).toBe('Use shipped version');
    expect(b.getAttribute('data-confirm')).toBe('Replace the changes made to "Page "A"" on this site with the shipped version? Your version stays in the page history.');
  });

  test('names are escaped and no inline handler is drawn', async () => {
    const doc = await partial('_sync-button', { userModified: true, id: 'x"onclick="y', name: '<img src=x onerror=alert(1)>' });
    expect(doc.querySelector('img')).toBeNull();
    const attributes = [...doc.querySelectorAll('*')].flatMap((el) => [...el.attributes].map((a) => a.name));
    expect(attributes.filter((name) => name.startsWith('on'))).toEqual([]);
    expect(doc.querySelector('button')?.getAttribute('data-sync-id')).toBe('x"onclick="y');
  });
});

describe('#1918 Admin → Required Pages draws shipped content through the partials', () => {
  test('it includes them', () => {
    const uses = (file: string, name: string) => (fs.readFileSync(file, 'utf8').match(new RegExp(`include\\('${name}'`, 'g')) ?? []).length;
    const required = path.join(VIEWS, 'admin-required-pages.ejs');
    expect(uses(required, '_sync-status')).toBe(2);
    expect(uses(required, '_sync-button')).toBe(2);
    expect(uses(required, '_sync-counts')).toBe(1);
    // #2414: one summary line per table, drawn by the same partial.
    expect(uses(required, '_sync-summary')).toBe(2);
  });
});

describe('#2389 slice 2 Review dialog and kept badges: the words and the look the design asks for', () => {
  const page = fs.readFileSync(path.join(VIEWS, 'admin-required-pages.ejs'), 'utf8');
  const text = async (item: Record<string, unknown>) => (await partial('_sync-status', item)).body.textContent?.replace(/\s+/g, ' ').trim();

  test('a kept page that needs review says what to do next', async () => {
    const item = { status: 'modified', syncState: 'kept-needs-review', userModified: true, workingChanges: ['The shipped page now shows a page total.'] };
    expect(await text(item)).toContain('Review it to decide whether to keep your version.');
  });

  test('the Kept for this site badge is not the cyan of the Review button', async () => {
    const doc = await partial('_sync-status', { status: 'modified', syncState: 'kept-for-site', userModified: true });
    const badge = doc.querySelector('[data-sync-status="kept-for-site"]');
    expect(badge?.className).not.toMatch(/bg-info/);
    expect(badge?.querySelector('i.fa-user-check')).not.toBeNull();
  });

  test('the dialog is titled Review, with the checkbox, the saved-at-once note and a darker note colour', () => {
    expect(page).toContain('Keep edited version');
    expect(page).not.toContain('Keep my version for this site');
    expect(page).toContain('Saved as soon as you tick it.');
    expect(page).toContain('#495057');
    expect(page).toContain('`Review: ${title}`');
    expect(page).toContain('Changes how the page works');
  });

  test('the note puts the saved-at-once line first and breaks into short lines', () => {
    const start = page.indexOf('id="reviewKeepBox"');
    const note = page.slice(start, page.indexOf('id="reviewKeepStatus"', start));
    const lines = [...note.matchAll(/<span class="d-block[^"]*"[^>]*>([^<]+)<\/span>/g)].map((m) => m[1].trim());
    expect(lines[0]).toBe('Saved as soon as you tick it.');
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(70);
  });

  test('the Kept for this site chip matches its row badge, and the Edited here chip says it also counts kept pages that need review', () => {
    const chip = page.slice(page.indexOf('data-strip-count="kept"') - 120, page.indexOf('data-strip-count="kept"') + 60);
    expect(chip).toContain('bg-light text-dark border border-secondary');
    expect(chip).not.toContain('bg-info');
    const edited = page.slice(page.indexOf('data-testid="count-edited-here"') - 140, page.indexOf('data-testid="count-edited-here"') + 260);
    expect(edited).toContain('Kept, needs your review');
  });

  test('a page that needs review gets one button that keeps the version as it is, with a line saying what it does', () => {
    expect(page).toContain('data-testid="review-keep-reviewed"');
    expect(page).toContain("Keep edited version (I've reviewed this)");
    expect(page).toContain("The newer version's changes will not be added.");
    // Both rows (core and add-on) tell the dialog the page is in that state.
    expect(page.match(/page\.syncState === 'kept-needs-review', page\.workingChanges \|\| \[\], page\.syncState === 'kept-needs-review'/g)?.length).toBe(2);
    expect(page).toContain('async function showDiff(uuid, title, liveUuid = \'\', source = \'\', kept = false, workingChanges = [], needsReview = false)');
  });

  test('the unticked box has a border of at least 3:1 on the dialog background (#6c757d), like the list checkboxes', () => {
    // Only the unticked box gets the grey border; a ticked box keeps the theme's own.
    const input = page.match(/<input[^>]*id="reviewKeepCheck"[^>]*>/)?.[0] ?? '';
    expect(input).not.toContain('border-color');
    expect(page).toMatch(/#reviewKeepCheck:not\(:checked\)\s*\{[^}]*border-color:\s*#6c757d/i);
  });

  test('every kept page, not only one that needs review, opens with the already-kept note', () => {
    expect(page).toContain("(source && kept) ? 'This page is already kept.");
    expect(page).not.toContain("(source && needsReview) ? 'This page is already kept.");
  });

  test('the guides and the design doc name the box Keep edited version, never Keep my version, and give the border as at least 3:1', () => {
    for (const file of ['docs/guides/addons-developer-guide.md', 'docs/planning/addons.md', 'docs/platform/addon-page-handling.md', 'docs/design/required-pages-sync-states.md']) {
      expect(fs.readFileSync(path.join(ROOT, file), 'utf8')).not.toContain('Keep my version');
    }
    const design = fs.readFileSync(path.join(ROOT, 'docs/design/required-pages-sync-states.md'), 'utf8');
    expect(design).toContain('at least 3:1');
    expect(design).not.toContain('4.5:1');
  });

  test('the dialog uses one name for the action: the box and the button both say Keep edited version', () => {
    expect(page).not.toContain('Keep my version');
    const button = page.match(/id="reviewKeepAgainBtn"[^>]*>([^<]+)</)?.[1] ?? '';
    expect(button).toBe("Keep edited version (I've reviewed this)");
  });

  test('a page that opens ticked is told it is already kept, and the note returns to the plain one after a save', () => {
    expect(page).toContain('id="reviewKeepNote"');
    expect(page).toContain('This page is already kept. Untick to stop keeping it (saved at once).');
    const start = page.indexOf('function setupReviewKeep');
    const body = page.slice(start, page.indexOf('document.getElementById(\'diffModal\')', start));
    expect(body).toContain('reviewKeepNote');
  });

  test('the Keep edited version (I\'ve reviewed this) button is hidden as soon as a save changes the box', () => {
    const start = page.indexOf('if (result.success)');
    const success = page.slice(start, page.indexOf('return true;', start));
    expect(success).toContain('again.hidden = true');
  });

  test('a refusal by the content rules is shown as one message, not wrapped in "Nothing was changed"', () => {
    expect(page).toContain('result.contentRefused');
  });

  test('a failed save says what failed and what to do', () => {
    expect(page).toContain('Your choice was not saved. Nothing was changed.');
  });

  test("the Review button's hover text offers only what the dialog offers", () => {
    expect(page).toContain("choose whether to keep this site's version");
    expect(page).not.toContain('or use the shipped one');
  });

  test('the page sentence points to Review, not to Diff', () => {
    expect(page).not.toContain('open Diff, then Use shipped version');
    expect(page).toContain('open Review');
  });
});

describe('#2389 slice 3 _sync-status: the release label', () => {
  const text = async (item: Record<string, unknown>) => (await partial('_sync-status', item)).body.textContent?.replace(/\s+/g, ' ').trim();
  const base = { status: 'modified', syncState: 'update-ready', userModified: false };

  test('shows both releases, with a v in front of each number', async () => {
    expect(await text({ ...base, copyRelease: '5.43.0', thisRelease: '5.45.0' })).toContain('Your copy: v5.43.0 · This release: v5.45.0');
  });

  test('a copy with no label says an earlier release', async () => {
    expect(await text({ ...base, thisRelease: '5.45.0' })).toContain('Your copy: an earlier release · This release: v5.45.0');
  });

  test('when this release is not known, only the copy is shown', async () => {
    const out = await text({ ...base, copyRelease: '5.43.0' });
    expect(out).toContain('Your copy: v5.43.0');
    expect(out).not.toContain('This release');
  });

  test('it shows on every state of a page that is on the site', async () => {
    for (const syncState of ['same-as-shipped', 'update-ready', 'edited-not-confirmed', 'both-changed', 'kept-for-site', 'kept-needs-review']) {
      expect(await text({ status: 'modified', syncState, userModified: false, copyRelease: '5.43.0', thisRelease: '5.45.0' })).toContain('Your copy: v5.43.0 · This release: v5.45.0');
    }
  });

  test('a page that is not on the site yet has no copy to label', async () => {
    expect(await text({ status: 'new', userModified: false, thisRelease: '5.45.0' })).not.toContain('Your copy');
  });

  test('the release text is escaped', async () => {
    const doc = await partial('_sync-status', { ...base, copyRelease: '<b>x</b>', thisRelease: '5.45.0' });
    expect(doc.querySelector('b')).toBeNull();
  });

  test('both lists hand the release to the status cell', () => {
    const view = fs.readFileSync(path.join(VIEWS, 'admin-required-pages.ejs'), 'utf8');
    expect(view.match(/copyRelease: page\.copyRelease, thisRelease: page\.thisRelease/g)).toHaveLength(2);
  });
});

describe('#2389 slice 3 the editor banner for a page that came with the software', () => {
  const editor = fs.readFileSync(path.join(VIEWS, '_basicEditor.ejs'), 'utf8');
  const banner = editor.match(/<% if \(typeof isRequiredPage[\s\S]*?<% \} %>/)?.[0] ?? '';
  const shown = (isRequiredPage: boolean) => new JSDOM(`<body>${ejs.render(banner, { isRequiredPage })}</body>`).window.document;

  test('says the design\'s words and nothing else', () => {
    expect(shown(true).body.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'This page came with the software. Your changes stay on this site: an update will not replace them. ' +
      'An admin will see this page in the list at Admin › Required Pages Sync and confirm that the change was meant. ' +
      'If it was a mistake, the admin can put the original back.'
    );
  });

  test('links to Required Pages Sync', () => {
    expect(shown(true).querySelector('a')?.getAttribute('href')).toBe('/admin/required-pages');
  });

  test('is not drawn for an ordinary page', () => {
    expect(shown(false).body.textContent?.trim()).toBe('');
  });

  test('has no file path, and no word saying changes will be overwritten', () => {
    const words = shown(true).body.textContent ?? '';
    expect(words).not.toContain('required-pages/');
    expect(words).not.toMatch(/overwritten|Shipped page/);
  });
});
