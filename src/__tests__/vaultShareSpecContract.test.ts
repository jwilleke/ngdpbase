/**
 * The E2E spec that makes a one-page link finds its form by a selector. That
 * form now lives on /my/shares and posts to /my/shares/vault-links, so the
 * selector must match the page as the view renders it. Unit CI runs this; the
 * browser spec runs only in the E2E job, so a stale selector shows up here first.
 */
import ejs from 'ejs';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const SPEC = readFileSync(path.join(ROOT, 'tests/e2e/vault-share.spec.ts'), 'utf8');

/** The CSS selector in the spec's first `const form = page.locator('...')` line, and the `has:` selector filtering it. */
function pageFormSelectors(): { form: string; has: string } {
  const m = SPEC.match(/const form = page\.locator\('([^']+)'\)\.filter\(\{ has: page\.locator\('([^']+)'\) \}\)/);
  if (!m) throw new Error('vault-share.spec.ts: the page-link form locator was not found');
  return { form: m[1], has: m[2] };
}

describe('vault-share.spec.ts finds the one-page form on /my/shares', () => {
  test('its form selector matches the rendered form, with the requested page ticked', async () => {
    const html = await ejs.renderFile(path.join(ROOT, 'views/my-shares.ejs'), {
      title: 'Shared links', csrfToken: 'csrf-value', jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`,
      lockedUnless: () => '', currentUser: { username: 'molly', displayName: 'Molly', roles: [] as string[], isAuthenticated: true },
      rows: [], mayTag: true, mayVault: true, vaults: [{ id: 'default', maxDays: 15, encrypted: false }],
      pickVault: 'default', pickPages: [{ uuid: 'u1', title: 'Shared' }, { uuid: 'u2', title: 'Sibling' }], preselected: 'u1',
      baseUrl: 'https://wiki.example.com', notice: null, shareChoice: 'vault', tagPrefill: '', pagePrefill: '', createdId: '',
      revoked: false, error: null, addresses: {}, pageTitles: {}
    });
    const doc = new JSDOM(html).window.document;
    const { form, has } = pageFormSelectors();
    const forms = [...doc.querySelectorAll(form)].filter((f) => f.querySelector(has));
    expect(forms).toHaveLength(1);
    expect(forms[0].querySelectorAll('input[name="pages"]:checked')).toHaveLength(1);
  });
});
