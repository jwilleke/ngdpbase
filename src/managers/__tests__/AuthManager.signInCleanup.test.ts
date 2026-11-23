/**
 * #2466: after a person signs in, their own private pages get the upgrade
 * clean-up (PageManager.convertLegacyAccessOnSignIn), run as that person. It
 * starts after the sign-in is done, never holds it up, and a failure in it is
 * logged and never stops the sign-in.
 */
import AuthManager from '../AuthManager';
import logger from '../../utils/logger';

const passwordResult = {
  success: true,
  username: 'molly',
  provider: 'password',
  factors: [{ provider: 'password', amr: ['pwd'], aal: 1 as const, at: '2026-10-11T10:00:00.000Z' }]
};

function setup(convert: (subject: unknown) => Promise<unknown>, roles: string[] = ['admin']) {
  const userManager = {
    getUser: vi.fn().mockResolvedValue({ username: 'molly', createdAt: '2026-10-01T10:00:00.000Z', sessionGeneration: 1 }),
    recordSignIn: vi.fn().mockResolvedValue(undefined)
  };
  const pageManager = { convertLegacyAccessOnSignIn: vi.fn(convert) };
  const pip = { subjectFor: vi.fn().mockResolvedValue({ username: 'molly', roles, isAuthenticated: true }) };
  const config = {
    getProperty: vi.fn((_k: string, d: unknown) => d),
    getCustomProperty: vi.fn(() => undefined),
    isBaseUrlExplicit: vi.fn().mockReturnValue(true),
    getBaseURL: vi.fn().mockReturnValue('https://wiki.example.com')
  };
  const engine = {
    getManager: vi.fn((name: string) => ({
      ConfigurationManager: config,
      UserManager: userManager,
      AuditManager: { logAuthentication: vi.fn().mockResolvedValue('a1') },
      PageManager: pageManager,
      PolicyInformationPoint: pip
    } as Record<string, unknown>)[name] ?? null)
  };
  return { manager: new AuthManager(engine), pageManager, pip, config };
}

function fakeReq() {
  const session: Record<string, unknown> = {
    regenerate: vi.fn((cb: (err?: unknown) => void) => { for (const k of Object.keys(session)) if (k !== 'regenerate' && k !== 'save') delete session[k]; cb(); }),
    save: vi.fn((cb: (err?: unknown) => void) => cb())
  };
  return { session, ip: '203.0.113.7', get: vi.fn() };
}

const later = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe('AuthManager runs the private-page clean-up after sign-in (#2466)', () => {
  afterEach(() => vi.restoreAllMocks());

  test('it runs as the person who signed in, with their permissions', async () => {
    const { manager, pageManager } = setup(async () => ({ converted: 0, left: 0 }));
    await manager.completeSignIn(fakeReq(), passwordResult, { method: 'password' });
    await later();
    expect(pageManager.convertLegacyAccessOnSignIn).toHaveBeenCalledTimes(1);
    expect(pageManager.convertLegacyAccessOnSignIn.mock.calls[0][0]).toMatchObject({ username: 'molly', roles: ['admin'], isAuthenticated: true });
  });

  test('it never holds the sign-in up: a clean-up that does not finish still lets the sign-in complete', async () => {
    const { manager, pageManager } = setup(() => new Promise(() => { /* never finishes */ }));
    const done = await Promise.race([
      manager.completeSignIn(fakeReq(), passwordResult, { method: 'password' }).then(() => 'completed'),
      new Promise((resolve) => setTimeout(() => resolve('held up'), 1000))
    ]);
    expect(done).toBe('completed');
    await later();
    expect(pageManager.convertLegacyAccessOnSignIn).toHaveBeenCalled();
  });

  test('a failure is logged and the sign-in is unaffected', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation((() => logger) as never);
    const { manager } = setup(async () => { throw new Error('disk full'); });
    const req = fakeReq();
    await expect(manager.completeSignIn(req, passwordResult, { method: 'password' })).resolves.toBeDefined();
    await later();
    expect(req.session.isAuthenticated).toBe(true);
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/clean-up|private pages/i);
  });

  test('a synchronous throw from the clean-up is also contained', async () => {
    vi.spyOn(logger, 'warn').mockImplementation((() => logger) as never);
    const { manager, pageManager } = setup(async () => ({}));
    pageManager.convertLegacyAccessOnSignIn.mockImplementation(() => { throw new Error('boom'); });
    await expect(manager.completeSignIn(fakeReq(), passwordResult, { method: 'password' })).resolves.toBeDefined();
    await later();
  });

  test('a site with no clean-up (no PageManager) signs in as before', async () => {
    const { manager, pageManager } = setup(async () => ({}));
    (pageManager as { convertLegacyAccessOnSignIn?: unknown }).convertLegacyAccessOnSignIn = undefined;
    await expect(manager.completeSignIn(fakeReq(), passwordResult, { method: 'password' })).resolves.toBeDefined();
  });

  describe('the subject it carries (#2466)', () => {
    test('its roles are the ones this sign-in level and the account\'s reach allow, never the full list', async () => {
      const { manager, pageManager } = setup(async () => ({}), ['admin', 'editor']);
      const spy = vi.spyOn(manager, 'rolesAtSignIn').mockReturnValue({ kept: ['editor'], steppedDown: ['admin'] });
      vi.spyOn(manager, 'aalReachFor').mockResolvedValue({ now: 2, ifEnrolled: 2 });
      await manager.completeSignIn(fakeReq(), passwordResult, { method: 'password' });
      await later();
      // Asked with the roles the person holds, the level they signed in at, and what their account can reach.
      expect(spy).toHaveBeenCalledWith(['admin', 'editor'], 1, 2);
      expect(pageManager.convertLegacyAccessOnSignIn.mock.calls[0][0]).toMatchObject({ username: 'molly', roles: ['editor'], isAuthenticated: true });
    });

    test('a role that needs a stronger sign-in is dropped for a password-only sign-in, and kept otherwise', async () => {
      const { manager, pageManager } = setup(async () => ({}), ['admin', 'editor']);
      vi.spyOn(manager, 'aalReachFor').mockResolvedValue({ now: 2, ifEnrolled: 2 });
      const levels = new Map([['admin', 2], ['editor', 1]]);
      vi.spyOn(manager as unknown as { effectiveLevels(): Map<string, number> }, 'effectiveLevels').mockReturnValue(levels);
      await manager.completeSignIn(fakeReq(), passwordResult, { method: 'password' });
      await later();
      const subject = pageManager.convertLegacyAccessOnSignIn.mock.calls[0][0] as { roles: string[] };
      expect(subject.roles).toEqual(['editor']);
    });

    test('it carries the sign-in record, the address and the private-store handle the next request would', async () => {
      const { manager, pageManager } = setup(async () => ({}));
      const req = { ...fakeReq(), ip: '203.0.113.7' };
      await manager.completeSignIn(req, passwordResult, { method: 'password', privateStoreHandle: 'handle-1' });
      await later();
      const subject = pageManager.convertLegacyAccessOnSignIn.mock.calls[0][0] as Record<string, unknown>;
      expect(subject.privateStoreHandle).toBe('handle-1');
      expect(subject.ipAddress).toBe('203.0.113.7');
      expect(subject.signIn).toBe(req.session.signIn);
      expect(subject.signIn).toMatchObject({ aal: 1 });
    });

    test('with no private store, no handle is carried', async () => {
      const { manager, pageManager } = setup(async () => ({}));
      await manager.completeSignIn(fakeReq(), passwordResult, { method: 'password' });
      await later();
      expect(pageManager.convertLegacyAccessOnSignIn.mock.calls[0][0]).not.toHaveProperty('privateStoreHandle');
    });
  });
});
