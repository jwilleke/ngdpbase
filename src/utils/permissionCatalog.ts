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
