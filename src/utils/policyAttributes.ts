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
