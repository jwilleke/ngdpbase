/**
 * #2320 — the page Info dropdown lists Page Information, Page History,
 * View Page Source and Page Statistics, and no Recent Changes. Renders the
 * real header view, as Express does.
 *
 * Sabotaged once (then restored): the Recent Changes `<li>` put back in the
 * Info menu — the "no Recent Changes" test went red.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../views');

const COMMON = {
  pageName: 'Main', csrfToken: 'csrf-value', jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`,
  lockedUnless: () => '',
  currentUser: { username: 'ann', displayName: 'Ann', roles: ['reader'], isAuthenticated: true }
};

async function infoItems(): Promise<string[]> {
  const html = await ejs.renderFile(path.join(VIEWS, 'header.ejs'), { ...COMMON });
  const doc = new JSDOM(html).window.document;
  const toggle = Array.from(doc.querySelectorAll('button.dropdown-toggle')).find(b => (b.textContent ?? '').trim() === 'Info');
  const items = toggle?.parentElement?.querySelectorAll('.dropdown-menu .dropdown-item') ?? [];
  return Array.from(items).map(a => (a.textContent ?? '').replace(/\s+/g, ' ').trim());
}

describe('#2320 the page Info dropdown', () => {
  test('lists the four page items', async () => {
    expect(await infoItems()).toEqual(['Page Information', 'Page History', 'View Page Source', 'Page Statistics']);
  });

  test('has no Recent Changes', async () => {
    expect(await infoItems()).not.toContain('Recent Changes');
  });
});
