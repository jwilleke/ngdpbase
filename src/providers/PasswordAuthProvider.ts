/**
 * PasswordAuthProvider — username/password authentication.
 *
 * Thin wrapper around UserManager.authenticateUser(). Registered by
 * AuthManager as the default provider (always enabled).
 */

import type { AuthProvider, AuthVerifyCredentials, AuthResult, FactorDescription } from './BaseAuthProvider.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type UserManager from '../managers/UserManager.js';

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

    const user = await userManager.authenticateUser(username, password);
    if (!user) return null;

    return { username: user.username };
  }
}
