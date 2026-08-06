/**
 * Derive a username from an email address (#1026).
 *
 * Extracted from GoogleOIDCProvider so every auto-provisioning path — OIDC and
 * magic link — produces the same username for the same address. Two rules that
 * disagree would let one provider create `jim-smith` and the other `jimsmith`
 * for the same person.
 */

import type UserManager from '../managers/UserManager.js';

/** True if the username is already taken. Treats a lookup error as "free". */
async function usernameExists(username: string, userManager: UserManager): Promise<boolean> {
  try {
    const u = await userManager.getUser(username);
    return u !== undefined;
  } catch {
    return false;
  }
}

/**
 * Turn an email address into an unused username.
 *
 * Local part, lowercased, with anything outside `[a-z0-9]` replaced by a
 * hyphen; a numeric suffix is appended until the name is free.
 *
 * The result is only free as of this call — a caller that derives a name and
 * creates the account later must be prepared for `createUser` to reject a
 * duplicate that appeared in between.
 */
export async function deriveUsername(email: string, userManager: UserManager): Promise<string> {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-');
  let candidate = base;
  let n = 2;
  while (await usernameExists(candidate, userManager)) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

export default deriveUsername;
