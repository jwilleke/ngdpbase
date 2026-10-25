/**
 * #2049 — an account made without a password, and the user's first password.
 *
 * `createUser` with no password stores none (never the hash of an empty
 * string), so the account has no way in until an invitation gives it one.
 * `setFirstPassword` lets only the user themselves, signed in as themselves
 * and holding `account-security`, set a password while the account has none.
 * The user provider and `updateUser`'s own steps are stand-ins, as in the
 * recovery-words test, so what is asserted is who is let through.
 *
 * Sabotage, each seen red then restored: hashing an empty password in
 * createUser (the "stores no password" test); dropping the self check, the
 * delegated check, the PDP check or the existing-password check in
 * setFirstPassword (the matching refusal test).
 */
import UserManager from '../UserManager';
import { KeyedSerial } from '../../utils/keyedSerial';

const self = (extra: Record<string, unknown> = {}) => ({ username: 'newbie', roles: ['reader'], isAuthenticated: true, ...extra }) as never;

describe('UserManager.createUser without a password (#2049)', () => {
  test('stores no password, so hasPassword is false and nothing can sign in with an empty one', async () => {
    const store = new Map<string, Record<string, unknown>>();
    const provider = {
      getUser: (name: string) => Promise.resolve(store.get(name)),
      getAllUsers: () => Promise.resolve(store),
      createUser: (u: Record<string, unknown>) => { store.set(u.username as string, u); return Promise.resolve(u); },
      updateUser: (name: string, u: Record<string, unknown>) => { store.set(name, u); return Promise.resolve(); },
      userExists: (n: string) => Promise.resolve(store.has(n))
    };
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (_key: string, dflt: unknown) => dflt },
      RoleManager: { applyRoleDiff: () => Promise.resolve(), resolveUserRoles: () => Promise.resolve([]) },
      PolicyInformationPoint: { isSystemPrincipal: () => false }
    };
    const manager = new UserManager({ getManager: (n: string) => managers[n] ?? null });
    (manager as unknown as { provider: unknown }).provider = provider;
    const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] } as never;

    await manager.createUser({ username: 'newbie', email: 'newbie@example.com', displayName: 'New Bie', password: '', roles: ['reader'] }, admin);
    expect(store.get('newbie')?.password).toBe('');
    expect(await manager.hasPassword('newbie')).toBe(false);

    await manager.createUser({ username: 'other', email: 'other@example.com', displayName: 'Other', roles: ['reader'] }, admin);
    expect(store.get('other')?.password).toBe('');
  });
});

describe('UserManager.setFirstPassword (#2049)', () => {
  let users: Record<string, Record<string, unknown>>;
  let manager: UserManager;
  let editAccount: ReturnType<typeof vi.fn>;
  let permits: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    users = { newbie: { username: 'newbie', isActive: true, password: '' } };
    permits = vi.fn(async (_s: unknown, action: string) => action === 'account-security');
    manager = Object.create(UserManager.prototype) as UserManager;
    const internals = manager as unknown as Record<string, unknown>;
    internals.provider = { getUser: async (u: string) => users[u] ?? null };
    internals.engine = { getManager: (name: string) => (name === 'PolicyDecisionPoint' ? { permits } : null) };
    editAccount = vi.fn(async () => ({ user: {}, updates: {}, disabling: false, recordEdit: async () => undefined }));
    internals.accountWrites = new KeyedSerial();
    internals.editAccount = editAccount;
    internals.finishEdit = vi.fn(async () => ({}));
  });

  test('the user themselves, with no password yet: set through the one edit door', async () => {
    expect(await manager.setFirstPassword('newbie', 'a-good-one', self())).toBe(true);
    expect(editAccount).toHaveBeenCalledWith('newbie', { password: 'a-good-one' }, expect.objectContaining({ username: 'newbie' }));
  });

  test('an account that already has a password is refused: that is changed on the profile, with the current one', async () => {
    users.newbie.password = 'scrypt$hash';
    expect(await manager.setFirstPassword('newbie', 'a-good-one', self())).toBe(false);
    expect(editAccount).not.toHaveBeenCalled();
  });

  test('someone else, even an administrator, cannot set it', async () => {
    permits.mockResolvedValue(true);
    expect(await manager.setFirstPassword('newbie', 'a-good-one', { username: 'admin', roles: ['admin'], isAuthenticated: true })).toBe(false);
    expect(editAccount).not.toHaveBeenCalled();
  });

  test.each([
    ['an agent token', { viaToken: { tokenId: 't', scopes: ['account-security'] } }],
    ['a share link', { viaShare: { shareId: 's' } }],
    ['a proxy', { viaProxy: { kind: 'proxy', grantId: 'g', actor: 'jim', scopes: ['account-security'] } }]
  ])('a request through %s is refused', async (_label, extra) => {
    expect(await manager.setFirstPassword('newbie', 'a-good-one', self(extra))).toBe(false);
    expect(editAccount).not.toHaveBeenCalled();
  });

  test('without account-security (the PDP says no) it is refused', async () => {
    permits.mockResolvedValue(false);
    expect(await manager.setFirstPassword('newbie', 'a-good-one', self())).toBe(false);
    expect(editAccount).not.toHaveBeenCalled();
  });

  test('an external or turned-off account is refused', async () => {
    users.newbie.isExternal = true;
    expect(await manager.setFirstPassword('newbie', 'a-good-one', self())).toBe(false);
    users.newbie = { username: 'newbie', isActive: false, password: '' };
    expect(await manager.setFirstPassword('newbie', 'a-good-one', self())).toBe(false);
    expect(editAccount).not.toHaveBeenCalled();
  });
});
