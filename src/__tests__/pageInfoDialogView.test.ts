/**
 * #2304 — the page info dialog and its copy-text block: no Last Accessed, a
 * URL that is the server's page link (no stray `#`), and every field it shows.
 * Renders the real header view and runs its own script in jsdom, as the
 * browser does.
 *
 * Sabotaged once (then restored): `lastAccessed` put back in the dialog table —
 * the "no Last Accessed" test went red.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM, VirtualConsole } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../views');

const COMMON = {
  pageName: '', csrfToken: 'csrf-value', jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`,
  lockedUnless: () => '',
  currentUser: { username: 'ann', displayName: 'Ann', roles: ['reader'], isAuthenticated: true }
};

const METADATA = {
  title: 'JSW Health History',
  slug: 'vaults--jim-default-jsw-health-history',
  uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  filesystemName: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.md',
  url: '/vaults/jim/default/JSW%20Health%20History',
  category: 'general',
  status: 'published',
  keywords: ['health'],
  created: '2026-06-17T10:20:59.212Z',
  lastModified: '2026-11-04T14:54:02.000Z',
  author: 'jim (urn:uuid:11111111-1111-4111-8111-111111111111)',
  editor: 'jim (urn:uuid:11111111-1111-4111-8111-111111111111)',
  description: null,
  version: 'v2 of 2',
  stats: { wordCount: 5, characterCount: 28, lineCount: 1, fileSize: 28 },
  custom: {}
};

interface PageInfoWindow {
  DOMParser: typeof DOMParser;
  eval(code: string): void;
  generatePageInfoModalContent(name: string, metadata: unknown, loading: boolean, error?: string): string;
  extractClientSideMetadata(name: string): { lastAccessed?: unknown };
  copyText(text: string): Promise<void>;
  showTemporaryMessage(): void;
  copyPageInfo(): void;
}

async function load(location: string): Promise<{ window: PageInfoWindow; html: string }> {
  const html = await ejs.renderFile(path.join(VIEWS, 'header.ejs'), { ...COMMON });
  const dom = new JSDOM(html, { url: location, runScripts: 'dangerously', virtualConsole: new VirtualConsole() });
  return { window: dom.window as unknown as PageInfoWindow, html };
}

const LOCATION = 'https://wiki.example.org/vaults/jim/default/JSW%20Health%20History?x=1#';

describe('#2304 the page info dialog', () => {
  test('shows every field and no Last Accessed', async () => {
    const { window } = await load(LOCATION);
    const dialog = new window.DOMParser().parseFromString(window.generatePageInfoModalContent('vaults/jim/default/JSW Health History', METADATA, false), 'text/html');
    const rows = new Map([...dialog.querySelectorAll('tr')].map((tr) => [tr.cells[0]?.textContent?.replace(/:$/, '').trim(), tr.cells[1]?.textContent?.trim()]));

    expect(rows.has('Last Accessed')).toBe(false);
    expect(dialog.body.textContent).not.toMatch(/Last Accessed/i);
    expect(rows.get('Title')).toBe('JSW Health History');
    expect(rows.get('Page Name')).toBe('vaults/jim/default/JSW Health History');
    expect(rows.get('Slug')).toBe(METADATA.slug);
    expect(rows.get('UUID')).toBe(METADATA.uuid);
    expect(rows.get('Version')).toBe('v2 of 2');
    expect(rows.get('Author')).toBe(METADATA.author);
    expect(rows.get('Editor')).toBe(METADATA.editor);
    expect(rows.get('System Category')).toBe('general');
    expect(rows.get('Created')).toBe(new Date(METADATA.created).toLocaleString());
    expect(rows.get('Last Modified')).toBe(new Date(METADATA.lastModified).toLocaleString());
  });

  test('the URL is the page link: no fragment, no query, the vault route', async () => {
    const { window } = await load(LOCATION);
    const dialog = new window.DOMParser().parseFromString(window.generatePageInfoModalContent('x', METADATA, false), 'text/html');
    const url = [...dialog.querySelectorAll('tr')].find((tr) => tr.cells[0]?.textContent === 'URL:')?.cells[1]?.textContent;

    expect(url).toBe('https://wiki.example.org/vaults/jim/default/JSW%20Health%20History');
    expect(url).not.toMatch(/[#?]/);
  });

  test('the copied text has the same URL and no Last Accessed', async () => {
    const { window } = await load(LOCATION);
    let copied = '';
    window.copyText = async (text: string) => { copied = text; };
    window.showTemporaryMessage = () => undefined;
    // `_currentPageInfo` is a script-level `let`, so only the script's own scope reaches it.
    window.eval(`_currentPageInfo = { pageName: 'vaults/jim/default/JSW Health History', metadata: ${JSON.stringify(METADATA)} };`);
    window.copyPageInfo();

    expect(copied).toContain('URL:           https://wiki.example.org/vaults/jim/default/JSW%20Health%20History\n');
    expect(copied).not.toMatch(/Last Accessed/i);
    expect(copied).toContain('Version:       v2 of 2');
  });

  test('the client-side fallback has no lastAccessed and its URL has no fragment', async () => {
    const { window } = await load(LOCATION);
    expect(window.extractClientSideMetadata('x')).not.toHaveProperty('lastAccessed');
    const dialog = new window.DOMParser().parseFromString(window.generatePageInfoModalContent('x', window.extractClientSideMetadata('x'), false), 'text/html');
    const url = [...dialog.querySelectorAll('tr')].find((tr) => tr.cells[0]?.textContent === 'URL:')?.cells[1]?.textContent;
    expect(url).toBe('https://wiki.example.org/vaults/jim/default/JSW%20Health%20History');
  });

  test('opening Page Information does not navigate to #', async () => {
    const { html } = await load(LOCATION);
    expect(html).toMatch(/<a class="dropdown-item" href="#" onclick="showPageInfo\(\); return false;">/);
  });
});
