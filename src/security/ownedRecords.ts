/**
 * Add-on record decisions (#1823).
 *
 * The add-on's manager is the enforcement point. It reads `owner` from the
 * stored row and asks {@link PolicyDecisionPoint.decideOwnedRecord} or
 * {@link PolicyDecisionPoint.decideOwnedList}. The answer is never null.
 * A type that declares `owner` (an identity @id) is refused to anyone but
 * that owner: under a proxy grant the subject is the person represented, so
 * the delegate is allowed and a role is not. A type with no `owner` is
 * decided by policy alone. A list that is refused is a denial, not an empty
 * page of rows.
 */

/** The PDP cannot decide. The caller fails closed; this is not a deny. */
export class OwnedRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OwnedRecordError';
  }
}

/** One record, with the attributes the manager read from its stored row. */
export interface OwnedRecordAsk {
  action: string;
  resource: {
    type: string;
    id: string;
    /** From the stored row. `owner`, when the type declares it, is the identity @id. */
    attributes?: Record<string, unknown>;
  };
}

/** A list of one type. There is no owner argument: the filter comes from the subject. */
export interface OwnedListAsk {
  action: string;
  resource: { type: string };
}

/**
 * A constraint the manager turns into a bound parameter. Never SQL.
 * `equals` means the column must equal the one value.
 */
export interface OwnedRecordFilter {
  attribute: string;
  operator: 'equals';
  values: readonly string[];
}

/**
 * The resource a refusal is audited against (#1823). `owner` is the identity
 * @id from the stored row, `ownerUser` that person's username. Both come from
 * storage, never from the request body.
 */
export interface OwnedAuditResource {
  type: string;
  id?: string;
  owner?: string;
  ownerUser?: string;
}

/** An explicit list answer (#1823). `filter` is empty only when the type has no owner. */
export type OwnedListDecision =
  | { decision: 'allow'; filter: readonly OwnedRecordFilter[] }
  | { decision: 'deny'; reason: string; policyIds: readonly string[] };

/**
 * What is wrong with a resource type's `owner` declaration, or null (#1823).
 * `owner`, when present at all, must be exactly `{ "type": "identity" }`.
 * Anything else, `null` included, would quietly make an owner type
 * policy-alone, so the decision throws and start-up refuses the config.
 */
export function ownerDeclarationProblem(type: string, entry: unknown): string | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const attributes = (entry as { attributes?: unknown }).attributes;
  if (typeof attributes !== 'object' || attributes === null || !Object.hasOwn(attributes, 'owner')) return null;
  const owner = (attributes as Record<string, unknown>).owner;
  if (typeof owner === 'object' && owner !== null && (owner as { type?: unknown }).type === 'identity') return null;
  return `resource type '${type}' declares owner as ${JSON.stringify(owner)}; owner must be { "type": "identity" }, the owner's identity @id`;
}
