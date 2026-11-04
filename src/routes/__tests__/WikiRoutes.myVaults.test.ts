/**
 * /my/vaults and /my/vaults/links (#2245).
 *
 * /my/vaults lists the owner's vaults, each with its pages by name and a badge
 * saying whether it is encrypted; a vault whose kind is encrypted while its
 * copy is not (#1834) says so as a warning. Its link to /my/vaults/links reads
 * "Links you've shared", and that page explains what a link does before the
 * form that shares a whole vault. The views are the real ones, rendered as
 * Express does.
 */

import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import WikiRoutes from '../WikiRoutes';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';
import { pageUrl } from '../../utils/pageUrl';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../views');

const MOLLY = { username: 'molly', isAuthenticated: true, roles: ['reader'], privateStoreHandle: 'sid' };

const page = (vault: string, title: string, uuid: string) => ({ name: `vaults/molly/${vault}/${title}`, title, uuid });

const VAULTS = [
  { id: 'capture', state: 'sealed', readable: true, pages: [page('capture', 'Captures — molly — 2026-09-22', 'u3')] },
  { id: 'default', state: 'unopened', readable: true, pages: [page('default', 'MollySecretDiary', 'u2'), page('default', 'Secret-Test-File', 'u1')] },
  { id: 'journal', state: 'mismatch', readable: true, pages: [page('journal', '2026-09-22-1-journal-molly', 'u4')] },
  { id: 'notes', state: 'plain', readable: true, pages: [page('notes', '<img src=x onerror=alert(1)>', 'u5')] },
  { id: 'phr', state: 'sealed', readable: false, pages: [] }
];

const createReq = (userContext: unknown) => ({
  params: {}, query: {}, body: {}, session: { csrfToken: 'tok' },
  path: '/my/vaults', originalUrl: '/my/vaults', protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext
});

const createRes = () => ({
  status: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis()
});

/** Header locals the views need; nothing here is under test. */
const CHROME = { pageName: '', csrfToken: 'tok', pageUrl, jsonForScript: (v: unknown) => JSON.stringify(v), lockedUnless: () => '', shareEnabled: true };

async function renderMyList(locals: Record<string, unknown>): Promise<Document> {
  const html = await ejs.renderFile(path.join(VIEWS, 'my-list.ejs'), { ...CHROME, ...locals });
  return new JSDOM(html).window.document;
}

describe('GET /my/vaults (#2245)', () => {
  test('renders the requester\'s own vaults, a page count, and the renamed link', async () => {
    const listOwnVaults = vi.fn(async () => VAULTS);
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'PluginManager') return TEST_PLUGIN_MANAGER;
        if (name === 'PageManager') return { listOwnVaults };
        if (name === 'PolicyDecisionPoint') return { permits: vi.fn().mockResolvedValue(true) };
        return null;
      })
    };
    const routes = new WikiRoutes(engine);
    vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
    const res = createRes();
    await routes.myPrivatePagesPage(createReq(MOLLY), res);

    expect(listOwnVaults).toHaveBeenCalledWith(expect.objectContaining({ username: 'molly', privateStoreHandle: 'sid' }));
    expect(res.render.mock.calls[0][0]).toBe('my-list');
    const view = res.render.mock.calls[0][1] as Record<string, unknown>;
    expect(view).toMatchObject({ listKind: 'vaults', items: VAULTS, itemCount: 5 });
    expect(view.listAction).toEqual({ href: '/my/vaults/links', label: 'Links you\'ve shared', icon: 'fa-link' });
  });
});

describe('my-list.ejs, listKind vaults (#2245)', () => {
  const locals = {
    title: 'My Private Pages', icon: 'fa-eye-slash', items: VAULTS, itemCount: 5, listKind: 'vaults',
    emptyMessage: 'none', listAction: { href: '/my/vaults/links', label: 'Links you\'ve shared', icon: 'fa-link' }
  };

  test('each vault lists its own pages, by name, linked to /vaults/<user>/<vault>/<page>', async () => {
    const doc = await renderMyList(locals);
    const sections = [...doc.querySelectorAll('section[data-vault]')];
    expect(sections.map((s) => s.getAttribute('data-vault'))).toEqual(['capture', 'default', 'journal', 'notes', 'phr']);
    const links = (id: string) => [...doc.querySelectorAll(`section[data-vault="${id}"] a.wikipage`)]
      .map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links('default')).toEqual([
      ['MollySecretDiary', '/vaults/molly/default/MollySecretDiary'],
      ['Secret-Test-File', '/vaults/molly/default/Secret-Test-File']
    ]);
    expect(links('capture')).toEqual([
      ['Captures — molly — 2026-09-22', '/vaults/molly/capture/Captures%20%E2%80%94%20molly%20%E2%80%94%202026-09-22']
    ]);
    expect(links('journal')).toEqual([['2026-09-22-1-journal-molly', '/vaults/molly/journal/2026-09-22-1-journal-molly']]);
    // A locked vault says so rather than claiming to be empty.
    expect(doc.querySelector('section[data-vault="phr"]')?.textContent).toContain('Locked. Unlock it to see its pages.');
    // The count is pages, not vaults.
    expect(doc.querySelector('.card-header .badge')?.textContent?.trim()).toBe('5');
  });

  test('the three badge states: Encrypted, Not encrypted, and Not encrypted with a warning', async () => {
    const doc = await renderMyList(locals);
    const badge = (id: string) => doc.querySelector(`section[data-vault="${id}"] [data-vault-badge]`)?.textContent?.trim();
    const warning = (id: string) => doc.querySelector(`section[data-vault="${id}"] [data-vault-warning]`)?.textContent?.replace(/\s+/g, ' ').trim();

    expect(badge('capture')).toBe('Encrypted');
    expect(warning('capture')).toBeUndefined();

    expect(badge('notes')).toBe('Not encrypted');
    expect(warning('notes')).toBeUndefined();

    expect(badge('default')).toBe('Not encrypted');
    expect(warning('default')).toBe('This site says default should be encrypted, but it is not. It has not been opened yet, so there is no key to encrypt it with.');
    expect(badge('journal')).toBe('Not encrypted');
    expect(warning('journal')).toBe('This site says journal should be encrypted, but it is not. Its stored copy is not encrypted, so an administrator needs to resolve it.');
  });

  test('a page name is escaped, never markup', async () => {
    const doc = await renderMyList(locals);
    const a = doc.querySelector('section[data-vault="notes"] a.wikipage');
    expect(a?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(doc.querySelector('section[data-vault="notes"] img')).toBeNull();
  });

  test('the header links to /my/vaults/links as "Links you\'ve shared"', async () => {
    const doc = await renderMyList(locals);
    const a = doc.querySelector('a[href="/my/vaults/links"]');
    expect(a?.textContent?.trim()).toBe('Links you\'ve shared');
    expect(doc.body.textContent).not.toContain('Vault links');
  });
});

describe('my-vault-links.ejs (#2245)', () => {
  async function renderLinks(): Promise<{ html: string; doc: Document }> {
    const html = await ejs.renderFile(path.join(VIEWS, 'my-vault-links.ejs'), {
      ...CHROME,
      title: 'Links you\'ve shared',
      vaults: [{ id: 'default', maxDays: 15, encrypted: false }],
      pickVault: null, pickPages: [], preselected: null, links: [], titles: {},
      baseUrl: 'http://localhost:3000', createdId: null, notice: null, error: null
    });
    return { html, doc: new JSDOM(html).window.document };
  }

  test('is titled "Links you\'ve shared"', async () => {
    const { doc } = await renderLinks();
    expect(doc.querySelector('h1')?.textContent?.trim()).toBe('Links you\'ve shared');
    expect(doc.body.textContent).not.toContain('Vault links');
  });

  test('says what a link does before the form that shares a whole vault', async () => {
    const { html, doc } = await renderLinks();
    const explanation = doc.querySelector('[data-share-explanation]')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(explanation).toContain('anyone you give the link to, without an account');
    expect(explanation).toContain('Read-only');
    expect(explanation).toContain('up to the vault\'s limit in days');
    expect(explanation).toContain('extend a working link by 1 to 24 hours at a time');
    expect(explanation).toContain('revoke it in the list below at any time, and it stops working at once');

    const explained = html.indexOf('data-share-explanation');
    const wholeForm = html.indexOf('name="scope" value="whole"');
    expect(explained).toBeGreaterThan(-1);
    expect(wholeForm).toBeGreaterThan(explained);
    // The form itself sits behind its own "Share a whole vault" disclosure.
    const details = doc.querySelector('input[name="scope"][value="whole"]')?.closest('details');
    expect(details?.querySelector('summary')?.textContent?.trim()).toBe('Share a whole vault');
    expect(details?.hasAttribute('open')).toBe(false);
  });
});
