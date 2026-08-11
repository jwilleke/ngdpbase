/**
 * Password hash migration through authenticateUser (#1042).
 *
 * `passwordHash` has its own unit tests; this pins the part that actually
 * migrates a live store — a user whose record holds a pre-#1042 SHA-256 hash
 * logs in normally, and the record is rewritten under the new scheme while we
 * still hold the plaintext.
 *
 * That moment is the ONLY opportunity: the old digest cannot be converted, so
 * if this does not happen at login it never happens at all. And if legacy
 * verification broke, upgrading would lock every existing user out — which is
 * why the "still logs in" half is asserted as hard as the "gets upgraded" half.
 */

import { createHash } from 'crypto';
import UserManager from '../UserManager';

const LEGACY_SALT = 'amdwiki-salt';

const legacyHash = (password: string, salt = LEGACY_SALT): string =>
  createHash('sha256').update(password + salt).digest('hex');

interface StoredUser {
  username: string;
  password: string;
  isActive: boolean;
  isExternal?: boolean;
  loginCount?: number;
}

/** In-memory user provider that records what gets written back. */
function makeProvider(users: Record<string, StoredUser>) {
  return {
    users,
    getUser: vi.fn((name: string) => Promise.resolve(users[name] ? { ...users[name] } : null)),
    updateUser: vi.fn((name: string, updated: StoredUser) => {
      users[name] = { ...updated };
      return Promise.resolve(users[name]);
    }),
    getAllUsers: vi.fn(() => Promise.resolve(new Map(Object.entries(users))))
  };
}

function makeManager(users: Record<string, StoredUser>, salt = LEGACY_SALT) {
  const engine = {
    getManager: vi.fn((name: string) =>
      name === 'ConfigurationManager'
        ? { getProperty: vi.fn((_k: string, d: unknown) => d) }
        : null
    )
  };
  const manager = new UserManager(engine) as unknown as {
    provider: unknown;
    passwordSalt: string;
    authenticateUser(u: string, p: string): Promise<unknown>;
  };
  const provider = makeProvider(users);
  manager.provider = provider;
  manager.passwordSalt = salt;
  return { manager, provider, users };
}

beforeEach(() => vi.clearAllMocks());

describe('a legacy account still logs in (#1042)', () => {
  test('the pre-#1042 hash is accepted', async () => {
    const { manager } = makeManager({
      olduser: { username: 'olduser', password: legacyHash('hunter2'), isActive: true }
    });

    expect(await manager.authenticateUser('olduser', 'hunter2')).toBeTruthy();
  });

  test('a wrong password is still refused', async () => {
    const { manager } = makeManager({
      olduser: { username: 'olduser', password: legacyHash('hunter2'), isActive: true }
    });

    expect(await manager.authenticateUser('olduser', 'wrong')).toBeNull();
  });

  test('an instance with a CUSTOM salt keeps working', async () => {
    const custom = 'this-instance-overrode-it';
    const { manager } = makeManager(
      { olduser: { username: 'olduser', password: legacyHash('hunter2', custom), isActive: true } },
      custom
    );

    expect(await manager.authenticateUser('olduser', 'hunter2')).toBeTruthy();
  });
});

describe('the record is upgraded in place (#1042)', () => {
  test('after a successful login the stored hash is scrypt', async () => {
    const { manager, users } = makeManager({
      olduser: { username: 'olduser', password: legacyHash('hunter2'), isActive: true }
    });

    await manager.authenticateUser('olduser', 'hunter2');

    expect(users.olduser.password.startsWith('scrypt$')).toBe(true);
  });

  test('the upgraded hash verifies the SAME password — the account is not bricked', async () => {
    // Writing a hash that does not match the password the user just typed
    // would lock them out on their next visit, silently.
    const { manager, users } = makeManager({
      olduser: { username: 'olduser', password: legacyHash('hunter2'), isActive: true }
    });

    await manager.authenticateUser('olduser', 'hunter2');
    users.olduser.loginCount = 0;

    expect(await manager.authenticateUser('olduser', 'hunter2')).toBeTruthy();
  });

  test('a FAILED login does not rewrite the hash', async () => {
    const original = legacyHash('hunter2');
    const { manager, users } = makeManager({
      olduser: { username: 'olduser', password: original, isActive: true }
    });

    await manager.authenticateUser('olduser', 'wrong');

    expect(users.olduser.password).toBe(original);
  });

  test('an already-migrated account is not rewritten again', async () => {
    const { manager, users, provider } = makeManager({
      newuser: { username: 'newuser', password: legacyHash('pw'), isActive: true }
    });

    await manager.authenticateUser('newuser', 'pw');
    const afterFirst = users.newuser.password;
    provider.updateUser.mockClear();

    await manager.authenticateUser('newuser', 'pw');

    // Still written (login stats), but the hash itself must be untouched.
    expect(users.newuser.password).toBe(afterFirst);
  });
});

describe('accounts without passwords stay that way (#1042)', () => {
  test('an isExternal account is not given a hash by logging in', async () => {
    // Magic-link and OIDC accounts store ''. They must remain impossible to
    // log into with a password, and must never be handed one by the migration.
    const { manager, users } = makeManager({
      ext: { username: 'ext', password: '', isActive: true, isExternal: true }
    });

    const result = await manager.authenticateUser('ext', '');

    expect(result).toBeNull();
    expect(users.ext.password).toBe('');
  });

  test('no password matches an external account', async () => {
    const { manager } = makeManager({
      ext: { username: 'ext', password: '', isActive: true, isExternal: true }
    });

    expect(await manager.authenticateUser('ext', 'anything')).toBeNull();
  });
});
