/**
 * GoogleOIDCProvider — "Sign in with Google" via OpenID Connect.
 *
 * Registered by AuthManager when `ngdpbase.auth.google-oidc.enabled` is true.
 *
 * Flow:
 *   1. generateAuthUrl() — build Google authorization URL, store state nonce
 *   2. verify()          — exchange code for ID token, validate JWT, resolve user
 *   3. consumeToken()    — delete state entry after session is created
 *
 * State entries are in-memory only (lost on restart; 10-min TTL is intentional).
 *
 * @see AuthManager
 * @see BaseAuthProvider
 * @see https://github.com/jwilleke/ngdpbase/issues/447
 */

import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import type {
  AuthProvider,
  AuthVerifyCredentials,
  AuthResult
} from './BaseAuthProvider.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type UserManager from '../managers/UserManager.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import logger from '../utils/logger.js';

export interface GoogleOIDCConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  autoProvision: boolean;
  defaultRoles: string[];
  hostedDomain?: string;
}

interface StateEntry {
  nonce: string;
  redirect: string;
  expiresAt: number;
}

export class GoogleOIDCProvider implements AuthProvider {
  readonly id = 'google-oidc';
  readonly displayName = 'Google';

  private client: OAuth2Client;
  /** nonce → entry */
  private states: Map<string, StateEntry>;

  constructor(
    private engine: WikiEngine,
    private config: GoogleOIDCConfig
  ) {
    this.client = new OAuth2Client(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );
    this.states = new Map();
  }

  /**
   * Generate the Google authorization URL and store a state nonce.
   * Returns the URL the route handler should redirect the browser to.
   */
  generateAuthUrl(redirect: string = '/'): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    this.states.set(nonce, {
      nonce,
      redirect,
      expiresAt: Date.now() + 10 * 60_000   // 10 minutes
    });
    this.cleanupExpired();

    const params: Parameters<OAuth2Client['generateAuthUrl']>[0] = {
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state: nonce
    };
    if (this.config.hostedDomain) {
      params.hd = this.config.hostedDomain;
    }

    return this.client.generateAuthUrl(params);
  }

  /**
   * Returns the redirect URL stored for a given state nonce.
   * Used by the callback route handler.
   */
  getStateRedirect(nonce: string): string {
    return this.states.get(nonce)?.redirect ?? '/';
  }

  /**
   * Verify the OAuth callback. Exchanges `code` + validates `state`, then
   * verifies the ID token JWT and resolves the local user.
   *
   * credentials.token  = OAuth authorization code
   * credentials.state  = state nonce from query string
   */
  async verify(credentials: AuthVerifyCredentials): Promise<AuthResult | null> {
    const code  = credentials.token;
    const nonce = (credentials as AuthVerifyCredentials & { state?: string }).state;

    if (!code || !nonce) {
      logger.debug('[GoogleOIDCProvider] Missing code or state');
      return null;
    }

    // Validate state (CSRF guard)
    const stateEntry = this.states.get(nonce);
    if (!stateEntry) {
      logger.warn('[GoogleOIDCProvider] Unknown or expired state nonce');
      return null;
    }
    if (Date.now() > stateEntry.expiresAt) {
      this.states.delete(nonce);
      logger.warn('[GoogleOIDCProvider] State nonce expired');
      return null;
    }

    // Exchange authorization code for tokens
    let idToken: string;
    try {
      const { tokens } = await this.client.getToken(code);
      if (!tokens.id_token) {
        logger.error('[GoogleOIDCProvider] No id_token in token response');
        return null;
      }
      idToken = tokens.id_token;
    } catch (err) {
      logger.error('[GoogleOIDCProvider] Token exchange failed:', err);
      return null;
    }

    // Verify and decode the ID token
    let email: string, name: string;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.config.clientId
      });
      const payload = ticket.getPayload();
      if (!payload?.email) {
        logger.error('[GoogleOIDCProvider] ID token missing email claim');
        return null;
      }
      email = payload.email.toLowerCase().trim();
      name  = payload.name ?? payload.email;
    } catch (err) {
      logger.error('[GoogleOIDCProvider] ID token verification failed:', err);
      return null;
    }

    // Resolve local user
    const userManager = this.engine.getManager<UserManager>('UserManager');
    if (!userManager) {
      logger.error('[GoogleOIDCProvider] UserManager not available');
      return null;
    }

    const existing = await userManager.getUserByEmail(email);

    if (existing) {
      if (!existing.isExternal) {
        // Prevent hijacking a password account via OAuth
        logger.warn(`[GoogleOIDCProvider] Email ${email} belongs to a non-external account — denying OAuth login`);
        return null;
      }
      // Update login stats via updateUser if supported
      try {
        await userManager.updateUser(existing.username, {
          lastLogin: new Date().toISOString(),
          loginCount: (existing.loginCount ?? 0) + 1
        } as Parameters<typeof userManager.updateUser>[1]);
      } catch {
        // best-effort — do not fail login if update fails
      }
      logger.info(`[GoogleOIDCProvider] Existing user logged in via Google: ${existing.username}`);
      return { username: existing.username };
    }

    // Auto-provision new user
    if (!this.config.autoProvision) {
      logger.info(`[GoogleOIDCProvider] Auto-provision disabled — rejecting unknown email: ${email}`);
      return null;
    }

    // `ngdpbase.application.registration: false` is an override — when self-
    // registration is disabled at the application level, no path can create a
    // new account, regardless of `auth.google-oidc.auto-provision`. Existing
    // OIDC users (matched above) still log in normally.
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const allowReg = (configManager?.getProperty(
      'ngdpbase.application.registration',
      true
    ) as boolean | undefined) ?? true;
    if (!allowReg) {
      logger.info(
        `[GoogleOIDCProvider] Registration disabled — rejecting new OIDC user: ${email}`
      );
      return null;
    }

    const username = await this.deriveUsername(email, userManager);
    try {
      await userManager.createUser({
        username,
        email,
        displayName: name,
        password: '',
        roles: this.config.defaultRoles,
        isExternal: true,
        isActive: true
      });
      logger.info(`[GoogleOIDCProvider] Auto-provisioned new user: ${username} (${email})`);
      return { username };
    } catch (err) {
      logger.error(`[GoogleOIDCProvider] Failed to auto-provision user ${username}:`, err);
      return null;
    }
  }

  /**
   * Delete state entry after session is created. Single-use guarantee.
   */
  consumeToken(nonce: string): void {
    this.states.delete(nonce);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Derive a username from an email address, de-duping if already taken.
   */
  private async deriveUsername(email: string, userManager: UserManager): Promise<string> {
    const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-');
    let candidate = base;
    let n = 2;
    while (await this.usernameExists(candidate, userManager)) {
      candidate = `${base}-${n++}`;
    }
    return candidate;
  }

  private async usernameExists(username: string, userManager: UserManager): Promise<boolean> {
    try {
      const u = await userManager.getUser(username);
      return u !== undefined;
    } catch {
      return false;
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [nonce, entry] of this.states) {
      if (now > entry.expiresAt) this.states.delete(nonce);
    }
  }

  /** Exposed for testing */
  getStateCount(): number {
    return this.states.size;
  }
}
