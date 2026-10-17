/**
 * #1842 — the repair list's page details: a page's title linked to its view
 * URL, and its outside files linked where they are served today, drawn by the
 * one partial the admin dashboard and the profile both use. The route sets
 * `pages` only for the pages the viewer may read (PageManager.vaultRepair
 * tests); a row without it shows no title and no file name. Everything is
 * escaped.
 *
 * Renders the real partial, as Express does.
 */
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../views');

async function render(repair: Record<string, unknown>): Promise<{ html: string; doc: Document }> {
  const html = await ejs.renderFile(path.join(VIEWS, '_vault-repair-pages.ejs'), { repair });
  return { html, doc: new JSDOM(html).window.document };
}

const row = { owner: 'molly', vault: 'notes', page: 'abababab-abab-4bab-8bab-abababababab', files: 1, footnotes: true, comments: false, may: true };

describe('#1842 the repair list\'s page details', () => {
  test('for the page\'s reader: the title links to the page, each outside file to its URL', async () => {
    const { doc } = await render({
      ...row,
      pages: [{ title: 'Lab Results', href: '/vaults/molly/notes/Lab%20Results', files: [{ name: 'labs.txt', href: '/attachments/abc123' }] }]
    });
    const links = [...doc.querySelectorAll('a')].map((a) => [a.textContent?.trim(), a.getAttribute('href')]);
    expect(links).toEqual([['Lab Results', '/vaults/molly/notes/Lab%20Results'], ['labs.txt', '/attachments/abc123']]);
  });

  test('a row without details (another administrator, a locked vault) draws nothing', async () => {
    const { html } = await render(row);
    expect(html.trim()).toBe('');
  });

  test('titles, file names and links are escaped', async () => {
    const { html, doc } = await render({
      ...row,
      pages: [{ title: '<img src=x onerror=alert(1)>', href: '/vaults/molly/notes/x"onclick="y', files: [{ name: '<b>f</b>', href: '/attachments/1' }] }]
    });
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.querySelector('b')).toBeNull();
    expect(doc.querySelector('a')?.getAttribute('onclick')).toBeNull();
    expect(html).toContain('&lt;img');
  });

  test('the admin dashboard and the profile both draw it through this partial', () => {
    const uses = (file: string) => (fs.readFileSync(path.join(VIEWS, file), 'utf8').match(/include\('_vault-repair-pages'/g) ?? []).length;
    expect(uses('admin-dashboard.ejs')).toBe(1);
    expect(uses('profile.ejs')).toBe(1);
  });
});
