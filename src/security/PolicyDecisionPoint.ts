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
 * - __PIP__ — `PolicyInformationPoint`: the subject's attributes and the
 *   page's own rules (#1431 step 13).
 * - __PAP__ — `ConfigurationManager` and the admin screens, where policy is
 *   written.
 */

import BaseManager from '../managers/BaseManager.js';
import logger from '../utils/logger.js';
import type { PermissionSubject, JobSubject } from '../managers/UserManager.js';
import { ANONYMOUS_SUBJECT } from '../managers/UserManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type { Decision, DecisionRequest } from '../types/Policy.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import { permissionsForRoles } from '../utils/rolePermissions.js';
import { normalizeUsername } from '../utils/username.js';

/** The subject's current attributes are the PIP's (#1431 step 13). */
interface SubjectSourceLike {
  resolveSubjectNow(username: string): Promise<{ username: string; roles: string[]; isAuthenticated: boolean }>;
  subjectFor(username: string): Promise<{ username: string; roles: string[]; isAuthenticated: boolean } | null>;
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
  constructor(engine: WikiEngine) {
    super(engine);
  }

  /** Where a subject's attributes come from (#1431 step 13). */
  private informationPoint(): SubjectSourceLike | null | undefined {
    return this.engine?.getManager<SubjectSourceLike>('PolicyInformationPoint');
  }

  /**
   * Authorise a request: may THIS subject perform `action`? The boolean form
   * of {@link decide} for a capability. It was `UserManager.hasPermission`
   * until #1431 step 14; the decision was already here, only the door moved.
   *
   * Takes a `PermissionSubject` — the request's own identity, forwarded from
   * `req.userContext` (WikiContext, ApiContext, ParseContext) or a
   * `JobContext` for work with no request (#631). Roles arrive already
   * resolved; the session middleware did that once per request.
   *
   * #1173 Part B: the username-string overload this method once accepted is
   * gone. A string cannot carry `viaToken`, so the agent-token ceiling below
   * had nothing to read and every string-form call resolved against the
   * owner's full roles. There is one path now, and the type makes the other
   * impossible. Callers with no subject to hand over have one of two
   * legitimate shapes: `ANONYMOUS_SUBJECT`, or the
   * separate question {@link userHoldsPermission} — "does the named user hold
   * this?" — which is a lookup about somebody else, not an authorisation.
   *
   * @param subject - The identity being authorised, with `roles` resolved and
   *                  `viaToken` present when a bearer token authenticated it.
   * @param action - Action/permission to check (e.g., 'page-create', 'user-read')
   * @returns True if the subject may perform the action under current policy
   */
  async permits(subject: PermissionSubject | JobSubject | null | undefined, action: string): Promise<boolean> {
    return (await this.decide(subject, { action })).permit;
  }

  /**
   * Does this NAMED USER hold a permission? (#1173)
   *
   * A different question from {@link permits}, and that is why it has a
   * different name. This one __inspects a user__ — "does bob hold
   * `admin-system`?" — where there is no request, no token, and nothing to cap.
   * `permits` __authorises a request__, so it must be handed the subject the
   * request carries or an agent token's scope ceiling has nothing to read.
   *
   * They shared a name and one of them took a bare string, which is how #1164
   * happened seventeen times. Splitting them means the dangerous question
   * cannot be asked by accident. The subject is the PIP's, resolved live.
   */
  async userHoldsPermission(username: string, action: string): Promise<boolean> {
    if (!username || normalizeUsername(username) === 'anonymous') {
      // The named constant, not a copy of it (#1164); normalized because the
      // constant spells it 'Anonymous' (#1436).
      return this.permits(ANONYMOUS_SUBJECT, action);
    }
    const subject = await this.informationPoint()?.subjectFor(username);
    if (!subject) return false;
    return this.permits(subject, action);
  }

  /**
   * The permissions a user's roles give them, for display (#1431 step 10).
   *
   * The union of their roles' rows in the admin Security Policy Summary, read
   * live from the policies — so the profile page and the admin page can never
   * disagree. A summary for a human, not an authorisation answer: that is
   * always {@link permits} with the subject.
   */
  async getUserPermissions(username: string): Promise<string[]> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!username || normalizeUsername(username) === 'anonymous') {
      return permissionsForRoles(configManager, ['anonymous']);
    }
    const subject = await this.informationPoint()?.subjectFor(username);
    if (!subject) return [];
    return permissionsForRoles(configManager, subject.roles);
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
      const issuerHolds = await this.userHoldsPermission(viaShare.issuer, action);
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
      const pip = this.informationPoint();
      if (!pip) {
        logger.warn('[PDP] PolicyInformationPoint not available to resolve roles, denying');
        return { permit: false, applicable: false, reason: 'no_information_point' };
      }
      userContext = await pip.resolveSubjectNow(subject.username);
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
