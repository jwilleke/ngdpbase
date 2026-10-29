/**
 * Who may act inside a user's private container — `pages/vaults/{user}/` and
 * every vault below it (docs/private-stores.md, Access).
 *
 * The owner, a share link the owner issued, or someone acting for the owner
 * under a proxy grant that carries `vault-proxy` (#1762). No role reaches in,
 * admin included.
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
 * encrypted slices, and a proxy only the key copy its grant carries (#1762
 * slice 5, `dekFor`).
 *
 * The container rule reads the proxy claim the subject carries; whether the
 * grant is still in force is re-read live by the PDP on every decision, and
 * the subject itself is rebuilt from the live grant on every request (#1762
 * slice 4).
 */
import { isJobContext, type ActorContext } from '../context/ActorContext.js';
import { shareNamesVault } from '../types/Share.js';
import { mixesProxyWithDelegation, proxyCarries } from './proxyClaim.js';
import { isSharedFolderOwner } from './privateStorePath.js';
import { permitsInSharedFolder } from './sharedFolderAccess.js';

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
  // #2125: the shared folders' container has no owner who acts; a folder is
  // decided by permission (`permitsInSharedFolder`), never by this rule.
  if (!owner || isSharedFolderOwner(owner)) return false;
  // #1762: a proxy's subject carries the represented person's username, so
  // the owner test below would admit it unasked. It gets in only when the
  // grant carries `vault-proxy`, and never alongside a token or a share.
  if (ctx.viaProxy && (mixesProxyWithDelegation(ctx) || !proxyCarries(ctx.viaProxy, 'vault-proxy'))) return false;
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
 *
 * A shared folder (#2125) is asked by permission instead:
 * `shared-folder-read` or `shared-folder-file` on the folder
 * (`permitsInSharedFolder`), never the vault policy.
 */
export async function permitsInVault(
  pdp: VaultDecider | null | undefined,
  ctx: ActorContext,
  action: string,
  where: { owner: string; vault: string; resource: string }
): Promise<boolean> {
  if (isSharedFolderOwner(where.owner)) return permitsInSharedFolder(pdp, ctx, action, where.vault);
  if (!pdp || !mayActInPrivateContainer(ctx, where.owner, { vault: where.vault })) return false;
  return (await pdp.decide(ctx, { action, resource: { type: 'page', id: where.resource }, attributes: { vault: where.vault } })).permit;
}
