/**
 * MagicLinkAuthProvider — passwordless authentication via one-time email links.
 *
 * Registered by AuthManager when `ngdpbase.auth.magic-link.enabled` is true.
 *
 * Flow:
 *   1. initiate()  — look up user by email, generate token, send link via mail transport
 *   2. verify()    — validate token (exists + not expired), return AuthResult
 *   3. consumeToken() — delete token after session is created (single-use guarantee)
 *
 * Tokens are in-memory only — lost on restart, acceptable for the default 15-min TTL.
 *
 * @see AuthManager
 * @see BaseAuthProvider
 */

import * as crypto from 'crypto';
import type {
  AuthProvider,
  AuthInitiateContext,
  AuthVerifyCredentials,
  AuthResult
} from './BaseAuthProvider.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import type UserManager from '../managers/UserManager.js';
import type { MailProvider } from '../mail/MailProvider.js';
import logger from '../utils/logger.js';

interface TokenEntry {
  username: string;
  email: string;
  redirect: string;
  expiresAt: number; // Date.now() + ttlMs
}

export interface MagicLinkConfig {
  ttlMs: number;
  mailProvider: MailProvider;
}

export class MagicLinkAuthProvider implements AuthProvider {
  readonly id = 'magic-link';
  readonly displayName = 'Magic Link';

  /** token → entry */
  private tokens: Map<string, TokenEntry>;
  /** email → timestamp of last request (rate-limit) */
  private rateLimitMap: Map<string, number>;

  constructor(
    private engine: WikiEngine,
    private config: MagicLinkConfig
  ) {
    this.tokens = new Map();
    this.rateLimitMap = new Map();
  }

  /**
   * Initiate the magic-link flow: look up the user, generate a token, send the email.
   * Silently succeeds if the email is not registered — prevents user enumeration.
   */
  async initiate(context: AuthInitiateContext): Promise<void> {
    try {
      const email = context.email?.trim().toLowerCase();
      if (!email) return;

      // Rate limit: 1 request per email per 60 seconds
      if (this.isRateLimited(email)) {
        logger.debug(`[MagicLinkAuthProvider] Rate limited: ${email}`);
        return;
      }

      const userManager = this.engine.getManager<UserManager>('UserManager');
      if (!userManager) return;

      const user = await userManager.getUserByEmail(email);
      if (!user) {
        // Silent — do not reveal whether email is registered
        logger.debug(`[MagicLinkAuthProvider] No user for email (silent): ${email}`);
        return;
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + this.config.ttlMs;

      this.tokens.set(token, {
        username: user.username,
        email,
        redirect: context.redirect || '/',
        expiresAt
      });

      this.rateLimitMap.set(email, Date.now());

      // #642 Iteration 3: derive baseUrl from canonical config at runtime.
      // AuthManager.initialize() already refused to register this provider
      // unless ngdpbase.application.base-url is explicit, so getBaseURL()
      // here always returns the operator-configured value.
      const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
      const baseUrl = (configManager?.getBaseURL() ?? '').replace(/\/$/, '');
      const verifyUrl = `${baseUrl}/auth/magic-link/verify?token=${token}`;
      const ttlMinutes = Math.round(this.config.ttlMs / 60_000);

      await this.config.mailProvider.send({
        to: email,
        subject: 'Your login link',
        text: [
          'Click the link below to log in.',
          '',
          verifyUrl,
          '',
          `This link expires in ${ttlMinutes} minutes and can only be used once.`,
          '',
          'If you did not request this link, you can ignore this email.'
        ].join('\n'),
        html: [
          '<p>Click the link below to log in.</p>',
          `<p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
          `<p>This link expires in ${ttlMinutes} minutes and can only be used once.</p>`,
          '<p>If you did not request this link, you can ignore this email.</p>'
        ].join('\n')
      });

      this.cleanupExpired();
      logger.info(`[MagicLinkAuthProvider] Link sent to ${email} for user ${user.username}`);
    } catch (err) {
      logger.error('[MagicLinkAuthProvider] Error in initiate:', err);
    }
  }

  /**
   * Verify a token. Returns AuthResult on success, null if invalid or expired.
   * Does NOT consume the token — call consumeToken() after the session is created.
   */
  verify(credentials: AuthVerifyCredentials): Promise<AuthResult | null> {
    const { token } = credentials;
    if (!token) return Promise.resolve(null);

    const entry = this.tokens.get(token);
    if (!entry) return Promise.resolve(null);

    if (Date.now() > entry.expiresAt) {
      this.tokens.delete(token);
      return Promise.resolve(null);
    }

    return Promise.resolve({ username: entry.username });
  }

  /**
   * Delete the token after the session has been created. Single-use guarantee.
   */
  consumeToken(token: string): void {
    this.tokens.delete(token);
  }

  /**
   * Returns the redirect URL stored with the token (for use by the route handler).
   */
  getTokenRedirect(token: string): string {
    return this.tokens.get(token)?.redirect || '/';
  }

  private isRateLimited(email: string): boolean {
    const last = this.rateLimitMap.get(email);
    if (!last) return false;
    return Date.now() - last < 60_000;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [token, entry] of this.tokens) {
      if (now > entry.expiresAt) this.tokens.delete(token);
    }
  }

  /** Exposed for testing */
  getTokenCount(): number {
    return this.tokens.size;
  }
}
