/**
 * The vocabulary of a policy `condition` (#2261): attribute types, the
 * operator table, the nesting limit, and how one comparison is decided.
 * Pure: no I/O, no manager. The evaluator and the validator both import it,
 * so the set of operators lives here and nowhere else.
 */

/** The types an attribute can be declared with. */
export const ATTRIBUTE_TYPES = ['string', 'integer', 'boolean', 'identity', 'list'] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

/**
 * How deep a condition may nest. Every node counts, leaves included, so
 * `any-of` > `all-of` > `not` > leaf is 4 and one more level is refused.
 */
export const MAX_CONDITION_DEPTH = 4;

/**
 * How wide a condition may be (#2261). Depth alone leaves the tree as wide as
 * a config file can make it, and the evaluator walks it for every page a
 * listing or search asks about. A literal `in` list, the children of one
 * `any-of` or `all-of`, and the nodes of the whole condition are each capped.
 */
export const MAX_IN_ITEMS = 256;
export const MAX_GROUP_CHILDREN = 256;
export const MAX_CONDITION_NODES = 512;

/** What a comparison against an attribute accepts, by operator. */
interface LeafOperator {
  /** Types the attribute on the left may have. */
  left: readonly AttributeType[];
}

const SCALARS: readonly AttributeType[] = ['string', 'integer', 'boolean', 'identity'];

/** The operators that compare one attribute with a value. */
export const LEAF_OPERATORS: Readonly<Record<string, LeafOperator>> = {
  equals: { left: SCALARS },
  'not-equals': { left: SCALARS },
  in: { left: ['string', 'integer', 'identity'] },
  'greater-or-equal': { left: ['integer'] },
  'less-or-equal': { left: ['integer'] }
};

/** The operators that combine conditions. `not` takes one condition, these take a list. */
export const GROUP_OPERATORS = ['any-of', 'all-of'] as const;
export const NOT_OPERATOR = 'not';

/** Every operator, in the order the validator lists them. */
export const CONDITION_OPERATORS: readonly string[] = [...Object.keys(LEAF_OPERATORS), ...GROUP_OPERATORS, NOT_OPERATOR];

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
 * side that is missing, or not of a type the operator can compare. Both sides
 * must be the same kind of value (a string, a boolean or a whole number), so
 * "5" never equals 5 and NaN never compares. `in` takes an array, or a Set the
 * evaluator built from a literal list; every entry of an array must be the
 * kind of value on the left. An empty string is a value, not a missing one.
 */
export function compareLeaf(operator: string, left: unknown, right: unknown): boolean | undefined {
  if (!isComparable(left)) return undefined;
  switch (operator) {
  case 'equals':
    return isComparable(right) && typeof right === typeof left ? left === right : undefined;
  case 'not-equals':
    return isComparable(right) && typeof right === typeof left ? left !== right : undefined;
  case 'in':
    if (right instanceof Set) return right.has(left);
    return Array.isArray(right) && right.every((v) => isComparable(v) && typeof v === typeof left) ? right.includes(left) : undefined;
  case 'greater-or-equal':
    return typeof left === 'number' && typeof right === 'number' && Number.isInteger(right) ? left >= right : undefined;
  case 'less-or-equal':
    return typeof left === 'number' && typeof right === 'number' && Number.isInteger(right) ? left <= right : undefined;
  default:
    return undefined;
  }
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
 * - A session: its sign-in record's level; a session from before sign-ins
 *   were recorded is AAL 1, as `AuthManager` treats it.
 *
 * Capped at `aalCap`, as a role is. Reads the record; it never works the level
 * out from factors.
 */
export function effectiveAal(subject: AalFacts | null | undefined): SubjectAal | undefined {
  if (!subject?.isAuthenticated || subject.viaShare) return undefined;
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

/** `subject:id` keeps working on a site whose configuration does not declare it. `aal` has no fallback. */
const BUILT_IN_SUBJECT_ATTRIBUTES: Readonly<Record<string, DeclaredSubjectAttribute>> = { id: { type: 'identity', from: 'account:id' } };

/** The subject attributes a site declares, with `id` always there. Anything not an object is ignored. */
export function declaredSubjectAttributes(raw: unknown): Record<string, DeclaredSubjectAttribute> {
  const declared = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, DeclaredSubjectAttribute>) : {};
  return { ...BUILT_IN_SUBJECT_ATTRIBUTES, ...declared };
}

/**
 * What is wrong with a subject attribute's declaration, or `null`: a `type`
 * that is not known, a `from` that is not a subject source, or an account field
 * that must never be read (`sensitive`, the password, email, roles and the
 * like). Said so a condition naming it is refused rather than silently unknown.
 */
export function subjectDeclarationProblem(name: string, decl: DeclaredSubjectAttribute | undefined, sensitive: readonly string[]): string | null {
  const where = `subject attribute '${name}' in ngdpbase.access.subject-attributes`;
  if (!decl || typeof decl !== 'object') return `${where} must be an object with a type and a from`;
  if (!ATTRIBUTE_TYPES.includes(decl.type as AttributeType)) return `${where} has type ${JSON.stringify(decl.type)}; use one of ${ATTRIBUTE_TYPES.join(', ')}`;
  const from = decl.from;
  const source = typeof from === 'string' ? SUBJECT_SOURCES.find((s) => from === s || (s !== 'sign-in' && from.startsWith(s))) : undefined;
  if (!source) return `${where} reads from ${JSON.stringify(from)}; start it with ${SUBJECT_SOURCES.join(', ')}`;
  if (source !== 'sign-in') {
    const field = (from as string).slice(source.length);
    if (!field) return `${where} reads from '${source}' with no field; write ${source}<field>`;
    if (sensitive.includes(field)) return `'${source}${field}' cannot be used in a condition`;
  }
  return null;
}
