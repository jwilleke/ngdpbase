import BaseManager from './BaseManager.js';
// #1431: the one declaration of a policy. A local copy with `effect` required
// sat here and drifted from it.
import type { Policy, PolicySubject, PolicyResource, PolicyCondition } from '../types/Policy.js';
import { isAttributeName } from '../types/Policy.js';
import logger from '../utils/logger.js';
import micromatch from 'micromatch';
import { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type PolicyDecisionPoint from '../security/PolicyDecisionPoint.js';
import { pageWritePoliciesToReview } from '../utils/pageWritePolicies.js';
import { categoryStored } from './ValidationManager.js';

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
/**
 * What the request knows about the resource beyond its name, supplied by the
 * PIP (#1504): today a page's `system-category`.
 */
export type ResourceAttributes = Record<string, unknown>;

/**
 * Reads one attribute a condition names, `subject:id` or `resource:owner`
 * (#2255). Supplied by the PDP from the PIP; `undefined` or `null` is a
 * missing attribute. Asked only when a matching policy has a condition.
 */
export type AttributeReader = (name: string) => unknown;

/**
 * Access evaluation context
 */
interface AccessContext {
  pageName: string;
  /**
   * The action asked. `actions` widens it: a policy granting any of them
   * matches (#2255: a page write is `page-edit` or `pushed-pages-edit`).
   */
  action: string;
  actions?: readonly string[];
  userContext?: UserContext;
  attributes?: ResourceAttributes;
  /** For a policy's `condition`; without one every condition is unknown. */
  readAttribute?: AttributeReader;
}

/** The subject attributes a condition may read before subject attributes are declared in config (#2261). */
const BUILT_IN_SUBJECT_ATTRIBUTES: Readonly<Record<string, string>> = { id: 'identity' };

/**
 * What is wrong with a policy's condition, one sentence each (#2255); empty
 * when it is fine. `equals` is the only operator. Each side that names an
 * attribute must be one that exists: `subject:id`, or a `resource:<name>`
 * declared on the `page` resource type. Two attributes must have the same
 * type. A condition with a problem never holds: an allow with it does not
 * apply and a deny with it does, as for a missing attribute.
 */
export function conditionProblems(condition: unknown, pageAttributes: Record<string, { type?: string }>): string[] {
  if (condition === undefined) return [];
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return ['condition must be an object: { "attribute": …, "equals": … }'];
  const keys = Object.keys(condition);
  const unknown = keys.filter((k) => k !== 'attribute' && k !== 'equals');
  if (unknown.length > 0) return [`condition uses ${unknown.map((k) => `'${k}'`).join(', ')}; only "attribute" and "equals" are supported (more operators are #2261)`];
  const c = condition as { attribute?: unknown; equals?: unknown };
  if (!isAttributeName(c.attribute)) return [`condition "attribute" must name an attribute (subject:, resource: or environment:), not ${JSON.stringify(c.attribute)}`];
  if (!('equals' in c)) return ['condition has no "equals"'];
  const typeOf = (name: string): string | null => {
    const [category, ...rest] = name.split(':');
    const attr = rest.join(':');
    if (category === 'subject') return Object.hasOwn(BUILT_IN_SUBJECT_ATTRIBUTES, attr) ? BUILT_IN_SUBJECT_ATTRIBUTES[attr] : null;
    if (category === 'resource') return Object.hasOwn(pageAttributes, attr) ? (pageAttributes[attr]?.type ?? 'string') : null;
    return null;
  };
  const problems: string[] = [];
  const sides = [c.attribute, ...(isAttributeName(c.equals) ? [c.equals] : [])];
  for (const side of sides) {
    if (typeOf(side) === null) problems.push(`condition reads '${side}', which is not declared (resource attributes are declared on the page resource type in ngdpbase.access.resource-types; subject:id is the only subject attribute so far)`);
  }
  if (problems.length === 0 && sides.length === 2 && typeOf(sides[0]) !== typeOf(sides[1])) {
    problems.push(`condition compares '${sides[0]}' (${typeOf(sides[0])}) with '${sides[1]}' (${typeOf(sides[1])}); both sides must have the same type`);
  }
  return problems;
}

/**
 * Does the condition hold (#2255)? `true` or `false`, or `undefined` when an
 * attribute it reads is missing: unknown, which the caller fails closed on.
 */
export async function conditionHolds(condition: PolicyCondition | undefined, read: AttributeReader | undefined): Promise<boolean | undefined> {
  if (!condition) return true;
  const value = async (side: unknown): Promise<unknown> => (isAttributeName(side) ? (read ? await read(side) : undefined) : side);
  const left = await value(condition.attribute);
  const right = await value(condition.equals);
  if (left === undefined || left === null || right === undefined || right === null) return undefined;
  return left === right;
}

/**
 * How each policy resource type matches (#1504). The TYPES are declared in
 * configuration, `ngdpbase.access.resource-types`, and read through
 * ConfigurationManager; how a type matches is code, one matcher per type. A
 * type that is not declared, or that has no matcher here, never matches — a
 * policy naming it decides nothing (docs/access-policies.md).
 */
export const RESOURCE_MATCHERS: Record<string, (pattern: string, pageName: string, attributes?: ResourceAttributes) => boolean> = {
  /** A page by its name (glob). */
  page: (pattern, pageName) => micromatch.isMatch(pageName, pattern),
  /** A page by its `system-category` frontmatter (glob). */
  'system-category': (pattern, _pageName, attributes) => {
    const category = attributes?.['system-category'];
    return typeof category === 'string' && micromatch.isMatch(category, pattern);
  },
  /**
   * A page or file in a private vault, by the vault id (#1539). The PIP
   * supplies `vault` only for vault content, so a capability check (no
   * resource) never matches — a vault grant cannot leak site-wide.
   */
  vault: (pattern, _pageName, attributes) => {
    const vault = attributes?.vault;
    return typeof vault === 'string' && micromatch.isMatch(vault, pattern);
  },
  /**
   * A shared folder, as `shared/{name}` (#2125). Supplied only when a folder
   * is asked about (`permitsInSharedFolder`), so a capability check never
   * matches: a folder grant cannot leak site-wide.
   */
  'shared-folder': (pattern, _pageName, attributes) => {
    const folder = attributes?.['shared-folder'];
    return typeof folder === 'string' && micromatch.isMatch(folder, pattern);
  }
};

/**
 * How each policy subject type matches (#1999), one matcher per type. These
 * are the only subject types a decision matches, and the only ones
 * PolicyValidator accepts: a type with no matcher here would be a policy that
 * grants nothing.
 */
export const SUBJECT_MATCHERS: Record<string, (value: string, userContext: UserContext | undefined) => boolean> = {
  /** A subject holding the role. */
  role: (value, userContext) => (userContext?.roles ?? []).includes(value),
  /**
   * A scheduled job acting as itself, by its id (#1999). The PIP gives a
   * scheduled run's subject `job` only when a policy names the job, and only
   * for the system principal's context.
   */
  job: (value, userContext) => typeof userContext?.job === 'string' && userContext.job === value
};

const RESOURCE_TYPES_KEY = 'ngdpbase.access.resource-types';

/**
 * The resource types configuration declares (#1504), for the evaluator and the
 * validator alike. When the key is not set at all — a configuration older than
 * it — the matchers' own types apply, so an older site keeps deciding as it
 * did; PolicyEvaluator.initialize() warns.
 */
export function declaredResourceTypes(getProperty: (key: string, defaultValue: unknown) => unknown): Set<string> {
  const declared = getProperty(RESOURCE_TYPES_KEY, null);
  return new Set(declared && typeof declared === 'object' ? Object.keys(declared) : Object.keys(RESOURCE_MATCHERS));
}

/**
 * Access evaluation result
 */
interface EvaluationResult {
  hasDecision: boolean;
  allowed: boolean;
  reason: string;
  policyName: string | null;
  /** The deciding policies' ids (#2255): the denies that matched, else the allows. Empty when none matched. */
  policyIds: string[];
}

const NO_POLICY: EvaluationResult = { hasDecision: false, allowed: false, reason: 'No matching policy', policyName: null, policyIds: [] };

/**
 * PolicyEvaluator - Evaluates access policies against a given context.
 *
 * PolicyEvaluator mimics how JSPWiki uses Java's built-in security framework
 * (java.security) to load and evaluate security policies from a policy file.
 * Among the policies that match, a deny overrides any allow whatever its
 * priority, and no match is a deny (#2255). Each decision names the policies
 * that decided it.
 *
 * @class PolicyEvaluator
 * @extends BaseManager
 *
 * @property {ConfigurationManager | null} configManager - Where the policies are read, live (#1431)
 *
 * @see {@link BaseManager} for base functionality
 * @see {@link PolicyDecisionPoint.policies} for how the policies are read
 * @see {@link PolicyInformationPoint} for access control integration
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
  private configManager: ConfigurationManager | null = null;

  /**
   * The policies in force NOW. Only the PDP interprets them (#1431 step 14b);
   * this evaluator is the PDP's matching engine and asks it for the list, read
   * live — PolicyManager used to hand back a copy taken at boot, so a policy
   * edited in /admin/configuration was not enforced until a restart.
   */
  private policies(): Policy[] {
    return this.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint')?.policies() ?? [];
  }

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
   * Initializes the PolicyEvaluator by getting its reference to ConfigurationManager
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If ConfigurationManager is not available
   *
   * @example
   * await evaluator.initialize();
   * console.log('Policy evaluator ready');
   */
  async initialize(): Promise<void> {
    this.configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager') ?? null;
    if (!this.configManager) {
      throw new Error('PolicyEvaluator requires ConfigurationManager to be initialized.');
    }
    // #1504: say when the declared resource types and the matchers disagree.
    const declared = this.configManager.getProperty(RESOURCE_TYPES_KEY, null) as Record<string, unknown> | null;
    if (!declared || typeof declared !== 'object') {
      logger.warn(`[POLICY] ${RESOURCE_TYPES_KEY} is not set; policies use the evaluator's own resource types (${Object.keys(RESOURCE_MATCHERS).join(', ')})`);
    } else {
      for (const type of Object.keys(declared)) {
        if (!RESOURCE_MATCHERS[type]) logger.warn(`[POLICY] resource type '${type}' is declared but nothing matches it; a policy naming it never matches`);
      }
      for (const type of Object.keys(RESOURCE_MATCHERS)) {
        if (!(type in declared)) logger.warn(`[POLICY] resource type '${type}' is not declared in ${RESOURCE_TYPES_KEY}; a policy naming it never matches`);
      }
    }
    this.reportPageWritePolicies();
    logger.info('📋 PolicyEvaluator initialized');
  }

  /**
   * Say at boot what an administrator should look at in the policies after
   * #2255, one warning each, and one needs-attention entry for them all:
   * stored policies the upgrade rewrote, policies it left that now decide
   * differently (a deny) or reach pushed pages, conditions that never hold,
   * and stored categories no policy lets anyone change (their pages are
   * changed by nobody, admin included).
   */
  private reportPageWritePolicies(): void {
    const config = this.configManager;
    const pdp = this.engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint');
    if (!config || !pdp) return;
    const lines: string[] = [...((config as { pageWritePolicyMigration?: string[] }).pageWritePolicyMigration ?? [])];
    lines.push(...pageWritePoliciesToReview(this.policies()));
    for (const { id, problems } of this.conditionProblemsInForce()) {
      lines.push(...problems.map((p) => `'${id}': ${p}; the policy never applies as an allow`));
    }
    const catalogue = config.getProperty('ngdpbase.system-category', {}) as Record<string, { label?: string; storageLocation?: unknown }> | null;
    const writable = new Set([...pdp.categoriesGranting('page-edit'), ...pdp.categoriesGranting('pushed-pages-edit')]);
    const unwritable = Object.entries(catalogue ?? {})
      .filter(([, entry]) => categoryStored(entry) !== 'none')
      .map(([key, entry]) => (typeof entry?.label === 'string' && entry.label ? entry.label : key).toLowerCase())
      .filter((category) => !writable.has(category));
    if (unwritable.length > 0) {
      lines.push(`no policy grants page-edit or pushed-pages-edit on system-category ${unwritable.join(', ')}, so nobody can change those pages, admin included; add a policy on the system-category resource type (#2255)`);
    }
    if (lines.length === 0) return;
    for (const line of lines) logger.warn(`[POLICY] ${line}`);
    this.markNeedsAttention(`Access policies need review after the #2255 upgrade (${lines.length}): ${lines.join('; ')}. See the start-up log and docs/access-policies.md.`, 'ngdpbase.access.policies');
  }

  /**
   * Evaluates all relevant policies to make an access decision (#2255).
   *
   * Deny overrides allow: if any matching deny applies, the answer is deny,
   * whatever the priorities; otherwise any matching allow permits; otherwise
   * no policy decided. A policy with a `condition` applies only when it holds;
   * an unknown condition (a missing attribute) keeps an allow from applying
   * and lets a deny apply, so a missing attribute fails closed.
   */
  async evaluateAccess(context: AccessContext): Promise<EvaluationResult> {
    const { pageName, action, userContext } = context || {};
    const roles = (userContext?.roles || []).join('|');
    logger.info(`[POLICY] Evaluate page=${pageName} action=${action} user=${userContext?.username} roles=${roles}`);

    if (!this.configManager) {
      return { ...NO_POLICY, reason: 'PolicyEvaluator not initialized' };
    }

    const matching = this.policies().filter((policy) => this.matches(policy, context));
    const result = await this.combine(matching, context.readAttribute);
    logger.info(`[POLICY] ${result.hasDecision ? `${result.allowed ? 'allow' : 'deny'} by ${result.policyIds.join(',')}` : 'No matching policy'}`);
    return result;
  }

  /**
   * Deny overrides allow, over policies that already match subject, resource
   * and action (#2255). Every matching deny whose condition is true or
   * unknown decides; failing that, every allow whose condition is true.
   */
  private async combine(matching: readonly Policy[], read: AttributeReader | undefined): Promise<EvaluationResult> {
    const denies: string[] = [];
    const allows: string[] = [];
    const pageAttributes = matching.some((p) => p.condition !== undefined) ? this.declaredPageAttributes() : {};
    for (const policy of matching) {
      const holds = conditionProblems(policy.condition, pageAttributes).length > 0
        ? undefined
        : await conditionHolds(policy.condition, read);
      if (policy.effect === 'deny') {
        if (holds !== false) denies.push(policy.id);
      } else if (holds === true) {
        allows.push(policy.id);
      }
    }
    if (denies.length > 0) return { hasDecision: true, allowed: false, reason: `Policy deny: ${denies.join(',')}`, policyName: denies[0], policyIds: denies };
    if (allows.length > 0) return { hasDecision: true, allowed: true, reason: `Policy allow: ${allows.join(',')}`, policyName: allows[0], policyIds: allows };
    return NO_POLICY;
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
    const resourceMatch = this.matchesResource(policy.resources, context.pageName, context.attributes);
    const actionMatch = (context.actions ?? [context.action]).some((a) => this.matchesAction(policy.actions, a));

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

    // #1429: the `All` special case is gone. `All` was a role nobody was ever
    // granted — injected into every subject at construction so that a policy
    // naming it would match — which put a grant outside the role catalogue and
    // outside the admin matrix. Every shipped role now grants `page-read` in
    // its own policy, and an unauthenticated caller carries the `anonymous`
    // role, which is a real role with real grants. A deployment whose OWN
    // policies name `All` must name the roles it means instead.

    // A match when AT LEAST ONE subject matches: a role the user holds, or
    // (#1999) the job a scheduled run acts as. A subject with no roles and no
    // job matches no policy that names subjects; any other type matches nobody.
    for (const subject of policySubjects) {
      // Own keys only: `constructor` or `toString` as a type must match nobody.
      const matcher = Object.hasOwn(SUBJECT_MATCHERS, subject.type) ? SUBJECT_MATCHERS[subject.type] : undefined;
      if (matcher && matcher(subject.value, userContext)) {
        return true; // Match found!
      }
    }

    return false; // No subject matched.
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
   * once; the predicate matches resources only and combines them exactly as
   * `evaluateAccess` does (deny overrides allow, #2255), so a list and a
   * single decision agree. No log line per call: a listing asks this ~18k
   * times, and the INFO line `evaluateAccess` writes is right for one
   * decision and wrong for a filter.
   */
  compile(
    userContext: UserContext | undefined,
    action: string,
    actions: readonly string[] = [action]
  ): (pageName: string, attributes?: ResourceAttributes, readAttribute?: AttributeReader) => Promise<EvaluationResult> {
    if (!this.configManager) {
      return () => Promise.resolve({ ...NO_POLICY, reason: 'PolicyEvaluator not initialized' });
    }
    const applicable = this.policies()
      .filter((policy) => this.matchesSubject(policy.subjects, userContext) && actions.some((a) => this.matchesAction(policy.actions, a)));
    logger.debug(`[POLICY] Compiled ${applicable.length} policies for user=${userContext?.username} action=${action}`);
    return (pageName, attributes, readAttribute) =>
      this.combine(applicable.filter((policy) => this.matchesResource(policy.resources, pageName, attributes)), readAttribute);
  }

  /** The attributes declared on the `page` resource type (#2255), for checking a condition. */
  declaredPageAttributes(): Record<string, { type?: string }> {
    const types = this.configManager?.getProperty(RESOURCE_TYPES_KEY, null) as Record<string, { attributes?: Record<string, { type?: string }> }> | null;
    const attributes = types?.page?.attributes;
    return attributes && typeof attributes === 'object' ? attributes : {};
  }

  /** Each policy in force whose condition has a problem, with the problems (#2255): for the boot warning. */
  conditionProblemsInForce(): Array<{ id: string; problems: string[] }> {
    const declared = this.declaredPageAttributes();
    return this.policies()
      .map((p) => ({ id: p.id, problems: conditionProblems(p.condition, declared) }))
      .filter((r) => r.problems.length > 0);
  }

  matchesResource(resources: PolicyResource[] | undefined, pageName: string, attributes?: ResourceAttributes): boolean {
    if (!resources || resources.length === 0) {
      return true; // No resources specified means it applies to all.
    }
    const declared = this.configManager
      ? declaredResourceTypes((key, def) => this.configManager!.getProperty(key, def))
      : new Set(Object.keys(RESOURCE_MATCHERS));
    for (const resource of resources) {
      const matcher = declared.has(resource.type) ? RESOURCE_MATCHERS[resource.type] : undefined;
      if (matcher && matcher(resource.pattern, pageName, attributes)) {
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
