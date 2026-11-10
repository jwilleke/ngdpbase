/**
 * #2345 — the red banner for a role held at password-alone until a second
 * factor is added. It names a passkey only where one can be added; where
 * passkeys are off or can't work on the address, only the authenticator app.
 * Renders the real header, as Express does. Since #2356 the header reads what
 * this account can add or use (`ways`, AuthManager.strongerSignInWays).
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
    const b = await banner({ roles: ['admin'], ways: { addPasskey: false, addTotp: true } });
    expect(text(b)).toBe('Your admin role needs an authenticator app, and you have not added one. You are using it with a password alone until you do. Add one now');
    expect(text(b)).not.toMatch(/passkey/i);
    expect(b?.querySelector('a')?.getAttribute('href')).toBe('/profile#sign-in-methods');
  });

  test('https address: wording unchanged', async () => {
    const b = await banner({ roles: ['admin'], ways: { addPasskey: true, addTotp: true } });
    expect(text(b)).toBe('Your admin role needs a passkey or an authenticator app, and you have not added one. You are using it with a password alone until you do. Add one now');
  });

  test('passkeys turned off: no passkey in the banner (same flag)', async () => {
    const b = await banner({ roles: ['admin', 'editor'], ways: { addPasskey: false, addTotp: true } });
    expect(text(b)).toContain('roles need an authenticator app');
    expect(text(b)).not.toMatch(/passkey/i);
  });
});

describe('#2345 the yellow step-down banner', () => {
  test('passkeys cannot work: asks for the authenticator app\'s code and links to sign in again', async () => {
    const b = await stepDown({ roles: ['admin'], ways: { useTotp: true, password: true } });
    expect(text(b)).toBe('Your admin role needs a sign-in with your authenticator app\'s code, so it is off while you are signed in with a password alone. Sign in again');
    expect(text(b)).not.toMatch(/passkey/i);
    expect(b?.querySelector('a')?.getAttribute('href')).toBe('/auth/reauth?next=%2Fview%2FLedger');
  });

  test('passkeys cannot work, even with a passkey already on the account: no passkey button', async () => {
    // A passkey on the account is not usable where passkeys can't work: AuthManager says usePasskey false.
    const b = await stepDown({ roles: ['admin'], ways: { usePasskey: false, useTotp: true, password: true } });
    expect(text(b)).not.toMatch(/passkey/i);
    expect(b?.querySelector('[data-passkey-signin]')).toBeNull();
  });

  test('passkeys available: wording and Add a passkey unchanged', async () => {
    const b = await stepDown({ roles: ['admin'], ways: { addPasskey: true, addTotp: true, password: true } });
    expect(text(b)).toBe('Your admin role needs a passkey sign-in, so it is off while you are signed in with a password. Add a passkey');
    expect(b?.querySelector('a')?.getAttribute('href')).toBe('/profile');
  });
});

describe('#2356 the banners name only what this account can add or use', () => {
  test('https, allowed everything, a passkey on the account: the passkey button, unchanged', async () => {
    const b = await stepDown({ roles: ['admin'], ways: { usePasskey: true, addTotp: true, password: true } });
    expect(text(b)).toBe('Your admin role needs a passkey sign-in, so it is off while you are signed in with a password. Sign in with your passkey');
    expect(b?.querySelector('[data-passkey-signin]')).not.toBeNull();
  });

  test('allowed methods exclude passkeys (https site): never a passkey, in either banner', async () => {
    const nag = await banner({ roles: ['admin'], ways: { addPasskey: false, addTotp: true } });
    expect(text(nag)).toContain('needs an authenticator app');
    expect(text(nag)).not.toMatch(/passkey/i);
    const down = await stepDown({ roles: ['admin'], ways: { usePasskey: false, addPasskey: false, useTotp: true, password: true } });
    expect(text(down)).not.toMatch(/passkey/i);
    expect(down?.querySelector('[data-passkey-signin]')).toBeNull();
  });

  test('cannot add the authenticator app: the red banner names only a passkey', async () => {
    const b = await banner({ roles: ['admin'], ways: { addPasskey: true, addTotp: false } });
    expect(text(b)).toBe('Your admin role needs a passkey, and you have not added one. You are using it with a password alone until you do. Add one now');
    expect(text(b)).not.toMatch(/authenticator/i);
  });

  test('an outside provider gives the level, no app: names the provider, not the app or a passkey', async () => {
    const b = await stepDown({ roles: ['admin'], ways: { addTotp: false, useTotp: false, password: true, outside: ['Example ID'] } });
    expect(text(b)).toBe('Your admin role needs a stronger sign-in, so it is off for now. Sign out, then sign in with Example ID.');
    expect(text(b)).not.toMatch(/authenticator|passkey/i);
    expect(b?.querySelector('a')).toBeNull();
  });

  test('an app on the account but no password to go with it: not told to use the app', async () => {
    const b = await stepDown({ roles: ['admin'], ways: { useTotp: true, password: false } });
    expect(text(b)).not.toMatch(/authenticator/i);
    expect(text(b)).toContain('Ask an administrator.');
  });

  test('nothing this account can do: the step-down banner says so and points to an administrator', async () => {
    const b = await stepDown({ roles: ['admin', 'editor'], ways: { addPasskey: false, addTotp: false, usePasskey: false, useTotp: false, password: true, outside: [] } });
    expect(text(b)).toBe('Your admin, editor roles need a stronger sign-in than this account can make here, so they are off for now. Ask an administrator.');
    expect(b?.querySelector('a')).toBeNull();
    expect(b?.querySelector('button')).toBeNull();
  });

  test('nothing this account can add: the red banner says so, with no Add one now', async () => {
    const b = await banner({ roles: ['admin'], ways: { addPasskey: false, addTotp: false } });
    expect(text(b)).toBe('Your admin role needs a stronger sign-in than this account can set up here. You are using it with a password alone. Ask an administrator.');
    expect(b?.querySelector('a')).toBeNull();
  });

  test('a provider\'s name is escaped', async () => {
    const html = await ejs.renderFile(path.join(VIEWS, 'header.ejs'), { ...COMMON, aalStepDown: { roles: ['admin'], ways: { outside: ['<b>X</b>'] } }, originalUrl: '/' });
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(html).not.toContain('<b>X</b>');
  });
});
