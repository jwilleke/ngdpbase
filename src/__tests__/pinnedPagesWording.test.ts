/**
 * #2520 (slice 1 of #2247) — "My Links" is renamed "Pinned pages" wherever a
 * person sees it: the sidebar heading, the page menu on desktop and mobile,
 * the Profile card, and the messages after adding or removing a pin. The
 * route /my/links, the plugin name and the stored data keep their names.
 *
 * Renders the real header and profile views, as Express does.
 */
import ejs from 'ejs';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VIEWS = path.join(ROOT, 'views');

const COMMON = {
  title: 'Garden', csrfToken: 'csrf-value', jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`,
  lockedUnless: () => ''
};

const signedIn = (pinned: unknown[]) => ({
  username: 'ann', displayName: 'Ann', roles: ['reader'], isAuthenticated: true,
  preferences: { 'nav.pinnedPages': pinned }
});

async function header(pinned: unknown[], currentUrl: string): Promise<{ html: string; doc: Document }> {
  const html = await ejs.renderFile(path.join(VIEWS, 'header.ejs'), {
    ...COMMON, currentUser: signedIn(pinned), currentUrl, pageName: 'Garden'
  });
  return { html, doc: new JSDOM(html).window.document };
}

const OTHER = [{ url: '/view/Trip', title: 'Trip', pageName: 'Trip' }];
const HERE = [{ url: '/view/Garden', title: 'Garden', pageName: 'Garden' }];

describe('"Pinned pages" in the header (#2520)', () => {
  test('the sidebar heading reads "Pinned pages"', async () => {
    const { doc } = await header(OTHER, '/view/Garden');
    expect(doc.querySelector('.my-links-sidebar h6')?.textContent?.trim()).toBe('Pinned pages');
  });

  test('the page menu offers "Add to pinned pages" on desktop and mobile', async () => {
    const { html } = await header(OTHER, '/view/Garden');
    expect(html.match(/Add to pinned pages/g)?.length).toBe(2);
    expect(html).not.toContain('Add to My Links');
  });

  test('a pinned page offers "Remove from pinned pages" on desktop and mobile', async () => {
    const { html } = await header(HERE, '/view/Garden');
    expect(html.match(/Remove from pinned pages/g)?.length).toBe(2);
    expect(html).not.toContain('Remove from My Links');
  });

  test('no rendered text on the page says "My Links"', async () => {
    const { doc } = await header(OTHER, '/view/Garden');
    expect(doc.body.textContent).not.toContain('My Links');
  });
});

describe('"Pinned pages" on the Profile card (#2520)', () => {
  test('the contributions list names it "Pinned pages" and still links to /my/links', async () => {
    const user = {
      username: 'alice', email: 'alice@example.com', displayName: 'Alice', roles: ['reader'], isExternal: false,
      createdAt: '2026-01-01T00:00:00.000Z', lastLogin: null, profilePage: null, preferences: {}
    };
    const html = await ejs.renderFile(path.join(VIEWS, 'profile.ejs'), {
      pageName: '', title: 'Profile', csrfToken: 'csrf-value', error: null, success: null,
      user, permissions: ['page-read'],
      contactDetails: null, pendingEmail: null, contactDetailsSaved: null, contactDetailsError: null,
      consents: [], addonConsentPending: {}, credentials: [], credentialsUnavailable: false,
      connectedIdentities: [], connectableProviders: [], passkeyHost: 'localhost', approvedApps: [],
      delegations: [], proxyAccess: { given: [], actingFor: [], owner: 'alice', options: [], vaultBlocked: false },
      offerEmailSecondFactor: false, hasPassword: true, unusedVaultFiles: [], vaultRepairs: [], vaultRepairNotice: '',
      vaultRepairError: null, agentTokensEnabled: true, agentTokensCanExtend: false, captureStartsPrivate: false,
      availableTimezones: [], availableDateFormats: [],
      contributions: { privatePages: 0, pages: 0, edits: 0, comments: 0, links: 5 },
      addonProfileSections: [], myShares: { active: 0, total: 0 },
      jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`, lockedUnless: () => '',
      nonce: 'n'
    }, { includer: (original: string) => (original === 'header' || original === 'footer' ? { template: '' } : undefined) as never });
    const doc = new JSDOM(html).window.document;
    const link = doc.querySelector('a[href="/my/links"]');
    expect(link?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Pinned pages');
    expect(doc.body.textContent).not.toContain('My Links');
  });
});

describe('"pinned pages" in the messages after a pin changes (#2520)', () => {
  test('my-links.js says "pinned pages" in lower case inside every message', async () => {
    const js = await fs.readFile(path.join(ROOT, 'public/js/my-links.js'), 'utf8');
    for (const message of ['Failed to add to pinned pages', 'Added to pinned pages', 'Failed to remove from pinned pages', 'Removed from pinned pages']) {
      expect(js).toContain(message);
    }
    expect(js).not.toContain('My Links');
  });
});

describe('the list page has its own browser tab title (#2520)', () => {
  test('the tab reads "Pinned pages | <site name>", not just the site name', async () => {
    const html = await ejs.renderFile(path.join(VIEWS, 'my-list.ejs'), {
      ...COMMON, currentUser: signedIn([]), currentUrl: '/my/links', pageName: undefined,
      applicationName: 'Garden Wiki', tabTitle: 'Pinned pages', title: 'Pinned pages', icon: 'fa-link', listKind: 'links',
      items: [], totalItems: 0, itemCount: 0, emptyMessage: 'Nothing here.'
    }, { includer: (original: string) => (original === 'footer' ? { template: '' } : undefined) as never });
    expect(new JSDOM(html).window.document.title).toBe('Pinned pages | Garden Wiki');
  });

  test('a list page with no tab title keeps showing the site name alone', async () => {
    const html = await ejs.renderFile(path.join(VIEWS, 'my-list.ejs'), {
      ...COMMON, currentUser: signedIn([]), currentUrl: '/my/pages', applicationName: 'Garden Wiki',
      title: 'My Pages', icon: 'fa-file', listKind: 'links', items: [], totalItems: 0, itemCount: 0, emptyMessage: 'Nothing here.'
    }, { includer: (original: string) => (original === 'footer' ? { template: '' } : undefined) as never });
    expect(new JSDOM(html).window.document.title).toBe('Garden Wiki');
  });
});
