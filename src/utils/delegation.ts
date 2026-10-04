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
 *   leaked one could breed (#1198).
 *
 * One rule for both delegations, so they cannot drift.
 */

/** Actions a delegation may never carry, by prefix. */
export const FORBIDDEN_DELEGATED_PREFIX = 'admin-';
/** The permission to mint a token — never carried by a delegation. */
export const MINT_PERMISSION = 'token-mint';

/** Why a scope cannot be delegated, or null when it can. */
export function refusedDelegatedScope(scope: string): string | null {
  if (scope.startsWith(FORBIDDEN_DELEGATED_PREFIX)) return `${scope} is an admin permission, which is never delegated`;
  if (scope === MINT_PERMISSION) return `${MINT_PERMISSION} is never delegated: a delegation never mints a token`;
  return null;
}
