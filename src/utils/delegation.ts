/**
 * What a delegated credential may never carry (#946, #1198, #1576).
 *
 * A person delegates a subset of their own permissions to something acting
 * for them: an agent token they mint, or an app they allow through the OpenID
 * Connect provider. Two kinds of permission are never delegable, however
 * privileged the person:
 *
 * - `admin-*` — administration stays with a person at the keyboard
 *   (#946 decision 3);
 * - `token-mint` — a delegation never creates a standing credential, or a
 *   leaked one could breed (#1198);
 * - `token-extend` — a delegation never lengthens a standing credential, or a
 *   leaked token could keep itself alive (#1734). Step-up already refuses it
 *   to a delegation, but a site may turn step-up off; this does not move;
 * - `proxy-grant` — a token or an app never lets someone act for the person
 *   (#1762). A proxy grant itself may carry it (that is how a proxy passes
 *   access on), so this rule is for tokens and apps, not proxy grants;
 * - `vault-proxy` — it means something only inside a proxy grant, where it
 *   lets the proxy into the person's vaults (#1762 slice 2); on a token or an
 *   app it would read as access it can never give.
 *
 * One rule for both delegations, so they cannot drift.
 */

/** Actions a delegation may never carry, by prefix. */
export const FORBIDDEN_DELEGATED_PREFIX = 'admin-';
/** The permission to mint a token — never carried by a delegation. */
export const MINT_PERMISSION = 'token-mint';
/** The permission to extend a token — never carried by a delegation (#1734). */
export const EXTEND_PERMISSION = 'token-extend';
/** The permission to make a proxy grant — never carried by a token or an app (#1762). */
export const PROXY_GRANT_PERMISSION = 'proxy-grant';
/** The proxy grant's vault marker — never carried by a token or an app (#1762). */
export const VAULT_PROXY_PERMISSION = 'vault-proxy';

/** Why a scope cannot be delegated, or null when it can. */
export function refusedDelegatedScope(scope: string): string | null {
  if (scope.startsWith(FORBIDDEN_DELEGATED_PREFIX)) return `${scope} is an admin permission, which is never delegated`;
  if (scope === MINT_PERMISSION) return `${MINT_PERMISSION} is never delegated: a delegation never mints a token`;
  if (scope === EXTEND_PERMISSION) return `${EXTEND_PERMISSION} is never delegated: a delegation never extends a token`;
  if (scope === VAULT_PROXY_PERMISSION) return `${VAULT_PROXY_PERMISSION} is only for proxy grants: it lets someone acting for you into your vaults`;
  if (scope === PROXY_GRANT_PERMISSION) return `${PROXY_GRANT_PERMISSION} is never delegated: a token or an app never lets someone act for you`;
  return null;
}

/**
 * A delegation's permission list as given (#946, #1762): at least one, each a
 * non-empty string, de-duplicated in order. Throws a caller-safe message. One
 * rule for agent tokens and proxy grants.
 */
export function requireScopeList(scopes: unknown): string[] {
  // An unscoped delegation is rejected, never treated as unrestricted (#946 decision 4).
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new Error('At least one scope is required');
  }
  // Scopes arrive from a request body. A non-string here would be stored and
  // then match no action for the life of the delegation — a credential that
  // fails silently rather than at the point of the mistake.
  if (!scopes.every((s): s is string => typeof s === 'string' && s.trim().length > 0)) {
    throw new Error('Every scope must be a non-empty string');
  }
  return [...new Set(scopes)];
}

/**
 * "Delegate, not grant" (#1178, #1762): the scopes the delegator does not hold,
 * in order. Empty means every scope is theirs to hand on. `holds` is asked of
 * the policy decision point; with no answer there is no delegation.
 */
export async function lackingScopes(scopes: readonly string[], holds: (scope: string) => Promise<boolean>): Promise<string[]> {
  const lacking: string[] = [];
  for (const scope of scopes) {
    if (!(await holds(scope))) lacking.push(scope);
  }
  return lacking;
}
