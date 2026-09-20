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

/** Who a policy grants to. `role` is the only type the evaluator matches today. */
export interface PolicySubject {
  /** `role`, and in future `user` or `group`. */
  type: string;
  value: string;
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
 * branch on the reason, or the reason becomes an interface.
 */
export interface Decision {
  permit: boolean;
  /**
   * Whether any policy spoke to this question at all.
   *
   * XACML's NotApplicable, and it is load-bearing here: the page door falls
   * through to its remaining tiers when no policy matched, while a capability
   * check treats silence as a refusal. A binary decision cannot express the
   * difference, and flattening it would silently delete Tier 3.
   *
   * `permit` is always false when this is false — nothing has said yes.
   */
  applicable: boolean;
  reason: string;
}

/** True when `pattern` covers `id` for a resource of that type. `*` is everything. */
export function resourceMatches(pattern: string, id: string): boolean {
  if (pattern === '*') return true;
  if (pattern === id) return true;
  if (pattern.endsWith('*')) return id.startsWith(pattern.slice(0, -1));
  return false;
}
