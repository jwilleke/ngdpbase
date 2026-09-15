/**
 * Who may act inside a user's private container — `pages/private/{user}/` and
 * every store below it (docs/planning/private-stores.md, Access).
 *
 * The owner, or a delegate of the owner. No role reaches in, admin included.
 *
 * A delegate is a share the owner issued (`viaShare.issuer === owner`). The
 * share ceiling — the action is delegated, the share has not expired, the
 * issuer still holds the action — is applied by `hasPermission` as it is for
 * every share; this adds only the container rule. A store lets delegates in
 * only when its Share switch is on (#1388). Until that switch exists every
 * store is Share Off, so today only the owner passes.
 *
 * An encrypted store additionally needs the owner's DEK in the session
 * (`assertCurrentSessionCanWriteStore`); a delegate carries none until a share
 * can wrap a store DEK.
 */
import type { ActorContext } from '../context/ActorContext.js';

export function mayActInPrivateContainer(
  ctx: ActorContext,
  owner: string,
  opts: { storeShared?: boolean } = {}
): boolean {
  if (!owner) return false;
  if (ctx.viaShare) {
    return opts.storeShared === true && ctx.viaShare.issuer === owner;
  }
  return ctx.username === owner;
}
