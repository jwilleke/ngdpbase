'use strict';

/**
 * The Policy Decision Point (#1431, step 6).
 *
 * One component answers "may this subject perform this action", and the
 * delegation ceilings run here, once. Before this, the capability path ran the
 * agent-token and share ceilings in `UserManager.hasPermission` and the page
 * path ran its own copies in `PolicyInformationPoint` — the same protection implemented
 * twice, with nothing keeping the two in step.
 *
 * __This step moves no behaviour.__ The ordering below is exactly what
 * `UserManager.hasPermission` did, comments and all, so the decision is
 * identical and only its address changes. The page path joins in step 7, which
 * is where orderings actually have to be reconciled.
 *
 * The roles the PEP is playing, for anyone reading this later:
 *
 * - __PEP__ — routes, manager doors, the availability gate. They ask and
 *   enforce (401 vs 403); they never decide.
 * - __PDP__ — this. Takes a subject and an action, returns permit or deny.
 * - __PIP__ — `UserManager` / `RoleManager` for the subject's roles, and the
 *   page's own rules for a resource decision.
 * - __PAP__ — `ConfigurationManager` and the admin screens, where policy is
 *   written.
 */

import BaseManager from '../managers/BaseManager.js';
import logger from '../utils/logger.js';
import type { PermissionSubject, JobSubject } from '../managers/UserManager.js';
import { ANONYMOUS_SUBJECT } from '../managers/UserManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type { Decision, DecisionRequest } from '../types/Policy.js';

interface UserManagerLike {
  userHoldsPermission(username: string, action: string): Promise<boolean>;
  resolveSubjectNow(username: string): Promise<{ username: string; roles: string[]; isAuthenticated: boolean }>;
}

interface PolicyEvaluatorLike {
  evaluateAccess(request: {
    pageName: string;
    action: string;
    userContext: { username: string; roles: string[]; isAuthenticated: boolean };
  }): Promise<{ allowed: boolean; hasDecision?: boolean; reason?: string; policyName?: string | null }>;
}

export class PolicyDecisionPoint extends BaseManager {
  /**
   * A manager so every PEP can reach it through `engine.getManager`, the same
   * way it reaches anything else. It holds no state of its own: a decision is
   * derived, never stored.
   */
  /**
   * `userManager` is the PIP this asks for subject attributes — the issuer's
   * live permissions for a share, and a job subject's current roles. It is
   * injected when `UserManager` builds its own PDP, because at that moment it
   * IS the UserManager and asking the engine for one would find nothing (or,
   * worse, a half-built one).
   */
  constructor(engine: WikiEngine, userManager?: UserManagerLike) {
    super(engine);
    this.injectedUserManager = userManager;
  }

  private readonly injectedUserManager?: UserManagerLike;

  private userManager(): UserManagerLike | null | undefined {
    return this.injectedUserManager ?? this.engine?.getManager<UserManagerLike>('UserManager');
  }

  /**
   * Decide. The order is load-bearing:
   *
   * 1. __The agent-token ceiling__, before anything else. A delegated token may
   *    only ever exercise a subset of its owner's rights, so a scope it does
   *    not carry is refused whatever policy says (#946).
   * 2. __A share IS the policy__ for a capability check (#1222). The subject is
   *    anonymous; what it may do is what the issuer delegated, bounded by what
   *    the issuer holds NOW — so this returns rather than falling through to
   *    the evaluator, and a share works on an instance whose policy grants
   *    anonymous nothing.
   * 3. __Roles resolved live__ when the subject asks for it (`resolveRolesNow`),
   *    so a job authorises against the roles its principal holds at decision
   *    time, not at enqueue time (#631, #1212).
   * 4. __The policies__, through `PolicyEvaluator`.
   */
  /**
   * The delegation ceilings alone: does the token's scope and the share's
   * grant permit this at all?
   *
   * Returns `null` when the caller carries no delegation — there is nothing to
   * bound, and the answer is whatever policy says.
   *
   * The refusal reasons are the vocabulary already recorded by
   * `PolicyInformationPoint.logAccessDecision` — `token_scope_deny`, `share_action_deny`,
   * `share_expired`, `share_resource_deny`, `share_issuer_deny` — because they
   * land in the audit trail, and renaming one silently changes what an
   * assessor reads.
   *
   * Separate from {@link decide} because a caller sometimes needs ONLY this.
   * `filterAccessiblePages` bounds the subject once and then applies each
   * page's own rules; running a full decision there would refuse the whole
   * list on a global policy that the page's frontmatter or ACL markup would
   * have overridden.
   */
  async ceiling(
    subject: PermissionSubject | JobSubject | null | undefined,
    request: DecisionRequest
  ): Promise<Decision | null> {
    const { action } = request;

    const viaToken = subject?.viaToken;
    if (viaToken && !viaToken.scopes.includes(action)) {
      logger.info(
        `[PDP] token ${viaToken.id} ("${viaToken.name}") lacks scope '${action}' ` +
        `(has: ${viaToken.scopes.join(',') || 'none'}) — denied`
      );
      return { permit: false, applicable: true, reason: 'token_scope_deny' };
    }

    const viaShare = subject?.viaShare;
    if (viaShare) {
      // #1431: when the question names a resource, the share must COVER it.
      // The page door checked this and the capability door did not, because a
      // capability question has no resource to cover — so this runs only when
      // one is supplied, and the two ceilings become the same code.
      const coverage = request.resourceCoverage;
      if (coverage && !coverage(viaShare.resources)) {
        logger.info(`[PDP] share ${viaShare.id} does not cover ${request.resource?.type ?? 'resource'} '${request.resource?.id ?? ''}' — denied`);
        return { permit: false, applicable: true, reason: 'share_resource_deny' };
      }
      if (!viaShare.actions.includes(action)) {
        logger.info(`[PDP] share ${viaShare.id} does not delegate '${action}' (has: ${viaShare.actions.join(',') || 'none'}) — denied`);
        return { permit: false, applicable: true, reason: 'share_action_deny' };
      }
      if (viaShare.expiresAt && Date.now() > Date.parse(viaShare.expiresAt)) {
        logger.info(`[PDP] share ${viaShare.id} expired ${viaShare.expiresAt} — denied`);
        return { permit: false, applicable: true, reason: 'share_expired' };
      }
      const userManager = this.userManager();
      const issuerHolds = !!userManager && await userManager.userHoldsPermission(viaShare.issuer, action);
      if (!issuerHolds) {
        logger.info(`[PDP] share ${viaShare.id}: issuer ${viaShare.issuer} no longer holds '${action}' — denied`);
        return { permit: false, applicable: true, reason: 'share_issuer_deny' };
      }
      // #1222: for a capability question the share IS the policy, and this is
      // an allow. A page question keeps going — a share visitor is an
      // anonymous visitor, and the page's own rules still have their say.
      return { permit: true, applicable: true, reason: 'share' };
    }

    return viaToken ? { permit: true, applicable: true, reason: 'token_scope_ok' } : null;
  }

  /**
   * Decide. The order is load-bearing:
   *
   * 1. __The ceilings__ (see {@link ceiling}), before anything else. A
   *    delegated credential may only ever exercise a subset of what was
   *    delegated, whatever policy says (#946, #1222).
   * 2. __A share IS the policy__ for a capability check, so a passing share
   *    returns an allow rather than falling through to the evaluator — a share
   *    must work on an instance whose policy grants anonymous nothing.
   * 3. __Roles resolved live__ when the subject asks for it (`resolveRolesNow`),
   *    so a job authorises against the roles its principal holds at decision
   *    time, not at enqueue time (#631, #1212).
   * 4. __The policies__, through `PolicyEvaluator`.
   */
  async decide(
    subject: PermissionSubject | JobSubject | null | undefined,
    request: DecisionRequest
  ): Promise<Decision> {
    const { action } = request;

    const ceiling = await this.ceiling(subject, request);
    if (ceiling && (!ceiling.permit || ceiling.reason === 'share')) return ceiling;

    const policyEvaluator = this.engine.getManager<PolicyEvaluatorLike>('PolicyEvaluator');
    if (!policyEvaluator) {
      logger.warn('[PDP] PolicyEvaluator not available, denying');
      return { permit: false, applicable: false, reason: 'no_evaluator' };
    }

    let userContext: { username: string; roles: string[]; isAuthenticated: boolean };
    // #1173: the `typeof subject === 'object'` guard is load-bearing. A caller
    // passing a username STRING is the shape that loses the agent token, and
    // `'x' in 'jim'` throws rather than returning false.
    if (typeof subject === 'object' && subject !== null && 'resolveRolesNow' in subject) {
      const userManager = this.userManager();
      if (!userManager) {
        logger.warn('[PDP] UserManager not available to resolve roles, denying');
        return { permit: false, applicable: false, reason: 'no_user_manager' };
      }
      userContext = await userManager.resolveSubjectNow(subject.username);
    } else if (subject) {
      userContext = {
        username: subject.username,
        roles: subject.roles,
        isAuthenticated: subject.isAuthenticated
      };
    } else {
      // #1212: the named constant for nobody, never an inline literal.
      userContext = { ...ANONYMOUS_SUBJECT };
    }

    // The PDP speaks resources; PolicyEvaluator still speaks page names. The
    // translation lives here, in one line, until the evaluator moves to
    // resources — which is what lets assets and media stop inventing their own
    // paths. '*' is the capability form: the question is about the subject.
    const result = await policyEvaluator.evaluateAccess({
      pageName: request.resource?.id ?? '*',
      action,
      userContext
    });
    // `hasDecision` false means no policy spoke — NotApplicable, not a deny.
    // The page door has further tiers to try; a capability check has none, and
    // treats silence as a refusal, which is what `permit: false` says here.
    return {
      permit: result.allowed,
      applicable: result.hasDecision !== false,
      reason: result.policyName ?? result.reason ?? (result.allowed ? 'policy_allow' : 'policy_deny')
    };
  }
}

export default PolicyDecisionPoint;
