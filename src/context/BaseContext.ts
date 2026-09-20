'use strict';

/**
 * BaseContext — the permission door, implemented once (#1399).
 *
 * `WikiContext`, `ApiContext` and `ParseContext` each carry the caller's
 * subject and each answered "may this subject do X?" in its own way. Three
 * implementations of one question is how they drift: `ApiContext.hasPermission`
 * REBUILT the subject from its own flattened fields, which is the #1173 defect
 * in the class where #1173 happened. The rebuild listed `username`, `roles`,
 * `isAuthenticated`, `viaToken` and `viaShare` — so it silently dropped
 * `privateStoreHandle`, and an addon API route could not see the caller's
 * sealed pages at all (#1382).
 *
 * This class holds the subject __exactly as given__ and asks `UserManager`
 * with it. Nothing here copies a field out of a subject and builds a new one.
 *
 * __Not one merged context class.__ The three keep their own state and
 * lifetimes — page and theme, API errors, parse state — and merging them would
 * grow optional fields that are placeholders for most callers, which is the
 * "parameter nothing reads" hazard security-posture P1 names. They share this
 * door and nothing else.
 *
 * __No `hasRole` here.__ A role name is not authority (P2): it skips the
 * policy evaluator, deny policies and the agent-token and share ceilings. A
 * question about a NAMED user is `UserManager.hasRole` / `userHoldsPermission`,
 * which is a lookup, not a decision.
 */

import type { PermissionSubject } from '../managers/UserManager.js';
import { ANONYMOUS_SUBJECT } from '../managers/UserManager.js';
import type UserManager from '../managers/UserManager.js';

/** The engine surface this door needs — `getManager`, nothing more. */
export interface EngineLike {
  getManager<T = unknown>(name: string): T | undefined | null;
}

export abstract class BaseContext {
  /**
   * The caller's subject as the middleware wrote it, or `null` for a context
   * built without one (a boot-time render, a test fixture).
   *
   * Read it through {@link getActor}; that is the accessor callers and manager
   * doors use, and it is the one place the anonymous case is decided.
   */
  protected readonly _subject: PermissionSubject | null;

  protected readonly engineRef: EngineLike;

  /**
   * #636: per-instance memoisation of the permission door. The PROMISE is
   * cached, not the result, so concurrent callers share one evaluation.
   */
  private readonly _permissionCache: Map<string, Promise<boolean>> = new Map();

  protected constructor(engine: EngineLike, subject: PermissionSubject | null) {
    this.engineRef = engine;
    this._subject = subject;
  }

  /**
   * The subject this context was handed, forwarded — never rebuilt.
   *
   * A caller with no session is `ANONYMOUS_SUBJECT`: a real, named caller that
   * policy evaluates like any other, not an absence. That is why this returns
   * a subject rather than `null` — "nobody in particular" is an answer, and
   * making every call site invent its own fallback is how a default actor gets
   * introduced (P1).
   *
   * The returned object is the stored reference. Do not copy it field by
   * field: a rebuilt subject drops whatever the copier did not think of, which
   * has so far been `viaToken` (#1173), `viaShare` (#1222) and
   * `privateStoreHandle` (#1382).
   */
  getActor(): PermissionSubject {
    return this._subject ?? ANONYMOUS_SUBJECT;
  }

  /** True when a real subject was supplied — `getActor()` is not the anonymous fallback. */
  hasSubject(): boolean {
    return this._subject !== null;
  }

  /**
   * May this caller perform `action` at all? The canonical global check:
   * `UserManager.hasPermission` through `PolicyEvaluator`, with role
   * expansion, deny policies and the token and share ceilings.
   *
   * For a check against a PAGE, ask `canAccess` on a context that has one —
   * resource attributes beat global policy.
   */
  async hasPermission(action: string): Promise<boolean> {
    const userManager = this.engineRef.getManager<UserManager>('UserManager');
    if (!userManager) return false;
    const cached = this._permissionCache.get(action);
    if (cached) return cached;
    // #637: hand over the already-resolved subject so UserManager can skip
    // provider.getUser + resolveUserRoles.
    const promise = userManager.hasPermission(this.getActor(), action);
    this._permissionCache.set(action, promise);
    return promise;
  }

  /**
   * The identifiers that match audience-style filters — every role, plus the
   * username when there is one. Used where running the full evaluator per
   * result would be too expensive (search filtering).
   */
  getPrincipals(): string[] {
    const subject = this.getActor();
    const principals = Array.isArray(subject.roles) ? [...subject.roles] : [];
    if (typeof subject.username === 'string' && subject.username.length > 0) {
      principals.push(subject.username);
    }
    return principals;
  }
}

export default BaseContext;
