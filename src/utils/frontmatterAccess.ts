/**
 * frontmatterAccess — the single implementation of ACL Tier 1 (#1054).
 *
 * A page's frontmatter can restrict who may act on it, via `access[<action>]`
 * or, for viewing, `audience`. Two subsystems needed that answer and each had
 * its own version of it, which is how they came to disagree:
 *
 *   - `PolicyInformationPoint.checkFrontmatterAccess` decided a request, correctly.
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
 * The entry `addon:<slug>` (#1964): "people who turned on the per-person
 * add-on <slug>". It is matched only against the viewer's enabled add-ons,
 * never against a role or a username.
 */
export const ADDON_PRINCIPAL_PREFIX = 'addon:';

/** The slug an `addon:<slug>` entry names, or null for any other entry. */
function addonSlugOf(principal: unknown): string | null {
  return typeof principal === 'string' && principal.startsWith(ADDON_PRINCIPAL_PREFIX)
    ? principal.slice(ADDON_PRINCIPAL_PREFIX.length)
    : null;
}

/**
 * Whether deciding `action` on this page needs the viewer's enabled add-ons —
 * so a caller asks for them only when the page names one (#1964).
 */
export function namesAddonPrincipal(metadata: AccessMetadataLike | null | undefined, action: string): boolean {
  return resolveFrontmatterPrincipals(metadata, action)?.some((p) => addonSlugOf(p) !== null) ?? false;
}

/**
 * Every add-on slug the page names in `audience` or in any `access` list, once
 * each, in the order first named — for the warning about a slug that can match
 * nobody (#1964).
 */
export function addonAudienceSlugs(metadata: AccessMetadataLike | null | undefined): string[] {
  if (!metadata) return [];
  const lists: unknown[] = [metadata.audience];
  if (metadata.access && typeof metadata.access === 'object') lists.push(...Object.values(metadata.access as Record<string, unknown>));
  const slugs = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      const slug = addonSlugOf(p);
      if (slug !== null) slugs.add(slug);
    }
  }
  return [...slugs];
}

/**
 * Decide Tier 1 for a viewer described as a flat principal list — their roles
 * plus their username. Callers holding a `UserContext` should pass
 * `[...roles, username]`; the provider layer already works in these terms.
 *
 * An `addon:<slug>` entry matches only when `<slug>` is in `enabledAddons`,
 * the viewer's enabled per-person add-ons (#1964); a caller that does not
 * supply them matches no such entry, so it can under-list but never leak.
 *
 * Denies when the page states a rule and nothing matches. That default is the
 * point: a listing that treats "no match" as "show it" is the bug this exists
 * to prevent.
 */
export function decideFrontmatterAccess(
  metadata: AccessMetadataLike | null | undefined,
  viewerPrincipals: readonly string[],
  action: string,
  enabledAddons: readonly string[] = []
): FrontmatterDecision {
  const principals = resolveFrontmatterPrincipals(metadata, action);
  if (!principals) return { decided: false, allowed: false };

  for (const p of principals) {
    const slug = addonSlugOf(p);
    const matches = slug === null ? viewerPrincipals.includes(p) : slug !== '' && enabledAddons.includes(slug);
    if (matches) {
      return { decided: true, allowed: true, matched: p };
    }
  }
  return { decided: true, allowed: false };
}
