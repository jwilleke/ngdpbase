import BaseManager from './BaseManager.js';
import logger from '../utils/logger.js';
import micromatch from 'micromatch';
import { WikiEngine } from '../types/WikiEngine.js';
import type PolicyManager from './PolicyManager.js';

/**
 * User context for policy evaluation
 */
interface UserContext {
  username?: string;
  roles?: string[];
  [key: string]: unknown;
}

/**
 * Policy subject definition
 */
interface PolicySubject {
  type: string;
  value: string;
}

/**
 * Policy resource definition
 */
interface PolicyResource {
  type: string;
  pattern: string;
}

/**
 * Policy definition for evaluation
 */
interface Policy {
  id: string;
  effect: string;
  subjects?: PolicySubject[];
  resources?: PolicyResource[];
  actions?: string[];
  priority?: number;
}

/**
 * Access evaluation context
 */
interface AccessContext {
  pageName: string;
  action: string;
  userContext?: UserContext;
}

/**
 * Access evaluation result
 */
interface EvaluationResult {
  hasDecision: boolean;
  allowed: boolean;
  reason: string;
  policyName: string | null;
}

/**
 * PolicyEvaluator - Evaluates access policies against a given context.
 *
 * PolicyEvaluator mimics how JSPWiki uses Java's built-in security framework
 * (java.security) to load and evaluate security policies from a policy file.
 * It evaluates policies in priority order and returns the first matching policy's
 * decision.
 *
 * @class PolicyEvaluator
 * @extends BaseManager
 *
 * @property {PolicyManager | null} policyManager - Reference to PolicyManager
 *
 * @see {@link BaseManager} for base functionality
 * @see {@link PolicyManager} for policy storage
 * @see {@link ACLManager} for access control integration
 *
 * @example
 * const evaluator = engine.getManager('PolicyEvaluator');
 * const result = await evaluator.evaluateAccess({
 *   pageName: 'Main',
 *   action: 'page:read',
 *   userContext: { username: 'admin', roles: ['admin'] }
 * });
 * if (result.allowed) console.log('Access granted');
 */
class PolicyEvaluator extends BaseManager {
  private policyManager: PolicyManager | null = null;

  /**
   * Creates a new PolicyEvaluator instance
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   */
  constructor(engine: WikiEngine) {
    super(engine);
  }

  /**
   * Initializes the PolicyEvaluator by getting reference to PolicyManager
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If PolicyManager is not available
   *
   * @example
   * await evaluator.initialize();
   * console.log('Policy evaluator ready');
   */
  async initialize(): Promise<void> {
    this.policyManager = this.engine.getManager('PolicyManager') ?? null;
    if (!this.policyManager) {
      throw new Error('PolicyEvaluator requires PolicyManager to be initialized.');
    }
    logger.info('📋 PolicyEvaluator initialized');
  }

  /**
   * Evaluates all relevant policies to make an access decision.
   *
   * Policies are evaluated in priority order (highest first). The first matching
   * policy determines the access decision. If no policies match, access is denied.
   *
   * @async
   * @param {AccessContext} context - The context of the access request
   * @returns {Promise<EvaluationResult>} Evaluation result with decision and reason
   *
   * @example
   * const result = await evaluator.evaluateAccess({
   *   pageName: 'AdminPanel',
   *   action: 'page:edit',
   *   userContext: { username: 'user', roles: ['editor'] }
   * });
   * console.log('Allowed:', result.allowed, 'Reason:', result.reason);
   */
  async evaluateAccess(context: AccessContext): Promise<EvaluationResult> {
    const { pageName, action, userContext } = context || {};
    const roles = (userContext?.roles || []).join('|');
    logger.info(`[POLICY] Evaluate page=${pageName} action=${action} user=${userContext?.username} roles=${roles}`);

    if (!this.policyManager) {
      return { hasDecision: false, allowed: false, reason: 'PolicyManager not initialized', policyName: null };
    }

    // PolicyManager returns Policy[] with different interface - use unknown cast
    const policies = this.policyManager.getAllPolicies() as unknown as Policy[];
    for (const policy of policies) {
      const match = this.matches(policy, context);
      logger.info(`[POLICY] Check policy=${policy.id} effect=${policy.effect} match=${match}`);
      if (match) {
        return { hasDecision: true, allowed: policy.effect === 'allow', reason: `Policy match: ${policy.id}`, policyName: policy.id };
      }
    }
    logger.info('[POLICY] No matching policy');
    return { hasDecision: false, allowed: false, reason: 'No matching policy', policyName: null };
  }

  /**
   * Checks if a single policy matches the given context.
   *
   * A policy matches if ALL of the following conditions are true:
   * - Subject matches (user has required role)
   * - Resource matches (page name matches pattern)
   * - Action matches (action is in policy's action list)
   *
   * @param {Policy} policy - The policy to check
   * @param {AccessContext} context - The access request context
   * @returns {boolean} True if the policy matches, false otherwise
   *
   * @example
   * const matches = evaluator.matches(policy, context);
   * if (matches) console.log('Policy applies to this request');
   */
  matches(policy: Policy, context: AccessContext): boolean {
    const subjectMatch = this.matchesSubject(policy.subjects, context.userContext);
    const resourceMatch = this.matchesResource(policy.resources, context.pageName);
    const actionMatch = this.matchesAction(policy.actions, context.action);

    return subjectMatch && resourceMatch && actionMatch;
  }

  /**
   * Check if the user context's roles match the policy's subject requirements.
   *
   * A user matches if:
   * - No subjects specified (applies to everyone), OR
   * - Policy includes "All" role (applies to everyone), OR
   * - User has at least one role matching a policy subject
   *
   * @param {PolicySubject[] | undefined} policySubjects - The subjects array from the policy
   * @param {UserContext | undefined} userContext - The user's context
   * @returns {boolean} True if the user matches the policy subjects
   *
   * @example
   * const matches = evaluator.matchesSubject(
   *   [{ type: 'role', value: 'admin' }],
   *   { username: 'user', roles: ['admin', 'editor'] }
   * );
   * // matches === true
   */
  matchesSubject(policySubjects: PolicySubject[] | undefined, userContext: UserContext | undefined): boolean {
    if (!policySubjects || policySubjects.length === 0) {
      return true; // A policy with no subjects applies to everyone.
    }

    const userRoles = new Set(userContext?.roles || []);

    // Check if policy requires "All" role - this matches everyone including anonymous
    for (const subject of policySubjects) {
      if (subject.type === 'role' && subject.value === 'All') {
        return true; // "All" matches any user
      }
    }

    // If user has no roles, they cannot match policies requiring specific roles
    if (userRoles.size === 0) {
      return false;
    }

    // The user is a match if they have AT LEAST ONE of the roles specified in the policy's subjects
    for (const subject of policySubjects) {
      if (subject.type === 'role' && userRoles.has(subject.value)) {
        return true; // Match found!
      }
    }

    return false; // No matching role was found in the user's context.
  }

  /**
   * Checks if the resource matches the policy's resources.
   *
   * Uses glob pattern matching (via micromatch) to check if the page name
   * matches any of the policy's resource patterns.
   *
   * @param {PolicyResource[] | undefined} resources - The resources array from the policy
   * @param {string} pageName - The name of the page being accessed
   * @returns {boolean} True if a resource matches the page
   *
   * @example
   * const matches = evaluator.matchesResource(
   *   [{ type: 'page', pattern: 'Admin*' }],
   *   'AdminPanel'
   * );
   * // matches === true
   */
  /**
   * `evaluateAccess` with the subject and the action fixed (#1219) — rule 10's
   * `filter` shape, compiled once and applied to many resources.
   *
   * Policies that cannot match this subject or this action are dropped here,
   * once; the predicate matches resources only, in the same order as
   * `evaluateAccess` so first-match-wins gives the same answer. No log line
   * per call: a listing asks this ~18k times, and the per-policy INFO line
   * `evaluateAccess` writes is right for one decision and wrong for a filter.
   */
  compile(userContext: UserContext | undefined, action: string): (pageName: string) => EvaluationResult {
    if (!this.policyManager) {
      return () => ({ hasDecision: false, allowed: false, reason: 'PolicyManager not initialized', policyName: null });
    }
    const applicable = (this.policyManager.getAllPolicies() as unknown as Policy[])
      .filter((policy) => this.matchesSubject(policy.subjects, userContext) && this.matchesAction(policy.actions, action));
    logger.debug(`[POLICY] Compiled ${applicable.length} policies for user=${userContext?.username} action=${action}`);
    return (pageName: string): EvaluationResult => {
      for (const policy of applicable) {
        if (this.matchesResource(policy.resources, pageName)) {
          return { hasDecision: true, allowed: policy.effect === 'allow', reason: `Policy match: ${policy.id}`, policyName: policy.id };
        }
      }
      return { hasDecision: false, allowed: false, reason: 'No matching policy', policyName: null };
    };
  }

  matchesResource(resources: PolicyResource[] | undefined, pageName: string): boolean {
    if (!resources || resources.length === 0) {
      return true; // No resources specified means it applies to all.
    }
    for (const resource of resources) {
      if (resource.type === 'page' && micromatch.isMatch(pageName, resource.pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if the action matches the policy's actions.
   *
   * An action matches if:
   * - No actions specified (applies to all actions), OR
   * - Action is in the policy's action list, OR
   * - Policy includes wildcard '*' (matches all actions)
   *
   * @param {string[] | undefined} actions - The actions array from the policy
   * @param {string} action - The action being performed
   * @returns {boolean} True if the action is in the policy's list
   *
   * @example
   * const matches = evaluator.matchesAction(
   *   ['page:read', 'page:edit'],
   *   'page:read'
   * );
   * // matches === true
   */
  matchesAction(actions: string[] | undefined, action: string): boolean {
    if (!actions || actions.length === 0) {
      return true; // No actions specified means it applies to all.
    }
    return actions.includes(action) || actions.includes('*');
  }
}

export default PolicyEvaluator;
