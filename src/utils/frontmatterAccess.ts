/**
 * frontmatterAccess — the single implementation of ACL Tier 1 (#1054).
 *
 * A page's frontmatter can restrict who may act on it, via `access[<action>]`
 * or, for viewing, `audience`. Two subsystems needed that answer and each had
 * its own version of it, which is how they came to disagree:
 *
 *   - `ACLManager.checkFrontmatterAccess` decided a request, correctly.
 *   - `VersioningFileProvider.getRecentChanges` decided a listing, and only
 *     consulted `audience` for pages already marked private — so every
 *     non-private page carrying an audience was listed to everyone, while
 *     `/view/` on the same page returned 403.
 *
 * Both now call this. The invariant worth keeping is that anything which LISTS
 * pages agrees with whatever DECIDES access, so a page can never appear in a
 * listing its viewer cannot open.
 *
 * Pure and dependency-free so the provider layer can use it without reaching
 * up into a manager.
 */

/** The frontmatter fields Tier 1 reads. */
export interface AccessMetadataLike {
  /** `{ view: ['role'], edit: [...] }` — per-action principal lists. */
  access?: unknown;
  /** Shorthand for `access.view`. */
  audience?: unknown;
}

export interface FrontmatterDecision {
  /** False when the page carries no rule for this action — caller falls through. */
  decided: boolean;
  /** Meaningful only when `decided`. */
  allowed: boolean;
  /** The principal that matched, for logging. */
  matched?: string;
}

/**
 * Principals permitted to perform `action`, or null when the page states no
 * rule and the caller should fall through to global policy.
 *
 * `access[action]` wins; `audience` is the shorthand and applies to `view`
 * only. An empty list counts as no rule — a page saying `audience: []`
 * restricts nobody, which matters because a bare `access:` key parses that way.
 */
export function resolveFrontmatterPrincipals(
  metadata: AccessMetadataLike | null | undefined,
  action: string
): string[] | null {
  if (!metadata) return null;

  let principals: string[] | undefined;
  if (metadata.access && typeof metadata.access === 'object') {
    const forAction = (metadata.access as Record<string, unknown>)[action];
    if (Array.isArray(forAction)) principals = forAction as string[];
  }
  if (!principals && action === 'view' && Array.isArray(metadata.audience)) {
    principals = metadata.audience as string[];
  }
  return principals?.length ? principals : null;
}

/**
 * Decide Tier 1 for a viewer described as a flat principal list — their roles
 * plus their username. Callers holding a `UserContext` should pass
 * `[...roles, username]`; the provider layer already works in these terms.
 *
 * Denies when the page states a rule and nothing matches. That default is the
 * point: a listing that treats "no match" as "show it" is the bug this exists
 * to prevent.
 */
export function decideFrontmatterAccess(
  metadata: AccessMetadataLike | null | undefined,
  viewerPrincipals: readonly string[],
  action: string
): FrontmatterDecision {
  const principals = resolveFrontmatterPrincipals(metadata, action);
  if (!principals) return { decided: false, allowed: false };

  for (const p of principals) {
    if (viewerPrincipals.includes(p)) {
      return { decided: true, allowed: true, matched: p };
    }
  }
  return { decided: true, allowed: false };
}
