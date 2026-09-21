/**
 * Is this signed-in user's private store locked in this session? (#1448)
 *
 * The unwrapped key lives only in process memory — it is wrapped by the user's
 * password and never persisted. A server restart drops it while the session
 * cookie survives, so the owner is still signed in but every private page of
 * theirs 404s and vanishes from lists, search and the journal. Indistinguishable
 * from data loss, to them. This is the question the banner asks so they are
 * told, and offered the password prompt that fixes it.
 *
 * Answered from the user's STATE, never from any page. While locked, the
 * store's catalogue is itself encrypted, so the server does not know which
 * pages are in it — and must not pretend to. "Your private store is locked"
 * is true and discloses nothing; "this page is in your store" is neither.
 *
 * Only ever true for the store's own owner, in their own session. Anonymous
 * visitors have no keys; an administrator has none to anyone else's store and
 * this reads only the subject's own key file, so no one is ever shown that
 * somebody ELSE has a store.
 */
import { normalizeUsername } from './username.js';
import { hasUnlockedKey } from './privateStoreUnlock.js';
import { userKeysExist } from './privateStoreDoor.js';
import type { ActorContext } from '../context/ActorContext.js';
import type { PrivateStoreLayoutOverrides } from './privateStorePath.js';

export async function privateStoreLockedFor(args: {
  ctx: ActorContext | undefined;
  username: string | undefined;
  pagesDirectory: string | undefined;
  layout?: PrivateStoreLayoutOverrides;
}): Promise<boolean> {
  const name = normalizeUsername(args.username);
  // The anonymous principal is not an account and holds no key file — skip
  // the filesystem check on every anonymous page view.
  if (!name || name === 'anonymous' || !args.pagesDirectory) return false;
  // Unlocked: nothing to say. Checked before the filesystem so an unlocked
  // owner's page views cost nothing extra.
  if (hasUnlockedKey(args.ctx)) return false;
  // Locked AND has keys: the case the banner exists for. No key file means no
  // encrypted store, and so nothing to unlock.
  return userKeysExist({ pagesDirectory: args.pagesDirectory, username: args.username as string, layout: args.layout });
}
