import BaseManager from './BaseManager.js';
// #1431: the one declaration of a policy. A local copy with `effect` required
// sat here and drifted from it.
import type { Policy, PolicySubject, PolicyResource, PolicyCondition } from '../types/Policy.js';
import { isAttributeName } from '../types/Policy.js';
import { CONDITION_OPERATORS, GROUP_OPERATORS, LEAF_OPERATORS, MAX_CONDITION_DEPTH, MAX_CONDITION_NODES, MAX_GROUP_CHILDREN, MAX_IN_ITEMS, NOT_OPERATOR, compareLeaf, declaredSubjectAttributes, literalFits, literalType, subjectDeclarationProblem, type DeclaredSubjectAttribute } from '../utils/policyAttributes.js';
import { normalizeUsername } from '../utils/username.js';
import logger from '../utils/logger.js';
import micromatch from 'micromatch';
import { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type PolicyDecisionPoint from '../security/PolicyDecisionPoint.js';
import { pageWritePoliciesToReview } from '../utils/pageWritePolicies.js';
import { categoryStored } from './ValidationManager.js';
import { SENSITIVE_USER_FIELDS } from '../types/User.js';

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
 * missing attribute. Asked only when a matching policy has a condition. A
 * reader may be async (an identity is resolved through IdentityManager), and
 * the evaluator awaits every read.
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- `unknown | Promise<unknown>` is `unknown`; written out so a reader author sees a Promise is allowed
export type AttributeReader = (name: string) => unknown | Promise<unknown>;

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

const SUBJECT_ATTRIBUTES_KEY = 'ngdpbase.access.subject-attributes';

/** The key that holds the operator of a node, or the keys when there is more than one. */
function operatorKeys(node: object): string[] {
  return Object.keys(node).filter((k) => k !== 'attribute');
}

/** The declared type of an attribute a condition names, or `null` when it is not declared. */
function attributeTypeOf(name: string, pageAttributes: Record<string, { type?: string }>, subjectAttributes: Record<string, DeclaredSubjectAttribute>): string | null {
  const [category, ...rest] = name.split(':');
  const attr = rest.join(':');
  if (category === 'subject') return Object.hasOwn(subjectAttributes, attr) ? (subjectAttributes[attr]?.type ?? null) : null;
  if (category === 'resource') return Object.hasOwn(pageAttributes, attr) ? (pageAttributes[attr]?.type ?? 'string') : null;
  return null;
}

/**
 * What is wrong with a policy's condition, one sentence each (#2255, #2261);
 * empty when it is fine. Each sentence says what is wrong, then what to
 * change. A node is a comparison (`attribute` and one operator) or `any-of`,
 * `all-of` or `not` over other conditions, nested at most
 * {@link MAX_CONDITION_DEPTH} deep, at most {@link MAX_CONDITION_NODES} nodes
 * in all, an `in` list of at most {@link MAX_IN_ITEMS} and an `any-of` or
 * `all-of` of at most {@link MAX_GROUP_CHILDREN}. Each attribute a comparison names must be
 * declared: a `subject:<name>` in `ngdpbase.access.subject-attributes`
 * (`id` always, `aal` as shipped), or a `resource:<name>` declared on the `page`
 * resource type. The types of the two sides must agree. A condition with a
 * problem never holds: an allow with it does not apply and a deny with it
 * does, as for a missing attribute.
 */
export function conditionProblems(condition: unknown, pageAttributes: Record<string, { type?: string }>, subjectAttributes: Record<string, DeclaredSubjectAttribute> = declaredSubjectAttributes(null)): string[] {
  if (condition === undefined) return [];
  const typeOf = (name: string): string | null => attributeTypeOf(name, pageAttributes, subjectAttributes);
  // A subject attribute that is declared but cannot be read (a bad `from`, a field that is never readable) is a problem in its own right.
  const declaration = (name: string): string | null =>
    name.startsWith('subject:') && typeOf(name) !== null ? subjectDeclarationProblem(name.slice('subject:'.length), subjectAttributes[name.slice('subject:'.length)], SENSITIVE_USER_FIELDS) : null;
  const undeclared = (name: string): string => {
    const where = name.startsWith('resource:')
      ? 'declare it on the page resource type in ngdpbase.access.resource-types'
      : name.startsWith('subject:')
        ? 'add it to ngdpbase.access.subject-attributes'
        : 'no environment attributes are declared yet';
    return `condition reads '${name}', which is not declared; ${where}`;
  };
  const list = (values: readonly string[]): string => values.join(', ');

  let nodes = 0;
  const walk = (node: unknown, depth: number): string[] => {
    // Past the cap every node answers at once, so a huge tree is not walked.
    if (++nodes > MAX_CONDITION_NODES) return nodes === MAX_CONDITION_NODES + 1 ? [`condition has more than ${MAX_CONDITION_NODES} nodes; split it into several policies`] : [];
    if (!node || typeof node !== 'object' || Array.isArray(node)) return ['condition must be an object; write { "attribute": …, "equals": … } or { "any-of": […] }'];
    if (depth > MAX_CONDITION_DEPTH) return [`conditions are nested ${depth} deep; the limit is ${MAX_CONDITION_DEPTH}; flatten with all-of or any-of`];
    const c = node as Record<string, unknown>;
    const ops = operatorKeys(node);

    if (!('attribute' in c)) {
      const known = ops.filter((k) => (GROUP_OPERATORS as readonly string[]).includes(k) || k === NOT_OPERATOR);
      const stray = ops.filter((k) => !known.includes(k));
      if (stray.length > 0 || known.length === 0) {
        const used = stray.length > 0 ? stray : ops;
        return [`condition uses ${used.length > 0 ? used.map((k) => `'${k}'`).join(', ') : 'no operator'}; use one of ${list(CONDITION_OPERATORS)}`];
      }
      if (known.length > 1) return [`condition has both '${known[0]}' and '${known[1]}'; use one operator per condition, combine with all-of`];
      const op = known[0];
      if (op === NOT_OPERATOR) return walk(c.not, depth + 1);
      const children = c[op];
      if (!Array.isArray(children)) return [`'${op}' must be a list of conditions; write { "${op}": [ … ] }`];
      if (children.length === 0) return [`'${op}' is empty; list at least one condition, or remove the condition`];
      if (children.length > MAX_GROUP_CHILDREN) return [`'${op}' lists ${children.length} conditions; the limit is ${MAX_GROUP_CHILDREN}; split it into several policies`];
      return children.flatMap((child) => walk(child, depth + 1));
    }

    if (!isAttributeName(c.attribute)) return [`condition "attribute" must name an attribute (subject:, resource: or environment:), not ${JSON.stringify(c.attribute)}`];
    const leafOps = ops.filter((k) => Object.hasOwn(LEAF_OPERATORS, k));
    const stray = ops.filter((k) => !leafOps.includes(k));
    if (stray.length > 0) return [`condition uses ${stray.map((k) => `'${k}'`).join(', ')}; use one of ${list(CONDITION_OPERATORS)}`];
    if (leafOps.length === 0) return [`condition on '${c.attribute}' has no operator; use one of ${list(Object.keys(LEAF_OPERATORS))}`];
    if (leafOps.length > 1) return [`condition has both '${leafOps[0]}' and '${leafOps[1]}'; use one operator per condition, combine with all-of`];

    const op = leafOps[0];
    const operand = c[op];
    const leftType = typeOf(c.attribute);
    const problems: string[] = [];
    if (leftType === null) problems.push(undeclared(c.attribute));
    const rightIsAttribute = isAttributeName(operand);
    const rightType = rightIsAttribute ? typeOf(operand) : null;
    if (rightIsAttribute && rightType === null) problems.push(undeclared(operand));
    for (const name of [c.attribute, ...(rightIsAttribute ? [operand] : [])]) {
      const bad = declaration(String(name));
      if (bad && !problems.includes(bad)) problems.push(bad);
    }
    if (problems.length > 0) return problems;
    const left = leftType as string;

    if (!LEAF_OPERATORS[op].left.includes(left as never)) {
      return [`condition applies '${op}' to '${c.attribute}' (${left}); '${op}' works on ${list(LEAF_OPERATORS[op].left)} attributes`];
    }
    const mismatch = (rightLabel: string, rightKind: string): string =>
      `condition compares '${String(c.attribute)}' (${left}) with ${rightLabel} (${rightKind}); both sides must have the same type`;

    if (op === 'in') {
      if (rightIsAttribute) {
        return rightType === 'list' ? [] : [`'in' needs a list; '${String(operand)}' is ${String(rightType)}; use a list attribute or write the values as an array`];
      }
      if (!Array.isArray(operand)) return ['\'in\' must be a list of values or a list attribute; write { "in": [ … ] }'];
      if (operand.length === 0) return ['\'in\' is empty; list at least one value, or remove the condition'];
      if (operand.length > MAX_IN_ITEMS) return [`'in' lists ${operand.length} values; the limit is ${MAX_IN_ITEMS}; use a list attribute or split it into several policies`];
      const items = operand as unknown[];
      const attributeLike = items.find((v) => isAttributeName(v));
      if (attributeLike !== undefined) return [`'in' lists '${String(attributeLike)}', which names an attribute; list literal values only, or use an attribute that is a list`];
      const wrong = items.find((v) => !literalFits(left, v));
      return wrong === undefined ? [] : [mismatch(JSON.stringify(wrong), literalType(wrong) ?? typeof wrong)];
    }
    if (rightIsAttribute) return rightType === left ? [] : [mismatch(`'${String(operand)}'`, String(rightType))];
    return literalFits(left, operand) ? [] : [mismatch(JSON.stringify(operand) ?? String(operand), literalType(operand) ?? typeof operand)];
  };

  return walk(condition, 1);
}

/** Attribute names whose read has thrown, warned about once per process. */
const warnedReads = new Set<string>();

/**
 * The condition as the evaluator runs it, built once per policy (#2261): an
 * `in` list becomes a Set, and a literal compared with an `identity`
 * attribute is normalised as `subject:id` is (trimmed, lower-cased), so
 * "Alice" meets alice. Only for a condition `conditionProblems` passed.
 */
function compileCondition(node: PolicyCondition, typeOf: (name: string) => string | null): PolicyCondition {
  const c = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(c)) {
    const v = c[key];
    if (key === 'attribute') out[key] = v;
    else if (key === 'any-of' || key === 'all-of') out[key] = (v as PolicyCondition[]).map((child) => compileCondition(child, typeOf));
    else if (key === NOT_OPERATOR) out[key] = compileCondition(v as PolicyCondition, typeOf);
    else {
      const identity = typeOf(String(c.attribute)) === 'identity';
      const literal = (x: unknown): unknown => (identity && typeof x === 'string' && !isAttributeName(x) ? normalizeUsername(x) : x);
      out[key] = key === 'in' && Array.isArray(v) ? new Set(v.map(literal)) : literal(v);
    }
  }
  return out as PolicyCondition;
}

/** A policy ready to decide: its condition checked and compiled once, not per page. */
interface PreparedPolicy {
  policy: Policy;
  /** The condition has a problem, so it never holds. */
  invalid: boolean;
  condition?: PolicyCondition;
}

/**
 * Is the condition true, false or unknown (#2255, #2261)? `true` or `false`,
 * or `undefined` when it cannot be told because an attribute it reads is
 * missing; the caller fails closed on that. Each node is judged on its own:
 * a missing attribute makes its leaf unknown, a true branch decides `any-of`,
 * a false branch decides `all-of`, and `not` of unknown is unknown.
 */
export async function conditionHolds(condition: PolicyCondition | undefined, read: AttributeReader | undefined, depth = 1): Promise<boolean | undefined> {
  if (!condition) return true;
  if (depth > MAX_CONDITION_DEPTH) return undefined;
  const node = condition as Record<string, unknown>;

  if ('any-of' in node || 'all-of' in node) {
    const anyOf = 'any-of' in node;
    const children = node[anyOf ? 'any-of' : 'all-of'];
    if (!Array.isArray(children) || children.length === 0) return undefined;
    const decisive = anyOf; // the value that settles the node: true for any-of, false for all-of
    let sawUnknown = false;
    for (const child of children as PolicyCondition[]) {
      const result = await conditionHolds(child, read, depth + 1);
      if (result === decisive) return decisive;
      if (result === undefined) sawUnknown = true;
    }
    return sawUnknown ? undefined : !decisive;
  }
  if ('not' in node) {
    if (!node.not) return undefined;
    const inner = await conditionHolds(node.not as PolicyCondition, read, depth + 1);
    return inner === undefined ? undefined : !inner;
  }

  const operator = Object.keys(node).find((k) => Object.hasOwn(LEAF_OPERATORS, k));
  if (!operator) return undefined;
  const value = async (side: unknown): Promise<unknown> => {
    if (!isAttributeName(side)) return side;
    if (!read) return undefined;
    try {
      return await read(side);
    } catch (err) {
      // A read that throws leaves this comparison unknown, not the decision aborted.
      if (!warnedReads.has(side)) {
        warnedReads.add(side);
        logger.warn(`[POLICY] reading '${side}' for a condition failed, so the comparison is unknown: ${err instanceof Error ? err.message : String(err)}`);
      }
      return undefined;
    }
  };
  return compareLeaf(operator, await value(node.attribute), await value(node[operator]));
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
export const SUBJECT_MATCHERS: Record<string, (value: string | undefined, userContext: UserContext | undefined) => boolean> = {
  /** A subject holding the role. */
  role: (value, userContext) => typeof value === 'string' && (userContext?.roles ?? []).includes(value),
  /**
   * A scheduled job acting as itself, by its id (#1999). The PIP gives a
   * scheduled run's subject `job` only when a policy names the job, and only
   * for the system principal's context.
   */
  job: (value, userContext) => typeof userContext?.job === 'string' && userContext.job === value,
  /**
   * Any signed-in user, whatever their roles (#2261). An agent token is its
   * account, so it counts. Not a job's own subject (`job` is set; a job is
   * not signed in, it matches `anyone` and its `job` policies only), and not
   * a share-link visitor: a share is covered by its own resources, never by a
   * grant to the signed-in (the PDP's share ceiling decides first; this is
   * the second line). Takes no value.
   */
  authenticated: (_value, userContext) => userContext?.isAuthenticated === true && !userContext.viaShare && typeof userContext.job !== 'string',
  /** Every caller: anonymous, a share visitor, a job and an admin too, so a deny for `anyone` refuses admin (#2261). Takes no value. */
  anyone: () => true
};

/**
 * The subject types that take no `value` (#2261), for the validator. A value
 * on one is refused rather than ignored.
 */
export const VALUELESS_SUBJECT_TYPES: readonly string[] = ['authenticated', 'anyone'];

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
    for (const { id, effect, problems } of this.conditionProblemsInForce()) {
      lines.push(...problems.map((p) => `'${id}': ${p}; ${effect === 'deny' ? 'the deny always applies' : 'the policy never applies as an allow'}`));
    }
    const catalogue = config.getProperty('ngdpbase.system-category', {}) as Record<string, { label?: string; storageLocation?: unknown; owner?: unknown }> | null;
    const writable = new Set([...pdp.categoriesGranting('page-edit'), ...pdp.categoriesGranting('pushed-pages-edit')]);
    // An installed add-on's category is declared even while the add-on is off
    // (#1559), and its policies are not; that is the add-on being off, not a gap.
    const addonOff = (owner: unknown): boolean => typeof owner === 'string' && owner !== 'admin'
      && config.getProperty(`ngdpbase.addons.${owner}.enabled`, false) !== true;
    const unwritable = Object.entries(catalogue ?? {})
      .filter(([, entry]) => categoryStored(entry) !== 'none' && !addonOff(entry?.owner))
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
    const result = await this.combine(this.prepare(matching), context.readAttribute);
    logger.info(`[POLICY] ${result.hasDecision ? `${result.allowed ? 'allow' : 'deny'} by ${result.policyIds.join(',')}` : 'No matching policy'}`);
    return result;
  }

  /**
   * Checks and compiles each policy's condition (#2261). `compile()` does it
   * once for a whole listing; a single decision does it for its few matches.
   */
  private prepare(policies: readonly Policy[]): PreparedPolicy[] {
    const conditional = policies.some((p) => p.condition !== undefined);
    const declared = conditional ? this.declaredPageAttributes() : {};
    const subjects = conditional ? this.declaredSubjectAttributes() : {};
    return policies.map((policy) => {
      if (policy.condition === undefined) return { policy, invalid: false };
      if (conditionProblems(policy.condition, declared, subjects).length > 0) return { policy, invalid: true };
      return { policy, invalid: false, condition: compileCondition(policy.condition, (name) => attributeTypeOf(name, declared, subjects)) };
    });
  }

  /**
   * Deny overrides allow, over policies that already match subject, resource
   * and action (#2255). Every matching deny whose condition is true or
   * unknown decides; failing that, every allow whose condition is true.
   */
  private async combine(matching: readonly PreparedPolicy[], read: AttributeReader | undefined): Promise<EvaluationResult> {
    const denies: string[] = [];
    const allows: string[] = [];
    for (const { policy, invalid, condition } of matching) {
      const holds = invalid ? undefined : await conditionHolds(condition, read);
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
    const applicable = this.prepare(this.policies()
      .filter((policy) => this.matchesSubject(policy.subjects, userContext) && actions.some((a) => this.matchesAction(policy.actions, a))));
    logger.debug(`[POLICY] Compiled ${applicable.length} policies for user=${userContext?.username} action=${action}`);
    return (pageName, attributes, readAttribute) =>
      this.combine(applicable.filter(({ policy }) => this.matchesResource(policy.resources, pageName, attributes)), readAttribute);
  }

  /** The attributes declared on the `page` resource type (#2255), for checking a condition. */
  declaredPageAttributes(): Record<string, { type?: string }> {
    const types = this.configManager?.getProperty(RESOURCE_TYPES_KEY, null) as Record<string, { attributes?: Record<string, { type?: string }> }> | null;
    const attributes = types?.page?.attributes;
    return attributes && typeof attributes === 'object' ? attributes : {};
  }

  /** The subject attributes a condition may read (#2261): `id` always, and those declared in `ngdpbase.access.subject-attributes`. */
  declaredSubjectAttributes(): Record<string, DeclaredSubjectAttribute> {
    return declaredSubjectAttributes(this.configManager?.getProperty(SUBJECT_ATTRIBUTES_KEY, null));
  }

  /** Each policy in force whose condition has a problem, with the problems (#2255): for the boot warning. */
  conditionProblemsInForce(): Array<{ id: string; effect: Policy['effect']; problems: string[] }> {
    const declared = this.declaredPageAttributes();
    const subjects = this.declaredSubjectAttributes();
    return this.policies()
      .map((p) => ({ id: p.id, effect: p.effect, problems: conditionProblems(p.condition, declared, subjects) }))
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
