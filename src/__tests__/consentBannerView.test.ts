/**
 * #2027 — the banner a user with documents to accept sees on every page:
 * what to accept, and a link to the prompt that returns to this page. The
 * consent gate decides it (`res.locals.consentNotice`); the header shows it.
 * Renders the real view, as Express does.
 *
 * Sabotaged once (then restored): the header's `consentNotice` block removed
 * — the "shows it" test went red.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../views');

const COMMON = {
  pageName: '', csrfToken: 'csrf-value', jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`,
  lockedUnless: () => '',
  currentUser: { username: 'ann', displayName: 'Ann', roles: ['reader'], isAuthenticated: true }
};

async function render(locals: Record<string, unknown>): Promise<Document> {
  const html = await ejs.renderFile(path.join(VIEWS, 'header.ejs'), { ...COMMON, ...locals });
  return new JSDOM(html).window.document;
}

const text = (el: { textContent: string | null } | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('#2027 the consent banner', () => {
  test('shows what to accept and links to the prompt, returning here', async () => {
    const doc = await render({ consentNotice: { message: 'You have terms to accept: Terms of Service, version 2.', link: '/consent?returnTo=%2Fview%2FMain' } });
    const banner = doc.querySelector('[data-consent-banner]');
    expect(text(banner)).toBe('You have terms to accept: Terms of Service, version 2. Read and accept');
    expect(banner?.querySelector('a')?.getAttribute('href')).toBe('/consent?returnTo=%2Fview%2FMain');
    // Persistent: nothing on it dismisses it.
    expect(banner?.querySelector('[data-bs-dismiss], .btn-close')).toBeNull();
  });

  test('absent when there is nothing to accept', async () => {
    expect((await render({})).querySelector('[data-consent-banner]')).toBeNull();
  });
});
