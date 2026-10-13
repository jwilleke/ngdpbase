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
 *   to a delegation, but a site may turn step-up off; this does not move.
 *
 * One rule for both delegations, so they cannot drift.
 */

/** Actions a delegation may never carry, by prefix. */
export const FORBIDDEN_DELEGATED_PREFIX = 'admin-';
/** The permission to mint a token — never carried by a delegation. */
export const MINT_PERMISSION = 'token-mint';
/** The permission to extend a token — never carried by a delegation (#1734). */
export const EXTEND_PERMISSION = 'token-extend';

/** Why a scope cannot be delegated, or null when it can. */
export function refusedDelegatedScope(scope: string): string | null {
  if (scope.startsWith(FORBIDDEN_DELEGATED_PREFIX)) return `${scope} is an admin permission, which is never delegated`;
  if (scope === MINT_PERMISSION) return `${MINT_PERMISSION} is never delegated: a delegation never mints a token`;
  if (scope === EXTEND_PERMISSION) return `${EXTEND_PERMISSION} is never delegated: a delegation never extends a token`;
  return null;
}
