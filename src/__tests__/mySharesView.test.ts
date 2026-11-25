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
    revoked: false, error: null, addresses: {}, ...locals
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
