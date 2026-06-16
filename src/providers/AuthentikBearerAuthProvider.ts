/**
 * AuthentikBearerAuthProvider — verify an Authentik-issued OAuth/OIDC bearer
 * JWT presented on the `Authorization: Bearer <token>` header (#818).
 *
 * Unlike the interactive Google-OIDC code-exchange flow, this provider trusts
 * a token an automated client (e.g. an AI agent) already holds — minted in
 * Authentik via the `client_credentials` grant against a per-person service
 * account. It verifies the JWT signature against Authentik's JWKS, checks
 * issuer + audience, then coordinates the identity to a local User record.
 *
 * Design mirrors CloudflareAccessAuthProvider (#649):
 *  - User coordination by **email** (`email` claim).
 *  - Unknown user → **JIT-provision** with default-role (overridable per
 *    Authentik group via `group-map`).
 *  - `groups[]` claim → ngdpbase roles via config-map.
 *
 * Author attribution (epic decision A): the service account's email is set to
 * match the human's ngdpbase account, so `findUserByEmail` resolves to that
 * user and pages are authored under their existing username (the UI renders
 * their displayName, e.g. "Jim Willeke").
 *
 * Wire-up: invoked by the request-time middleware in `src/app.ts` (header →
 * verify → resolve-or-provision → set req.userContext, stateless — no session
 * is created for API calls). It does NOT participate in the /login flow.
 *
 * Token verification uses `jose.createRemoteJWKSet` against the configured
 * JWKS URL — keys are fetched on demand and cached + rotated by jose.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyResult, type JWTVerifyGetKey } from 'jose';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type UserManager from '../managers/UserManager.js';
import type {
  AuthProvider,
  AuthVerifyCredentials,
  AuthResult
} from './BaseAuthProvider.js';

/**
 * Authentik OIDC access-token payload — standard OIDC claims plus the
 * `groups` array Authentik emits when the provider exposes the groups scope.
 */
interface AuthentikJwtPayload extends JWTPayload {
  email?: string;
  name?: string;
  preferred_username?: string;
  groups?: string[];
}

export interface AuthentikBearerConfig {
  /** OIDC issuer, e.g. `https://auth.nerdsbythehour.com/application/o/ngdpbase/`. */
  issuer: string;
  /** JWKS URI, e.g. `<issuer>jwks/`. */
  jwksUrl: string;
  /** Expected audience (the Authentik provider's client-id). */
  audience: string;
  /** Role assigned to JIT-provisioned users when no group maps. */
  defaultRole: string;
  /**
   * Map of Authentik group name → ngdpbase role name. Groups absent from this
   * map are silently ignored (user still gets defaultRole).
   */
  groupMap: Record<string, string>;
}

export class AuthentikBearerAuthProvider implements AuthProvider {
  readonly id = 'authentik-bearer';
  readonly displayName = 'Authentik (Bearer)';

  private readonly engine: WikiEngine;
  private readonly config: AuthentikBearerConfig;
  private readonly jwks: JWTVerifyGetKey;

  /**
   * @param jwksOverride optional pre-built JWKS getter for tests; production
   *   omits this and uses `createRemoteJWKSet` against the configured JWKS URL.
   */
  constructor(engine: WikiEngine, config: AuthentikBearerConfig, jwksOverride?: JWTVerifyGetKey) {
    this.engine = engine;
    this.config = config;
    this.jwks = jwksOverride ?? createRemoteJWKSet(new URL(config.jwksUrl));
  }

  /**
   * Verify the bearer JWT and resolve (or provision) the local user.
   * `credentials.token` is the raw JWT lifted from the `Authorization: Bearer`
   * header by the request-time middleware.
   */
  async verify(credentials: AuthVerifyCredentials): Promise<AuthResult | null> {
    const token = credentials.token;
    if (!token) {
      return null;
    }

    let verified: JWTVerifyResult<AuthentikJwtPayload>;
    try {
      verified = await jwtVerify<AuthentikJwtPayload>(token, this.jwks, {
        issuer: this.config.issuer,
        audience: this.config.audience
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Surface the underlying cause (e.g. JWKS fetch network errors like
      // ECONNREFUSED / EHOSTUNREACH / ENOTFOUND) — "fetch failed" alone is opaque.
      const cause = (err && typeof err === 'object' && 'cause' in err)
        ? (err as { cause?: { code?: string; message?: string } }).cause
        : undefined;
      const causeStr = cause
        ? ` (cause: ${cause.code ?? ''} ${cause.message ?? ''})`.trimEnd()
        : '';
      logger.warn(`[AuthentikBearerAuthProvider] JWT verification failed: ${message}${causeStr}`);
      return null;
    }

    const payload = verified.payload;
    const email = payload.email?.toLowerCase();
    if (!email) {
      logger.warn('[AuthentikBearerAuthProvider] JWT had no email claim');
      return null;
    }

    return this.resolveOrProvision(email, payload);
  }

  private async resolveOrProvision(
    email: string,
    payload: AuthentikJwtPayload
  ): Promise<AuthResult | null> {
    const userManager = this.engine.getManager<UserManager>('UserManager');
    if (!userManager) {
      logger.error('[AuthentikBearerAuthProvider] UserManager unavailable');
      return null;
    }

    // Email-keyed lookup. Resolving to the human's existing account is the
    // mechanism behind decision A (author reads as the human).
    const existing = await this.findUserByEmail(userManager, email);
    if (existing) {
      logger.info(`[AuthentikBearerAuthProvider] Existing user matched: ${existing.username}`);
      return { username: existing.username };
    }

    // JIT-provision. Username derived from a name claim or email local-part.
    const desiredUsername = payload.preferred_username || email.split('@')[0];
    const username = await this.deriveUniqueUsername(userManager, desiredUsername);
    const displayName = payload.name || payload.preferred_username || username;
    const roles = this.mapGroupsToRoles(payload.groups ?? []);

    try {
      await userManager.createUser({
        username,
        email,
        displayName,
        // Federated users have no local password — mirrors GoogleOIDC / CF.
        password: '',
        roles,
        isExternal: true,
        isActive: true
      });
      logger.info(`[AuthentikBearerAuthProvider] JIT-provisioned user: ${username} (${email}) with roles=[${roles.join(', ')}]`);
      return { username };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[AuthentikBearerAuthProvider] JIT provision failed for ${username}:`, message);
      return null;
    }
  }

  /**
   * Map Authentik groups[] to ngdpbase role names. Groups without an entry in
   * config.groupMap are dropped silently. Result always contains
   * config.defaultRole — even with no group hits, user gets the default.
   */
  private mapGroupsToRoles(groups: string[]): string[] {
    const out = new Set<string>([this.config.defaultRole]);
    for (const g of groups) {
      const mapped = this.config.groupMap[g];
      if (mapped) out.add(mapped);
    }
    return Array.from(out);
  }

  private async findUserByEmail(
    userManager: UserManager,
    email: string
  ): Promise<{ username: string } | null> {
    const candidate = (userManager as unknown as {
      getUserByEmail?: (e: string) => Promise<{ username: string } | null>;
    }).getUserByEmail;
    if (typeof candidate === 'function') {
      try {
        const found = await candidate.call(userManager, email);
        if (found) return found;
      } catch (err) {
        logger.warn('[AuthentikBearerAuthProvider] getUserByEmail failed:', err);
      }
    }
    // Fallback: scan via getAllUsers if available.
    const listAll = (userManager as unknown as {
      getAllUsers?: () => Promise<Array<{ username: string; email?: string }>>;
    }).getAllUsers;
    if (typeof listAll === 'function') {
      try {
        const users = await listAll.call(userManager);
        const found = users.find(u => u.email?.toLowerCase() === email);
        return found ? { username: found.username } : null;
      } catch (err) {
        logger.warn('[AuthentikBearerAuthProvider] getAllUsers fallback failed:', err);
      }
    }
    return null;
  }

  private async deriveUniqueUsername(
    userManager: UserManager,
    desired: string
  ): Promise<string> {
    const getUser = (userManager as unknown as {
      getUser?: (u: string) => Promise<unknown>;
    }).getUser;
    if (typeof getUser !== 'function') return desired;
    let candidate = desired;
    let suffix = 1;
    // Cap at a sane number — defensive only; collisions are rare in practice.
    while (suffix < 100) {
      const existing = await getUser.call(userManager, candidate);
      if (!existing) return candidate;
      candidate = `${desired}${suffix}`;
      suffix++;
    }
    return `${desired}-${Date.now()}`;
  }
}
