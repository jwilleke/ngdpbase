/**
 * #2073 — the routes around a user's own email change: the confirmation link's
 * page (GET shows, POST confirms; never signs in), registration (the account
 * is made without the email, which is sent a link), and an administrator's
 * edit (trusted, no link; an administrator's email never shared). The rules
 * themselves are AuthManager's and UserManager's (AuthManager.emailChange,
 * UserManager.sharedEmail tests).
 *
 * Sabotaged once each (2026-10-25), and watched go red:
 * - registration giving createUser the typed email again → "registration makes the account without the email";
 * - the confirm page changing the email on the GET → "the GET only shows";
 * - the admin edit's UserCreateError branch removed → "an administrator is told why".
 */
import WikiRoutes from '../WikiRoutes';
import { UserCreateError } from '../../utils/userCreateError';

const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), cookie: vi.fn().mockReturnThis()
});

function routes(opts: { sent?: string; confirm?: unknown; shared?: boolean; updateFail?: Error } = {}) {
  const authManager = {
    emailChangeOffer: vi.fn((t: string) => (t === 'good' ? { username: 'pat', address: 'pat@new.example' } : null)),
    confirmEmailChange: vi.fn(() => Promise.resolve(opts.confirm ?? { outcome: 'changed', username: 'pat' })),
    requestEmailChange: vi.fn((..._a: unknown[]) => Promise.resolve(opts.sent ?? 'sent')),
    emailLinksAvailable: vi.fn(() => true)
  };
  const userManager = {
    getUser: vi.fn((u: string) => Promise.resolve({ username: u, email: 'pat@new.example' })),
    createUser: vi.fn(() => Promise.resolve({ username: 'dee' })),
    updateUser: vi.fn(() => (opts.updateFail ? Promise.reject(opts.updateFail) : Promise.resolve(true))),
    isEmailShared: vi.fn(() => Promise.resolve(opts.shared === true))
  };
  const managers: Record<string, unknown> = {
    AuthManager: authManager,
    UserManager: userManager,
    ConfigurationManager: { getProperty: (_k: string, d: unknown) => d },
    PolicyDecisionPoint: { permits: vi.fn(() => Promise.resolve(true)) }
  };
  const r = new WikiRoutes({ getManager: (n: string) => managers[n] ?? null }) as unknown as Record<string, (q: unknown, s: unknown) => Promise<void>>;
  (r as unknown as { getCommonTemplateData: () => Promise<Record<string, unknown>> }).getCommonTemplateData = () => Promise.resolve({ csrfToken: 'tok' });
  return { r, authManager, userManager };
}

const req = (extra: Record<string, unknown> = {}) => ({
  session: { csrfToken: 'tok', save: vi.fn((cb: (e?: unknown) => void) => cb()) }, body: {}, query: {}, params: {}, ip: '10.0.0.9',
  headers: {}, get: () => 'ua', userContext: { username: 'admin', roles: ['admin'], isAuthenticated: true }, ...extra
});

describe('the email confirmation link (#2073)', () => {
  test('the GET only shows what it would change; nothing is changed', async () => {
    const { r, authManager } = routes();
    const out = res();
    await r.emailChangeConfirmPage(req({ query: { t: 'good' } }), out);
    expect(out.render).toHaveBeenCalledWith('email-change-confirm', expect.objectContaining({ offer: { username: 'pat', address: 'pat@new.example' }, token: 'good', result: null }));
    expect(authManager.confirmEmailChange).not.toHaveBeenCalled();
  });

  test('the POST confirms through AuthManager; a shared email gets the note; signs nobody in', async () => {
    const { r, authManager } = routes({ shared: true });
    const out = res();
    const q = req({ body: { t: 'good' }, session: { csrfToken: 'tok' } });
    await r.emailChangeConfirm(q, out);
    expect(authManager.confirmEmailChange).toHaveBeenCalledWith('good');
    expect(out.render).toHaveBeenCalledWith('email-change-confirm', expect.objectContaining({
      result: { ok: true, message: 'Your email is changed. Another account uses this email too. Emailed sign-in links will ask which account.' }
    }));
    expect((q.session as Record<string, unknown>).username).toBeUndefined();
  });

  test('an expired or refused link says so, with nothing changed', async () => {
    for (const [confirm, status] of [[{ outcome: 'expired' }, 410], [{ outcome: 'refused', message: 'That email address cannot be used. Please use another.' }, 409]] as const) {
      const { r } = routes({ confirm });
      const out = res();
      await r.emailChangeConfirm(req({ body: { t: 'x' } }), out);
      expect(out.status).toHaveBeenCalledWith(status);
      expect(out.render).toHaveBeenCalledWith('email-change-confirm', expect.objectContaining({ result: expect.objectContaining({ ok: false }) }));
    }
  });
});

describe('registration (#2073)', () => {
  const form = { username: 'dee', email: 'dee@example.org', password: 'pw-1234567', confirmPassword: 'pw-1234567' };

  test('the account is made without the email, which is sent a link; the URL never holds the address', async () => {
    const { r, userManager, authManager } = routes();
    const out = res();
    await r.processRegister(req({ body: { ...form } }), out);
    expect(userManager.createUser).toHaveBeenCalledWith(expect.objectContaining({ username: 'dee', email: '' }), expect.objectContaining({ username: 'dee' }));
    expect(authManager.requestEmailChange).toHaveBeenCalledWith(expect.objectContaining({ username: 'dee' }), 'dee', 'dee@example.org', 'registration');
    const target = decodeURIComponent(String(out.redirect.mock.calls[0][0]));
    expect(target).toBe('/login?success=Registration successful. We sent a link to the email address you gave; it becomes your email when you click it.');
    expect(target).not.toContain('dee@example.org');
  });

  test('a site that cannot send the link makes the account without an email, and says an administrator can add it', async () => {
    const { r } = routes({ sent: 'unavailable' });
    const out = res();
    await r.processRegister(req({ body: { ...form } }), out);
    expect(decodeURIComponent(String(out.redirect.mock.calls[0][0]))).toBe('/login?success=Registration successful. Your email address was not saved, because this site could not send the link to confirm it. An administrator can add it.');
  });
});

describe('an administrator\'s edit (#2073)', () => {
  test('is trusted: the email goes straight to UserManager, no link', async () => {
    const { r, userManager, authManager } = routes();
    const out = res();
    await r.adminUpdateUser(req({ params: { username: 'pat' }, body: { email: 'pat@other.example' } }), out);
    expect(userManager.updateUser).toHaveBeenCalledWith('pat', expect.objectContaining({ email: 'pat@other.example' }), expect.objectContaining({ username: 'admin' }));
    expect(authManager.requestEmailChange).not.toHaveBeenCalled();
    expect(out.json).toHaveBeenCalledWith({ success: true, message: 'User updated successfully' });
  });

  test('an administrator is told why an administrator\'s email cannot be shared', async () => {
    const { r } = routes({ updateFail: new UserCreateError('admin-email-shared', 'That email belongs to root, an account holding the admin role, which cannot share it') });
    const out = res();
    await r.adminUpdateUser(req({ params: { username: 'pat' }, body: { email: 'root@example.org' } }), out);
    expect(out.status).toHaveBeenCalledWith(409);
    expect(out.json).toHaveBeenCalledWith({ success: false, message: 'That email belongs to root, an account holding the admin role, which cannot share it' });
  });
});
