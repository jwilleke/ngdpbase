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
  ['share-manage', ['share-create', 'share-extend', 'share-revoke']],
  // #2038: renamed (identity model, step 3); the old names are read for one release only.
  ['contact-read', ['identity-read']],
  ['contact-manage', ['identity-manage']]
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

/**
 * What the standard OpenID Connect sign-in scopes let an app see, in plain
 * words (#1572). They are not permissions, so they are not in the catalog;
 * this is their one declaration — the consent page and the "My tokens and
 * devices" list both read it through `describeScopes`.
 */
export const SIGN_IN_SCOPE_LABELS: Readonly<Record<string, string>> = {
  openid: 'Confirm who you are (your username)',
  profile: 'Your name',
  email: 'Your email address',
  address: 'Your postal address',
  phone: 'Your phone number',
  offline_access: 'Stay connected while you are not using it, until you revoke it'
};

/** One scope or permission as a person reads it: its name, and what it lets the holder do. */
export interface ScopeDescription {
  name: string;
  description: string;
}

/**
 * A permission entry in plain words (#1764): its `label` — the end-user line
 * shown wherever a person reads what a permission does — else its
 * `description` (an add-on that declares no label), else nothing.
 */
export function permissionLabel(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object') return null;
  const { label, description } = entry as { label?: unknown; description?: unknown };
  if (typeof label === 'string' && label.trim()) return label;
  if (typeof description === 'string' && description.trim()) return description;
  return null;
}

/**
 * Scope or permission names in plain words (#1764), in order, without
 * repeats: a sign-in scope by `SIGN_IN_SCOPE_LABELS`, a permission by
 * `permissionLabel` of its catalog entry. A name declared nowhere (an app's
 * own scope, such as a host's `patient/*.read`) is shown as itself.
 */
export function describeScopes(names: readonly string[], definitions: unknown): ScopeDescription[] {
  const catalog = definitions && typeof definitions === 'object' && !Array.isArray(definitions) ? definitions as Record<string, unknown> : {};
  const out: ScopeDescription[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const description = Object.hasOwn(SIGN_IN_SCOPE_LABELS, name)
      ? SIGN_IN_SCOPE_LABELS[name]
      : (Object.hasOwn(catalog, name) ? permissionLabel(catalog[name]) : null);
    out.push({ name, description: description ?? name });
  }
  return out;
}
