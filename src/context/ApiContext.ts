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
 *       await ctx.requirePermission('page-edit');
 *       const username = ctx.actingUsername();
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
// #1665: the Request augmentation (req.userContext, req.session). Imported here so the
// emitted ApiContext.d.ts carries it to every add-on that typechecks against dist/.
import '../types/express.js';
import { BaseContext } from './BaseContext.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type { AgentTokenGrant, PermissionSubject } from '../managers/UserManager.js';
import type { ShareGrant } from '../types/Share.js';
import { freshSignInAnswer } from '../security/freshSignIn.js';

// ── ApiError ────────────────────────────────────────────────────────────────

/**
 * Thrown by ApiContext guard methods (requirePermission, actingUsername).
 * Route handlers should catch this and forward `status` to `res.status()`.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /**
     * For a step-up refusal (#1745): where the person re-authenticates,
     * returning to the page they were on. Send it with the 403 so the page can
     * offer the way forward, as core routes do (`{ error, reauth }`).
     */
    public readonly reauth?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The subject a request carries, refused when there is none (#1399).
 *
 * The session middleware writes one on every request — the signed-in user, or
 * the anonymous PRINCIPAL it assigns when nobody has signed in — and the bearer
 * and share paths overwrite it with their own. A request reaching here without
 * one is a failure upstream, not an anonymous caller, and substituting anonymous
 * would be the default actor security-posture P1 forbids.
 */
function subjectOf(req: Request): PermissionSubject {
  const uc = req.userContext;
  if (!uc || typeof uc.username !== 'string' || !uc.username) {
    throw new Error(
      'request has no subject: the session middleware writes one on every request (security-posture P1)'
    );
  }
  return uc;
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

  /**
   * The address the request came from (#1179), read from the subject the
   * middleware wrote — not a copy. Forwarded with the context, so a job or a
   * record an add-on starts from it carries the provenance (#1667).
   */
  get ipAddress(): string | undefined {
    const ip = this.subject?.ipAddress;
    return typeof ip === 'string' && ip ? ip : undefined;
  }

  private constructor(
    engine: WikiEngine,
    isAuthenticated: boolean,
    username: string | null,
    displayName: string | null,
    email: string | null,
    roles: string[],
    viaToken?: AgentTokenGrant,
    viaShare?: ShareGrant,
    subject: PermissionSubject | null = null,
    request: Request | null = null
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
    this.request = request;
  }

  /** The request this context was built from; the step-up answer needs its return page (#1745). */
  private readonly request: Request | null;

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
      // #1399: forward the subject the middleware wrote, as it wrote it.
      subjectOf(req),
      req
    );
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  /**
   * The username this request acts as, for a feature that belongs to a
   * person (a journal, a reservation). Asked AFTER `requirePermission`: policy
   * decides whether the caller may, this only says whether there is someone
   * to act as (#1430). A permission delegated to anonymous visitors still
   * finds nobody here, so the refusal is a 401, never a crash on a missing
   * name.
   *
   * @example
   * await ctx.requirePermission('page-edit');
   * const username = ctx.actingUsername(); // → 401 if nobody is signed in
   */
  actingUsername(): string {
    // The anonymous subject carries a username ('anonymous'); it is not a
    // person a journal or a reservation can belong to.
    if (!this.isAuthenticated || !this.username) {
      throw new ApiError(401, 'Authentication required');
    }
    return this.username;
  }

  // #1198: `hasRole` / `requireRole` are gone. A role name is not authority
  // (security-posture.md P2): it skips the policy evaluator, deny policies and
  // the agent-token scope ceiling. Ask `hasPermission` / `requirePermission`.

  /**
   * Returns true if the caller has the given permission.
   *
   * Asks the PDP (`PolicyDecisionPoint.permits`, #1431 step 14) — same canonical
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
   * Throws unless policy grants the caller this permission.
   *
   * #1399: the refusal classifies itself — 401 for a caller who has not
   * signed in, 403 for one who has. That is the ONE sanctioned use of
   * `isAuthenticated` (security-posture P2): it never decides, it only says
   * which refusal to send after policy has already said no. Before this,
   * every route paired `requireAuthenticated()` with this call to get the 401,
   * which read as though authentication were half the gate.
   *
   * #1745: a refusal for someone who HOLDS the permission is the step-up one
   * (#1635) — their sign-in is not fresh enough. It carries `reauth`, built
   * where core routes build it (security/freshSignIn.ts), and the prompt is
   * audited there; a delegated credential gets no `reauth`.
   *
   * @example
   * await ctx.requirePermission('search-user'); // → 401 anonymous, 403 signed in
   */
  async requirePermission(permission: string): Promise<void> {
    if (await this.hasPermission(permission)) return;
    if (this.request && await this.holdsPermission(permission)) {
      const answer = await freshSignInAnswer(this.engine, this.request, this.request.userContext, permission, 'json');
      throw new ApiError(403, answer.error, answer.reauth);
    }
    throw this.isAuthenticated
      ? new ApiError(403, 'Forbidden')
      : new ApiError(401, 'Authentication required');
  }
}

