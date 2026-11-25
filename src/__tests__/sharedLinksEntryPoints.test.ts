/**
 * Slice 3 of #2247 (R9): every place that offers to share something opens the
 * Shared links page's Share... chooser. Renders the real views, as Express does.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../views');

const COMMON = {
  title: 'Page', csrfToken: 'csrf-value', jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`,
  lockedUnless: () => ''
};
const ANN = { username: 'ann', displayName: 'Ann', roles: [] as string[], isAuthenticated: true };

async function headerLinks(locals: Record<string, unknown>): Promise<string[]> {
  const html = await ejs.renderFile(path.join(VIEWS, 'header.ejs'), { ...COMMON, ...locals });
  const doc = new JSDOM(html).window.document;
  return Array.from(doc.querySelectorAll('a.dropdown-item')).map((a) => a.getAttribute('href') ?? '');
}

describe('the page menu\'s share entries', () => {
  const shared = { currentUser: ANN, currentUrl: '/view/Main', shareEnabled: true, can: (p: string) => p === 'share-create' };

  test('"Share this page" on a page in your own private area opens the chooser with that page ticked', async () => {
    const links = await headerLinks({ ...shared, pageName: 'vaults/ann/journal/Day one' });
    expect(links).toContain('/my/shares?share=vault&page=vaults%2Fann%2Fjournal%2FDay%20one');
    expect(links.filter((h) => h.startsWith('/my/vaults/links'))).toEqual([]);
  });

  test('"Share <tag>" opens the chooser with the tag filled in', async () => {
    const links = await headerLinks({ ...shared, pageName: 'Main', metadata: { 'user-keywords': ['trip'] } });
    expect(links).toContain('/my/shares?share=tag&tag=trip');
    expect(links.filter((h) => h.startsWith('/shares'))).toEqual([]);
  });
});

describe('the media tag page', () => {
  test('its Share button opens the chooser with the tag filled in, not a form that makes a link at once', async () => {
    const html = await ejs.renderFile(path.join(VIEWS, 'media-keyword.ejs'), {
      ...COMMON, keyword: 'trip', canShare: true, currentUser: ANN, media: [], items: [], total: 0, page: 1, pages: 1,
      sort: 'date', baseUrl: '', mediaItems: []
    });
    const doc = new JSDOM(html).window.document;
    expect(doc.querySelector('a[href="/my/shares?share=tag&tag=trip"]')).not.toBeNull();
    expect(doc.querySelector('form[action="/shares/create"]')).toBeNull();
  });
});

describe('the admin dashboard card (round 3 L2)', () => {
  test('is named for the Shared links page, not "Share Links"', async () => {
    const { readFileSync } = await import('fs');
    const html = readFileSync(path.join(VIEWS, 'admin-dashboard.ejs'), 'utf8');
    expect(html).toContain('Manage shared links');
    expect(html).not.toContain('Manage Share Links');
  });
});
