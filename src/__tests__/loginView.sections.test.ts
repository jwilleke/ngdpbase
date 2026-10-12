/**
 * #1781 — the login page labels each sign-in method: a section per method that
 * is on (username and password, passkey, external provider), "or" only between
 * sections shown, and each outside provider's button with its icon on the left,
 * drawn by the one partial the profile's Connect buttons use too.
 *
 * These render the real templates (header and footer stubbed) synchronously,
 * as Express does, since the defect class is branch selection in the view.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../views');
const BUTTON_PARTIAL = path.join(VIEWS, '_outside-provider-button.ejs');

/** Header and footer are not under test; every other include renders for real. */
const includer = (original: string): { template: string } | undefined =>
  original === 'header' || original === 'footer' ? { template: '<!-- stub -->' } : undefined;

const GOOGLE = { id: 'oidc:google', name: 'google', displayName: 'Google', icon: { kind: 'builtin', id: 'google' } };
const FAMILY = { id: 'oidc:family', name: 'family', displayName: 'Shared family sign-in', icon: { kind: 'image', src: 'https://family.example.com/favicon.ico' } };
const MICROSOFT = { id: 'oidc:microsoft', name: 'microsoft', displayName: 'Microsoft', icon: { kind: 'fa', className: 'fab fa-microsoft' } };

async function login(locals: Record<string, unknown> = {}): Promise<Document> {
  const html = await ejs.renderFile(path.join(VIEWS, 'login.ejs'), {
    error: undefined, success: undefined, magic: undefined, redirect: '/', csrfToken: 'csrf-value',
    magicLinkEnabled: false, passkeyEnabled: false, outsideProviders: [], pendingConnection: null, passwordAuthEnabled: true,
    ...locals
  }, { includer });
  return new JSDOM(html).window.document;
}

const sections = (doc: Document): string[] =>
  [...doc.querySelectorAll('[data-signin-method]')].map(s => s.getAttribute('data-signin-method') ?? '');
const separators = (doc: Document): number => doc.querySelectorAll('[data-signin-separator]').length;

describe('#1781 the login page labels each sign-in method', () => {
  test('password only: one labelled section', async () => {
    const doc = await login();
    expect(sections(doc)).toEqual(['password']);
    expect(doc.getElementById('signin-password-heading')?.textContent).toBe('Username and password');
    expect(separators(doc)).toBe(0);
    expect(doc.querySelector('a[href="/recover-password"]')).not.toBeNull();
  });

  test('all three, in order, and no "or" lines between them', async () => {
    const doc = await login({ passkeyEnabled: true, outsideProviders: [FAMILY] });
    expect(sections(doc)).toEqual(['password', 'passkey', 'external']);
    expect([...doc.querySelectorAll('h2')].map(h => h.textContent)).toEqual(['Username and password', 'Passkey', 'External provider']);
    expect(separators(doc)).toBe(0);
    expect(doc.body.textContent).not.toMatch(/— or —/);
    const passkey = doc.querySelector('[data-passkey-section]')!;
    expect(passkey.classList.contains('d-none')).toBe(true);
  });

  test('password sign-in off: passkey and external', async () => {
    const doc = await login({ passwordAuthEnabled: false, passkeyEnabled: true, outsideProviders: [GOOGLE] });
    expect(sections(doc)).toEqual(['passkey', 'external']);
    expect(doc.querySelector('form:has(input[type="password"])')).toBeNull();
    expect(separators(doc)).toBe(0);
  });

  test('password sign-in off with only outside providers', async () => {
    const doc = await login({ passwordAuthEnabled: false, outsideProviders: [GOOGLE, FAMILY] });
    expect(sections(doc)).toEqual(['external']);
    expect(separators(doc)).toBe(0);
    expect(doc.querySelectorAll('[data-outside-provider]')).toHaveLength(2);
  });

  test('password sign-in off and no outside provider: the password section still shows', async () => {
    expect(sections(await login({ passwordAuthEnabled: false }))).toEqual(['password']);
  });

  test('password and external: two sections, no "or"', async () => {
    const doc = await login({ outsideProviders: [GOOGLE] });
    expect(sections(doc)).toEqual(['password', 'external']);
    expect(separators(doc)).toBe(0);
  });

  test('the pending-connection notice stays above every section', async () => {
    const html = (await login({ pendingConnection: { displayName: 'Google', email: '' }, outsideProviders: [GOOGLE] })).body.innerHTML;
    expect(html.indexOf('data-pending-connection')).toBeLessThan(html.indexOf('data-signin-method'));
  });

  test('the forms, hidden fields and passkey attributes are unchanged', async () => {
    const doc = await login({ passkeyEnabled: true, outsideProviders: [GOOGLE], redirect: '/view/Home' });
    const password = doc.querySelector('form[action="/login"]')!;
    expect(password.querySelector('input[name="_csrf"]')?.getAttribute('value')).toBe('csrf-value');
    expect(password.querySelector('input[name="redirect"]')?.getAttribute('value')).toBe('/view/Home');
    expect(password.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Login');
    const outside = doc.querySelector('form[action="/auth/oauth/google"]')!;
    expect(outside.querySelector('input[name="_csrf"]')?.getAttribute('value')).toBe('csrf-value');
    expect(outside.querySelector('input[name="redirect"]')?.getAttribute('value')).toBe('/view/Home');
    const passkey = doc.querySelector('[data-passkey-signin]')!;
    expect(passkey.getAttribute('data-redirect')).toBe('/view/Home');
    expect(passkey.getAttribute('data-error-target')).toBe('passkey-error');
    expect(doc.getElementById('passkey-error')).not.toBeNull();
  });
});

describe('#1781 an outside provider\'s button shows its icon on the left', () => {
  const button = async (provider: Record<string, unknown>): Promise<Element> =>
    (await login({ outsideProviders: [provider] })).querySelector('[data-outside-provider]')!;

  test('an image: escaped, decorative, 20 by 20, before the label', async () => {
    const b = await button({ ...FAMILY, displayName: 'Family <b>', icon: { kind: 'image', src: 'https://family.example.com/i.png?a=1&b="2"' } });
    const img = b.firstElementChild!;
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toBe('https://family.example.com/i.png?a=1&b="2"');
    expect(img.getAttribute('alt')).toBe('');
    expect([img.getAttribute('width'), img.getAttribute('height')]).toEqual(['20', '20']);
    expect(b.textContent?.trim()).toBe('Family <b>');
    expect(b.querySelector('b')).toBeNull();
  });

  test('a Font Awesome icon', async () => {
    const icon = (await button(MICROSOFT)).firstElementChild!;
    expect(icon.tagName).toBe('I');
    expect(icon.className).toBe('fab fa-microsoft fa-fw');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  test('Google\'s logo', async () => {
    const icon = (await button(GOOGLE)).firstElementChild!;
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(icon.querySelectorAll('path')).toHaveLength(4);
  });
});

describe('#1781 the profile\'s Connect buttons use the same partial', () => {
  test('one partial draws both', async () => {
    const fs = await import('node:fs');
    const uses = (view: string): number => fs.readFileSync(path.join(VIEWS, view), 'utf8').match(/include\('_outside-provider-button'/g)?.length ?? 0;
    expect(uses('login.ejs')).toBe(1);
    expect(uses('profile.ejs')).toBe(1);
  });

  test('a Connect button renders through it', async () => {
    const html = await ejs.renderFile(BUTTON_PARTIAL, { provider: MICROSOFT, label: 'Connect Microsoft', buttonClass: 'btn btn-sm btn-outline-primary' });
    const b = new JSDOM(html).window.document.querySelector('button')!;
    expect(b.className).toContain('btn-sm btn-outline-primary');
    expect(b.firstElementChild?.className).toBe('fab fa-microsoft fa-fw');
    expect(b.textContent?.trim()).toBe('Connect Microsoft');
  });
});
