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
import { toPermissionSubject } from '../context/JobContext.js';
import { shareNamesVault } from '../types/Share.js';

/** The PDP surface a vault decision needs. */
export interface VaultDecider {
  decide(
    subject: unknown,
    request: { action: string; resource: { type: string; id: string }; attributes: Record<string, unknown> }
  ): Promise<{ permit: boolean }>;
}

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

/**
 * May `ctx` do `action` inside `owner`'s vault `vault` (#1539)? The container
 * rule first — the owner, or a share link of theirs for this vault; never a
 * role — then the capability asked with the vault, so a policy on the `vault`
 * resource type (`vault-owner`) decides. `resource` names what is acted on (a
 * vault page's name, or a file in the vault); it never matches `page: *`, so a
 * site-wide role does not reach in. The one rule for vault pages
 * (`BaseContext.hasPermissionOn`) and vault files (`AttachmentManager`).
 */
export async function permitsInVault(
  pdp: VaultDecider | null | undefined,
  ctx: ActorContext,
  action: string,
  where: { owner: string; vault: string; resource: string }
): Promise<boolean> {
  if (!pdp || !mayActInPrivateContainer(ctx, where.owner, { vault: where.vault })) return false;
  const subject = isJobContext(ctx) ? toPermissionSubject(ctx) : ctx;
  return (await pdp.decide(subject, { action, resource: { type: 'page', id: where.resource }, attributes: { vault: where.vault } })).permit;
}
