/**
 * The vocabulary of a policy `condition` (#2261, #2330): attribute types, the
 * function table, the nesting limit, and how one comparison is decided.
 * Pure: no I/O, no manager. The evaluator and the validator both import it,
 * so the set of functions lives here and nowhere else.
 *
 * A condition follows XACML 3.0 in lowercase (#2330). A function is a key
 * named for its XACML function, `string-equal`, whose value is the array of its
 * arguments. An argument is an attribute, `{ "attributeid": "subject:id",
 * "datatype": "string" }`, or a literal, `{ "value": "sales", "datatype":
 * "string" }`. `datatype` is required on both.
 */
import type { PolicyFinding } from './pageWritePolicies.js';

/** The types an attribute can be declared with. */
export const ATTRIBUTE_TYPES = ['string', 'integer', 'boolean', 'identity', 'list'] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

/**
 * The datatypes a condition may name: the XACML 3.0 JSON profile's short
 * names. Only `string`, `integer` and `boolean` have a function today, so a
 * condition naming any other is refused as a datatype its function does not take.
 */
export const DATATYPES = ['string', 'integer', 'boolean', 'double', 'date', 'time', 'dateTime', 'anyURI'] as const;

/** The datatypes some function takes. */
export type FunctionType = 'string' | 'integer' | 'boolean';

/**
 * How deep a condition may nest. Every function node counts, arguments that
 * are attributes or values do not, so `or` > `and` > `not` > `string-equal` is 4
 * and one more level is refused.
 */
export const MAX_CONDITION_DEPTH = 4;

/**
 * How wide a condition may be (#2261). Depth alone leaves the tree as wide as
 * a config file can make it, and the evaluator walks it for every page a
 * listing or search asks about. A literal `value` list in an `is-in`, the
 * arguments of one `and` or `or`, and the function nodes of the whole condition
 * are each capped.
 */
export const MAX_IN_ITEMS = 256;
export const MAX_GROUP_CHILDREN = 256;
export const MAX_CONDITION_NODES = 512;

/** What a comparison does once both arguments are read. */
export type ComparisonKind = 'equal' | 'is-in' | 'greater-than' | 'greater-than-or-equal' | 'less-than' | 'less-than-or-equal';

/** One function that compares two arguments: the datatype it takes and what it does. */
export interface ConditionFunction {
  type: FunctionType;
  kind: ComparisonKind;
}

/**
 * The functions that compare two arguments, by XACML 3.0 name (core spec,
 * appendix A.3), in lowercase. `X-is-in` takes a value, then a bag: an attribute
 * that is a list, or a literal whose `value` is an array.
 */
export const COMPARISON_FUNCTIONS: Readonly<Record<string, ConditionFunction>> = {
  'string-equal': { type: 'string', kind: 'equal' },
  'integer-equal': { type: 'integer', kind: 'equal' },
  'boolean-equal': { type: 'boolean', kind: 'equal' },
  'string-is-in': { type: 'string', kind: 'is-in' },
  'integer-is-in': { type: 'integer', kind: 'is-in' },
  'integer-greater-than': { type: 'integer', kind: 'greater-than' },
  'integer-greater-than-or-equal': { type: 'integer', kind: 'greater-than-or-equal' },
  'integer-less-than': { type: 'integer', kind: 'less-than' },
  'integer-less-than-or-equal': { type: 'integer', kind: 'less-than-or-equal' }
};

/** The functions that combine conditions: XACML's logical functions. `not` takes one condition, these take a list. */
export const GROUP_FUNCTIONS = ['and', 'or'] as const;
export const NOT_FUNCTION = 'not';

/** Every function, in the order the validator lists them. */
export const CONDITION_FUNCTIONS: readonly string[] = [...Object.keys(COMPARISON_FUNCTIONS), ...GROUP_FUNCTIONS, NOT_FUNCTION];

/** The keys of an argument: an attribute or a literal, and its datatype. */
export const OPERAND_KEYS = ['attributeid', 'value', 'datatype'] as const;

/**
 * The shape before #2330, key by key, and what replaces it, so the validator
 * can say what to write. Not read by the evaluator: an old condition never holds.
 */
export const LEGACY_CONDITION_KEYS: Readonly<Record<string, string>> = {
  attribute: '{ "attributeid": …, "datatype": … } as an argument of a function',
  equals: 'string-equal, integer-equal or boolean-equal',
  'not-equals': 'not around string-equal, integer-equal or boolean-equal',
  in: 'string-is-in or integer-is-in',
  'greater-or-equal': 'integer-greater-than-or-equal',
  'less-or-equal': 'integer-less-than-or-equal',
  'any-of': 'or',
  'all-of': 'and'
};

/** The one example the validator shows for the old shape. */
export const CONDITION_EXAMPLE = '{ "string-equal": [ { "attributeid": "subject:department-id", "datatype": "string" }, { "value": "sales", "datatype": "string" } ] }';

/** The datatype an attribute of a declared type is referenced with: an identity is a string. A list has the datatype of its entries. */
export function datatypeOf(attributeType: string): string | null {
  if (attributeType === 'identity') return 'string';
  if (attributeType === 'list') return null;
  return attributeType;
}

/** The type a literal value has, or `null` when it is not a usable literal. */
export function literalType(value: unknown): 'string' | 'integer' | 'boolean' | null {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return null;
}

/** Can a literal be compared with an attribute of this type? An identity is a string. */
export function literalFits(attributeType: string, value: unknown): boolean {
  const type = literalType(value);
  if (type === null) return false;
  return attributeType === 'identity' ? type === 'string' : attributeType === type;
}

/** A value a comparison can use: a string, a boolean, or a whole number (not NaN, ±Infinity or 2.5). */
function isComparable(value: unknown): value is string | boolean | number {
  return typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isInteger(value));
}

/**
 * Does a value read for an attribute fit the type it is declared with? A
 * value that does not is treated as missing by the reader, so a comparison on
 * it is unknown and fails closed, not a definite false or true (#2261). Never
 * coerces: "5" is not an integer. An empty string is a string, a value and not
 * a missing one.
 */
export function valueFits(attributeType: string, value: unknown): boolean {
  switch (attributeType) {
  case 'integer':
    return typeof value === 'number' && Number.isInteger(value);
  case 'boolean':
    return typeof value === 'boolean';
  case 'list':
    return Array.isArray(value) && value.every(isComparable);
  default: // string, identity
    return typeof value === 'string';
  }
}

/**
 * Decides one comparison once both sides are read. `undefined` is unknown: a
 * side that is missing, or not of a type the function can compare. Both sides
 * must be the same kind of value (a string, a boolean or a whole number), so
 * "5" never equals 5 and NaN never compares. `is-in` takes an array, or a Set the
 * evaluator built from a literal list; every entry of an array must be the
 * kind of value on the left. An empty string is a value, not a missing one.
 */
export function compareLeaf(kind: ComparisonKind, left: unknown, right: unknown): boolean | undefined {
  if (!isComparable(left)) return undefined;
  switch (kind) {
  case 'equal':
    return isComparable(right) && typeof right === typeof left ? left === right : undefined;
  case 'is-in':
    if (right instanceof Set) return right.has(left);
    return Array.isArray(right) && right.every((v) => isComparable(v) && typeof v === typeof left) ? right.includes(left) : undefined;
  case 'greater-than':
    return typeof left === 'number' && typeof right === 'number' && Number.isInteger(right) ? left > right : undefined;
  case 'greater-than-or-equal':
    return typeof left === 'number' && typeof right === 'number' && Number.isInteger(right) ? left >= right : undefined;
  case 'less-than':
    return typeof left === 'number' && typeof right === 'number' && Number.isInteger(right) ? left < right : undefined;
  case 'less-than-or-equal':
    return typeof left === 'number' && typeof right === 'number' && Number.isInteger(right) ? left <= right : undefined;
  default:
    return undefined;
  }
}

/** One attribute declared on a resource type: its type and the PIP source it is read from. */
export interface DeclaredResourceAttribute {
  type?: string;
  from?: string;
}

/** `ngdpbase.access.resource-types` as read: each type's own `attributes`. */
export type ResourceTypeDeclarations = Record<string, { attributes?: Record<string, DeclaredResourceAttribute> }>;

/**
 * The resource types, besides `page`, whose attributes a policy naming them may
 * read (#2261 slice 5). `system-category` selects pages and declares none.
 */
export const ATTRIBUTE_RESOURCE_TYPES: readonly string[] = ['vault', 'shared-folder'];

/**
 * The attributes one resource type declares in `ngdpbase.access.resource-types`,
 * or `{}` for a type with none, an unknown type, or no declarations at all.
 */
export function declaredAttributes(types: ResourceTypeDeclarations | null | undefined, type: string): Record<string, DeclaredResourceAttribute> {
  if (!types || typeof types !== 'object' || !Object.hasOwn(types, type)) return {};
  const attributes = types[type]?.attributes;
  return attributes && typeof attributes === 'object' && !Array.isArray(attributes) ? attributes : {};
}

/**
 * What a policy may read as `resource:<name>`, and the PIP reads for it: the
 * `page` set, then the set of each of `vault` and `shared-folder` the policy
 * names. A name declared on `page` and on another type keeps the page's
 * declaration, so one name has one meaning on a page. A policy naming no type,
 * or only `system-category`, gets the `page` set alone.
 */
export function attributesForResourceTypes(types: ResourceTypeDeclarations | null | undefined, named: readonly string[]): Record<string, DeclaredResourceAttribute> {
  const merged: Record<string, DeclaredResourceAttribute> = {};
  for (const type of ['page', ...ATTRIBUTE_RESOURCE_TYPES.filter((t) => named.includes(t))]) {
    for (const [name, decl] of Object.entries(declaredAttributes(types, type))) {
      if (!Object.hasOwn(merged, name)) merged[name] = decl;
    }
  }
  return merged;
}

/** The key that names how rules are combined (#2330). */
export const RULE_COMBINING_ALGORITHM_KEY = 'ngdpbase.access.rule-combining-algorithm';

/** The only algorithm the evaluator implements; XACML's name for it. */
export const SUPPORTED_COMBINING_ALGORITHMS: readonly string[] = ['deny-overrides'];

/** What Admin → Configuration says about the algorithm. */
export const DENY_OVERRIDES_EXPLANATION = 'Any matching deny wins. Order and priority don\'t matter.';

/** What is wrong with the value of `ngdpbase.access.rule-combining-algorithm`, or `null`. Used on save, on load and at boot. */
export function combiningAlgorithmProblem(value: unknown): string | null {
  if (typeof value === 'string' && SUPPORTED_COMBINING_ALGORITHMS.includes(value)) return null;
  return `${RULE_COMBINING_ALGORITHM_KEY} is ${JSON.stringify(value) ?? 'not set'}; the only value accepted is ${SUPPORTED_COMBINING_ALGORITHMS.map((a) => `"${a}"`).join(', ')}`;
}

/** The assurance level a sign-in reached: NIST SP 800-63B, 1 to 3. */
export type SubjectAal = 1 | 2 | 3;

/** `value` as an assurance level, or `undefined` when it is not 1, 2 or 3. Never coerces. */
export function toAal(value: unknown): SubjectAal | undefined {
  return value === 1 || value === 2 || value === 3 ? value : undefined;
}

/**
 * What a subject carries that bears on its assurance level (#2261 slice 3).
 * Read from the request's subject, never from a request field: a caller
 * cannot send an `aal` and have it believed.
 */
export interface AalFacts {
  isAuthenticated?: boolean;
  /** The session's sign-in record; absent on a session from before #1523. */
  signIn?: { aal?: unknown } | null;
  /** The highest level the account's methods can reach; the level never exceeds it. */
  aalCap?: number;
  /** A token request: the level stored when the token was made. */
  viaToken?: { aal?: unknown } | null;
  /** A share visitor has no sign-in. */
  viaShare?: unknown;
  /** A bearer JWT (Authentik): verified, but it records no sign-in level, so the subject has none (#2287). */
  bearerWithoutLevel?: unknown;
  /** A background job: the level stored when the job was requested. */
  grantedAal?: unknown;
  /** A background job (`JobSubject`): it has no session to read. */
  resolveRolesNow?: unknown;
}

/**
 * The subject's `subject:aal`, or `undefined` when it has none (#2261).
 *
 * - Not signed in, or a share visitor: none.
 * - An agent token: the level stored with the token. A token made before this
 *   stored one has none.
 * - A background job: the level stored with the job's request. A job with
 *   none (a schedule, boot, a request from before this) has none.
 * - A bearer JWT that records no level (Authentik): none. It is not a session
 *   from before sign-ins were recorded, so the AAL 1 rule below does not apply.
 * - A session: its sign-in record's level; a session from before sign-ins
 *   were recorded (#1523) is AAL 1, as `AuthManager` treats it.
 *
 * Capped at `aalCap`, as a role is. Reads the record; it never works the level
 * out from factors.
 */
export function effectiveAal(subject: AalFacts | null | undefined): SubjectAal | undefined {
  if (!subject?.isAuthenticated || subject.viaShare || subject.bearerWithoutLevel) return undefined;
  let raw: SubjectAal | undefined;
  if (subject.viaToken) raw = toAal(subject.viaToken.aal);
  else if (subject.resolveRolesNow) raw = toAal(subject.grantedAal);
  else raw = toAal(subject.signIn?.aal) ?? (subject.signIn ? undefined : 1);
  if (raw === undefined) return undefined;
  return toAal(Math.min(raw, typeof subject.aalCap === 'number' && subject.aalCap >= 1 ? subject.aalCap : 3));
}

/**
 * The fields of a request's subject that bear on its level, copied by name so
 * a subject rebuilt for a decision keeps them (the #1164 lesson: a field not
 * forwarded is silently lost). Reads nothing else from it.
 */
export function aalFactsOf(subject: object | null | undefined): AalFacts {
  const s = (subject ?? {}) as Record<string, unknown>;
  return {
    signIn: s.signIn as AalFacts['signIn'],
    aalCap: typeof s.aalCap === 'number' ? s.aalCap : undefined,
    viaToken: s.viaToken as AalFacts['viaToken'],
    viaShare: s.viaShare,
    bearerWithoutLevel: s.bearerWithoutLevel,
    grantedAal: s.grantedAal,
    resolveRolesNow: s.resolveRolesNow
  };
}

/** Where a subject attribute may be read from: `account:<field>`, `profile:<field>` or `sign-in`. */
export const SUBJECT_SOURCES = ['account:', 'profile:', 'sign-in'] as const;

/** One declared subject attribute, as `ngdpbase.access.subject-attributes` holds it. */
export interface DeclaredSubjectAttribute {
  type?: string;
  from?: string;
}

/**
 * `id` and `aal` mean what they mean here, whatever the configuration (or an
 * add-on's default-config.json) says (#2287). `aal` is read from the sign-in
 * record and `id` from the account; a site that could redefine either could
 * make `subject:aal` read a field it controls and pass a "second factor" rule.
 */
export const PINNED_SUBJECT_ATTRIBUTES: Readonly<Record<string, DeclaredSubjectAttribute>> = {
  id: { type: 'identity', from: 'account:id' },
  aal: { type: 'integer', from: 'sign-in' }
};

/** The subject attributes a site declares, with `id` and `aal` pinned to their built-in meaning. Anything not an object is ignored. */
export function declaredSubjectAttributes(raw: unknown): Record<string, DeclaredSubjectAttribute> {
  const declared = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, DeclaredSubjectAttribute>) : {};
  return { ...declared, ...PINNED_SUBJECT_ATTRIBUTES };
}

/**
 * What is wrong with the value of `ngdpbase.access.subject-attributes` itself
 * (#2287), one message each: not an object; `id` or `aal` declared with any
 * meaning but the built-in one (the built-in is kept regardless; the same
 * declaration as the built-in is harmless and not reported); and any other
 * declaration `subjectDeclarationProblem` refuses. Used on save, on load and at boot.
 */
export function subjectAttributesProblems(raw: unknown, sensitive: readonly string[]): string[] {
  return subjectAttributesFindings(raw, sensitive).map((f) => f.log);
}

/** {@link subjectAttributesProblems}, each also in plain words for the needs-attention entry. */
export function subjectAttributesFindings(raw: unknown, sensitive: readonly string[]): PolicyFinding[] {
  if (raw === null || raw === undefined) return [];
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return [{
      log: 'ngdpbase.access.subject-attributes must be an object of attribute name to { type, from }',
      plain: 'The list of user details that rules can check is not in a form the site can read, so none of them work. Fix or clear that list in Admin → Configuration.'
    }];
  }
  return Object.entries(raw as Record<string, DeclaredSubjectAttribute>).flatMap(([name, decl]) => {
    const pinned = Object.hasOwn(PINNED_SUBJECT_ATTRIBUTES, name) ? PINNED_SUBJECT_ATTRIBUTES[name] : undefined;
    if (pinned) {
      const same = !!decl && typeof decl === 'object' && decl.type === pinned.type && decl.from === pinned.from;
      return same ? [] : [{
        log: `subject attribute '${name}' in ngdpbase.access.subject-attributes cannot be redefined: it is built in (type ${pinned.type}, from ${pinned.from}) and keeps that meaning; remove it`,
        plain: `The user detail '${name}' is built into the site and cannot be redefined, so your version is ignored. Remove it from the list of user details in Admin → Configuration.`
      }];
    }
    const problem = subjectDeclarationFinding(name, decl, sensitive);
    return problem ? [problem] : [];
  });
}

/**
 * What is wrong with a subject attribute's declaration, or `null`: a `type`
 * that is not known, a `from` that is not a subject source, or an account field
 * that must never be read (`sensitive`, the password, email, roles and the
 * like). Said so a condition naming it is refused rather than silently unknown.
 */
export function subjectDeclarationProblem(name: string, decl: DeclaredSubjectAttribute | undefined, sensitive: readonly string[]): string | null {
  return subjectDeclarationFinding(name, decl, sensitive)?.log ?? null;
}

/** {@link subjectDeclarationProblem}, also in plain words. */
function subjectDeclarationFinding(name: string, decl: DeclaredSubjectAttribute | undefined, sensitive: readonly string[]): PolicyFinding | null {
  const where = `subject attribute '${name}' in ngdpbase.access.subject-attributes`;
  const plain = `The user detail '${name}' is not set up correctly, so a rule that checks it will not work. Fix it, or remove it, in the list of user details in Admin → Configuration.`;
  if (!decl || typeof decl !== 'object') return { log: `${where} must be an object with a type and a from`, plain };
  if (!ATTRIBUTE_TYPES.includes(decl.type as AttributeType)) return { log: `${where} has type ${JSON.stringify(decl.type)}; use one of ${ATTRIBUTE_TYPES.join(', ')}`, plain };
  const from = decl.from;
  const source = typeof from === 'string' ? SUBJECT_SOURCES.find((s) => from === s || (s !== 'sign-in' && from.startsWith(s))) : undefined;
  if (!source) return { log: `${where} reads from ${JSON.stringify(from)}; start it with ${SUBJECT_SOURCES.join(', ')}`, plain };
  if (source !== 'sign-in') {
    const field = (from as string).slice(source.length);
    if (!field) return { log: `${where} reads from '${source}' with no field; write ${source}<field>`, plain };
    if (sensitive.includes(field)) {
      return {
        log: `'${source}${field}' cannot be used in a condition`,
        plain: `The user detail '${name}' reads private account data, which a rule may not check. Remove it from the list of user details in Admin → Configuration.`
      };
    }
  }
  return null;
}

/**
 * A declaration map as written, every `$NAME` left unresolved, or `null` when
 * it cannot be read. Declarations are read this way so a `$NAME` in one is
 * judged and reported as written and an environment variable's value never
 * reaches a message or a log line; a throwing read (an unset variable) is
 * `null`, not an exception.
 */
export function readDeclaredAsWritten(config: { getUnresolvedProperty?: (key: string, def?: unknown) => unknown; getProperty: (key: string, def?: unknown) => unknown } | null | undefined, key: string): unknown {
  if (!config) return null;
  try {
    // No unresolved read means no way to avoid resolving `$NAME`, so read nothing.
    return typeof config.getUnresolvedProperty === 'function' ? config.getUnresolvedProperty(key, null) : null;
  } catch {
    return null;
  }
}

/** Where an environment attribute may be read from: `schedule:<name>` or `config:<key>` (#2261 slice 4). */
export const ENVIRONMENT_SOURCES = ['schedule:', 'config:'] as const;

/** One declared environment attribute, as `ngdpbase.access.environment-attributes` holds it. */
export interface DeclaredEnvironmentAttribute {
  type?: string;
  from?: string;
}

/** The environment attributes a site declares. Anything not an object is ignored. */
export function declaredEnvironmentAttributes(raw: unknown): Record<string, DeclaredEnvironmentAttribute> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, DeclaredEnvironmentAttribute>) : {};
}

/**
 * What is wrong with an environment attribute's declaration, or `null`: a
 * `type` that is not `boolean` (both sources yield a boolean and nothing
 * else), a `from` that is not `schedule:<name>` or `config:<key>`, or one with
 * no name or key after the prefix. Any configuration key may be read, secrets
 * included (#2261): a condition can only compare the value, and the value is
 * never written to a log, an audit record or a message.
 */
export function environmentDeclarationProblem(name: string, decl: DeclaredEnvironmentAttribute | undefined): string | null {
  return environmentDeclarationFinding(name, decl)?.log ?? null;
}

/** {@link environmentDeclarationProblem}, also in plain words. */
function environmentDeclarationFinding(name: string, decl: DeclaredEnvironmentAttribute | undefined): PolicyFinding | null {
  const where = `environment attribute '${name}' in ngdpbase.access.environment-attributes`;
  const plain = `The check '${name}' (for rules that depend on a schedule or a setting) is not set up correctly, so a rule that uses it will not work. Fix it, or remove it, in the list of checks in Admin → Configuration.`;
  if (!decl || typeof decl !== 'object') return { log: `${where} must be an object with a type and a from`, plain };
  if (decl.type !== 'boolean') return { log: `${where} has type ${JSON.stringify(decl.type)}; schedule: and config: attributes are boolean only, so use "boolean"`, plain };
  const from = decl.from;
  const source = typeof from === 'string' ? ENVIRONMENT_SOURCES.find((s) => from.startsWith(s)) : undefined;
  if (!source) return { log: `${where} reads from ${JSON.stringify(from)}; start it with ${ENVIRONMENT_SOURCES.join(' or ')}`, plain };
  if (!(from as string).slice(source.length)) return { log: `${where} reads from '${source}' with no ${source === 'schedule:' ? 'schedule name' : 'key'}; write ${source}<${source === 'schedule:' ? 'name' : 'key'}>`, plain };
  return null;
}

/**
 * What is wrong with the value of `ngdpbase.access.environment-attributes`
 * itself, one message each: not an object, or a declaration
 * {@link environmentDeclarationProblem} refuses. Used on save, on load and at boot.
 */
export function environmentAttributesProblems(raw: unknown): string[] {
  return environmentAttributesFindings(raw).map((f) => f.log);
}

/** {@link environmentAttributesProblems}, each also in plain words for the needs-attention entry. */
export function environmentAttributesFindings(raw: unknown): PolicyFinding[] {
  if (raw === null || raw === undefined) return [];
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return [{
      log: 'ngdpbase.access.environment-attributes must be an object of attribute name to { type, from }',
      plain: 'The list of checks that depend on a schedule or a setting is not in a form the site can read, so none of them work. Fix or clear that list in Admin → Configuration.'
    }];
  }
  return Object.entries(raw as Record<string, DeclaredEnvironmentAttribute>).flatMap(([name, decl]) => {
    const problem = environmentDeclarationFinding(name, decl);
    return problem ? [problem] : [];
  });
}

/**
 * What the old plural `conditions` array's entry types become in the single `condition` (#2334).
 * Only a user-attribute entry with an equality operator (`==` or `===`) has an equivalent: a string comparison.
 */
const CONDITIONS_DECLARATION = '{ "department": { "type": "string", "from": "profile:department" } }';
const CONDITIONS_EXAMPLE = '{ "string-equal": [ { "attributeid": "subject:department", "datatype": "string" }, { "value": "IT", "datatype": "string" } ] }';

/** The policies that carry a non-empty old plural `conditions` array, named by id or by position (#2334). An empty array limits nothing either way, so it is not named. */
function policiesWithOldConditions(policies: unknown): string[] {
  if (!Array.isArray(policies)) return [];
  return [...policies.entries()]
    .filter(([, p]) => {
      const c = (p as { conditions?: unknown } | null)?.conditions;
      return Array.isArray(c) && c.length > 0;
    })
    .map(([i, p]) => `'${typeof (p as { id?: unknown }).id === 'string' ? (p as { id: string }).id : `#${i + 1}`}'`);
}

/**
 * The words an administrator sees (the needs-attention entry and the save message) when a policy carries
 * the old plural `conditions` array, or null when none does (#2334). Plain words: no issue number, no JSON.
 */
export function unenforcedConditionsNotice(policies: unknown): string | null {
  const names = policiesWithOldConditions(policies);
  if (names.length === 0) return null;
  const one = names.length === 1;
  return `${one ? 'This rule has' : 'These rules have'} an old 'conditions' list that the site ignores, so it doesn't limit anyone: ${names.join(', ')}. Move ${one ? 'it' : 'each one'} into ${one ? 'the' : 'its'} rule's condition, or remove it.`;
}

/**
 * The start-up log line for the same policies, in full: the condition to write, the attribute
 * declaration it needs, and the entry types with no equivalent (#2334). Null when none has one.
 * Nothing in the decision path reads that array, so a rule written there limits no access.
 */
export function unenforcedConditionsLine(policies: unknown): string | null {
  const names = policiesWithOldConditions(policies);
  if (names.length === 0) return null;
  return `${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} a conditions array, which is not enforced: nothing reads it, so it limits no access. `
    + `Replace it with the single condition in the XACML form. A user-attribute entry with the == or === operator becomes ${CONDITIONS_EXAMPLE}, `
    + `which needs the attribute declared with a source in ngdpbase.access.subject-attributes, for example ${CONDITIONS_DECLARATION} (see docs/access-policies.md#subject-attributes). `
    + 'The other entry types (time-range, ip-range, context-attribute, session-attribute, environment, and user-attribute with any other operator) have no equivalent: a rule you need cannot be written yet, so do not rely on it (#2334)';
}
