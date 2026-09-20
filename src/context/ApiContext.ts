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
 *       await ctx.requirePermission('page-edit');
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
import { BaseContext } from './BaseContext.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type { AgentTokenGrant, PermissionSubject } from '../managers/UserManager.js';
import type { ShareGrant } from '../types/Share.js';

// ── ApiError ────────────────────────────────────────────────────────────────

/**
 * Thrown by ApiContext guard methods (requireAuthenticated, requirePermission).
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

export class ApiContext extends BaseContext {
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

  /** The share this request presented, when it did (#1222). Carried for the same reason as `viaToken`. */
  readonly viaShare?: ShareGrant;

  /**
   * The request's subject exactly as the middleware wrote it (#1179/#1382).
   *
   * The fields above are a flattened copy for convenience; this is the context
   * itself, to forward to a manager door that takes one — never rebuilt from
   * the fields, which is the #1173 defect. `null` for a request with no subject.
   */
  readonly subject: PermissionSubject | null;

  private constructor(
    engine: WikiEngine,
    isAuthenticated: boolean,
    username: string | null,
    displayName: string | null,
    email: string | null,
    roles: string[],
    viaToken?: AgentTokenGrant,
    viaShare?: ShareGrant,
    subject: PermissionSubject | null = null
  ) {
    // #1399: the subject goes to BaseContext as given. The flattened fields
    // below are a convenience copy for route code to READ; nothing may build a
    // subject back out of them.
    super(engine, subject);
    this.engine = engine;
    this.isAuthenticated = isAuthenticated;
    this.username = username;
    this.displayName = displayName;
    this.email = email;
    this.roles = roles;
    this.viaToken = viaToken;
    this.viaShare = viaShare;
    this.subject = subject;
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
    // #1212: a request with no middleware-written context is anonymous, field by field.
    const uc: Partial<NonNullable<Request['userContext']>> = req.userContext ?? {};
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
      uc.viaToken,
      uc.viaShare,
      // #1399: forward the subject the middleware wrote, as it wrote it. A
      // context with no username is not a subject — a malformed or absent one
      // resolves to the anonymous caller through BaseContext.getActor(), which
      // is the least-privilege reading, rather than being passed on as an
      // empty object the evaluator would have to interpret.
      typeof uc.username === 'string' && uc.username ? (req.userContext ?? null) : null
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

  // #1198: `hasRole` / `requireRole` are gone. A role name is not authority
  // (security-posture.md P2): it skips the policy evaluator, deny policies and
  // the agent-token scope ceiling. Ask `hasPermission` / `requirePermission`.

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
  /**
   * #1399: the door is BaseContext's, which asks UserManager with the subject
   * this context was handed. This method used to rebuild that subject from the
   * flattened fields above — the #1173 defect, in the class where #1173
   * happened. The rebuild listed username, roles, isAuthenticated, viaToken and
   * viaShare, so it dropped `privateStoreHandle` and an addon API route could
   * not see the caller's own sealed pages (#1382).
   *
   * @example
   * if (await ctx.hasPermission('user-read')) { // include PII fields }
   */
  // hasPermission(action) is inherited from BaseContext.

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

