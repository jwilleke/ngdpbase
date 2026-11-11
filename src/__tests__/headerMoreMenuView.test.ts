/**
 * #2174 — the desktop More menu is shown only when it has something in it.
 * A signed-out visitor on a screen that is not a page (the search page, say)
 * has no item to put in it, so the group is left out, as the mobile menu
 * leaves out its Page Actions. Renders the real header view, as Express does.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../views');

const COMMON = {
  title: 'Search', csrfToken: 'csrf-value', jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`,
  lockedUnless: () => ''
};
const SIGNED_IN = { username: 'ann', displayName: 'Ann', roles: ['reader'], isAuthenticated: true };

async function hasMoreMenu(locals: Record<string, unknown>): Promise<boolean> {
  const html = await ejs.renderFile(path.join(VIEWS, 'header.ejs'), { ...COMMON, ...locals });
  const doc = new JSDOM(html).window.document;
  return Array.from(doc.querySelectorAll('button.dropdown-toggle')).some(b => (b.textContent ?? '').trim() === 'More');
}

describe('the desktop More menu', () => {
  test('is left out for a signed-out visitor on a screen that is not a page', async () => {
    expect(await hasMoreMenu({})).toBe(false);
  });

  test('stays for a visitor on a page (Show Reader View)', async () => {
    expect(await hasMoreMenu({ pageName: 'Main' })).toBe(true);
  });

  test('stays for a signed-in user on a screen that is not a page (Add to My Links)', async () => {
    expect(await hasMoreMenu({ currentUser: SIGNED_IN, currentUrl: '/search' })).toBe(true);
  });

  test('stays for someone who can create pages (Create New Page)', async () => {
    expect(await hasMoreMenu({ canCreatePage: true })).toBe(true);
  });
});
