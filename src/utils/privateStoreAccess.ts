/**
 * Who may act inside a user's private container — `pages/vaults/{user}/` and
 * every vault below it (docs/private-stores.md, Access).
 *
 * The owner, or a share link the owner issued. No role reaches in, admin
 * included.
 *
 * A share link gets in only for a vault it names (#1388), and only when the
 * caller names that vault: a question about the owner's container as a whole
 * — their list of vaults, their trash, their takeout — is the owner's alone.
 * Which pages of the vault the link may read, that it has not expired, and
 * that its issuer still holds the action, are the share ceiling's to decide
 * (`PolicyDecisionPoint.ceiling`), as for every share; this is only the
 * container rule.
 *
 * An encrypted vault additionally needs a key in the session
 * (`assertContextCanWriteStore`); a share link carries none until #1388's
 * encrypted slices.
 */
import { isJobContext, type ActorContext } from '../context/ActorContext.js';
import { shareNamesVault } from '../types/Share.js';

export function mayActInPrivateContainer(
  ctx: ActorContext,
  owner: string,
  opts: { vault?: string } = {}
): boolean {
  if (!owner) return false;
  if (ctx.viaShare) {
    return opts.vault !== undefined
      && ctx.viaShare.issuer === owner
      && shareNamesVault(ctx.viaShare.resources, owner, opts.vault);
  }
  // A request must be an authenticated session of the owner: an anonymous
  // visitor never matches, even a page whose recorded owner is `Anonymous`.
  // A job carries who asked for it.
  if (!isJobContext(ctx) && ctx.isAuthenticated !== true) return false;
  return ctx.username === owner;
}
