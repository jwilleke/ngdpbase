/**
 * CloudflareAccessAuthProvider — JWT-based trust of Cloudflare Access (#649).
 *
 * Cloudflare Access is a zero-trust gateway: it authenticates users at the
 * edge (against your IdP) and forwards a signed JWT to the origin in the
 * `Cf-Access-Jwt-Assertion` header. This provider verifies that JWT and
 * coordinates the identity to a local User record.
 *
 * Design decisions (per #649 operator-confirmed 2026-05-25):
 *  - Q1 — User coordination by **email** (`identity.email` from the JWT).
 *  - Q2 — Unknown user → **JIT-provision** with default-role (overridable
 *    per CF group via `group-map`).
 *  - Q3 — CF `identity.groups[]` → ngdpbase roles via **config-map**.
 *
 * Cloudflare-Access-specific — not a generalised federated-IdP abstraction.
 *
 * Wire-up: this provider is invoked by the request-time middleware in
 * `src/app.ts` (header → verify → JIT-or-lookup → `req.session.username`).
 * It does NOT participate in the explicit /login flow; routes call AuthManager
 * with `providerId='cloudflare-access'` only from the middleware path.
 *
 * Token verification uses `jose.createRemoteJWKSet` against
 * `https://<team-domain>/cdn-cgi/access/certs` — keys are fetched on demand
 * and cached + rotated by jose internally.
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
 * Cloudflare Access JWT payload shape — `identity` is CF-specific (not part
 * of standard JWT claims).
 */
interface CfAccessJwtPayload extends JWTPayload {
  email?: string;
  identity?: {
    name?: string;
    groups?: string[];
  };
}

export interface CloudflareAccessConfig {
  /** Cloudflare team domain, e.g. `mjwilleke.cloudflareaccess.com`. */
  teamDomain: string;
  /** Application AUD tag (one per CF Access Application). */
  applicationAud: string;
  /** Role assigned to JIT-provisioned users when no CF group maps. */
  defaultRole: string;
  /**
   * Map of CF group name → ngdpbase role name. CF groups absent from this
   * map are silently ignored at provisioning time (user still gets defaultRole).
   */
  groupMap: Record<string, string>;
}

export class CloudflareAccessAuthProvider implements AuthProvider {
  readonly id = 'cloudflare-access';
  readonly displayName = 'Cloudflare Access';

  private readonly engine: WikiEngine;
  private readonly config: CloudflareAccessConfig;
  private readonly jwks: JWTVerifyGetKey;
  private readonly issuer: string;

  /**
   * @param jwksOverride optional pre-built JWKS getter for tests; production
   *   omits this and uses `createRemoteJWKSet` against the team-domain certs
   *   endpoint.
   */
  constructor(engine: WikiEngine, config: CloudflareAccessConfig, jwksOverride?: JWTVerifyGetKey) {
    this.engine = engine;
    this.config = config;
    this.issuer = `https://${config.teamDomain}`;
    this.jwks = jwksOverride
      ?? createRemoteJWKSet(new URL(`${this.issuer}/cdn-cgi/access/certs`));
  }

  /**
   * Verify the Cloudflare Access JWT and resolve (or provision) the local user.
   * `credentials.token` is the raw JWT lifted from the `Cf-Access-Jwt-Assertion`
   * header by the request-time middleware.
   */
  async verify(credentials: AuthVerifyCredentials): Promise<AuthResult | null> {
    const token = credentials.token;
    if (!token) {
      return null;
    }

    let verified: JWTVerifyResult<CfAccessJwtPayload>;
    try {
      verified = await jwtVerify<CfAccessJwtPayload>(token, this.jwks, {
        issuer: this.issuer,
        audience: this.config.applicationAud
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[CloudflareAccessAuthProvider] JWT verification failed: ${message}`);
      return null;
    }

    const payload = verified.payload;
    const email = payload.email?.toLowerCase();
    if (!email) {
      logger.warn('[CloudflareAccessAuthProvider] JWT had no email claim');
      return null;
    }

    return this.resolveOrProvision(email, payload);
  }

  private async resolveOrProvision(
    email: string,
    payload: CfAccessJwtPayload
  ): Promise<AuthResult | null> {
    const userManager = this.engine.getManager<UserManager>('UserManager');
    if (!userManager) {
      logger.error('[CloudflareAccessAuthProvider] UserManager unavailable');
      return null;
    }

    // Email-keyed lookup (Q1=a). Falls back to scanning when the provider
    // doesn't expose a direct getUserByEmail.
    const existing = await this.findUserByEmail(userManager, email);
    if (existing) {
      logger.info(`[CloudflareAccessAuthProvider] Existing user matched: ${existing.username}`);
      return { username: existing.username };
    }

    // JIT-provision (Q2=i). Username derived from local-part of email; if
    // already taken (e.g. existing local-only user with same handle but
    // different email), append a numeric suffix.
    const desiredUsername = email.split('@')[0];
    const username = await this.deriveUniqueUsername(userManager, desiredUsername);
    const displayName = payload.identity?.name || username;
    const roles = this.mapGroupsToRoles(payload.identity?.groups ?? []);

    try {
      await userManager.createUser({
        username,
        email,
        displayName,
        // Federated users have no local password — mirrors GoogleOIDC's pattern
        // (src/providers/GoogleOIDCProvider.ts:215). isExternal=true blocks
        // local password reset; isActive=true allows immediate login.
        password: '',
        roles,
        isExternal: true,
        isActive: true
      });
      logger.info(`[CloudflareAccessAuthProvider] JIT-provisioned user: ${username} (${email}) with roles=[${roles.join(', ')}]`);
      return { username };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[CloudflareAccessAuthProvider] JIT provision failed for ${username}:`, message);
      return null;
    }
  }

  /**
   * Map CF identity.groups[] to ngdpbase role names. Groups without an
   * entry in config.groupMap are dropped silently. Result always contains
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
        logger.warn('[CloudflareAccessAuthProvider] getUserByEmail failed:', err);
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
        logger.warn('[CloudflareAccessAuthProvider] getAllUsers fallback failed:', err);
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
