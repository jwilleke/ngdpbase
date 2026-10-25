/**
 * #2073 — an emailed sign-in link to an address several accounts share: the
 * page asks which account (by name), and the account chosen goes to
 * AuthManager with the token, which decides. A link to one account is shown
 * as before. The provider's own rules are in MagicLinkAuthProvider.test.ts.
 *
 * Sabotaged once (2026-10-25), and watched go red:
 * - the chosen account not passed on the POST → "the account chosen goes to
 *   AuthManager with the token".
 */
import WikiRoutes from '../WikiRoutes';

const res = () => ({
  status: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(), cookie: vi.fn().mockReturnThis(), clearCookie: vi.fn().mockReturnThis()
});

function routes(choices: string[] | null) {
  const authManager = {
    getAccountChoices: vi.fn(() => choices),
    authenticate: vi.fn((_p: string, creds: { account?: string }) => Promise.resolve(
      choices ? (creds.account && choices.includes(creds.account) ? { success: true, username: creds.account } : { success: false }) : { success: true, username: 'ann' })),
    getFlowRedirect: vi.fn(() => '/wanted'),
    getDeviceState: vi.fn(() => null),
    provisionIfNew: vi.fn(() => Promise.resolve(undefined)),
    consumeToken: vi.fn(() => true),
    completeSignIn: vi.fn(() => Promise.resolve({}))
  };
  const managers: Record<string, unknown> = {
    AuthManager: authManager,
    UserManager: { getUser: vi.fn((u: string) => Promise.resolve({ username: u, displayName: u === 'ann' ? 'Ann Smith' : 'Bob Smith' })) },
    ConfigurationManager: { getProperty: (_k: string, d: unknown) => d },
    AuditManager: { logAuditEvent: vi.fn(() => Promise.resolve('a')) }
  };
  const r = new WikiRoutes({ getManager: (n: string) => managers[n] ?? null }) as unknown as Record<string, (q: unknown, s: unknown) => Promise<void>>;
  (r as unknown as { getCommonTemplateData: () => Promise<Record<string, unknown>> }).getCommonTemplateData = () => Promise.resolve({});
  return { r, authManager };
}

const req = (extra: Record<string, unknown> = {}) => ({
  session: { save: vi.fn((cb: (e?: unknown) => void) => cb()) }, body: {}, query: {}, ip: '1.2.3.4', headers: {}, cookies: {},
  get: () => 'ua', ...extra
});

describe('emailed sign-in link to a shared address (#2073)', () => {
  test('the page asks which account, by name, without signing anyone in', async () => {
    const { r, authManager } = routes(['ann', 'bob']);
    const out = res();
    await r.verifyMagicLink(req({ query: { token: 't1' } }), out);
    expect(authManager.authenticate).not.toHaveBeenCalled();
    expect(out.render).toHaveBeenCalledWith('magic-link-confirm', expect.objectContaining({
      token: 't1', accounts: [{ username: 'ann', displayName: 'Ann Smith' }, { username: 'bob', displayName: 'Bob Smith' }]
    }));
  });

  test('a link to one account is shown as before', async () => {
    const { r } = routes(null);
    const out = res();
    await r.verifyMagicLink(req({ query: { token: 't1' } }), out);
    expect(out.render).toHaveBeenCalledWith('magic-link-confirm', expect.objectContaining({ username: 'ann', accounts: null }));
  });

  test('the account chosen goes to AuthManager with the token, which decides', async () => {
    const { r, authManager } = routes(['ann', 'bob']);
    const out = res();
    await r.completeMagicLink(req({ body: { token: 't1', account: 'bob' } }), out);
    expect(authManager.authenticate).toHaveBeenCalledWith('magic-link', { token: 't1', account: 'bob' }, expect.anything());
    expect(authManager.completeSignIn).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ username: 'bob' }), expect.anything());
    expect(out.redirect).toHaveBeenCalledWith('/wanted');
  });

  test('an account the link did not offer signs nobody in', async () => {
    const { r, authManager } = routes(['ann', 'bob']);
    const out = res();
    await r.completeMagicLink(req({ body: { token: 't1', account: 'mallory' } }), out);
    expect(authManager.consumeToken).not.toHaveBeenCalled();
    expect(authManager.completeSignIn).not.toHaveBeenCalled();
    expect(out.redirect).toHaveBeenCalledWith('/login?error=Link+expired+or+already+used');
  });
});
