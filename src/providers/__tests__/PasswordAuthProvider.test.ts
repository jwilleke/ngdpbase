/**
 * PasswordAuthProvider — the password method's check (#1758).
 *
 * AuthManager is the one door for every check of a secret; this provider is
 * its connection to the password. UserManager keeps the hash and hands it over
 * through `storedPasswordHash` (null for an unknown, inactive or password-less
 * account); the check, and the rehash at the current cost (#1042), are here.
 */
import { createHash } from 'crypto';
import { PasswordAuthProvider } from '../PasswordAuthProvider';
import { hashPassword } from '../../utils/passwordHash';
import { randomUUID } from 'node:crypto';
// Test passwords are made when the test runs, never written in the source:
// a literal reads to a secret scanner as a hardcoded credential (#1758).
const RIGHT_PW = `pw-${randomUUID()}`;
const WRONG_PW = `pw-${randomUUID()}`;

const legacyHash = (password: string, salt = 'amdwiki-salt'): string =>
  createHash('sha256').update(password + salt).digest('hex');

function setup(stored: string | null, salt?: string, storedName = 'molly') {
  const userManager = {
    storedPasswordHash: vi.fn().mockResolvedValue(stored),
    // Lookups ignore case (#1436): any casing finds the one stored record.
    getUser: vi.fn().mockResolvedValue({ username: storedName }),
    upgradePasswordHash: vi.fn().mockResolvedValue(undefined)
  };
  const configManager = {
    getProperty: vi.fn((k: string, d: unknown) => (k === 'ngdpbase.user.security.passwordsalt' && salt !== undefined ? salt : d))
  };
  const engine = {
    getManager: vi.fn((n: string) => (n === 'UserManager' ? userManager : n === 'ConfigurationManager' ? configManager : null))
  };
  return { provider: new PasswordAuthProvider(engine), userManager };
}

let currentHash: string;
beforeAll(async () => { currentHash = await hashPassword(RIGHT_PW); });

describe('PasswordAuthProvider (#1758)', () => {
  test('the right password names the account', async () => {
    const { provider, userManager } = setup(currentHash);
    expect(await provider.verify({ username: 'molly', password: RIGHT_PW })).toEqual({ username: 'molly' });
    expect(userManager.storedPasswordHash).toHaveBeenCalledWith('molly');
  });

  test('a differently-cased name signs in as the account as stored, never as typed (#1882)', async () => {
    const { provider, userManager } = setup(legacyHash(RIGHT_PW));
    expect(await provider.verify({ username: 'MOLLY', password: RIGHT_PW })).toEqual({ username: 'molly' });
    expect(userManager.getUser).toHaveBeenCalledWith('MOLLY');
    expect(userManager.upgradePasswordHash).toHaveBeenCalledWith('molly', expect.any(String), true);
  });

  test('a current hash is not rewritten', async () => {
    const { provider, userManager } = setup(currentHash);
    await provider.verify({ username: 'molly', password: RIGHT_PW });
    expect(userManager.upgradePasswordHash).not.toHaveBeenCalled();
  });

  test('a wrong password is refused, and nothing is rewritten', async () => {
    const { provider, userManager } = setup(currentHash);
    expect(await provider.verify({ username: 'molly', password: WRONG_PW })).toBeNull();
    expect(userManager.upgradePasswordHash).not.toHaveBeenCalled();
  });

  test('an unknown, inactive or password-less account (no stored hash) is refused', async () => {
    const { provider, userManager } = setup(null);
    expect(await provider.verify({ username: 'ghost', password: 'anything' })).toBeNull();
    expect(userManager.upgradePasswordHash).not.toHaveBeenCalled();
  });

  test('a missing username or password is refused without asking for the hash', async () => {
    const { provider, userManager } = setup(currentHash);
    expect(await provider.verify({ username: 'molly', password: '' })).toBeNull();
    expect(await provider.verify({ username: '', password: RIGHT_PW })).toBeNull();
    expect(userManager.storedPasswordHash).not.toHaveBeenCalled();
  });

  test('a legacy hash verifies and is upgraded, marked legacy, to a hash of the same password', async () => {
    const { provider, userManager } = setup(legacyHash(RIGHT_PW));
    expect(await provider.verify({ username: 'molly', password: RIGHT_PW })).toEqual({ username: 'molly' });
    expect(userManager.upgradePasswordHash).toHaveBeenCalledWith('molly', expect.stringMatching(/^scrypt\$/), true);
    // The new hash verifies the same password — the account is not bricked.
    const upgraded = userManager.upgradePasswordHash.mock.calls[0][1] as string;
    const again = setup(upgraded);
    expect(await again.provider.verify({ username: 'molly', password: RIGHT_PW })).toEqual({ username: 'molly' });
  });

  test('a legacy hash made with an instance\'s own salt is checked with that salt', async () => {
    const { provider } = setup(legacyHash(RIGHT_PW, 'custom-salt'), 'custom-salt');
    expect(await provider.verify({ username: 'molly', password: RIGHT_PW })).toEqual({ username: 'molly' });
    const defaultSalt = setup(legacyHash(RIGHT_PW, 'custom-salt'));
    expect(await defaultSalt.provider.verify({ username: 'molly', password: RIGHT_PW })).toBeNull();
  });

  test('with no UserManager there is nothing to check against', async () => {
    const provider = new PasswordAuthProvider({ getManager: () => null });
    expect(await provider.verify({ username: 'molly', password: RIGHT_PW })).toBeNull();
  });
});
