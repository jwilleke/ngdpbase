/**
 * frontmatterAccess — the single implementation of ACL Tier 1 (#1054).
 *
 * A page's frontmatter can restrict who may act on it, via `access[<action>]`
 * or `audience`, which covers every action (#1964). Two subsystems needed
 * that answer and each had its own version of it, which is how they came to disagree:
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

import { permissionForPageAction } from '../security/pageActions.js';

/** The frontmatter fields Tier 1 reads. */
export interface AccessMetadataLike {
  /** `{ view: ['role'], edit: [...] }` — per-action principal lists. */
  access?: unknown;
  /** Who may act on the page at all; administrators excepted (#1964). */
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

/** A non-empty principal list, or null — an empty list states no rule. */
function listOrNull(value: unknown): string[] | null {
  return Array.isArray(value) && value.length > 0 ? value as string[] : null;
}

/**
 * The page's `audience`, or null when it names none (#1964, operator
 * 2026-10-23). An audience restricts EVERY action: someone outside it may
 * neither read nor edit the page.
 */
export function audiencePrincipals(metadata: AccessMetadataLike | null | undefined): string[] | null {
  return metadata ? listOrNull(metadata.audience) : null;
}

/**
 * The page's `access[action]` list, or null when it states none. It applies
 * to that action only, and to everyone — administrators included.
 */
export function accessPrincipals(metadata: AccessMetadataLike | null | undefined, action: string): string[] | null {
  if (!metadata?.access || typeof metadata.access !== 'object') return null;
  return listOrNull((metadata.access as Record<string, unknown>)[action]);
}

/** Whether `action` is reading the page — the one action an audience match grants outright. */
function isViewAction(action: string): boolean {
  return permissionForPageAction(action) === 'page-read';
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
  return [audiencePrincipals(metadata), accessPrincipals(metadata, action)]
    .some((list) => list?.some((p) => addonSlugOf(p) !== null) ?? false);
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

/** The first entry of `list` this viewer matches, if any. */
function firstMatch(list: readonly string[], viewerPrincipals: readonly string[], enabledAddons: readonly string[]): string | undefined {
  return list.find((p) => {
    const slug = addonSlugOf(p);
    return slug === null ? viewerPrincipals.includes(p) : slug !== '' && enabledAddons.includes(slug);
  });
}

/**
 * Whether the page's audience leaves this viewer out — true only when it
 * names one and nothing in it matches. The caller then asks whether the
 * viewer is an administrator, the one exception (#1964), and passes the
 * answer to {@link decideFrontmatterAccess}; it asks only when this is true.
 */
export function audienceExcludes(
  metadata: AccessMetadataLike | null | undefined,
  viewerPrincipals: readonly string[],
  enabledAddons: readonly string[] = []
): boolean {
  const audience = audiencePrincipals(metadata);
  return audience !== null && firstMatch(audience, viewerPrincipals, enabledAddons) === undefined;
}

/** The `matched` an administrator outside the audience is admitted by. */
export const AUDIENCE_ADMIN_MATCH = 'admin-system';

/**
 * Decide Tier 1 for a viewer described as a flat principal list — their roles
 * plus their username. Callers holding a `UserContext` should pass
 * `[...roles, username]`; the provider layer already works in these terms.
 *
 * Two rules, in order (#1964, operator 2026-10-23):
 *
 * - __`audience`__ applies to every action. Someone it leaves out may neither
 *   read nor edit the page: every action is refused. The one exception is an
 *   administrator — a viewer holding `admin-system`, which the caller decides
 *   and passes as `isAdmin` (this module never reads a role for it). For
 *   `view`, a viewer the audience admits is allowed; for any other action it
 *   only lets them through to `access` and then policy.
 * - __`access[action]`__ applies to that action, to everyone, administrators
 *   included. When the page states it, it decides.
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
  enabledAddons: readonly string[] = [],
  isAdmin = false
): FrontmatterDecision {
  const audience = audiencePrincipals(metadata);
  let audienceMatched: string | undefined;
  if (audience) {
    audienceMatched = firstMatch(audience, viewerPrincipals, enabledAddons) ?? (isAdmin ? AUDIENCE_ADMIN_MATCH : undefined);
    if (audienceMatched === undefined) return { decided: true, allowed: false };
  }

  const access = accessPrincipals(metadata, action);
  if (access) {
    const matched = firstMatch(access, viewerPrincipals, enabledAddons);
    return matched === undefined ? { decided: true, allowed: false } : { decided: true, allowed: true, matched };
  }

  if (audienceMatched !== undefined && isViewAction(action)) {
    return { decided: true, allowed: true, matched: audienceMatched };
  }
  return { decided: false, allowed: false };
}
