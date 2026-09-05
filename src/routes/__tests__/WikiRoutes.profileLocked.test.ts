/**
 * Shared-account identity lock (#1029).
 *
 * A public demo publishes a login on its Welcome page, which only works if the
 * holder cannot then take the account over. `profileLocked` freezes password,
 * email and display name against self-service change on /profile.
 *
 * Email is the case that justifies the flag covering more than the password:
 * magic-link login resolves an account by address
 * (`MagicLinkAuthProvider.getUserByEmail`), so a visitor who repoints it at
 * their own inbox has permanent exclusive access and the published password
 * stops mattering. A password-only lock would have looked correct and left
 * that wide open.
 *
 * An administrator is unaffected — /admin/users/<name>/edit requires
 * `user-edit` and never consults this flag, so the account is recoverable.
 */

import WikiRoutes from '../WikiRoutes';

const LOCKED = {
  username: 'admindemo',
  email: 'admindemo@example.com',
  displayName: 'Demo Administrator',
  profileLocked: true
};

const UNLOCKED = {
  username: 'jim',
  email: 'jim@example.com',
  displayName: 'Jim',
  profileLocked: undefined
};

const createMockReq = (username: string, body: Record<string, unknown>) => ({
  params: {},
  query: {},
  body,
  session: { csrfToken: 'tok' },
  path: '/profile',
  originalUrl: '/profile',
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: { username, isAuthenticated: true, roles: ['reader'] }
});

const createMockRes = () => ({
  status: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis()
});

function makeRoutes(account: Record<string, unknown>) {
  const userManager = {
    // #1198: the profile routes ask profile-manage of policy; a reader holds it.
    hasPermission: vi.fn(() => Promise.resolve(true)),
    getUser: vi.fn(() => Promise.resolve(account)),
    updateUser: vi.fn(() => Promise.resolve(account)),
    authenticateUser: vi.fn(() => Promise.resolve(true))
  };
  const engine = {
    getManager: vi.fn((name: string) => (name === 'UserManager' ? userManager : null))
  };
  const routes = new WikiRoutes(engine);
  return { routes, userManager };
}

/** The redirect the handler used to bounce the caller back to /profile. */
function redirectTarget(res: ReturnType<typeof createMockRes>): string {
  return (res.redirect.mock.calls[0]?.[0] as string) ?? '';
}

beforeEach(() => vi.clearAllMocks());

describe('profileLocked blocks self-service identity change (#1029)', () => {
  test.each([
    ['password', { newPassword: 'newpass', confirmPassword: 'newpass', currentPassword: 'admin123' }],
    ['email address', { email: 'attacker@example.org' }],
    ['display name', { displayName: 'Owned' }]
  ])('refuses a %s change and writes nothing', async (label, body) => {
    const res = createMockRes();
    const { routes, userManager } = makeRoutes(LOCKED);

    await routes.updateProfile(createMockReq('admindemo', body), res);

    expect(redirectTarget(res)).toContain('error=');
    expect(decodeURIComponent(redirectTarget(res))).toContain(label);
    expect(userManager.updateUser).not.toHaveBeenCalled();
  });

  test('names every attempted field at once', async () => {
    const res = createMockRes();
    const { routes } = makeRoutes(LOCKED);

    await routes.updateProfile(
      createMockReq('admindemo', {
        email: 'attacker@example.org',
        displayName: 'Owned',
        newPassword: 'newpass'
      }),
      res
    );

    const message = decodeURIComponent(redirectTarget(res));
    expect(message).toContain('password');
    expect(message).toContain('email address');
    expect(message).toContain('display name');
  });

  test('resubmitting the unchanged form is not a change — the visitor can still save', async () => {
    // The profile form posts displayName and email prefilled on every save,
    // so a presence-only check would have blocked unrelated edits and made
    // the account feel broken rather than protected.
    const res = createMockRes();
    const { routes, userManager } = makeRoutes(LOCKED);

    await routes.updateProfile(
      createMockReq('admindemo', {
        email: LOCKED.email,
        displayName: LOCKED.displayName,
        profilePage: 'Demo Administrator'
      }),
      res
    );

    expect(decodeURIComponent(redirectTarget(res))).not.toContain('shared account');
    expect(userManager.updateUser).toHaveBeenCalled();
  });
});

describe('an ordinary account is unaffected (#1029)', () => {
  test.each([
    ['email', { email: 'jim@newhost.example' }],
    ['display name', { displayName: 'Jim W' }]
  ])('%s change goes through', async (_label, body) => {
    const res = createMockRes();
    const { routes, userManager } = makeRoutes(UNLOCKED);

    await routes.updateProfile(createMockReq('jim', body), res);

    expect(userManager.updateUser).toHaveBeenCalled();
    expect(decodeURIComponent(redirectTarget(res))).not.toContain('shared account');
  });
});
