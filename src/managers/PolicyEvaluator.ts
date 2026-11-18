import BaseManager, { type ManagerStatus } from './BaseManager.js';
// #1431: the one declaration of a policy. A local copy with `effect` required
// sat here and drifted from it.
import type { Policy, PolicySubject, PolicyResource, PolicyCondition } from '../types/Policy.js';
import { isAttributeName } from '../types/Policy.js';
import { readDeclaredAsWritten, COMPARISON_FUNCTIONS, CONDITION_EXAMPLE, CONDITION_FUNCTIONS, DATATYPES, GROUP_FUNCTIONS, LEGACY_CONDITION_KEYS, MAX_CONDITION_DEPTH, MAX_CONDITION_NODES, MAX_GROUP_CHILDREN, MAX_IN_ITEMS, NOT_FUNCTION, OPERAND_KEYS, RULE_COMBINING_ALGORITHM_KEY, combiningAlgorithmProblem, compareLeaf, datatypeOf, ATTRIBUTE_RESOURCE_TYPES, attributesForResourceTypes, declaredAttributes, declaredEnvironmentAttributes, declaredSubjectAttributes, environmentAttributesFindings, environmentDeclarationProblem, literalFits, literalType, subjectAttributesFindings, subjectDeclarationProblem, unenforcedConditionsLine, unenforcedConditionsNotice, type DeclaredEnvironmentAttribute, type DeclaredSubjectAttribute, type ResourceTypeDeclarations } from '../utils/policyAttributes.js';
import { SCHEDULES_KEY, TIME_ZONE_KEY, scheduleIsEnabled, scheduleProblem, type Schedule } from '../utils/availability.js';
import { normalizeUsername } from '../utils/username.js';
import logger from '../utils/logger.js';
import micromatch from 'micromatch';
import { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type PolicyDecisionPoint from '../security/PolicyDecisionPoint.js';
import { CHECKED_DENIES_KEY, DENY_CHECKED_ACTION, pageWritePolicyFindings, policyFingerprint } from '../utils/pageWritePolicies.js';
import type { ActorContext } from '../context/ActorContext.js';
import { SENSITIVE_USER_FIELDS } from '../types/User.js';
import { systemContext } from '../context/bootActions.js';
import { ownerDeclarationProblem } from '../security/ownedRecords.js';

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
const ENVIRONMENT_ATTRIBUTES_KEY = 'ngdpbase.access.environment-attributes';

/** The declared type of an attribute a condition names, or `null` when it is not declared. */
function attributeTypeOf(name: string, pageAttributes: Record<string, { type?: string }>, subjectAttributes: Record<string, DeclaredSubjectAttribute>, environmentAttributes: Record<string, DeclaredEnvironmentAttribute> = {}): string | null {
  const [category, ...rest] = name.split(':');
  const attr = rest.join(':');
  if (category === 'subject') return Object.hasOwn(subjectAttributes, attr) ? (subjectAttributes[attr]?.type ?? null) : null;
  if (category === 'environment') return Object.hasOwn(environmentAttributes, attr) ? (environmentAttributes[attr]?.type ?? null) : null;
  if (category === 'resource') return Object.hasOwn(pageAttributes, attr) ? (pageAttributes[attr]?.type ?? 'string') : null;
  return null;
}

/** The attribute each argument names, or `null` for a literal or anything that is not an attribute. */
function attributeIds(args: unknown[]): Array<string | null> {
  return args.map((x) => {
    const id = x && typeof x === 'object' ? (x as { attributeid?: unknown }).attributeid : undefined;
    return isAttributeName(id) ? String(id) : null;
  });
}

/**
 * What is wrong with a policy's condition, one sentence each (#2255, #2261,
 * #2330); empty when it is fine. Each sentence says what is wrong, then what to
 * change. A node is one XACML function in lowercase: a comparison such as
 * `string-equal` over two arguments, or `and`, `or` or `not` over other
 * conditions, nested at most {@link MAX_CONDITION_DEPTH} deep, at most
 * {@link MAX_CONDITION_NODES} function nodes in all, an `is-in` list of at most
 * {@link MAX_IN_ITEMS} and an `and` or `or` of at most {@link MAX_GROUP_CHILDREN}.
 * An argument is an attribute (`attributeid`, `datatype`) or a literal (`value`,
 * `datatype`); `datatype` is required, must be the type the attribute is declared with
 * and the type the function takes. Each attribute must be declared: a
 * `subject:<name>` in `ngdpbase.access.subject-attributes` (`id` always, `aal`
 * as shipped), or a `resource:<name>` declared on the resource type the policy names (the
 * `page` type when it names a page, or that add-on's type when it names only
 * that type, #1823), or an `environment:<name>` in `ngdpbase.access.environment-attributes`. The old
 * shape (`attribute` with `equals` and the like) is a problem that shows the
 * new one. A condition with a problem never holds: an allow with it does not
 * apply and a deny with it does, as for a missing attribute.
 */
export function conditionProblems(condition: unknown, pageAttributes: Record<string, { type?: string }>, subjectAttributes: Record<string, DeclaredSubjectAttribute> = declaredSubjectAttributes(null), environmentAttributes: Record<string, DeclaredEnvironmentAttribute> = {}, resourceTypeLabel = 'page'): string[] {
  if (condition === undefined) return [];
  const typeOf = (name: string): string | null => attributeTypeOf(name, pageAttributes, subjectAttributes, environmentAttributes);
  // A subject attribute that is declared but cannot be read (a bad `from`, a field that is never readable) is a problem in its own right.
  const declaration = (name: string): string | null => {
    if (typeOf(name) === null) return null;
    if (name.startsWith('subject:')) return subjectDeclarationProblem(name.slice('subject:'.length), subjectAttributes[name.slice('subject:'.length)], SENSITIVE_USER_FIELDS);
    if (name.startsWith('environment:')) return environmentDeclarationProblem(name.slice('environment:'.length), environmentAttributes[name.slice('environment:'.length)]);
    return null;
  };
  const undeclared = (name: string): string => {
    const where = name.startsWith('resource:')
      ? `declare it on the ${resourceTypeLabel} resource type in ngdpbase.access.resource-types`
      : name.startsWith('subject:')
        ? 'add it to ngdpbase.access.subject-attributes'
        : 'add it to ngdpbase.access.environment-attributes';
    return `condition reads '${name}', which is not declared; ${where}`;
  };
  const list = (values: readonly string[]): string => values.join(', ');

  /** The problems in one argument of the comparison `fn`; `position` 0 is the first, and the bag of an `is-in` is the second. */
  const operandProblems = (fn: string, position: number, arg: unknown): string[] => {
    const spec = COMPARISON_FUNCTIONS[fn];
    const bag = spec.kind === 'is-in' && position === 1;
    if (!arg || typeof arg !== 'object' || Array.isArray(arg)) return [`'${fn}' argument ${position + 1} must be { "attributeid": …, "datatype": … } or { "value": …, "datatype": … }`];
    const a = arg as Record<string, unknown>;
    const stray = Object.keys(a).filter((k) => !(OPERAND_KEYS as readonly string[]).includes(k));
    if (stray.length > 0) return [`'${fn}' argument ${position + 1} has ${stray.map((k) => `'${k}'`).join(', ')}; an argument has only ${list(OPERAND_KEYS)}`];
    const isAttribute = 'attributeid' in a;
    if (isAttribute && 'value' in a) return [`'${fn}' argument ${position + 1} has both 'attributeid' and 'value'; use one`];
    if (!isAttribute && !('value' in a)) return [`'${fn}' argument ${position + 1} has neither 'attributeid' nor 'value'; write { "attributeid": …, "datatype": … } or { "value": …, "datatype": … }`];
    const what = isAttribute ? `'${String(a.attributeid)}'` : `value ${JSON.stringify(a.value) ?? 'undefined'}`;
    if (a.datatype === undefined) return [`${what} has no datatype; add "datatype": "${spec.type}"`];
    if (typeof a.datatype !== 'string' || !(DATATYPES as readonly string[]).includes(a.datatype)) return [`${what} has datatype ${JSON.stringify(a.datatype)}; use one of ${list(DATATYPES)}`];
    const datatype = a.datatype;

    if (isAttribute) {
      const id = a.attributeid;
      if (!isAttributeName(id)) return [`condition "attributeid" must name an attribute (subject:, resource: or environment:), not ${JSON.stringify(id)}`];
      const declared = typeOf(id);
      if (declared === null) return [undeclared(id)];
      const bad = declaration(id);
      if (bad) return [bad];
      const mine = datatypeOf(declared);
      if (declared === 'list' && !bag) return [`'${id}' is a list; '${fn}' needs a single value there; use ${spec.type}-is-in to look for a value in it`];
      if (declared !== 'list' && bag) return [`'${fn}' needs a list; '${id}' is ${declared}; use a list attribute or write the values as an array in a value`];
      if (mine !== null && datatype !== mine) return [`'${id}' is declared ${declared}; its datatype must be "${mine}", not "${datatype}"`];
      if (datatype !== spec.type) return [`'${fn}' takes ${spec.type}; '${id}' has datatype "${datatype}"`];
      return [];
    }

    if (datatype !== spec.type) return [`'${fn}' takes ${spec.type}; ${what} has datatype "${datatype}"`];
    if (bag) {
      if (!Array.isArray(a.value)) return [`'${fn}' needs a list; write { "value": [ … ], "datatype": "${spec.type}" } or use a list attribute`];
      if (a.value.length === 0) return [`'${fn}' is empty; list at least one value, or remove the condition`];
      if (a.value.length > MAX_IN_ITEMS) return [`'${fn}' lists ${a.value.length} values; the limit is ${MAX_IN_ITEMS}; use a list attribute or split it into several policies`];
      const wrong = (a.value as unknown[]).find((v) => !literalFits(datatype, v));
      return wrong === undefined ? [] : [`${JSON.stringify(wrong) ?? 'undefined'} is a ${literalType(wrong) ?? typeof wrong}, not the datatype "${datatype}" it is declared with`];
    }
    return literalFits(datatype, a.value) ? [] : [`value ${JSON.stringify(a.value) ?? String(a.value)} is a ${literalType(a.value) ?? typeof a.value}, not the datatype "${datatype}" it is declared with`];
  };

  let nodes = 0;
  const walk = (node: unknown, depth: number): string[] => {
    // Past the cap every node answers at once, so a huge tree is not walked.
    if (++nodes > MAX_CONDITION_NODES) return nodes === MAX_CONDITION_NODES + 1 ? [`condition has more than ${MAX_CONDITION_NODES} nodes; split it into several policies`] : [];
    if (!node || typeof node !== 'object' || Array.isArray(node)) return [`condition must be an object; write ${CONDITION_EXAMPLE}`];
    if (depth > MAX_CONDITION_DEPTH) return [`conditions are nested ${depth} deep; the limit is ${MAX_CONDITION_DEPTH}; flatten with and or or`];
    const keys = Object.keys(node);

    const legacy = keys.filter((k) => Object.hasOwn(LEGACY_CONDITION_KEYS, k));
    const notLegacy = keys.length === 1 && keys[0] === NOT_FUNCTION && !Array.isArray((node as Record<string, unknown>).not);
    if (legacy.length > 0 || notLegacy) {
      const used = notLegacy ? [NOT_FUNCTION] : legacy;
      const instead = used.filter((k) => k !== 'attribute').map((k) => (k === NOT_FUNCTION ? 'not takes a list of one condition: { "not": [ … ] }' : `${k} is ${LEGACY_CONDITION_KEYS[k]}`));
      return [`condition is in the old form (it uses ${used.map((k) => `'${k}'`).join(', ')}); write it as ${CONDITION_EXAMPLE}${instead.length > 0 ? `; ${instead.join('; ')}` : ''}. See docs/access-policies.md`];
    }

    if (keys.length === 0) return [`condition uses no function; use one of ${list(CONDITION_FUNCTIONS)}`];
    if (keys.length > 1) return [`condition has both '${keys[0]}' and '${keys[1]}'; use one function per condition, combine with and`];
    const fn = keys[0];
    const args = (node as Record<string, unknown>)[fn];

    if ((GROUP_FUNCTIONS as readonly string[]).includes(fn)) {
      if (!Array.isArray(args)) return [`'${fn}' must be a list of conditions; write { "${fn}": [ … ] }`];
      if (args.length === 0) return [`'${fn}' is empty; list at least one condition, or remove the condition`];
      if (args.length > MAX_GROUP_CHILDREN) return [`'${fn}' lists ${args.length} conditions; the limit is ${MAX_GROUP_CHILDREN}; split it into several policies`];
      return args.flatMap((child) => walk(child, depth + 1));
    }
    if (fn === NOT_FUNCTION) {
      if (!Array.isArray(args) || args.length !== 1) return ['\'not\' takes a list of exactly one condition; write { "not": [ … ] }'];
      return walk(args[0], depth + 1);
    }
    if (!Object.hasOwn(COMPARISON_FUNCTIONS, fn)) return [`condition uses '${fn}'; use one of ${list(CONDITION_FUNCTIONS)}`];
    if (!Array.isArray(args) || args.length !== 2) return [`'${fn}' takes two arguments; write { "${fn}": [ a, b ] }`];
    const problems = [...operandProblems(fn, 0, args[0]), ...operandProblems(fn, 1, args[1])];
    // Two attributes are compared only when declared the same: an identity is normalised, a string is not.
    // An `is-in` bag is a list attribute, checked against the left side's datatype by operandProblems.
    const ids = attributeIds(args);
    if (problems.length === 0 && COMPARISON_FUNCTIONS[fn].kind !== 'is-in' && ids[0] && ids[1] && typeOf(ids[0]) !== typeOf(ids[1])) {
      return [`condition compares '${ids[0]}' (${String(typeOf(ids[0]))}) with '${ids[1]}' (${String(typeOf(ids[1]))}); both sides must have the same type`];
    }
    return problems.filter((p, i) => problems.indexOf(p) === i);
  };

  return walk(condition, 1);
}

/** Attribute names whose read has thrown, warned about once per process. */
const warnedReads = new Set<string>();

/**
 * The condition as the evaluator runs it, built once per policy (#2261): a
 * literal list in an `is-in` becomes a Set, and a literal compared with an
 * `identity` attribute is normalised as `subject:id` is (trimmed, lower-cased),
 * so "Alice" meets alice. Only for a condition `conditionProblems` passed.
 */
function compileCondition(node: PolicyCondition, typeOf: (name: string) => string | null): PolicyCondition {
  const out: Record<string, unknown[]> = {};
  for (const key of Object.keys(node)) {
    const args = node[key];
    if ((GROUP_FUNCTIONS as readonly string[]).includes(key) || key === NOT_FUNCTION) {
      out[key] = (args as PolicyCondition[]).map((child) => compileCondition(child, typeOf));
      continue;
    }
    const operands = args as Array<Record<string, unknown>>;
    const identity = operands.some((a) => typeof a.attributeid === 'string' && typeOf(a.attributeid) === 'identity');
    const literal = (x: unknown): unknown => (identity && typeof x === 'string' ? normalizeUsername(x) : x);
    out[key] = operands.map((a, i) => {
      // An `is-in` bag that is an attribute (a list) meets an identity on the left: its entries are normalised when read.
      if (identity && i === 1 && COMPARISON_FUNCTIONS[key]?.kind === 'is-in' && 'attributeid' in a) return { ...a, normalizeEntries: true };
      if (!('value' in a)) return a;
      return { ...a, value: Array.isArray(a.value) ? new Set(a.value.map(literal)) : literal(a.value) };
    });
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
 * missing, or an argument lacks the datatype its function takes; the caller
 * fails closed on that. Each node is judged on its own: a missing attribute
 * makes its comparison unknown, a true branch decides `or`, a false branch
 * decides `and`, and `not` of unknown is unknown.
 */
export async function conditionHolds(condition: PolicyCondition | undefined, read: AttributeReader | undefined, depth = 1): Promise<boolean | undefined> {
  if (!condition) return true;
  if (depth > MAX_CONDITION_DEPTH) return undefined;
  const keys = Object.keys(condition);
  if (keys.length !== 1) return undefined;
  const fn = keys[0];
  const args: unknown = condition[fn];

  if ((GROUP_FUNCTIONS as readonly string[]).includes(fn)) {
    const isOr = fn === 'or';
    if (!Array.isArray(args) || args.length === 0) return undefined;
    const decisive = isOr; // the value that settles the node: true for or, false for and
    let sawUnknown = false;
    for (const child of args as PolicyCondition[]) {
      const result = await conditionHolds(child, read, depth + 1);
      if (result === decisive) return decisive;
      if (result === undefined) sawUnknown = true;
    }
    return sawUnknown ? undefined : !decisive;
  }
  if (fn === NOT_FUNCTION) {
    if (!Array.isArray(args) || args.length !== 1 || !args[0]) return undefined;
    const inner = await conditionHolds(args[0] as PolicyCondition, read, depth + 1);
    return inner === undefined ? undefined : !inner;
  }

  if (!Object.hasOwn(COMPARISON_FUNCTIONS, fn) || !Array.isArray(args) || args.length !== 2) return undefined;
  const spec = COMPARISON_FUNCTIONS[fn];
  const value = async (arg: unknown): Promise<unknown> => {
    if (!arg || typeof arg !== 'object' || Array.isArray(arg)) return undefined;
    const a = arg as Record<string, unknown>;
    // The datatype is required and must be the one the function takes: anything else is unknown.
    if (a.datatype !== spec.type) return undefined;
    if (!('attributeid' in a)) return a.value;
    const name = a.attributeid;
    if (!isAttributeName(name) || !read) return undefined;
    try {
      const got = await read(name);
      // Entries of a list compared with an identity go through normalizeUsername, as the subject does (#2330).
      return a.normalizeEntries === true && Array.isArray(got) ? (got as unknown[]).map((e) => (typeof e === 'string' ? normalizeUsername(e) : e)) : got;
    } catch (err) {
      // A read that throws leaves this comparison unknown, not the decision aborted.
      if (!warnedReads.has(name)) {
        warnedReads.add(name);
        logger.warn(`[POLICY] reading '${name}' for a condition failed, so the comparison is unknown: ${err instanceof Error ? err.message : String(err)}`);
      }
      return undefined;
    }
  };
  return compareLeaf(spec.kind, await value(args[0]), await value(args[1]));
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
 * Which resource attributes a policy's condition may read (#1823, #2261).
 *
 * A policy that names exactly one add-on type (no page matcher) uses that
 * type's attributes. Any other policy reads the `page` attributes, as a
 * condition on a core type is about the page, and also those declared on the
 * `vault` and `shared-folder` types it names: an attribute declared on one is
 * readable only by a policy that names it. A policy naming no type, or only
 * `system-category`, gets the `page` set alone.
 */
export function conditionAttributeSource(
  resources: readonly { type?: string }[] | undefined,
  types: ResourceTypeDeclarations | null
): { attributes: Record<string, { type?: string }>; label: string } {
  const named = [...new Set((resources ?? []).map((r) => r?.type).filter((t): t is string => typeof t === 'string' && t.length > 0))];
  if (named.length === 1 && !Object.hasOwn(RESOURCE_MATCHERS, named[0]) && types && Object.hasOwn(types, named[0])) {
    return { attributes: declaredAttributes(types, named[0]), label: named[0] };
  }
  const also = ATTRIBUTE_RESOURCE_TYPES.filter((t) => named.includes(t));
  return { attributes: attributesForResourceTypes(types, named), label: ['page', ...also].join(' or ') };
}

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
  /** Allows that matched subject, resource and action but whose condition was false or unknown (#2288). Absent when none. */
  conditionNotMet?: string[];
}

const NO_POLICY: EvaluationResult = { hasDecision: false, allowed: false, reason: 'No matching policy', policyName: null, policyIds: [] };

/**
 * PolicyEvaluator - Evaluates access policies against a given context.
 *
 * PolicyEvaluator mimics how JSPWiki uses Java's built-in security framework
 * (java.security) to load and evaluate security policies from a policy file.
 * Among the policies that match, a deny overrides any allow, the
 * rule-combining algorithm `deny-overrides` (#2330), and no match is a deny (#2255). Each decision names the policies
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

  /** The headline of the access-policies item now up, so marking the last deny takes down this one and no other (#2355). */
  private reportedReason: string | null = null;

  /**
   * Each condition checked and compiled, by the condition object configuration
   * holds (#2279), kept while `ConfigurationManager.getRevision()` is
   * `revision`. Any change to the configuration (a save, a reload, a reset, a
   * restore, an add-on's runtime value) changes the revision, and the next
   * decision starts again from nothing. The policies themselves are still read
   * live for every decision; only a condition's compiled form is reused.
   */
  private preparedConditions: { revision: number; byPolicy: WeakMap<Policy, Omit<PreparedPolicy, 'policy'>> } | null = null;

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
    // #2330: the one algorithm the evaluator implements. Any other value would be
    // read as deny-overrides anyway, so the site says so and does not start rather than
    // run under a rule its configuration does not state.
    const algorithm = this.configManager.getProperty(RULE_COMBINING_ALGORITHM_KEY, 'deny-overrides');
    const algorithmProblem = combiningAlgorithmProblem(algorithm);
    if (algorithmProblem) {
      logger.error(`[POLICY] ${algorithmProblem}; the site does not start`);
      throw new Error(algorithmProblem);
    }
    logger.info(`Access policies: ${this.policies().length} loaded, rule-combining-algorithm ${String(algorithm)}`);
    // #1504: say when the declared resource types and the matchers disagree.
    const declared = this.configManager.getProperty(RESOURCE_TYPES_KEY, null) as Record<string, unknown> | null;
    if (!declared || typeof declared !== 'object') {
      logger.warn(`[POLICY] ${RESOURCE_TYPES_KEY} is not set; policies use the evaluator's own resource types (${Object.keys(RESOURCE_MATCHERS).join(', ')})`);
    } else {
      // #1823 (PR #2324 review, M3): the merged declaration, app-custom-config.json
      // included. A malformed owner would make an owner type policy-alone, so the site does not start.
      const ownerProblems = Object.entries(declared).map(([type, entry]) => ownerDeclarationProblem(type, entry)).filter((p): p is string => p !== null);
      if (ownerProblems.length > 0) throw new Error(`${RESOURCE_TYPES_KEY}: ${ownerProblems.join('; ')}`);
      for (const type of Object.keys(declared)) {
        // #1823: an add-on's type has no page matcher. It matches by id only
        // when a record of that type is decided, so a page decision never sees it.
        if (!RESOURCE_MATCHERS[type]) logger.info(`[POLICY] resource type '${type}' matches by id on an add-on record decision (#1823); a page decision does not use it`);
      }
      for (const type of Object.keys(RESOURCE_MATCHERS)) {
        if (!(type in declared)) logger.warn(`[POLICY] resource type '${type}' is not declared in ${RESOURCE_TYPES_KEY}; a policy naming it never matches`);
      }
    }
    this.reportPageWritePolicies();
    await this.dropMarksOfGoneRules(systemContext(this.engine, 'drop checked-deny marks whose rule no longer exists (#2355)'));
    logger.info('📋 PolicyEvaluator initialized');
  }

  /**
   * Say at boot what a developer should look at in the policies after #2255,
   * one warning each: stored policies the upgrade rewrote, policies it left
   * that now decide differently (a deny) or reach pushed pages, and conditions
   * that never hold. These are log lines only; categories no policy lets anyone
   * change are an upgrade check (`upgradeChecks/uneditablePages.ts`).
   */
  private reportPageWritePolicies(log = true): void {
    const config = this.configManager;
    if (!config) return;
    // The log keeps each line in full; `shown` is what the needs-attention item says, in plain words
    // (no permission ids, issue numbers, setting names or file paths). A line with no entry in `shown` is already plain.
    const migration = config as { pageWritePolicyMigration?: string[]; pageWritePolicyMigrationShown?: Record<string, string> };
    const lines: string[] = [...(migration.pageWritePolicyMigration ?? [])];
    const shown = new Map<string, string>(Object.entries(migration.pageWritePolicyMigrationShown ?? {}));
    const logOnly: string[] = [];
    const checkedLog: string[] = [];
    const add = (finding: { log: string; plain: string }): void => {
      lines.push(finding.log);
      shown.set(finding.log, finding.plain);
    };
    // An open allow rule is the upgrade notice's to-do (`upgradeChecks/openWriteRules.ts`), so the box leaves it out and the log keeps it.
    // #2355: a deny an administrator marked as checked, with the content it has now, is left out of the box and logged quietly.
    const checkedDenies = (config.getProperty(CHECKED_DENIES_KEY, {}) ?? {}) as Record<string, string>;
    const buttons: NonNullable<ManagerStatus['buttons']> = [];
    for (const finding of pageWritePolicyFindings(this.policies(), checkedDenies)) {
      if (finding.coveredByUpgradeNotice) logOnly.push(finding.log);
      else if (finding.deny?.checked) checkedLog.push(finding.log);
      else {
        add(finding);
        if (finding.deny) buttons.push({ label: `Mark '${finding.deny.id}' as checked`, action: DENY_CHECKED_ACTION, fields: { id: finding.deny.id, fingerprint: finding.deny.fingerprint } });
      }
    }
    // #2330: `priority` is gone; a leftover one changes nothing.
    const withPriority = this.policies().filter((p) => p.priority !== undefined).map((p) => `'${p.id}'`);
    if (withPriority.length > 0) {
      add({
        log: `${withPriority.join(', ')} ${withPriority.length === 1 ? 'has' : 'have'} a priority, which is ignored: under deny-overrides any matching deny wins and order and priority don't matter; remove it (#2330)`,
        plain: `${withPriority.length === 1 ? 'This rule has' : 'These rules have'} an old 'priority' that the site ignores, so it changes nothing: ${withPriority.join(', ')}. Remove it${withPriority.length === 1 ? '' : ' from each one'}.`
      });
    }
    // #2334: the old plural `conditions` array is read by nothing.
    // The log keeps the long form; the needs-attention entry shows plain words.
    const unenforced = unenforcedConditionsLine(this.policies());
    const notice = unenforcedConditionsNotice(this.policies());
    if (unenforced && notice) add({ log: unenforced, plain: notice });
    for (const { id, effect, problems } of this.conditionProblemsInForce()) {
      const plain = `The rule '${id}' has a condition that cannot work, so ${effect === 'deny' ? 'it always denies' : 'it never gives anyone access'}. Open the rule in Admin → Configuration and fix its condition, or remove it.`;
      problems.forEach((p) => add({ log: `'${id}': ${p}; ${effect === 'deny' ? 'the deny always applies' : 'the policy never applies as an allow'}`, plain }));
    }
    // #2287: the declaration itself, add-on defaults included (this reads the merged value). `id` and `aal` keep their built-in meaning either way.
    subjectAttributesFindings(readDeclaredAsWritten(config, SUBJECT_ATTRIBUTES_KEY), SENSITIVE_USER_FIELDS).forEach(add);
    // #2261 slice 4: the environment declarations, and each schedule one names that is missing (the attribute is then missing and fails closed).
    environmentAttributesFindings(readDeclaredAsWritten(config, ENVIRONMENT_ATTRIBUTES_KEY)).forEach(add);
    this.scheduleProblems().forEach(add);
    if (log) {
      for (const line of [...lines, ...logOnly]) logger.warn(`[POLICY] ${line}`);
      for (const line of checkedLog) logger.info(`[POLICY] ${line}; an administrator marked it as checked`);
    }
    if (lines.length === 0) {
      // Nothing left to say: take back the item this method put up, and only that one.
      if (this.reportedReason) this.markReadyIfDegradedBy(this.reportedReason);
      this.reportedReason = null;
      return;
    }
    // Each part is a full sentence, so they are joined with a space.
    // Several log lines can say one plain thing (a rule with two bad conditions), so it is said, and counted, once.
    const plain = [...new Set(lines.map((l) => `${(shown.get(l) ?? l).replace(/\.$/, '')}.`))];
    this.reportedReason = `Access policies need review (${plain.length} ${plain.length === 1 ? 'problem' : 'problems'}):`;
    this.markNeedsAttention(this.reportedReason, 'ngdpbase.access.policies', { details: plain, ...(buttons.length > 0 ? { buttons } : {}) });
  }

  /** The stored marks whose rule is still a deny in force (#2355). A mark for a rule since removed is not kept: the same rule added later must be shown again. */
  private marksOfExistingDenies(): Record<string, string> {
    const stored = (this.configManager?.getProperty(CHECKED_DENIES_KEY, {}) ?? {}) as Record<string, string>;
    const denies = new Set(this.policies().filter((p) => p.effect === 'deny').map((p) => p.id));
    return Object.fromEntries(Object.entries(stored).filter(([id]) => denies.has(id)));
  }

  /** Save the marks without those of rules that are gone (#2355); nothing is written when none is. */
  private async dropMarksOfGoneRules(ctx: ActorContext): Promise<void> {
    const config = this.configManager;
    if (!config) return;
    const stored = (config.getProperty(CHECKED_DENIES_KEY, {}) ?? {}) as Record<string, string>;
    const kept = this.marksOfExistingDenies();
    if (Object.keys(kept).length === Object.keys(stored).length) return;
    try {
      await config.setProperty(CHECKED_DENIES_KEY, kept, ctx);
    } catch (err: unknown) {
      logger.warn(`[POLICY] Could not drop checked-deny marks of removed rules: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * An administrator marks a deny as checked (#2355). Kept as the rule's id and a fingerprint of
   * its content in `ngdpbase.access.checked-denies`, written through ConfigurationManager with the
   * person's context, which records the change. It hides the item and nothing else: no decision
   * reads it. Answers `changed` when the rule is no longer what the page showed (nothing is
   * saved) and `missing` when no deny has that id.
   */
  async markDenyChecked(ctx: ActorContext, id: string, fingerprint: string): Promise<'checked' | 'changed' | 'missing'> {
    const config = this.configManager;
    const rule = this.policies().find((p) => p.id === id && p.effect === 'deny');
    if (!config || !rule) return 'missing';
    const now = policyFingerprint(rule);
    if (now !== fingerprint) return 'changed';
    await config.setProperty(CHECKED_DENIES_KEY, { ...this.marksOfExistingDenies(), [id]: now }, ctx);
    this.reportPageWritePolicies(false);
    return 'checked';
  }

  /**
   * Evaluates all relevant policies to make an access decision (#2255).
   *
   * Deny overrides allow (the rule-combining algorithm, #2330): if any matching
   * deny applies, the answer is deny; otherwise any matching allow permits;
   * otherwise no policy decided. A policy with a `condition` applies only when it holds;
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
    const result = await this.combine(this.prepared(matching), context.readAttribute);
    logger.info(`[POLICY] ${result.hasDecision ? `${result.allowed ? 'allow' : 'deny'} by ${result.policyIds.join(',')}` : 'No matching policy'}`);
    return result;
  }

  /**
   * The policies with their conditions checked and compiled (#2279): a
   * condition already compiled under the configuration in force is reused,
   * and `prepare` runs only for the rest. With no configuration revision to
   * key on, everything is prepared again.
   */
  private prepared(policies: readonly Policy[]): PreparedPolicy[] {
    const revision = typeof this.configManager?.getRevision === 'function' ? this.configManager.getRevision() : undefined;
    if (revision === undefined) return this.prepare(policies);
    if (this.preparedConditions?.revision !== revision) this.preparedConditions = { revision, byPolicy: new WeakMap() };
    // Keyed by the policy, not its condition: what a condition may read depends on the resource types the policy names (#2261), so two policies sharing one condition object are checked each.
    const cache = this.preparedConditions.byPolicy;
    const missing = policies.filter((p) => p.condition !== undefined && !cache.has(p));
    if (missing.length > 0) {
      for (const { policy, ...rest } of this.prepare(missing)) cache.set(policy, rest);
    }
    return policies.map((policy) => (policy.condition === undefined
      ? { policy, invalid: false }
      : { policy, ...cache.get(policy)! }));
  }

  /**
   * Checks and compiles each policy's condition (#2261). `prepared()` keeps
   * the result until the configuration changes (#2279).
   */
  private prepare(policies: readonly Policy[], attributes?: Record<string, { type?: string }>, label = 'page'): PreparedPolicy[] {
    const conditional = policies.some((p) => p.condition !== undefined);
    const types = conditional && !attributes ? this.resourceTypeMap() : null;
    const subjects = conditional ? this.declaredSubjectAttributes() : {};
    const environment = conditional ? this.declaredEnvironmentAttributes() : {};
    return policies.map((policy) => {
      if (policy.condition === undefined) return { policy, invalid: false };
      // #2261: the attributes a condition may read are the ones declared for the resource types THIS policy names.
      const source = attributes ? { attributes, label } : conditionAttributeSource(policy.resources, types);
      if (conditionProblems(policy.condition, source.attributes, subjects, environment, source.label).length > 0) return { policy, invalid: true };
      return { policy, invalid: false, condition: compileCondition(policy.condition, (name) => attributeTypeOf(name, source.attributes, subjects, environment)) };
    });
  }

  /**
   * Decide one add-on record type by id (#1823).
   *
   * Only policies that name this type are considered, and a policy with no
   * resources does not match: a page grant cannot cover the type, and a
   * blanket policy cannot either. The id is matched with the same globs as a
   * page name, a leading dot included. A core type (`page`, `system-category`, `vault`,
   * `shared-folder`) is not decided here.
   */
  async evaluateDeclaredResource(context: {
    resourceType: string;
    id: string;
    action: string;
    actions?: readonly string[];
    userContext?: UserContext;
    readAttribute?: AttributeReader;
  }): Promise<EvaluationResult> {
    if (!this.configManager) return { ...NO_POLICY, reason: 'PolicyEvaluator not initialized' };
    if (Object.hasOwn(RESOURCE_MATCHERS, context.resourceType)) return { ...NO_POLICY, reason: `resource type '${context.resourceType}' is decided by its own door` };
    const declared = declaredResourceTypes((key, def) => this.configManager!.getProperty(key, def));
    if (!declared.has(context.resourceType)) return { ...NO_POLICY, reason: `resource type '${context.resourceType}' is not declared` };
    const actions = context.actions ?? [context.action];
    const matching = this.policies().filter((policy) =>
      this.matchesSubject(policy.subjects, context.userContext)
      && actions.some((a) => this.matchesAction(policy.actions, a))
      && this.namesDeclaredType(policy.resources, context.resourceType, context.id));
    const forType = conditionAttributeSource([{ type: context.resourceType }], this.resourceTypeMap());
    return this.combine(this.prepare(matching, forType.attributes, forType.label), context.readAttribute);
  }

  /** True when a policy resource names this type and its pattern covers the id. No resources is not a match. */
  private namesDeclaredType(resources: PolicyResource[] | undefined, type: string, id: string): boolean {
    if (!resources || resources.length === 0) return false;
    return resources.some((r) => r.type === type && typeof r.pattern === 'string' && micromatch.isMatch(id, r.pattern, { dot: true }));
  }

  private resourceTypeMap(): ResourceTypeDeclarations | null {
    const types = this.configManager?.getProperty(RESOURCE_TYPES_KEY, null);
    return types && typeof types === 'object' ? types as ResourceTypeDeclarations : null;
  }

  /**
   * Deny overrides allow, over policies that already match subject, resource
   * and action (#2255). Every matching deny whose condition is true or
   * unknown decides; failing that, every allow whose condition is true.
   */
  private async combine(matching: readonly PreparedPolicy[], read: AttributeReader | undefined): Promise<EvaluationResult> {
    const denies: string[] = [];
    const allows: string[] = [];
    const notMet: string[] = [];
    for (const { policy, invalid, condition } of matching) {
      const holds = invalid ? undefined : await conditionHolds(condition, read);
      if (policy.effect === 'deny') {
        if (holds !== false) denies.push(policy.id);
      } else if (holds === true) {
        allows.push(policy.id);
      } else {
        notMet.push(policy.id);
      }
    }
    const conditionNotMet = notMet.length > 0 ? { conditionNotMet: notMet } : {};
    if (denies.length > 0) return { hasDecision: true, allowed: false, reason: `Policy deny: ${denies.join(',')}`, policyName: denies[0], policyIds: denies, ...conditionNotMet };
    if (allows.length > 0) return { hasDecision: true, allowed: true, reason: `Policy allow: ${allows.join(',')}`, policyName: allows[0], policyIds: allows, ...conditionNotMet };
    return { ...NO_POLICY, ...conditionNotMet };
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
    const applicable = this.prepared(this.policies()
      .filter((policy) => this.matchesSubject(policy.subjects, userContext) && actions.some((a) => this.matchesAction(policy.actions, a))));
    logger.debug(`[POLICY] Compiled ${applicable.length} policies for user=${userContext?.username} action=${action}`);
    return (pageName, attributes, readAttribute) =>
      this.combine(applicable.filter(({ policy }) => this.matchesResource(policy.resources, pageName, attributes)), readAttribute);
  }

  /** The attributes declared on the `page` resource type (#2255), for checking a condition. */
  declaredPageAttributes(): Record<string, { type?: string }> {
    return declaredAttributes(this.configManager?.getProperty(RESOURCE_TYPES_KEY, null) as ResourceTypeDeclarations | null, 'page');
  }

  /** The subject attributes a condition may read (#2261): `id` always, and those declared in `ngdpbase.access.subject-attributes`. */
  declaredSubjectAttributes(): Record<string, DeclaredSubjectAttribute> {
    return declaredSubjectAttributes(readDeclaredAsWritten(this.configManager, SUBJECT_ATTRIBUTES_KEY));
  }

  /** The environment attributes a condition may read (#2261): those declared in `ngdpbase.access.environment-attributes`. */
  declaredEnvironmentAttributes(): Record<string, DeclaredEnvironmentAttribute> {
    return declaredEnvironmentAttributes(readDeclaredAsWritten(this.configManager, ENVIRONMENT_ATTRIBUTES_KEY));
  }

  /**
   * One line for each declared `schedule:` attribute whose schedule is not in
   * `ngdpbase.schedules` (the attribute is missing and a condition on it fails
   * closed) or has no rules (it reads as always open), for the boot warning.
   */
  private scheduleProblems(): Array<{ log: string; plain: string }> {
    let schedules: Record<string, Schedule> | null = null;
    let zone: unknown = 'UTC';
    try {
      schedules = this.configManager?.getProperty(SCHEDULES_KEY, null) as Record<string, Schedule> | null;
      zone = this.configManager?.getProperty(TIME_ZONE_KEY, 'UTC');
    } catch {
      return [{
        log: 'ngdpbase.schedules could not be read, so no attribute that reads a schedule can be used; a condition on one never holds (an allow does not apply, a deny does)',
        plain: 'The schedules could not be read, so a rule that depends on a schedule never holds: an allow rule stops applying and a deny rule keeps applying. Fix the schedules in Admin → Configuration.'
      }];
    }
    return Object.entries(this.declaredEnvironmentAttributes()).flatMap(([name, decl]) => {
      const from = typeof decl?.from === 'string' ? decl.from : '';
      if (!from.startsWith('schedule:') || environmentDeclarationProblem(name, decl) !== null) return [];
      const schedule = from.slice('schedule:'.length);
      const never = 'a condition on it never holds (an allow does not apply, a deny does)';
      const neverPlain = 'so a rule that depends on it never holds: an allow rule stops applying and a deny rule keeps applying';
      const found = schedules && typeof schedules === 'object' && Object.hasOwn(schedules, schedule) ? schedules[schedule] : undefined;
      if (!found || typeof found !== 'object') {
        return [{
          log: `environment attribute '${name}' reads schedule '${schedule}', which is not in ngdpbase.schedules; ${never}`,
          plain: `The check '${name}' uses a schedule called '${schedule}' that does not exist, ${neverPlain}. Add that schedule in Admin → Configuration, or point the check at one that exists.`
        }];
      }
      const bad = scheduleProblem(found, typeof zone === 'string' && zone ? zone : 'UTC');
      if (bad) {
        return [{
          log: `environment attribute '${name}' reads schedule '${schedule}', which cannot be read (${bad}); ${never}`,
          plain: `The schedule '${schedule}', used by the check '${name}', has a mistake the site cannot read, ${neverPlain}. Fix the schedule in Admin → Configuration.`
        }];
      }
      if (!scheduleIsEnabled(found)) {
        return [{
          log: `environment attribute '${name}' reads schedule '${schedule}', which is switched off (enabled: false); ${never}`,
          plain: `The schedule '${schedule}', used by the check '${name}', is switched off, ${neverPlain}. Switch it back on in Admin → Configuration, or stop using it.`
        }];
      }
      if (!Array.isArray(found.rules) || found.rules.length === 0) {
        return [{
          log: `environment attribute '${name}' reads schedule '${schedule}', which has no rules; it reads as always open`,
          plain: `The schedule '${schedule}', used by the check '${name}', has no times in it, so it counts as always open. Add the times it should be open in Admin → Configuration.`
        }];
      }
      return [];
    });
  }

  /** Each policy in force whose condition has a problem, with the problems (#2255): for the boot warning. */
  conditionProblemsInForce(): Array<{ id: string; effect: Policy['effect']; problems: string[] }> {
    const types = this.resourceTypeMap();
    const subjects = this.declaredSubjectAttributes();
    const environment = this.declaredEnvironmentAttributes();
    return this.policies()
      .map((p) => {
        const source = conditionAttributeSource(p.resources, types);
        return { id: p.id, effect: p.effect, problems: conditionProblems(p.condition, source.attributes, subjects, environment, source.label) };
      })
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
