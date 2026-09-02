'use strict';

/**
 * ApiContext — Lightweight request context for API route handlers.
 *
 * Parallel to WikiContext (used for page rendering), ApiContext provides a
 * clean, typed, consistent object for addon and core API routes. It replaces
 * scattered access to `req.userContext`, `req.session`, and engine managers.
 *
 * Usage:
 *   import { ApiContext, ApiError } from '../../../src/context/ApiContext';
 *
 *   router.post('/reservations', async (req, res) => {
 *     try {
 *       const ctx = ApiContext.from(req, engine);
 *       ctx.requireAuthenticated();
 *       ctx.requireRole('clubhouse-manager', 'admin');
 *       // ...
 *     } catch (err) {
 *       if (err instanceof ApiError) {
 *         return res.status(err.status).json({ error: err.message });
 *       }
 *       res.status(500).json({ error: String(err) });
 *     }
 *   });
 */

import type { Request } from 'express';
import type { WikiEngine } from '../types/WikiEngine.js';
import type UserManager from '../managers/UserManager.js';
import type { AgentTokenGrant } from '../managers/UserManager.js';
import { ANONYMOUS_SUBJECT } from '../managers/UserManager.js';

// ── ApiError ────────────────────────────────────────────────────────────────

/**
 * Thrown by ApiContext guard methods (requireAuthenticated, requireRole).
 * Route handlers should catch this and forward `status` to `res.status()`.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── ApiContext ───────────────────────────────────────────────────────────────

export class ApiContext {
  /** Reference to the wiki engine */
  readonly engine: WikiEngine;

  /** Whether the caller has an active authenticated session */
  readonly isAuthenticated: boolean;

  /** Caller's username, or null for anonymous */
  readonly username: string | null;

  /** Caller's display name, or null */
  readonly displayName: string | null;

  /** Caller's email address, or null */
  readonly email: string | null;

  /** Caller's assigned roles (always an array, never undefined) */
  readonly roles: string[];

  /**
   * The agent token this request arrived with, when it did (#1173).
   *
   * Absent before this: `from()` copied five fields off `req.userContext` and
   * `viaToken` was not one of them, so every `ctx.hasPermission()` — including
   * every addon API route using `requirePermission()` — resolved against the
   * token OWNER's live roles with the token's scope ceiling unable to run. The
   * same defect #1164 fixed in route code, reached through a context class
   * instead, and invisible to a check that only scans `src/routes/`.
   */
  readonly viaToken?: AgentTokenGrant;

  private constructor(
    engine: WikiEngine,
    isAuthenticated: boolean,
    username: string | null,
    displayName: string | null,
    email: string | null,
    roles: string[],
    viaToken?: AgentTokenGrant
  ) {
    this.engine = engine;
    this.isAuthenticated = isAuthenticated;
    this.username = username;
    this.displayName = displayName;
    this.email = email;
    this.roles = roles;
    this.viaToken = viaToken;
  }

  /**
   * Build an ApiContext from an Express request and engine reference.
   *
   * Reads `req.userContext` (set by the session middleware in app.ts) and
   * normalises the values into a fully-typed object. Always succeeds — an
   * unauthenticated request produces a context with `isAuthenticated: false`
   * and an empty/anonymous roles array.
   */
  static from(req: Request, engine: WikiEngine): ApiContext {
    const uc = req.userContext ?? {};
    const isAuthenticated = Boolean(
      (uc as Record<string, unknown>)['isAuthenticated'] ??
      req.session?.isAuthenticated ??
      false
    );

    return new ApiContext(
      engine,
      isAuthenticated,
      (uc.username) ?? null,
      (uc.displayName) ?? null,
      (uc.email) ?? null,
      Array.isArray(uc.roles) ? (uc.roles) : [],
      uc.viaToken
    );
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  /**
   * Throws `ApiError(401)` if the caller is not authenticated.
   *
   * @example
   * ctx.requireAuthenticated(); // → 401 if anonymous
   */
  requireAuthenticated(): void {
    if (!this.isAuthenticated) {
      throw new ApiError(401, 'Authentication required');
    }
  }

  /**
   * Returns true if the caller has at least one of the specified roles.
   *
   * @example
   * if (ctx.hasRole('admin', 'clubhouse-manager')) { ... }
   */
  hasRole(...roles: string[]): boolean {
    // eslint-disable-next-line no-restricted-syntax -- canonical role-check implementation
    return roles.some(r => this.roles.includes(r));
  }

  /**
   * Throws `ApiError(403)` if the caller does not have at least one of the
   * specified roles.
   *
   * @example
   * ctx.requireRole('admin', 'clubhouse-manager'); // → 403 if neither role
   */
  requireRole(...roles: string[]): void {
    if (!this.hasRole(...roles)) {
      throw new ApiError(403, 'Forbidden');
    }
  }

  /**
   * Returns true if the caller has the given permission.
   *
   * Delegates to {@link UserManager.hasPermission} — same canonical
   * `PolicyEvaluator`-backed path that `WikiContext.hasPermission` uses.
   * Honors anonymous/authenticated role expansion, deny policies, resource
   * patterns, and the `'All'`/`'Authenticated'` role semantics. (#630)
   *
   * @example
   * if (await ctx.hasPermission('user-read')) { // include PII fields }
   */
  async hasPermission(permission: string): Promise<boolean> {
    const userManager = this.engine.getManager<UserManager>('UserManager');
    if (!userManager) return false;
    // #637: build a userContext from our request-scoped fields and pass it
    // through so UserManager can skip provider.getUser + resolveUserRoles.
    // The session middleware already resolved roles + added 'Authenticated'/'All'
    // for authenticated callers; we trust that shape here.
    if (this.username) {
      return userManager.hasPermission(
        {
          username: this.username,
          roles: this.roles,
          isAuthenticated: this.isAuthenticated,
          // #1173: carried, not dropped. Without this the subject is rebuilt
          // from three fields and the ceiling has no token to find.
          ...(this.viaToken ? { viaToken: this.viaToken } : {})
        },
        permission
      );
    }
    // Anonymous: a named subject rather than an empty string, so there is one
    // code path into hasPermission (#1173).
    return userManager.hasPermission(ANONYMOUS_SUBJECT, permission);
  }

  /**
   * Throws `ApiError(403)` if the caller's roles do not grant the given permission.
   *
   * @example
   * await ctx.requirePermission('search-user'); // → 403 if no role grants it
   */
  async requirePermission(permission: string): Promise<void> {
    if (!(await this.hasPermission(permission))) {
      throw new ApiError(403, 'Forbidden');
    }
  }
}

