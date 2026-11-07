'use strict';

/**
 * Access policy shapes — declared once (#1431).
 *
 * A policy grants actions to subjects on resources. It is written in
 * `ngdpbase.access.policies` and read through `ConfigurationManager`; nothing
 * else grants.
 *
 * These were declared four times before this file: `PolicyManager` had its own
 * `Policy`, `PolicyEvaluator` had `Policy`, `PolicySubject` and
 * `PolicyResource`, `types/Share.ts` had `ShareResource` for the same
 * `{ type, pattern }` pair, and `types/express.d.ts` re-declared that pair
 * again because a `.d.ts` may not import a `.ts`. Four copies of one shape is
 * how a field gets added to one and missed in the others.
 */

/** Who a policy grants to. The evaluator matches `role`, `job` (#1999), `authenticated` and `anyone` (#2261), its `SUBJECT_MATCHERS`. */
export interface PolicySubject {
  /** `role`, `job` for a scheduled job acting as itself (#1999), or `authenticated` / `anyone` (#2261). */
  type: string;
  /** The role or the job id. `authenticated` and `anyone` take none. */
  value?: string;
}

/**
 * What a policy covers.
 *
 * `type` names the kind of thing — `page`, `media`, `asset`. `pattern` is
 * matched against the resource's id; `*` is everything of that type.
 */
export interface PolicyResource {
  type: string;
  pattern: string;
}

/**
 * A comparison of one attribute with a value (#2255, #2261). A string starting
 * `subject:`, `resource:` or `environment:` names an attribute; anything else
 * is a literal. Exactly one operator key beside `attribute`:
 * `equals`, `not-equals`, `in`, `greater-or-equal`, `less-or-equal`.
 */
export type LeafCondition = { attribute: string } & (
  | { equals: unknown }
  | { 'not-equals': unknown }
  | { in: unknown[] | string }
  | { 'greater-or-equal': number | string }
  | { 'less-or-equal': number | string }
);

/**
 * A policy's condition: a {@link LeafCondition}, or `any-of` / `all-of` /
 * `not` over other conditions, nested at most 4 deep.
 *
 * Each node is true, false or unknown. A leaf reading an attribute that is
 * missing is unknown; in `any-of` a true branch decides, in `all-of` a false
 * one does, and `not` of unknown is unknown. An allow applies only when the
 * condition is true; a deny applies when it is true or unknown.
 */
export type PolicyCondition =
  | LeafCondition
  | { 'any-of': PolicyCondition[] }
  | { 'all-of': PolicyCondition[] }
  | { not: PolicyCondition };

/** The prefixes that mark a condition value as an attribute rather than a literal (#2255). */
export const ATTRIBUTE_CATEGORIES = ['subject', 'resource', 'environment'] as const;

/** True when `value` names an attribute (`subject:id`, `resource:owner`), not a literal. */
export function isAttributeName(value: unknown): value is string {
  return typeof value === 'string' && ATTRIBUTE_CATEGORIES.some((c) => value.startsWith(`${c}:`));
}

/** One entry of `ngdpbase.access.policies`. */
export interface Policy {
  id: string;
  name?: string;
  description?: string;
  /** Lower runs first, so a higher-priority deny lands last and wins. */
  priority?: number;
  /**
   * `allow` or `deny`. Typed as a string because the value comes from
   * configuration, where an operator can write anything; the evaluator treats
   * everything that is not `deny` as an allow.
   */
  effect?: string;
  subjects?: PolicySubject[];
  resources?: PolicyResource[];
  actions?: string[];
  /** Applies only when this holds (#2255); see {@link PolicyCondition}. */
  condition?: PolicyCondition;
  [key: string]: unknown;
}

/**
 * The thing a decision is about.
 *
 * Deliberately NOT a page name. The policies have always modelled resources as
 * `{ type, pattern }` — `ShareResource` says so in as many words: "Resource
 * type the evaluator knows: page, media, …" — while the call that asked for a
 * decision flattened it to a page name, which is why assets, media and
 * attachments each grew their own path.
 *
 * Deliberately not the domain object either. A decision takes a REFERENCE, so
 * the PDP answers without loading anything — including when the answer is a
 * flat no. An `AssetRecord` or a page's frontmatter is an ATTRIBUTE source: a
 * PIP supplies it, and only when a policy actually depends on it. Passing the
 * record would make every caller load it first, teach the PDP about each
 * domain type in turn, and need a signature per type.
 */
export interface DecisionResource {
  /**
   * The kind of thing. This is the __permission target__ — the left half of
   * every permission name: `page`, `asset`, `user`, `admin`, `comment`,
   * `profile`, `search`, `share`, `store`, `token`. One vocabulary, declared
   * once, rather than a second taxonomy beside the registry.
   *
   * Two inconsistencies to settle as resources start being used (#1431):
   * shipped policies name only `page`, even on grants like `token-mint` and
   * `user-edit`, so the clause is decorative for nine targets; and shares use
   * `media` (`types/Share.ts`) where the permissions use `asset`.
   */
  type: string;
  /**
   * Which one. A page's name or uuid; an asset's id.
   *
   * An asset is identified by `id` AND `providerId` (`types/Asset.ts`), so a
   * reference to one must be provider-qualified or it is ambiguous.
   */
  id: string;
}

/** What is being asked of the PDP. No resource means a capability question. */
export interface DecisionRequest {
  action: string;
  resource?: DecisionResource;
  /**
   * Where a page or file sits, for the resource types that match on it: the
   * `vault` (#1539) or the `shared-folder` (#2125). A page's own attributes —
   * its `system-category`, its `owner` — are never passed: the PDP asks the
   * PIP for them from the page id (#2255).
   */
  attributes?: Record<string, unknown>;
  /**
   * The page's frontmatter when the PIP itself already holds it (the page
   * door, the list filter), so the PDP's lookup reads no page twice. Only the
   * PIP sets it; a route never does (#2255).
   */
  pageMetadata?: Record<string, unknown> | null;
  /**
   * Whether a share's `resources` cover the thing being asked about.
   *
   * Supplied by the PEP because the answer depends on attributes the PDP does
   * not hold — a page share is matched against the page's keywords, for
   * instance. The PDP owns the RULE (a share must cover the resource); the
   * caller supplies the match, which is the PIP half.
   */
  resourceCoverage?: (shareResources: readonly PolicyResource[]) => boolean;
}

/**
 * What the PDP answers.
 *
 * `reason` is for the log and the audit record. A PEP enforces `permit` and
 * chooses 401 vs 403 from whether the caller is authenticated — it must not
 * branch on the reason, or the reason becomes an interface. The one exception
 * is {@link STEP_UP_REASON}, read only by `ApiContext.enforceDeny` (#1431): the one
 * refusal that offers a way forward (a fresh sign-in).
 */
export interface Decision {
  permit: boolean;
  /**
   * Whether any policy spoke to this question at all.
   *
   * XACML's NotApplicable. Both outcomes refuse when `permit` is false, but
   * they are different facts: a policy that said no is `policy_deny`, while
   * no policy speaking is `default_deny`, and the audit trail must tell an
   * assessor which one happened. Kept three-state for that, even though the
   * page door no longer has a tier below this one to fall through to — the
   * page-ACL markup tier it once fed was removed in #1431 step 7a.
   *
   * `permit` is always false when this is false — nothing has said yes.
   */
  applicable: boolean;
  reason: string;
  /**
   * The ids of the policies that decided (#2255): the denies that matched,
   * or, when none did, the allows that matched. Empty when no policy matched
   * or something other than policy decided (a ceiling, step-up).
   */
  policyIds: string[];
  /**
   * The ids of allow policies that matched subject, resource and action but
   * whose condition was false or unknown (#2288), so a refusal can say which
   * allow was not met. Ids only, never attribute values. Absent when none.
   */
  conditionNotMet?: string[];
}

/**
 * The reason a deny carries when the subject holds the permission but its
 * sign-in is not fresh enough to act (#1635). Declared once: the PDP writes it
 * and `ApiContext.enforceDeny` reads it to ask for a fresh sign-in.
 */
export const STEP_UP_REASON = 'step-up';

/** True when `pattern` covers `id` for a resource of that type. `*` is everything. */
export function resourceMatches(pattern: string, id: string): boolean {
  if (pattern === '*') return true;
  if (pattern === id) return true;
  if (pattern.endsWith('*')) return id.startsWith(pattern.slice(0, -1));
  return false;
}
