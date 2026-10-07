/**
 * Which permission entries are actions someone may hold (#1638 slice 3).
 *
 * Every audit event is declared on a permission entry, so the catalog also
 * holds records that no one is ever permitted to do — `system-start`,
 * `job-failed`, `authentication-failed`. Those entries carry
 * `"grantable": false`. This is the one predicate that says so; everything
 * that hands out, offers or lists permissions asks it: app (OIDC) scopes,
 * the generated `CorePermission` type, the admin roles matrix and the
 * permission listings. Omitted means grantable.
 */

/** True unless the entry says `"grantable": false`. */
export function isGrantable(entry: unknown): boolean {
  return !(entry && typeof entry === 'object' && (entry as { grantable?: unknown }).grantable === false);
}

/** The names of the grantable entries in a permission catalog, in catalog order. */
export function grantablePermissionNames(definitions: unknown): string[] {
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) return [];
  return Object.entries(definitions as Record<string, unknown>)
    .filter(([, entry]) => isGrantable(entry))
    .map(([name]) => name);
}

/** The grantable entries of a permission catalog, as a map in catalog order. */
export function grantablePermissions<T>(definitions: Record<string, T> | null | undefined): Record<string, T> {
  return Object.fromEntries(Object.entries(definitions ?? {}).filter(([, entry]) => isGrantable(entry)));
}

/**
 * Permissions that were split into narrower ones, and what each stood for.
 *
 * A policy, an agent token or an app grant written before the split still
 * names the old permission; it is read as all of the new ones, so nobody loses
 * an ability on upgrade. New writing should name the new permissions.
 */
export const RETIRED_PERMISSIONS: ReadonlyMap<string, readonly string[]> = new Map([
  // #1638: one name per action — create, extend and revoke are separate.
  ['share-manage', ['share-create', 'share-extend', 'share-revoke']]
]);

/** The names with every retired permission replaced by what it stood for, de-duplicated, order kept. */
export function withRetiredExpanded(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    for (const n of RETIRED_PERMISSIONS.get(name) ?? [name]) {
      if (!out.includes(n)) out.push(n);
    }
  }
  return out;
}
