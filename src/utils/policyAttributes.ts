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

/**
 * Decides one comparison once both sides are read. `undefined` is unknown: a
 * side that is missing, or not of a type the operator can compare.
 */
export function compareLeaf(operator: string, left: unknown, right: unknown): boolean | undefined {
  if (left === undefined || left === null || right === undefined || right === null) return undefined;
  switch (operator) {
  case 'equals':
    return left === right;
  case 'not-equals':
    return left !== right;
  case 'in':
    return Array.isArray(right) ? right.includes(left) : undefined;
  case 'greater-or-equal':
    return typeof left === 'number' && typeof right === 'number' ? left >= right : undefined;
  case 'less-or-equal':
    return typeof left === 'number' && typeof right === 'number' ? left <= right : undefined;
  default:
    return undefined;
  }
}
