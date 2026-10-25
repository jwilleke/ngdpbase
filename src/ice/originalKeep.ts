/**
 * The allowance a keep at upload carries to the upload door (#2061).
 *
 * A receiver that keeps originals in its own encrypted vault (phr) declares
 * the media types it keeps (`originals.types`). The site's attachment
 * allow-list does not name them (FHIR JSON, C-CDA XML), so the door would
 * refuse the keep. The exemption is narrow, and lives here, not in a flag:
 *
 * - the engine opens one {@link OriginalKeep} for one receiver, one user and
 *   one `keepOriginal` call, and closes it when the call returns;
 * - the receiver passes it to `AttachmentManager.uploadAttachment` as its
 *   `keep` option, unchanged;
 * - the door honours it only while it is open, and only for a file going
 *   into that user's own vault of a system-category the receiver's add-on
 *   declares ({@link keepAllowsInto}). Anywhere else it changes nothing.
 *
 * An object the engine did not open is never honoured, whatever it says.
 */
import type { ActorContext } from '../context/ActorContext.js';
import type { OriginalKeep, RegisteredReceiver } from './types.js';

/** The keeps the engine has open now. Identity, not shape: a copy is not one. */
const openKeeps = new WeakSet<OriginalKeep>();

/** Open a keep for one call of `receiver.keepOriginal` with `ctx`. Close it with {@link closeOriginalKeep}. */
export function openOriginalKeep(receiver: RegisteredReceiver, ctx: ActorContext): OriginalKeep {
  const keep: OriginalKeep = Object.freeze({
    receiver: receiver.id,
    addon: receiver.owner,
    user: ctx.username,
    types: Object.freeze([...(receiver.originals?.types ?? [])])
  });
  openKeeps.add(keep);
  return keep;
}

/** The call is over: the keep is honoured no more. */
export function closeOriginalKeep(keep: OriginalKeep): void {
  openKeeps.delete(keep);
}

/** Where an upload is going, as the door resolved it. */
export interface KeepDestination {
  /** Who is uploading: the request's username. */
  uploader: string;
  /** The vault's owner. */
  owner: string;
  /** The add-on whose system-category declares the vault (`StoreKind.owner`); null when no category does. */
  vaultAddon: string | null;
}

/**
 * Does this keep apply to this upload? Only an open keep, for a file going
 * into its user's own vault of a system-category its receiver's add-on
 * declares, uploaded by that user. A `false` leaves the upload exactly as
 * any other: the site's allow-list decides.
 */
export function keepAllowsInto(keep: OriginalKeep | undefined, to: KeepDestination): boolean {
  if (!keep || !openKeeps.has(keep)) return false;
  return to.uploader === keep.user && to.owner === keep.user && to.vaultAddon === keep.addon;
}
