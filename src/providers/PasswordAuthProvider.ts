/**
 * PasswordAuthProvider — username/password authentication.
 *
 * The password method's check (#1758): AuthManager is the one door for every
 * check of a secret, and this provider is its connection to the password.
 * The hash stays on the account (UserManager keeps it and hands it only to
 * this check); the check, and the decision to re-hash at the current cost
 * (#1042), are made here. Registered by AuthManager as the default provider.
 */

import type { AuthProvider, AuthVerifyCredentials, AuthResult, FactorDescription } from './BaseAuthProvider.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type UserManager from '../managers/UserManager.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import { hashPassword, verifyPassword, needsRehash, isLegacyHash } from '../utils/passwordHash.js';

export class PasswordAuthProvider implements AuthProvider {
  readonly id = 'password';
  readonly displayName = 'Username & Password';
  /** Something you know (#1523). */
  readonly factor: FactorDescription = { amr: ['pwd'], aal: 1, primary: true };

  constructor(private engine: WikiEngine) {}

  async verify(credentials: AuthVerifyCredentials): Promise<AuthResult | null> {
    const { username, password } = credentials;
    if (!username || !password) return null;

    const userManager = this.engine.getManager<UserManager>('UserManager');
    if (!userManager) return null;

    const stored = await userManager.storedPasswordHash(username);
    if (!stored) return null;
    // The legacy salt keeps its historic value: legacy digests were made with it (#1042).
    const legacySalt = this.engine.getManager<ConfigurationManager>('ConfigurationManager')
      ?.getProperty('ngdpbase.user.security.passwordsalt', 'amdwiki-salt') as string | undefined;
    if (!(await verifyPassword(password, stored, legacySalt || 'amdwiki-salt'))) return null;

    // #1042: upgrade the stored hash now, while the plaintext is known to be right.
    if (needsRehash(stored)) await userManager.upgradePasswordHash(username, await hashPassword(password), isLegacyHash(stored));

    return { username };
  }
}
