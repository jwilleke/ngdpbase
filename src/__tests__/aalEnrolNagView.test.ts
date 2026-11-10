/**
 * #2345 — the red banner for a role held at password-alone until a second
 * factor is added. It names a passkey only where one can be added; where
 * passkeys are off or can't work on the address, only the authenticator app.
 * Renders the real header, as Express does.
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
  currentUser: { username: 'ann', displayName: 'Ann', roles: ['admin'], isAuthenticated: true }
};

interface Node_ { textContent: string | null; querySelector: (s: string) => { getAttribute: (n: string) => string | null } | null }

async function stepDown(aalStepDown: Record<string, unknown>): Promise<Node_ | null> {
  const html = await ejs.renderFile(path.join(VIEWS, 'header.ejs'), { ...COMMON, aalStepDown, originalUrl: '/view/Ledger' });
  return new JSDOM(html).window.document.querySelector('.alert-warning');
}

async function banner(aalEnrolNag: Record<string, unknown>): Promise<Node_ | null> {
  const html = await ejs.renderFile(path.join(VIEWS, 'header.ejs'), { ...COMMON, aalEnrolNag });
  return new JSDOM(html).window.document.querySelector('[data-aal-enrol-nag]');
}
const text = (el: Node_ | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('#2345 the add-a-second-factor banner', () => {
  test('passkeys cannot work on the address: names only the authenticator app', async () => {
    const b = await banner({ roles: ['admin'], passkeysAvailable: false });
    expect(text(b)).toBe('Your admin role needs an authenticator app, and you have not added one. You are using it with a password alone until you do. Add one now');
    expect(text(b)).not.toMatch(/passkey/i);
    expect(b?.querySelector('a')?.getAttribute('href')).toBe('/profile#sign-in-methods');
  });

  test('https address: wording unchanged', async () => {
    const b = await banner({ roles: ['admin'], passkeysAvailable: true });
    expect(text(b)).toBe('Your admin role needs a passkey or an authenticator app, and you have not added one. You are using it with a password alone until you do. Add one now');
  });

  test('passkeys turned off: no passkey in the banner (same flag)', async () => {
    const b = await banner({ roles: ['admin', 'editor'], passkeysAvailable: false });
    expect(text(b)).toContain('roles need an authenticator app');
    expect(text(b)).not.toMatch(/passkey/i);
  });
});

describe('#2345 the yellow step-down banner', () => {
  test('passkeys cannot work: asks for the authenticator app\'s code and links to sign in again', async () => {
    const b = await stepDown({ roles: ['admin'], hasPasskey: false, passkeysAvailable: false });
    expect(text(b)).toBe('Your admin role needs a sign-in with your authenticator app\'s code, so it is off while you are signed in with a password alone. Sign in again');
    expect(text(b)).not.toMatch(/passkey/i);
    expect(b?.querySelector('a')?.getAttribute('href')).toBe('/auth/reauth?next=%2Fview%2FLedger');
  });

  test('passkeys cannot work, even with a passkey already on the account: no passkey button', async () => {
    const b = await stepDown({ roles: ['admin'], hasPasskey: true, passkeysAvailable: false });
    expect(text(b)).not.toMatch(/passkey/i);
    expect(b?.querySelector('[data-passkey-signin]')).toBeNull();
  });

  test('passkeys available: wording and Add a passkey unchanged', async () => {
    const b = await stepDown({ roles: ['admin'], hasPasskey: false, passkeysAvailable: true });
    expect(text(b)).toBe('Your admin role needs a passkey sign-in, so it is off while you are signed in with a password. Add a passkey');
    expect(b?.querySelector('a')?.getAttribute('href')).toBe('/profile');
  });
});
