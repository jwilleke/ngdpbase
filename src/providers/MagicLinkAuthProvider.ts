/**
 * MagicLinkAuthProvider — passwordless authentication via one-time email links.
 *
 * Registered by AuthManager when `ngdpbase.auth.magic-link.enabled` is true.
 *
 * Flow:
 *   1. initiate()  — look up user by email, generate token, send link via mail transport
 *   2. verify()    — validate token (exists + not expired), return AuthResult
 *   3. consumeToken() — delete token; its return value gates the session (#1021)
 *
 * `verify()` being side-effect free is load-bearing, not incidental (#1019): the
 * route layer calls it twice, once on the GET that renders the sign-in
 * confirmation page and again on the POST that completes the login. Only the
 * POST consumes. Moving consumption into verify() would reintroduce the bug
 * where a mail scanner's link pre-fetch burns the token before the user clicks.
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
import { deriveUsername } from '../utils/deriveUsername.js';
import logger from '../utils/logger.js';

interface TokenEntry {
  /**
   * The account this token signs in as. For a new account (#1026) this is the
   * name derived at request time and reserved for creation on verify — it does
   * not exist as a user yet.
   */
  username: string;
  email: string;
  redirect: string;
  expiresAt: number; // Date.now() + ttlMs
  /** True when verifying this token must create the account first (#1026) */
  isNewUser: boolean;
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
      if (!user && !this.isAutoProvisionEnabled()) {
        // Silent — do not reveal whether email is registered
        logger.debug(`[MagicLinkAuthProvider] No user for email (silent): ${email}`);
        return;
      }

      // #1026: with auto-provision on, an unknown email still gets a link — but
      // the account is NOT created here. It is created when the link is
      // verified, so an address nobody controls never becomes an account and a
      // spray of requests at other people's addresses leaves nothing behind.
      // The caller-visible response is identical either way, which is what
      // keeps the anti-enumeration property intact.
      const isNewUser = !user;
      const username = user
        ? user.username
        : await deriveUsername(email, userManager);

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + this.config.ttlMs;

      this.tokens.set(token, {
        username,
        email,
        redirect: context.redirect || '/',
        expiresAt,
        isNewUser
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
      logger.info(
        `[MagicLinkAuthProvider] Link sent to ${email} ` +
        (user ? `for user ${user.username}` : '(new account — provisioned on verify)')
      );
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
   * Delete the token and report whether THIS caller was the one that did.
   *
   * #1021: the return value is the single-use gate, not a courtesy. The route
   * used to verify, then consume, with an `await` between the two — so two
   * POSTs carrying the same token (a double-clicked confirmation button, a
   * client retry, a prefetch racing the real submit) could both clear
   * verification before either consumed, and both would then establish a
   * session. #1019's CSRF-protected POST does not close that: both submits
   * come from the same session with the same valid token.
   *
   * `Map.delete` returns true only for the call that found an entry, and it is
   * synchronous so it cannot interleave. Exactly one caller can ever see true,
   * which makes consumption — not verification — the thing a session is gated
   * on.
   */
  consumeToken(token: string): boolean {
    return this.tokens.delete(token);
  }

  /**
   * Where the user was headed before the link was issued (#1049).
   *
   * Named for the capability rather than the mechanism: GoogleOIDCProvider
   * answers the same question keyed by a state nonce, and the two used to be
   * `getTokenRedirect` / `getStateRedirect`, which is why AuthManager needed a
   * method per provider to ask it.
   *
   * Must be read BEFORE consumeToken(), which deletes the entry.
   */
  getFlowRedirect(token: string): string {
    return this.tokens.get(token)?.redirect || '/';
  }

  /**
   * Create the account behind a new-user token (#1026).
   *
   * Called from the POST that completes sign-in, never from the GET — so a mail
   * scanner pre-fetching the link cannot bring an account into existence, for
   * the same reason it cannot consume the token (#1019).
   *
   * The account is created with `isExternal: true`, which stores an empty
   * password hash. `UserManager.verifyPassword` refuses an empty stored hash
   * outright (#1042), so these accounts cannot be logged into with a password
   * by any input — magic link is structurally their only way in.
   *
   * Idempotent: a token whose account already exists is a no-op, so a double
   * submit cannot fail the second time.
   *
   * @returns true if the token is usable (existing user, or newly created)
   */
  async provisionIfNew(token: string): Promise<boolean> {
    const entry = this.tokens.get(token);
    if (!entry) return false;
    if (!entry.isNewUser) return true;

    const userManager = this.engine.getManager<UserManager>('UserManager');
    if (!userManager) return false;

    // Re-check: the name was derived when the link was requested and something
    // else may have claimed it since.
    const existing = await userManager.getUserByEmail(entry.email);
    if (existing) {
      entry.username = existing.username;
      entry.isNewUser = false;
      return true;
    }

    const username = await deriveUsername(entry.email, userManager);
    const role = this.resolveDefaultRole(userManager);

    try {
      await userManager.createUser({
        username,
        email: entry.email,
        displayName: username,
        password: '',
        roles: [role],
        isExternal: true,
        isActive: true
      });
    } catch (err) {
      logger.error(`[MagicLinkAuthProvider] Failed to provision ${entry.email}:`, err);
      return false;
    }

    entry.username = username;
    entry.isNewUser = false;
    logger.info(`[MagicLinkAuthProvider] Provisioned new user: ${username} (${entry.email}) role=${role}`);
    return true;
  }

  /** Whether an unknown email may create an account by verifying a link (#1026). */
  private isAutoProvisionEnabled(): boolean {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');

    // `ngdpbase.application.registration` is the master override — when self-
    // registration is off, no path may create an account, exactly as
    // GoogleOIDCProvider treats it. The provider toggle sits below it.
    const allowReg = (configManager?.getProperty?.(
      'ngdpbase.application.registration',
      true
    ) as boolean | undefined) ?? true;
    if (!allowReg) return false;

    return (configManager?.getProperty?.(
      'ngdpbase.auth.magic-link.auto-provision',
      false
    ) as boolean | undefined) ?? false;
  }

  /**
   * Role for auto-provisioned users. An unknown role name falls back to
   * `reader` with a warning — a typo should degrade to read-only, not throw
   * mid-signup or silently mint a more privileged account than intended.
   */
  private resolveDefaultRole(userManager: UserManager): string {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const configured = (configManager?.getProperty?.(
      'ngdpbase.auth.magic-link.registration.default-role',
      'reader'
    ) as string | undefined) ?? 'reader';

    if (configured === 'reader') return 'reader';

    if (userManager.getRole?.(configured) == null) {
      logger.warn(
        `[MagicLinkAuthProvider] Unknown role "${configured}" in ` +
        'ngdpbase.auth.magic-link.registration.default-role — falling back to "reader"'
      );
      return 'reader';
    }

    return configured;
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
