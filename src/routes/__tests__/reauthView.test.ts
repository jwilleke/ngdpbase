/**
 * #2193 — views/reauth.ejs carries a script's prompt id to the password
 * confirmation, the passkey button and Cancel. Cancel for such a prompt is a
 * POST with the session's CSRF token, so the page waiting on it, in whichever
 * window, learns it was cancelled; any other prompt's Cancel stays a link to
 * where it returns. Header and footer are left out: they are not this view's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const VIEW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../views/reauth.ejs');

/** The view without its header and footer includes, which need the whole page's data. */
const TEMPLATE = fs.readFileSync(VIEW, 'utf8').replace(/<%- include\('(header|footer)'[^%]*%>/g, '');

const PROMPT = '0123456789abcdef0123456789abcdef';

function render(prompt: string): string {
  return ejs.render(TEMPLATE, { next: '/view/Ledger', prompt, needsPasskey: false, hasPasskey: true, hasPassword: true, csrfToken: 'tok' });
}

describe('reauth view (#2193)', () => {
  test('a script\'s prompt: its id goes with the password, the passkey and a Cancel that posts', () => {
    const html = render(PROMPT);
    expect(html).toContain(`<input type="hidden" name="prompt" value="${PROMPT}">`);
    expect(html).toContain(`data-prompt="${PROMPT}"`);
    expect(html).toMatch(/<form method="POST" action="\/auth\/reauth\/cancel"[^>]*>\s*<input type="hidden" name="_csrf" value="tok">/);
    expect(html).not.toContain('<a href="/view/Ledger">Cancel</a>');
  });

  test('any other prompt: no id, and Cancel is the link back', () => {
    const html = render('');
    expect(html).not.toContain('name="prompt"');
    expect(html).not.toContain('/auth/reauth/cancel');
    expect(html).toContain('<a href="/view/Ledger">Cancel</a>');
  });

  test('#421 slice 2c: an enrolled app is offered; at AAL2 with the password, below it alone', () => {
    const at = (needsPasskey: boolean) => ejs.render(TEMPLATE, { next: '/profile', prompt: '', needsPasskey, hasPasskey: false, hasPassword: true, hasTotp: true, csrfToken: 'tok' });
    const aal2 = at(true);
    expect(aal2).toMatch(/<form method="POST" action="\/auth\/reauth\/totp"[\s\S]*name="password"[\s\S]*name="code"/);
    expect(aal2).not.toContain('has no way to confirm');
    const aal1 = at(false);
    expect(aal1).toContain('action="/auth/reauth/totp"');
    expect(aal1).not.toContain('id="reauthTotpPassword"');
    expect(render('')).not.toContain('/auth/reauth/totp');
  });

  test('#2345: where passkeys cannot work, the note names the app and password, not a passkey', () => {
    const at = (passkeysAvailable: boolean) => ejs.render(TEMPLATE, { next: '/profile', prompt: '', needsPasskey: true, passkeysAvailable, hasPasskey: false, hasPassword: true, hasTotp: true, csrfToken: 'tok' });
    const off = at(false);
    expect(off).toContain('Your role needs your password with your authenticator app');
    expect(off).not.toMatch(/passkey/i);
    expect(at(true)).toContain('Your role needs a passkey, or your password with your authenticator app');
  });
});
