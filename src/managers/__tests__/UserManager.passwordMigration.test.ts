/**
 * Password hash migration through the password check (#1042, #1758).
 *
 * `passwordHash` has its own unit tests; this pins the part that actually
 * migrates a live store — a user whose record holds a pre-#1042 SHA-256 hash
 * signs in normally, and the record is rewritten under the new scheme while we
 * still hold the plaintext.
 *
 * #1758: the check is PasswordAuthProvider's (AuthManager is the one door);
 * UserManager keeps the hash and hands it over through `storedPasswordHash`,
 * and rewrites it through `upgradePasswordHash`. These run the real pair.
 *
 * That moment is the ONLY opportunity: the old digest cannot be converted, so
 * if this does not happen at sign-in it never happens at all. And if legacy
 * verification broke, upgrading would lock every existing user out — which is
 * why the "still signs in" half is asserted as hard as the "gets upgraded" half.
 */

import { createHash } from 'crypto';
import UserManager from '../UserManager';
import { PasswordAuthProvider } from '../../providers/PasswordAuthProvider';

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

function makeCheck(users: Record<string, StoredUser>, salt = LEGACY_SALT) {
  const managers: Record<string, unknown> = {
    ConfigurationManager: {
      getProperty: vi.fn((k: string, d: unknown) => (k === 'ngdpbase.user.security.passwordsalt' ? salt : d))
    }
  };
  const engine = { getManager: vi.fn((name: string) => managers[name] ?? null) };
  const manager = new UserManager(engine) as unknown as { provider: unknown };
  const provider = makeProvider(users);
  manager.provider = provider;
  managers.UserManager = manager;
  const check = new PasswordAuthProvider(engine);
  const signIn = (username: string, password: string) => check.verify({ username, password });
  return { signIn, provider, users };
}

beforeEach(() => vi.clearAllMocks());

describe('a legacy account still signs in (#1042)', () => {
  test('the pre-#1042 hash is accepted', async () => {
    const { signIn } = makeCheck({
      olduser: { username: 'olduser', password: legacyHash('hunter2'), isActive: true }
    });

    expect(await signIn('olduser', 'hunter2')).toEqual({ username: 'olduser' });
  });

  test('a wrong password is still refused', async () => {
    const { signIn } = makeCheck({
      olduser: { username: 'olduser', password: legacyHash('hunter2'), isActive: true }
    });

    expect(await signIn('olduser', 'wrong')).toBeNull();
  });

  test('an instance with a CUSTOM salt keeps working', async () => {
    const custom = 'this-instance-overrode-it';
    const { signIn } = makeCheck(
      { olduser: { username: 'olduser', password: legacyHash('hunter2', custom), isActive: true } },
      custom
    );

    expect(await signIn('olduser', 'hunter2')).toEqual({ username: 'olduser' });
  });
});

describe('the record is upgraded in place (#1042)', () => {
  test('after a successful sign-in the stored hash is scrypt', async () => {
    const { signIn, users } = makeCheck({
      olduser: { username: 'olduser', password: legacyHash('hunter2'), isActive: true }
    });

    await signIn('olduser', 'hunter2');

    expect(users.olduser.password.startsWith('scrypt$')).toBe(true);
  });

  test('the upgraded hash verifies the SAME password — the account is not bricked', async () => {
    // Writing a hash that does not match the password the user just typed
    // would lock them out on their next visit, silently.
    const { signIn, users } = makeCheck({
      olduser: { username: 'olduser', password: legacyHash('hunter2'), isActive: true }
    });

    await signIn('olduser', 'hunter2');
    expect(users.olduser.password.startsWith('scrypt$')).toBe(true);

    expect(await signIn('olduser', 'hunter2')).toEqual({ username: 'olduser' });
  });

  test('a FAILED sign-in does not rewrite the hash', async () => {
    const original = legacyHash('hunter2');
    const { signIn, users, provider } = makeCheck({
      olduser: { username: 'olduser', password: original, isActive: true }
    });

    await signIn('olduser', 'wrong');

    expect(users.olduser.password).toBe(original);
    expect(provider.updateUser).not.toHaveBeenCalled();
  });

  test('an already-migrated account is not rewritten again', async () => {
    const { signIn, users, provider } = makeCheck({
      newuser: { username: 'newuser', password: legacyHash('pw'), isActive: true }
    });

    await signIn('newuser', 'pw');
    const afterFirst = users.newuser.password;
    provider.updateUser.mockClear();

    await signIn('newuser', 'pw');

    // #1758: the check writes nothing for a current hash (the sign-in count is AuthManager's, via recordSignIn).
    expect(users.newuser.password).toBe(afterFirst);
    expect(provider.updateUser).not.toHaveBeenCalled();
  });
});

describe('accounts without passwords stay that way (#1042)', () => {
  test('an isExternal account is not given a hash by signing in', async () => {
    // Magic-link and OIDC accounts store ''. They must remain impossible to
    // sign into with a password, and must never be handed one by the migration.
    const { signIn, users } = makeCheck({
      ext: { username: 'ext', password: '', isActive: true, isExternal: true }
    });

    const result = await signIn('ext', '');

    expect(result).toBeNull();
    expect(users.ext.password).toBe('');
  });

  test('no password matches an external account', async () => {
    const { signIn, users } = makeCheck({
      ext: { username: 'ext', password: '', isActive: true, isExternal: true }
    });

    expect(await signIn('ext', 'anything')).toBeNull();
    expect(users.ext.password).toBe('');
  });
});
