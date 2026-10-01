/**
 * Every account is given `ngdpbase.user.account-roles` when it is created — #1539.
 *
 * `vault-owner` is what lets a person work in their own vaults, so every
 * account gets it at the one door accounts are made through, `createUser`, and
 * the bootstrap admin gets it where that account is made.
 */

import UserManager from '../UserManager';
import type { ActorContext } from '../../context/ActorContext';

const ACTOR = { username: 'admin', isAuthenticated: true, roles: ['admin'] } as ActorContext;

function makeManager(accountRoles: unknown) {
  const store = new Map<string, unknown>();
  const provider = {
    getUser: vi.fn((name: string) => Promise.resolve(store.get(name))),
    getAllUsers: vi.fn(() => Promise.resolve(store)),
    createUser: vi.fn((u: { username: string }) => {
      store.set(u.username, u);
      return Promise.resolve(u);
    }),
    updateUser: vi.fn(() => Promise.resolve()),
    userExists: vi.fn((n: string) => Promise.resolve(store.has(n)))
  };
  const configManager = {
    getProperty: vi.fn((key: string, dflt: unknown) => {
      if (key === 'ngdpbase.user.account-roles') return accountRoles;
      if (key === 'ngdpbase.user.security.defaultpassword') return 'admin123';
      return dflt;
    })
  };
  const roleManager = { applyRoleDiff: vi.fn(() => Promise.resolve()), resolveUserRoles: vi.fn(() => Promise.resolve([])), grantToEveryAccountOnce: vi.fn(() => Promise.resolve(0)) };
  const pip = { isSystemPrincipal: () => false };
  const managers: Record<string, unknown> = { ConfigurationManager: configManager, RoleManager: roleManager, PolicyInformationPoint: pip };
  const manager = new UserManager({ getManager: (n: string) => managers[n] ?? null });
  (manager as unknown as { provider: unknown }).provider = provider;
  return { manager, roleManager, store };
}

const newUser = (roles?: string[]) => ({ username: 'molly', email: 'm@example.com', displayName: 'Molly', password: 'pw-123456789', ...(roles ? { roles } : {}) });

describe('account roles at creation (#1539)', () => {
  test('createUser adds vault-owner to the roles the sign-up path chose', async () => {
    const { manager, roleManager } = makeManager(['vault-owner']);
    await manager.createUser(newUser(['reader']), ACTOR);
    expect(roleManager.applyRoleDiff).toHaveBeenCalledWith('molly', [], ['reader', 'vault-owner']);
  });

  test('an admin ticking no role still gives the account vault-owner', async () => {
    const { manager, roleManager } = makeManager(['vault-owner']);
    await manager.createUser(newUser([]), ACTOR);
    expect(roleManager.applyRoleDiff).toHaveBeenCalledWith('molly', [], ['vault-owner']);
  });

  test('a role already chosen is not listed twice', async () => {
    const { manager, roleManager } = makeManager(['vault-owner']);
    await manager.createUser(newUser(['vault-owner', 'editor']), ACTOR);
    expect(roleManager.applyRoleDiff).toHaveBeenCalledWith('molly', [], ['vault-owner', 'editor']);
  });

  test('with the key emptied by the operator, only the chosen roles are given', async () => {
    const { manager, roleManager } = makeManager([]);
    await manager.createUser(newUser(['reader']), ACTOR);
    expect(roleManager.applyRoleDiff).toHaveBeenCalledWith('molly', [], ['reader']);
  });

  test('at boot, accounts made before the role existed are handed to RoleManager to be given it once', async () => {
    const { manager, roleManager, store } = makeManager(['vault-owner']);
    store.set('alice', {});
    store.set('bob', {});
    await (manager as unknown as { grantAccountRolesToExistingAccounts(): Promise<void> }).grantAccountRolesToExistingAccounts();
    expect(roleManager.grantToEveryAccountOnce).toHaveBeenCalledWith('vault-owner', ['alice', 'bob'], expect.objectContaining({ origin: 'boot' }));
  });

  test('the bootstrap admin gets vault-owner too', async () => {
    const { manager, roleManager } = makeManager(['vault-owner']);
    await manager.createDefaultAdmin();
    expect(roleManager.applyRoleDiff).toHaveBeenCalledWith('admin', [], ['admin', 'vault-owner']);
  });
});
