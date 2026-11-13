/**
 * #2390 — the Trail button is drawn on every screen that draws the left menu,
 * wiki page or not, and the Required Pages Sync and Diff screens no longer
 * carry their own in-page breadcrumb (the Trail replaces it). Renders the
 * real header and admin views, as Express does.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../views');

const COMMON = {
  title: 'Admin Dashboard', csrfToken: 'csrf-value', jsonForScript: (v: unknown) => JSON.stringify(v),
  pageUrl: (n: string) => `/view/${n}`, lockedUnless: () => ''
};

async function render(file: string, locals: Record<string, unknown>): Promise<Document> {
  const html = await ejs.renderFile(path.join(VIEWS, file), { ...COMMON, ...locals });
  return new JSDOM(html).window.document;
}

describe('#2390 the Trail button follows the left menu', () => {
  test('shows on a wiki page', async () => {
    const doc = await render('header.ejs', { pageName: 'Main' });
    expect(doc.querySelector('#trail #breadcrumbTrail')).not.toBeNull();
  });

  test('shows on a screen with an empty pageName (admin screens, profile)', async () => {
    const doc = await render('header.ejs', { pageName: '' });
    expect(doc.querySelector('#trail #breadcrumbTrail')).not.toBeNull();
    expect(doc.querySelector('#trail button')?.textContent?.trim()).toBe('Trail');
  });

  test('shows on a screen with no pageName at all (search)', async () => {
    const doc = await render('header.ejs', {});
    expect(doc.querySelector('#trail #breadcrumbTrail')).not.toBeNull();
  });

  test('loads the trail script', async () => {
    const doc = await render('header.ejs', {});
    expect(doc.querySelector('script[src="/js/nav-trail.js"]')).not.toBeNull();
  });
});

describe('#2390 no in-page breadcrumb on the sync screens', () => {
  const emptyCounts = { current: 0, modified: 0, new: 0, outdatedSyncable: 0, outdatedUserEdited: 0, uuidMismatch: 0, titleDrift: 0 };

  test('Required Pages Sync keeps its Back to Dashboard button but not the breadcrumb line', async () => {
    const doc = await render('admin-required-pages.ejs', {
      title: 'Required Pages Sync', comparison: [], counts: emptyCounts, addonComparison: [], addonCounts: emptyCounts,
      orphanedAddonPages: [], declined: [], notInSource: []
    });
    expect(doc.querySelector('nav[aria-label="breadcrumb"]')).toBeNull();
    expect(doc.body.textContent).not.toContain('Admin Dashboard ›');
    expect(Array.from(doc.querySelectorAll('a.btn')).some(a => (a.textContent ?? '').includes('Back to Dashboard'))).toBe(true);
  });

  test('Diff keeps its Back to Dashboard button but not the breadcrumb', async () => {
    const doc = await render('admin-diff.ejs', { title: 'Page Diff', sourceMode: false, titleA: 'A', titleB: 'B', diffString: '' });
    expect(doc.querySelector('nav[aria-label="breadcrumb"]')).toBeNull();
    const back = Array.from(doc.querySelectorAll('a.btn')).find(a => (a.textContent ?? '').includes('Back to Dashboard'));
    expect(back?.getAttribute('href')).toBe('/admin');
  });

  test('Diff opened from Required Pages Sync goes back to Required Pages Sync', async () => {
    const doc = await render('admin-diff.ejs', { title: 'Page Diff', sourceMode: true, titleA: 'A', titleB: 'B', diffString: '' });
    expect(doc.querySelector('nav[aria-label="breadcrumb"]')).toBeNull();
    const back = Array.from(doc.querySelectorAll('a.btn')).find(a => (a.textContent ?? '').includes('Back to Required Pages Sync'));
    expect(back?.getAttribute('href')).toBe('/admin/required-pages');
    expect(doc.body.textContent).not.toContain('Back to Dashboard');
  });
});

describe('#2390 the error page keeps itself out of the Trail', () => {
  test('error.ejs carries the skip marker', async () => {
    const doc = await render('error.ejs', { title: 'Page Not Found', error: { status: 404 }, message: 'nope', appName: 'x', currentUser: null });
    expect(doc.querySelector('[data-trail-skip]')).not.toBeNull();
  });
});
