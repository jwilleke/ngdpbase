/**
 * #1758 — AuthManager.completeSignIn, the one sign-in completion step. Every
 * way a person finishes signing in (password, passkey, second factor, email
 * link, Google) ends here: a new session (#1043) with a fresh CSRF token, the
 * identity, how they signed in (#1523), the password-change generation
 * (#1482), their private stores (#1391), one success audit and the count on
 * the account. `authenticate()` records failures and re-checks only.
 *
 * Real AuthManager; a fake request whose session behaves like
 * express-session's (regenerate() empties it and hands back a fresh id).
 */
import AuthManager from '../AuthManager';

const makeConfigManager = () => ({
  getProperty: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
  getCustomProperty: vi.fn(() => undefined),
  isBaseUrlExplicit: vi.fn().mockReturnValue(true),
  getBaseURL: vi.fn().mockReturnValue('https://wiki.example.com')
});

function setup(opts: { recordSignIn?: () => Promise<void>; sessionGeneration?: number } = {}) {
  const audit = { logAuthentication: vi.fn().mockResolvedValue('a1') };
  const userManager = {
    getUser: vi.fn().mockResolvedValue({ username: 'molly', sessionGeneration: opts.sessionGeneration ?? 4 }),
    recordSignIn: vi.fn(opts.recordSignIn ?? (() => Promise.resolve()))
  };
  const configManager = makeConfigManager();
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'UserManager') return userManager;
      if (name === 'AuditManager') return audit;
      return null;
    })
  };
  const manager = new AuthManager(engine);
  return { manager, audit, userManager };
}

function fakeReq(initial: Record<string, unknown> = {}) {
  const order: string[] = [];
  const session: Record<string, unknown> = {
    id: 'pre-login-id',
    csrfToken: 'pre-login-token',
    ...initial,
    regenerate: vi.fn((cb: (err?: unknown) => void) => {
      order.push('regenerate');
      for (const k of Object.keys(session)) if (k !== 'regenerate' && k !== 'save') delete session[k];
      session.id = 'regenerated-id';
      cb();
    }),
    save: vi.fn((cb: (err?: unknown) => void) => cb())
  };
  const req = {
    session,
    ip: '203.0.113.7',
    get: vi.fn((h: string) => (h.toLowerCase() === 'user-agent' ? 'TestAgent/1.0' : undefined))
  };
  return { req, session, order };
}

const passwordResult = {
  success: true,
  username: 'molly',
  provider: 'password',
  factors: [{ provider: 'password', amr: ['pwd'], aal: 1 as const, at: '2026-10-11T10:00:00.000Z' }]
};

const successAudits = (audit: { logAuthentication: ReturnType<typeof vi.fn> }) =>
  audit.logAuthentication.mock.calls.filter((c) => c[1] === 'success');

describe('AuthManager.completeSignIn (#1758)', () => {
  test('regenerates the session, mints a new CSRF token, then writes the identity, how and the generation', async () => {
    const { manager } = setup({ sessionGeneration: 4 });
    const { req, session } = fakeReq();

    await manager.completeSignIn(req, passwordResult, { method: 'password' });

    expect(session.regenerate).toHaveBeenCalledTimes(1);
    expect(session.id).toBe('regenerated-id');
    expect(session.csrfToken).toBeTruthy();
    expect(session.csrfToken).not.toBe('pre-login-token');
    expect(session.username).toBe('molly');
    expect(session.isAuthenticated).toBe(true);
    expect(session.signIn).toEqual(expect.objectContaining({
      provider: 'password',
      factors: passwordResult.factors,
      amr: ['pwd'],
      aal: 1,
      mfa: false,
      at: expect.any(String)
    }));
    expect(session.sessionGeneration).toBe(4);
  });

  test('the identity is written after regeneration, never before (#1043)', async () => {
    const { manager } = setup();
    const { req, session, order } = fakeReq();
    const regen = session.regenerate as ReturnType<typeof vi.fn>;
    // Keep the accessor alive across regenerate so the write is observed.
    session.regenerate = vi.fn((cb: (err?: unknown) => void) => { order.push('regenerate'); cb(); });
    Object.defineProperty(session, 'username', {
      configurable: true,
      set() { order.push('write-identity'); },
      get() { return 'molly'; }
    });

    await manager.completeSignIn(req, passwordResult, { method: 'password' });

    expect(regen).not.toHaveBeenCalled();
    expect(order).toEqual(['regenerate', 'write-identity']);
  });

  test('a store that cannot regenerate still signs the person in', async () => {
    const { manager } = setup();
    const { req, session } = fakeReq();
    session.regenerate = vi.fn((cb: (err?: unknown) => void) => cb(new Error('store down')));

    await manager.completeSignIn(req, passwordResult, { method: 'password' });

    expect(session.isAuthenticated).toBe(true);
    expect(session.username).toBe('molly');
  });

  test('a session already signed in on this browser is ended as superseded (#1626)', async () => {
    const { manager, audit } = setup();
    const { req } = fakeReq({ username: 'earlier', isAuthenticated: true });

    await manager.completeSignIn(req, passwordResult, { method: 'password' });

    expect(audit.logAuthentication).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'earlier', loginMethod: 'session' }), 'logout', 'superseded');
  });

  test('a result with no sign-in record (a delegated token) leaves no signIn on the session', async () => {
    const { manager } = setup();
    const { req, session } = fakeReq();

    await manager.completeSignIn(req, { success: true, username: 'molly' }, { method: 'password' });

    expect(session.isAuthenticated).toBe(true);
    expect(session.signIn).toBeUndefined();
  });

  test('a result without a username is refused', async () => {
    const { manager } = setup();
    const { req } = fakeReq();
    await expect(manager.completeSignIn(req, { success: true }, { method: 'password' })).rejects.toThrow(/username/);
  });

  describe('private stores', () => {
    test('unlockWith and a registered vault unlocker: the handle comes from the unlocker', async () => {
      const { manager } = setup();
      const unlocker = vi.fn().mockResolvedValue('handle-1');
      manager.setVaultUnlocker(unlocker);
      const { req, session } = fakeReq();

      await manager.completeSignIn(req, passwordResult, { method: 'password', unlockWith: { password: 'pw' } });

      expect(unlocker).toHaveBeenCalledWith('molly', 'pw');
      expect(session.privateStoreHandle).toBe('handle-1');
    });

    test('a handle already unlocked (two-step) is used without calling the unlocker', async () => {
      const { manager } = setup();
      const unlocker = vi.fn().mockResolvedValue('should-not-be-used');
      manager.setVaultUnlocker(unlocker);
      const { req, session } = fakeReq();

      await manager.completeSignIn(req, passwordResult, { method: 'password and email link', privateStoreHandle: 'held-handle' });

      expect(unlocker).not.toHaveBeenCalled();
      expect(session.privateStoreHandle).toBe('held-handle');
    });

    test('no unlocker registered: no handle, and no error', async () => {
      const { manager } = setup();
      const { req, session } = fakeReq();

      await expect(manager.completeSignIn(req, passwordResult, { method: 'password', unlockWith: { password: 'pw' } }))
        .resolves.toEqual({});

      expect(session.privateStoreHandle).toBeUndefined();
      expect(session.isAuthenticated).toBe(true);
    });

    test('unlockVaults goes through the registered unlocker, or returns nothing', async () => {
      const { manager } = setup();
      expect(await manager.unlockVaults('molly', 'pw')).toBeUndefined();
      manager.setVaultUnlocker(vi.fn().mockResolvedValue('h'));
      expect(await manager.unlockVaults('molly', 'pw')).toBe('h');
    });
  });

  describe('the record of the sign-in', () => {
    test('exactly one success audit, naming how, from where, and the count on the account once', async () => {
      const { manager, audit, userManager } = setup();
      const { req } = fakeReq();

      await manager.completeSignIn(req, passwordResult, { method: 'passkey' });

      expect(successAudits(audit)).toHaveLength(1);
      expect(audit.logAuthentication).toHaveBeenCalledWith(
        { username: 'molly', ipAddress: '203.0.113.7', userAgent: 'TestAgent/1.0', loginMethod: 'passkey' },
        'success',
        'signed in: passkey'
      );
      expect(userManager.recordSignIn).toHaveBeenCalledTimes(1);
      expect(userManager.recordSignIn).toHaveBeenCalledWith('molly');
    });

    test('a failing count does not fail the sign-in', async () => {
      const { manager, userManager } = setup({ recordSignIn: () => Promise.reject(new Error('disk full')) });
      const { req, session } = fakeReq();

      await expect(manager.completeSignIn(req, passwordResult, { method: 'password' })).resolves.toEqual({});

      expect(userManager.recordSignIn).toHaveBeenCalledTimes(1);
      expect(session.isAuthenticated).toBe(true);
    });

    test('a failing audit write does not fail the sign-in', async () => {
      const { manager, audit } = setup();
      audit.logAuthentication.mockRejectedValue(new Error('disk full'));
      const { req, session } = fakeReq();

      await expect(manager.completeSignIn(req, passwordResult, { method: 'password' })).resolves.toEqual({});
      expect(session.isAuthenticated).toBe(true);
    });
  });

  describe('authenticate() leaves the sign-in record to completeSignIn', () => {
    const attempt = { ipAddress: '203.0.113.7', userAgent: 'TestAgent/1.0', purpose: 'sign-in' as const };

    test('a successful sign-in check writes no audit and counts nothing', async () => {
      const { manager, audit, userManager } = setup();
      await manager.initialize();
      vi.spyOn(manager.providers.get('password') as { verify(c: unknown): Promise<unknown> }, 'verify').mockResolvedValue({ username: 'molly' });

      const result = await manager.authenticate('password', { username: 'molly', password: 'pw' }, attempt);

      expect(result.success).toBe(true);
      expect(audit.logAuthentication).not.toHaveBeenCalled();
      expect(userManager.recordSignIn).not.toHaveBeenCalled();
    });

    test('a refused sign-in check still writes one failure audit', async () => {
      const { manager, audit, userManager } = setup();
      await manager.initialize();
      vi.spyOn(manager.providers.get('password') as { verify(c: unknown): Promise<unknown> }, 'verify').mockResolvedValue(null);

      const result = await manager.authenticate('password', { username: 'molly', password: 'wrong' }, attempt);

      expect(result).toEqual({ success: false });
      expect(audit.logAuthentication).toHaveBeenCalledTimes(1);
      expect(audit.logAuthentication).toHaveBeenCalledWith(
        { username: 'molly', ipAddress: '203.0.113.7', userAgent: 'TestAgent/1.0', loginMethod: 'password' }, 'failure', 'password refused');
      expect(userManager.recordSignIn).not.toHaveBeenCalled();
    });
  });
});
