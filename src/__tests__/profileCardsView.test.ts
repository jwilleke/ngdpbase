/**
 * #1541 — every card on /profile, add-on sections included, collapses under
 * the header /admin's Share Manager card uses: `.card > .card-body.py-2 >
 * details#id[open] > summary.card-summary` with an icon and an h6 title,
 * and the content in `div.mt-3`.
 *
 * Renders the real profile.ejs as Express does, with header and footer
 * stubbed out: they are not part of the page's cards.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { describe, expect, test } from 'vitest';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../views');

const user = {
  username: 'alice', email: 'alice@example.com', displayName: 'Alice', roles: ['reader'], isExternal: false,
  createdAt: '2026-01-01T00:00:00.000Z', lastLogin: null, profilePage: null, preferences: {}
};

/** What WikiRoutes passes to res.render('profile'), with every optional card turned on. */
function locals(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pageName: '', title: 'Profile', csrfToken: 'csrf-value', error: null, success: null,
    user, permissions: ['page-read'],
    contactDetails: null, pendingEmail: null, contactDetailsSaved: null, contactDetailsError: null,
    consents: [], addonConsentPending: {}, credentials: [], credentialsUnavailable: false,
    connectedIdentities: [], connectableProviders: [], passkeyHost: 'localhost', approvedApps: [],
    delegations: [], proxyAccess: { given: [], actingFor: [], owner: 'alice', options: [], vaultBlocked: false },
    offerEmailSecondFactor: false, hasPassword: true,
    unusedVaultFiles: [{ vault: 'alice', locked: true, files: [] }],
    vaultRepairs: [], vaultRepairNotice: 'Moved.', vaultRepairError: null,
    agentTokensEnabled: true, agentTokensCanExtend: false, captureStartsPrivate: false,
    availableTimezones: [], availableDateFormats: [],
    contributions: { privatePages: 0, pages: 0, edits: 0, comments: 0 },
    addonProfileSections: [], myShares: { active: 0, total: 0 },
    jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`, lockedUnless: () => '',
    nonce: 'n',
    ...over
  };
}

async function render(over: Record<string, unknown> = {}): Promise<Document> {
  const html = await ejs.renderFile(path.join(VIEWS, 'profile.ejs'), locals(over), {
    includer: (original: string) => (original === 'header' || original === 'footer' ? { template: '' } : undefined) as never
  });
  return new JSDOM(html).window.document;
}

const text = (el: { textContent: string | null } | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** A card that holds a section: every card but the page's own frame and the preferences' Live Preview. */
const sectionCards = (doc: Document): Element[] =>
  [...doc.querySelectorAll('.card')].filter(c => !c.classList.contains('mt-4') || c.hasAttribute('data-addon'))
    .filter(c => !c.classList.contains('bg-info'));

function expectAdminHeader(card: Element): void {
  const body = card.firstElementChild;
  expect(body?.matches('.card-body.py-2')).toBe(true);
  const details = body?.firstElementChild;
  expect(details?.tagName).toBe('DETAILS');
  expect(details?.id).not.toBe('');
  expect(details?.hasAttribute('open')).toBe(true);
  const summary = details?.firstElementChild;
  expect(summary?.matches('summary.card-summary')).toBe(true);
  expect(summary?.querySelector(':scope > i.fas')).not.toBeNull();
  expect(text(summary?.querySelector(':scope > h6'))).not.toBe('');
  expect(summary?.nextElementSibling?.matches('div.mt-3')).toBe(true);
}

describe('#1541 /profile cards collapse under the /admin header', () => {
  test('every card starts open under a summary.card-summary with an icon and a title, each with its own id', async () => {
    const doc = await render();
    const cards = sectionCards(doc);
    const titles = cards.map(c => text(c.querySelector('summary h6')));
    expect(titles).toEqual(expect.arrayContaining([
      'Account Information', 'Permissions', 'My Contributions', 'Share Links', 'Your consents',
      'Vault pages with data outside their vault', 'Unused files in your vaults', 'Sign-in methods',
      'My tokens and devices', 'Proxy access', 'User Preferences'
    ]));
    for (const card of cards) expectAdminHeader(card);
    // The title stays a heading, so the page outline and tests/e2e/profile-contact-details.spec.ts find it.
    expect(text(doc.querySelector('#contact-details summary.card-summary > h6'))).toBe('Contact details');
    expect(doc.querySelectorAll('.card-header').length).toBe(1); // the page's own frame, "User Profile"
    const ids = [...doc.querySelectorAll('details')].map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('forms, ids and CSRF fields are kept', async () => {
    const doc = await render();
    for (const id of ['your-consents', 'vault-repairs', 'sign-in-methods', 'tokens-and-devices', 'proxy-access', 'agent-token-new-btn']) {
      expect(doc.getElementById(id), id).not.toBeNull();
    }
    const prefs = doc.querySelector('form[action="/preferences"]');
    expect(prefs?.closest('details')?.id).toBe('profile-user-preferences');
    expect(prefs?.querySelector('input[name="_csrf"]')?.getAttribute('value')).toBe('csrf-value');
    expect(doc.querySelector('script:not([src]):not([nonce])')).toBeNull();
  });

  test('an add-on section gets the same card and header from core, inside the preferences form', async () => {
    const doc = await render({
      addonProfileSections: [
        { addonName: 'journal', title: 'Journal', icon: 'fa-book', html: '<input type="hidden" name="journal._rendered" value="1">' },
        { addonName: 'plain', title: 'Plain <b>add-on</b>', html: '<p>fields</p>' }
      ]
    });
    const journal = doc.querySelector('[data-addon="journal"]');
    expect(journal).not.toBeNull();
    expectAdminHeader(journal);
    expect(journal!.querySelector('details')?.id).toBe('profile-addon-journal');
    expect(journal!.querySelector('summary i')?.classList.contains('fa-book')).toBe(true);
    expect(journal!.querySelector('div.mt-3 input[name="journal._rendered"]')?.closest('form')?.getAttribute('action')).toBe('/preferences');

    const plain = doc.querySelector('[data-addon="plain"]');
    expectAdminHeader(plain);
    expect(plain!.querySelector('summary i')?.classList.contains('fa-puzzle-piece')).toBe(true);
    expect(text(plain!.querySelector('summary h6'))).toBe('Plain <b>add-on</b>');
  });
});
