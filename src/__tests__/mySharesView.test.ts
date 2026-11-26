/**
 * views/my-shares.ejs, rendered as Express renders it (slice 3 of #2247).
 */
import ejs from 'ejs';
import path from 'path';
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
    expect(table.classList.contains('d-none') && table.classList.contains('d-md-table')).toBe(true);
    expect(doc.querySelectorAll('tr[data-share-id="r2"] td.text-nowrap').length).toBeGreaterThanOrEqual(2);
  });

  test('each link also has a card for phones, with its address, both buttons and the same wording', async () => {
    const doc = await render({ rows: [LABELLED], addresses: { r2: 'https://wiki.example.com/share/abc' } });
    const card = doc.querySelector('.d-md-none [data-share-card="r2"]') as HTMLElement;
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
    const { readFileSync } = await import('fs');
    const html = readFileSync(path.join(VIEWS, 'shares.ejs'), 'utf8');
    expect(html).toContain('All shared links (admin)');
    expect(html).not.toContain('Share Links');
  });

  test('the shared-links table undoes the system-info first-column style', async () => {
    const { readFileSync } = await import('fs');
    const css = readFileSync(path.join(VIEWS, '../public/css/style.css'), 'utf8');
    const rule = css.match(/\.shared-links td:first-child\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('width: auto');
    expect(rule).toContain('font-weight: normal');
    expect(css).toMatch(/\.shared-links[^{]*\{[^}]*min-width: 280px/);
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
    const { readFileSync } = await import('fs');
    const css = readFileSync(path.join(VIEWS, '../public/css/style.css'), 'utf8');
    const doc = await render({ rows: [LABELLED] });
    const cell = doc.querySelector('table#sharedLinksTable td:first-child') as Element;
    expect(cell.closest('table')?.classList.contains('table-sm')).toBe(true);
    expect(cascaded(css, cell, 'width')).toBe('auto');
    expect(cascaded(css, cell, 'font-weight')).toBe('normal');
    expect(cascaded(css, cell, 'color')).toBe('inherit');
  });

  test('the Link column is at least 280px wide and its address box can grow and shrink', async () => {
    const { readFileSync } = await import('fs');
    const css = readFileSync(path.join(VIEWS, '../public/css/style.css'), 'utf8');
    const doc = await render({ rows: [ROW], addresses: { r1: 'https://wiki.example.com/share/abc' } });
    const linkCell = doc.querySelector('table#sharedLinksTable td:nth-child(5)') as Element;
    expect(cascaded(css, linkCell, 'min-width')).toBe('280px');
    const group = doc.querySelector('table#sharedLinksTable .input-group') as Element;
    expect(cascaded(css, group, 'display')).toBe('flex');
    const input = group.querySelector('input') as Element;
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
    expect(doc.body.textContent).not.toContain('Revoke');
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
    const { readFileSync } = await import('fs');
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
