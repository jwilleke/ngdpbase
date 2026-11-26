/**
 * views/my-shares.ejs, rendered as Express renders it (slice 3 of #2247).
 */
import ejs from 'ejs';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../views');

const COMMON = {
  title: 'Shared links', csrfToken: 'csrf-value', jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`,
  lockedUnless: () => '', currentUser: { username: 'molly', displayName: 'Molly', roles: [] as string[], isAuthenticated: true }
};
const ROW = { id: 'r1', kind: 'tag', what: 'Everything tagged Garden', status: 'active', expiresAt: null, createdAt: '2026-11-01T00:00:00.000Z', actions: ['revoke'] };

async function render(locals: Record<string, unknown>): Promise<Document> {
  const html = await ejs.renderFile(path.join(VIEWS, 'my-shares.ejs'), {
    ...COMMON, rows: [], mayTag: true, mayVault: true, vaults: [], pickVault: null, pickPages: [], preselected: null,
    baseUrl: 'https://wiki.example.com', notice: null, shareChoice: '', tagPrefill: '', pagePrefill: '', createdId: '',
    revoked: false, error: null, addresses: {}, pageTitles: {}, ...locals
  });
  return new JSDOM(html).window.document;
}

const ROOT = path.join(VIEWS, '..');

/** Where a stylesheet href is served from, as src/app.ts serves it: /themes from themes/, everything else from public/. Remote hrefs (CDN) are not ours. */
function stylesheetFile(href: string): string | null {
  if (/^(https?:)?\/\//.test(href)) return null;
  const clean = href.split('?')[0];
  return clean.startsWith('/themes/') ? path.join(ROOT, clean) : path.join(ROOT, 'public', clean);
}

/** The hrefs of every local stylesheet the page links, in load order. */
function localStylesheets(doc: Document): string[] {
  return [...doc.querySelectorAll('link[rel="stylesheet"]')]
    .map(l => l.getAttribute('href') ?? '')
    .filter(h => stylesheetFile(h) !== null);
}

/** The text of the local stylesheets a rendered page really loads, in load order. A browser, unlike jsdom, reads these. */
function loadedCss(doc: Document): string {
  return localStylesheets(doc).map(h => readFileSync(stylesheetFile(h), 'utf8')).join('\n');
}

const SHARE = { id: 's1', token: 'tok', status: 'active', scope: { keyword: 'garden' }, expiresAt: null, createdBy: 'molly', createdAt: '2026-11-01T00:00:00.000Z' };

async function renderAdmin(): Promise<Document> {
  const html = await ejs.renderFile(path.join(VIEWS, 'shares.ejs'), {
    ...COMMON, shares: [SHARE], shareStatsHtml: '', isAdmin: true, backLink: null, baseUrl: 'https://wiki.example.com',
    createdId: null, revoked: false, error: null, keywordPrefill: ''
  });
  return new JSDOM(html).window.document;
}

describe('my-shares.ejs addresses (round 3 H1)', () => {
  test('an active tag link shows its full address and a Copy button', async () => {
    const doc = await render({ rows: [ROW], addresses: { r1: 'https://wiki.example.com/share/abc' }, createdId: 'r1' });
    const input = doc.querySelector('tr[data-share-id="r1"] input[readonly]');
    expect(input?.getAttribute('value')).toBe('https://wiki.example.com/share/abc');
    expect(doc.querySelector('tr[data-share-id="r1"] button[title="Copy link"]')).not.toBeNull();
  });

  test('a row with no address shows none', async () => {
    const doc = await render({ rows: [{ ...ROW, status: 'revoked', actions: [] }] });
    expect(doc.querySelector('tr[data-share-id="r1"] input[readonly]')).toBeNull();
  });
});

const VAULTS = [{ id: 'journal', maxDays: 7, encrypted: false }, { id: 'family', maxDays: 7, encrypted: true }];

describe('my-shares.ejs private-area branch (round 3 M1 and test gap)', () => {
  test('the private-area branch says what a link does, before the forms (M1)', async () => {
    const doc = await render({ shareChoice: 'vault', vaults: VAULTS });
    const explanation = doc.querySelector('[data-share-explanation]')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(explanation).toContain('anyone you give the link to, without an account');
    expect(explanation).toContain('Read-only');
    expect(explanation).toContain('Encrypted vaults');
    const html = doc.body.innerHTML;
    expect(html.indexOf('data-share-explanation')).toBeLessThan(html.indexOf('data-vault-link'));
  });

  test('the tag branch does not show the private-area explanation (M1)', async () => {
    const doc = await render({ shareChoice: 'tag', vaults: VAULTS });
    expect(doc.querySelector('[data-share-explanation]')).toBeNull();
  });

  test('the whole-area form posts to /my/shares/vault-links, encrypted vault included', async () => {
    const doc = await render({ shareChoice: 'vault', vaults: VAULTS });
    const forms = [...doc.querySelectorAll('form[data-vault-link]')];
    expect(forms.length).toBeGreaterThan(0);
    for (const form of forms) expect(form.getAttribute('action')).toBe('/my/shares/vault-links');
    expect(doc.querySelector('select[name="vault"] option[value="family"]')).not.toBeNull();
  });

  test('the pick-pages form posts to /my/shares/vault-links', async () => {
    const doc = await render({
      shareChoice: 'vault', vaults: VAULTS, pickVault: 'family', pickPages: [{ uuid: 'u1', title: 'Notes' }], preselected: 'u1'
    });
    const form = doc.querySelector('form[data-vault-link] input[name="vault"][data-encrypted="true"]')?.closest('form');
    expect(form?.getAttribute('action')).toBe('/my/shares/vault-links');
  });
});

describe('my-shares.ejs messages for the private-area routes (round 3 M2)', () => {
  test.each([
    ['vault', 'Choose one of your vaults.'],
    ['days', 'Choose a lifetime within that vault'],
    ['pages', 'Choose at least one page.'],
    ['hours', 'extended by 1 to 24 hours at a time']
  ])('?error=%s shows its message', async (error, text) => {
    const doc = await render({ error });
    expect(doc.body.textContent).toContain(text);
  });
});

const LABELLED = { ...ROW, id: 'r2', kind: 'chosen-pages', what: '1 page in your default vault', label: 'For Dr Smith', pageUuid: 'u1', expiresAt: '2026-12-03T00:00:00.000Z', createdAt: '2026-11-26T08:00:00.000Z', actions: ['extend', 'visits', 'revoke'] };

describe('my-shares.ejs rows (round 5)', () => {
  test('the label is the bold first line of the What cell, with the what text under it, and the Made date', async () => {
    const doc = await render({ rows: [LABELLED], addresses: { r2: 'https://wiki.example.com/share/abc' } });
    const cell = doc.querySelector('tr[data-share-id="r2"] td:first-child') as HTMLElement;
    expect(cell.querySelector('strong')?.textContent).toBe('For Dr Smith');
    expect(cell.textContent).toContain('1 page in your default vault');
    expect(doc.querySelector('tr[data-share-id="r2"] [data-made]')?.textContent?.trim()).toBe('2026-11-26');
  });

  test('a label with markup is escaped', async () => {
    const doc = await render({ rows: [{ ...LABELLED, label: '<script>alert(1)</script>' }] });
    expect(doc.querySelector('tr[data-share-id="r2"] strong')?.textContent).toBe('<script>alert(1)</script>');
    expect(doc.documentElement.innerHTML).not.toContain('<script>alert(1)</script>');
  });

  test('two links to the same vault with different labels are told apart', async () => {
    const doc = await render({ rows: [LABELLED, { ...LABELLED, id: 'r3', label: 'For the family' }] });
    expect(doc.querySelector('tr[data-share-id="r2"] strong')?.textContent).toBe('For Dr Smith');
    expect(doc.querySelector('tr[data-share-id="r3"] strong')?.textContent).toBe('For the family');
  });

  test('with no label a one-page link shows its page title, and other links show nothing extra', async () => {
    const doc = await render({
      rows: [{ ...LABELLED, label: '' }, { ...ROW, label: '', pageUuid: null }],
      pageTitles: { r2: 'Day one' }
    });
    expect(doc.querySelector('tr[data-share-id="r2"] td:first-child strong')?.textContent).toBe('Day one');
    expect(doc.querySelector('tr[data-share-id="r1"] td:first-child strong')).toBeNull();
  });

  test('an active link with no address says it was shown once', async () => {
    const doc = await render({ rows: [{ ...LABELLED, kind: 'whole-area' }] });
    expect(doc.querySelector('tr[data-share-id="r2"]')?.textContent).toContain('Address was shown once, when you made it');
  });

  test('a manager-revoked link reads "Page no longer available"', async () => {
    const doc = await render({ rows: [{ ...ROW, label: '', pageUuid: null, status: 'page not available', actions: [] }] });
    expect(doc.body.textContent).toContain('Page no longer available');
    expect(doc.body.textContent).not.toContain('(404)');
  });

  test('the table is for wide screens and has its own class; dates do not wrap', async () => {
    const doc = await render({ rows: [LABELLED] });
    const table = doc.querySelector('table#sharedLinksTable') as HTMLElement;
    expect(table.classList.contains('shared-links')).toBe(true);
    expect(table.classList.contains('d-none')).toBe(false);
    expect(doc.querySelectorAll('tr[data-share-id="r2"] td.text-nowrap').length).toBeGreaterThanOrEqual(2);
  });

  test('each link also has a card for phones, with its address, both buttons and the same wording', async () => {
    const doc = await render({ rows: [LABELLED], addresses: { r2: 'https://wiki.example.com/share/abc' } });
    const card = doc.querySelector('.shared-links-cards [data-share-card="r2"]') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.querySelector('strong')?.textContent).toBe('For Dr Smith');
    expect(card.textContent).toContain('Active, ends 2026-12-03');
    expect(card.querySelector('input[readonly]')?.getAttribute('value')).toBe('https://wiki.example.com/share/abc');
    expect(card.querySelector('button[aria-label="Copy link"]')).not.toBeNull();
    expect(card.textContent).toContain('Extend or see who visited');
    expect(card.querySelector('form[action="/my/vaults/links/r2/revoke"]')).not.toBeNull();
  });

  test('the button that leaves the page says who visited', async () => {
    const doc = await render({ rows: [LABELLED] });
    expect(doc.body.textContent).toContain('Extend or see who visited');
    expect(doc.body.textContent).not.toContain('Extend or see visits');
  });

  test('Copy has an aria-label, falls back to selecting and copying, and goes back to the icon', async () => {
    const doc = await render({ rows: [ROW], addresses: { r1: 'https://wiki.example.com/share/abc' } });
    expect(doc.querySelector('tr[data-share-id="r1"] button[aria-label="Copy link"]')).not.toBeNull();
    const html = doc.documentElement.innerHTML;
    expect(html).toContain('execCommand');
    expect(html).toContain('setTimeout');
  });
});

describe('my-shares.ejs share panel (round 5)', () => {
  test('with no links the panel is open and says what to do', async () => {
    const doc = await render({ rows: [] });
    expect(doc.querySelector('details#share-new')?.hasAttribute('open')).toBe(true);
    expect(doc.body.textContent).toContain('You haven\'t shared anything yet. Choose what to share above and press Make link.');
  });

  test('with links and no choice the panel is closed so the list comes first', async () => {
    const doc = await render({ rows: [ROW] });
    expect(doc.querySelector('details#share-new')?.hasAttribute('open')).toBe(false);
  });

  test('the six-item explanation sits under "How shared links work"', async () => {
    const doc = await render({ shareChoice: 'vault', vaults: VAULTS, rows: [ROW] });
    const explanation = doc.querySelector('[data-share-explanation]');
    const details = explanation?.closest('details#share-new details');
    expect(details?.querySelector('summary')?.textContent?.trim()).toBe('How shared links work');
  });

  test('the whole-vault form is not a disclosure inside the Share panel', async () => {
    const doc = await render({ shareChoice: 'vault', vaults: VAULTS, rows: [ROW] });
    const form = doc.querySelector('#share-new input[name="scope"][value="whole"]');
    expect(form?.closest('details')?.id).toBe('share-new');
  });
});

describe('the admin list and the style (round 5)', () => {
  test('the admin list is named "All shared links (admin)"', async () => {
    const html = readFileSync(path.join(VIEWS, 'shares.ejs'), 'utf8');
    expect(html).toContain('All shared links (admin)');
    expect(html).not.toContain('Share Links');
  });

  test('the shared-links table undoes the system-info first-column style', async () => {
    const css = loadedCss(await render({ rows: [LABELLED] }));
    const rule = css.match(/\.shared-links td:first-child\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('width: auto');
    expect(rule).toContain('font-weight: normal');
    expect(css).toMatch(/\.shared-link-cell[^{]*\{[^}]*min-width: 180px/);
  });
});

// ---- round 6 ----

type CssRule = { selector: string; body: string; order: number };

/** The top-level style rules of a stylesheet, in order. At-rule blocks (media queries) are skipped. */
function topLevelRules(css: string): CssRule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];
  let depth = 0;
  let start = 0;
  let head = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) head = text.slice(start, i).trim();
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        if (!head.startsWith('@')) {
          const body = text.slice(text.indexOf('{', start) + 1, i);
          for (const selector of head.split(',')) rules.push({ selector: selector.trim(), body, order: rules.length });
        }
        start = i + 1;
      }
    }
  }
  return rules;
}

/** Specificity of a simple selector as a comparable number: ids, then classes/attributes/pseudo-classes, then elements. */
function specificity(selector: string): number {
  const ids = (selector.match(/#[\w-]+/g) ?? []).length;
  const classes = (selector.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+(\([^)]*\))?/g) ?? []).length;
  const elements = (selector.replace(/\.[\w-]+|#[\w-]+|\[[^\]]*\]|:+[\w-]+(\([^)]*\))?/g, ' ').match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length;
  return ids * 10000 + classes * 100 + elements;
}

/** The value the cascade gives `property` on `element`, by specificity and then source order. */
function cascaded(css: string, element: Element, property: string): string | null {
  let winner: { value: string; spec: number; order: number } | null = null;
  for (const rule of topLevelRules(css)) {
    let matches: boolean;
    try { matches = element.matches(rule.selector); } catch { continue; }
    if (!matches) continue;
    const declaration = rule.body.split(';').map(d => d.split(':')).find(([name]) => name.trim() === property);
    if (!declaration) continue;
    const spec = specificity(rule.selector);
    if (!winner || spec > winner.spec || (spec === winner.spec && rule.order > winner.order)) {
      winner = { value: declaration.slice(1).join(':').trim(), spec, order: rule.order };
    }
  }
  return winner?.value ?? null;
}

describe('the shared-links table style wins the cascade (round 6 M1, item 4)', () => {
  test('the first column is not bold, grey or 40% wide, whatever rule comes later in the file', async () => {
    const doc = await render({ rows: [LABELLED] });
    const css = loadedCss(doc);
    const cell = doc.querySelector('table#sharedLinksTable td:first-child') as Element;
    expect(cell.closest('table')?.classList.contains('table-sm')).toBe(true);
    expect(cascaded(css, cell, 'width')).toBe('auto');
    expect(cascaded(css, cell, 'font-weight')).toBe('normal');
    expect(cascaded(css, cell, 'color')).toBe('inherit');
  });

  test('the Link column is at least 180px wide and its address box can grow and shrink', async () => {
    const doc = await render({ rows: [ROW], addresses: { r1: 'https://wiki.example.com/share/abc' } });
    const css = loadedCss(doc);
    const linkCell = doc.querySelector('table#sharedLinksTable td.shared-link-cell') as Element;
    expect(cascaded(css, linkCell, 'min-width')).toBe('180px');
    const group = doc.querySelector('table#sharedLinksTable .input-group') as Element;
    expect(cascaded(css, group, 'display')).toBe('flex');
    const input = group.querySelector('input') as Element;
    expect(cascaded(css, input, 'flex')).toBe('1 1 auto');
    expect(cascaded(css, input, 'min-width')).toBe('0');
  });
});

describe('the rules are in a stylesheet the page loads (round 7)', () => {
  test('the pages link their own stylesheets from disk; the shared-links rules are in one of them', async () => {
    for (const doc of [await render({ rows: [LABELLED] }), await renderAdmin()]) {
      const hrefs = localStylesheets(doc);
      expect(hrefs.map(h => h.split('?')[0])).toContain('/themes/core.css');
      for (const href of hrefs) expect(readFileSync(stylesheetFile(href), 'utf8').length).toBeGreaterThan(0);
      expect(loadedCss(doc)).toMatch(/\.table\.shared-links td:first-child\s*\{/);
      expect(loadedCss(doc)).toMatch(/\.table\.shared-links \.input-group > input\s*\{/);
    }
  });

  test('the admin table has the same class, so its first column and address box are styled like the person page', async () => {
    const doc = await renderAdmin();
    const css = loadedCss(doc);
    const table = doc.querySelector('table#sharesTable') as Element;
    expect(table.classList.contains('shared-links')).toBe(true);
    const first = doc.querySelector('table#sharesTable td:first-child') as Element;
    expect(cascaded(css, first, 'font-weight')).toBe('normal');
    expect(cascaded(css, first, 'color')).toBe('inherit');
    const cell = doc.querySelector('table#sharesTable td.shared-link-cell') as Element;
    expect(cascaded(css, cell, 'min-width')).toBe('180px');
    const input = doc.querySelector('table#sharesTable .input-group > input') as Element;
    expect(cascaded(css, input, 'flex')).toBe('1 1 auto');
    expect(cascaded(css, input, 'min-width')).toBe('0');
  });
});

describe('expired and revoked rows have no actions (round 6 L3)', () => {
  const STATUSES = ['expired', 'revoked', 'page not available'];
  test.each(STATUSES)('a %s link shows no Revoke or Extend in the table or the phone card', async (status) => {
    // The row still carries the actions it would have had when active: the page must not trust them.
    const doc = await render({ rows: [{ ...LABELLED, status }] });
    expect(doc.querySelector('tr[data-share-id="r2"] form[action$="/revoke"]')).toBeNull();
    expect(doc.querySelector('[data-share-card="r2"] form[action$="/revoke"]')).toBeNull();
    expect(doc.body.textContent).not.toMatch(/\bRevoke\b/);
    expect(doc.body.textContent).not.toContain('Extend or see who visited');
  });

  test('an active link shows both in the table and the phone card', async () => {
    const doc = await render({ rows: [LABELLED] });
    expect(doc.querySelector('tr[data-share-id="r2"] form[action$="/revoke"]')).not.toBeNull();
    expect(doc.querySelector('[data-share-card="r2"] form[action$="/revoke"]')).not.toBeNull();
    expect(doc.querySelectorAll('a[href="/my/vaults/links"]').length).toBe(2);
  });
});

describe('the admin page is named "All shared links (admin)" everywhere (round 6 item 5)', () => {
  test('the route passes that title, and the heading and tab say it', async () => {
    const route = readFileSync(path.join(VIEWS, '../src/routes/WikiRoutes.ts'), 'latin1');
    const render = route.slice(route.indexOf("res.render('shares'"));
    expect(render.slice(0, render.indexOf('});'))).toContain("title: 'All shared links (admin)'");
    const view = readFileSync(path.join(VIEWS, 'shares.ejs'), 'utf8');
    expect(view).toContain("pageName: 'All shared links (admin)'");
    expect(view).toContain('All shared links (admin) <%-');
  });
});

describe('the Copy button in a browser (round 6 L2, item 6)', () => {
  const ADDRESS = 'https://wiki.example.com/share/abc';
  const COPY_HELP = 'Press Ctrl+C (or hold and copy) to copy the address.';

  /** The page with its inline script running; clipboard and execCommand are what the test gives it. */
  async function page(env: { clipboard?: { writeText: (text: string) => Promise<void> }; execCommand?: () => boolean }) {
    const html = await ejs.renderFile(path.join(VIEWS, 'my-shares.ejs'), {
      ...COMMON, rows: [ROW], mayTag: true, mayVault: true, vaults: [], pickVault: null, pickPages: [], preselected: null,
      baseUrl: 'https://wiki.example.com', notice: null, shareChoice: '', tagPrefill: '', pagePrefill: '', createdId: '',
      revoked: false, error: null, addresses: { r1: ADDRESS }, pageTitles: {}, cspNonce: 'n'
    });
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      beforeParse(window) {
        const w = window as unknown as Record<string, unknown>;
        w.setTimeout = (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length; };
        if (env.clipboard) Object.defineProperty(window.navigator, 'clipboard', { value: env.clipboard, configurable: true });
        (window.document as unknown as Record<string, unknown>).execCommand = env.execCommand ?? undefined;
      }
    });
    const doc = dom.window.document;
    const button = doc.querySelector('table#sharedLinksTable [data-copy-link]') as HTMLButtonElement;
    const input = doc.querySelector('table#sharedLinksTable input[readonly]') as HTMLInputElement;
    const help = doc.querySelector('table#sharedLinksTable [data-copy-help]');
    const settle = () => new Promise<void>(resolve => { setImmediate(resolve); });
    return { dom, doc, button, input, help, timers, settle };
  }

  test('no clipboard, execCommand works: a tick shows, then the icon returns after the timer', async () => {
    const execCommand = vi.fn(() => true);
    const p = await page({ execCommand });
    p.button.click();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(p.button.innerHTML).toContain('fa-check');
    expect(p.help?.hidden).toBe(true);
    expect(p.timers.at(-1)?.ms).toBe(2000);
    p.timers.at(-1)?.fn();
    expect(p.button.innerHTML).toContain('fa-copy');
  });

  test('a clipboard that rejects falls back to selecting and copying', async () => {
    const execCommand = vi.fn(() => true);
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    const p = await page({ clipboard: { writeText }, execCommand });
    p.button.click();
    await p.settle();
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(p.button.innerHTML).toContain('fa-check');
  });

  test('when nothing can copy, the address stays selected and the help line appears', async () => {
    const execCommand = vi.fn(() => false);
    const p = await page({ clipboard: { writeText: () => Promise.reject(new Error('denied')) }, execCommand });
    p.button.click();
    await p.settle();
    expect(p.button.innerHTML).toContain('fa-copy');
    expect(p.doc.activeElement).toBe(p.input);
    expect(p.input.selectionStart).toBe(0);
    expect(p.input.selectionEnd).toBe(ADDRESS.length);
    expect(p.help?.hidden).toBe(false);
    expect(p.help?.textContent?.trim()).toBe(COPY_HELP);
  });

  test('no clipboard and no execCommand at all gives the same help line', async () => {
    const p = await page({});
    p.button.click();
    expect(p.help?.hidden).toBe(false);
    expect(p.help?.textContent?.trim()).toBe(COPY_HELP);
    expect(p.input.selectionEnd).toBe(ADDRESS.length);
  });

  test('a later successful copy hides the help line again', async () => {
    let works = false;
    const p = await page({ execCommand: () => works });
    p.button.click();
    expect(p.help?.hidden).toBe(false);
    works = true;
    p.button.click();
    expect(p.help?.hidden).toBe(true);
  });
});

// ---- round 8 ----

describe('the link actions read as a link and Revoke (round 8 items 1 and 2)', () => {
  test('Extend or see who visited is a text link with an arrow, centred in a 44px target, beside Revoke in a wrapping group', async () => {
    const doc = await render({ rows: [LABELLED] });
    for (const scope of ['tr[data-share-id="r2"]', '[data-share-card="r2"]']) {
      const link = doc.querySelector(`${scope} a[href="/my/vaults/links"]`) as Element;
      expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe('Extend or see who visited');
      for (const name of ['btn', 'btn-sm', 'btn-link', 'px-0', 'text-start', 'd-inline-flex', 'align-items-center']) {
        expect(link.classList.contains(name)).toBe(true);
      }
      expect(link.classList.contains('btn-outline-secondary')).toBe(false);
      expect(link.querySelector('i.fas.fa-arrow-right')).not.toBeNull();
      expect(link.getAttribute('style')).toContain('min-height: 44px');
      const group = link.parentElement as Element;
      for (const name of ['shared-link-actions', 'd-flex', 'gap-2', 'align-items-center', 'flex-wrap']) expect(group.classList.contains(name)).toBe(true);
      expect(group.querySelector('form[action$="/revoke"]')).not.toBeNull();
    }
  });

  test('Revoke asks before it stops the link, on the person page as on the admin page', async () => {
    const doc = await render({ rows: [LABELLED] });
    for (const scope of ['tr[data-share-id="r2"]', '[data-share-card="r2"]']) {
      const form = doc.querySelector(`${scope} form[action$="/revoke"]`) as Element;
      expect(form.getAttribute('onsubmit')).toBe("return confirm('Stop this link? It stops working immediately.')");
    }
  });
});

describe('the Link column, inactive rows, phone cards and the empty state (round 8 items 3 to 6)', () => {
  test('the Link column does not claim the whole row, so the other columns keep room (round 9)', async () => {
    const doc = await render({ rows: [ROW], addresses: { r1: 'https://wiki.example.com/share/abc' } });
    const css = loadedCss(doc);
    const cell = doc.querySelector('table#sharedLinksTable td.shared-link-cell') as Element;
    expect(cascaded(css, cell, 'width')).toBeNull();
    expect(cascaded(css, cell, 'min-width')).toBe('180px');
  });

  test.each(['expired', 'revoked', 'page not available'])('a %s row is muted and an active row is not', async (status) => {
    const doc = await render({ rows: [{ ...ROW, id: 'a1', status: 'active' }, { ...ROW, id: 'x1', status }], addresses: { a1: 'https://wiki.example.com/share/abc' } });
    const dead = [...doc.querySelectorAll('tr[data-share-id="x1"] td')];
    expect(dead.length).toBe(6);
    for (const td of dead) expect(td.classList.contains('text-muted')).toBe(true);
    for (const td of doc.querySelectorAll('tr[data-share-id="a1"] td')) expect(td.classList.contains('text-muted')).toBe(false);
  });

  test('a revoked phone card does not end in a lone dash, but the table cell still says there is no link', async () => {
    const doc = await render({ rows: [{ ...ROW, status: 'revoked', actions: [] }] });
    const card = doc.querySelector('[data-share-card="r1"]') as Element;
    expect(card.textContent?.replace(/\s+/g, ' ').trim()).not.toMatch(/(^|\s)-$/);
    expect(card.querySelector('.mb-2:empty')).toBeNull();
    expect(doc.querySelector('tr[data-share-id="r1"] td.shared-link-cell')?.textContent?.trim()).toBe('-');
  });

  test('an active card with no stored address still says it was shown once', async () => {
    const doc = await render({ rows: [ROW] });
    expect(doc.querySelector('[data-share-card="r1"]')?.textContent).toContain('Address was shown once, when you made it');
  });

  test('owner-only does not break at its hyphen in the tag form text', async () => {
    const doc = await render({ shareChoice: 'tag' });
    const code = [...doc.querySelectorAll('#share-new code')].find(c => c.textContent === 'owner-only') as Element;
    expect(code.classList.contains('text-nowrap')).toBe(true);
  });
});

describe('the Actions column keeps both actions on one line each (round 8 measurement)', () => {
  test('the Actions cell does not wrap, so the link is not squeezed to a few letters beside Revoke', async () => {
    const doc = await render({ rows: [LABELLED] });
    const cell = doc.querySelector('tr[data-share-id="r2"] td:last-child') as Element;
    expect(cell.querySelector('a[href="/my/vaults/links"]')).not.toBeNull();
    expect(cell.classList.contains('text-nowrap')).toBe(true);
  });
});

// ---- round 9: the table fits its box ----

describe('the table fits its box and the layout switches by the box width (round 9)', () => {
  const RULE = (css: string, selector: string): string => css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'))?.[1] ?? '';

  test('the What column has room to read, on the person page only', async () => {
    const doc = await render({ rows: [LABELLED] });
    const css = loadedCss(doc);
    const what = doc.querySelector('table#sharedLinksTable td:first-child') as Element;
    expect(what.classList.contains('shared-link-what')).toBe(true);
    expect(cascaded(css, what, 'min-width')).toBe('10rem');
    const admin = await renderAdmin();
    expect(cascaded(css, admin.querySelector('table#sharesTable td:first-child') as Element, 'min-width')).toBeNull();
  });

  test('in the table the Extend link sits above Revoke; on a card they sit side by side and wrap', async () => {
    const doc = await render({ rows: [LABELLED] });
    const css = loadedCss(doc);
    const inTable = doc.querySelector('table#sharedLinksTable .shared-link-actions') as Element;
    expect(cascaded(css, inTable, 'flex-direction')).toBe('column');
    expect(cascaded(css, inTable, 'align-items')).toBe('flex-start');
    expect(cascaded(css, inTable, 'flex-wrap')).toBe('nowrap');
    const onCard = doc.querySelector('[data-share-card="r2"] .shared-link-actions') as Element;
    expect(cascaded(css, onCard, 'flex-direction')).toBeNull();
    expect(onCard.classList.contains('flex-wrap')).toBe(true);
  });

  test('cards are the default and the table appears only when its box is wide enough for every column', async () => {
    const doc = await render({ rows: [LABELLED] });
    const css = loadedCss(doc);
    const wrap = doc.querySelector('.shared-links-wrap') as Element;
    expect(wrap.querySelector('table#sharedLinksTable')).not.toBeNull();
    expect(wrap.querySelector('.shared-links-cards [data-share-card="r2"]')).not.toBeNull();
    expect(RULE(css, '.shared-links-wrap')).toContain('container-type: inline-size');
    const table = doc.querySelector('.shared-links-table') as Element;
    expect(table.querySelector('table#sharedLinksTable')).not.toBeNull();
    expect(cascaded(css, table, 'display')).toBe('none');
    expect(cascaded(css, doc.querySelector('.shared-links-cards') as Element, 'display')).toBe('block');
    expect(css).toMatch(/@container \(min-width: 840px\)\s*\{[^@]*\.shared-links-table\s*\{[^}]*display: block[^}]*\}[^@]*\.shared-links-cards\s*\{[^}]*display: none/);
  });
});
