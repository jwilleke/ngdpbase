/**
 * Single source of truth for the state of a shipped page the site holds (#931,
 * #2389).
 *
 * The core list, the add-on list and `PageManager.syncShippedPages` all call
 * `shippedPageState()`, so what the screen shows and what Sync does cannot
 * drift. Core pages stamp `REQUIRED_SOURCE_HASH_KEY`, add-on pages
 * `addon-source-hash`. The hash is content-derived; the `user-modified` flag
 * is read as well: a page saved here is never replaced without an admin.
 */
import { createHash } from 'node:crypto';

/**
 * Stable content hash of an addon page body. Trimmed so a trailing-newline
 * difference between the source file and the on-disk form does not read as a
 * modification. This is the value stamped into a seeded page's
 * `addon-source-hash` frontmatter.
 */
export function pageSourceHash(content: string): string {
  return createHash('sha256').update(String(content).trim()).digest('hex');
}

/**
 * Frontmatter key a required page's live copy carries: `pageSourceHash` of the
 * body it was seeded or synced with (#1395). The required-pages analogue of
 * `addon-source-hash`, read by the same `shippedPageState()`.
 */
export const REQUIRED_SOURCE_HASH_KEY = 'required-source-hash';

/**
 * The state of a shipped page that exists on the site (#2389, slice 1): the one
 * answer the core list, the add-on list and `PageManager.syncShippedPages` all
 * read, from docs/design/required-pages-sync-states.md.
 *
 *  - `same-as-shipped`       — the text matches what ships and nobody edited it here.
 *  - `update-ready`          — a newer version shipped; this page was never edited
 *                              here. The only state Sync All replaces.
 *  - `edited-not-confirmed`  — changed on this site (an editor save set
 *                              `user-modified`, or it has no stamp, or its text no
 *                              longer matches its stamp). Never replaced without
 *                              an admin.
 *  - `both-changed`          — edited here, and a newer version also shipped.
 *
 * The kept states (K) and working changes (W) come in a later slice.
 */
export type ShippedPageStateName =
  | 'same-as-shipped'
  | 'update-ready'
  | 'edited-not-confirmed'
  | 'both-changed';

/**
 * Decide a shipped page's state. Core pages stamp `required-source-hash`, add-on
 * pages `addon-source-hash`; the caller reads whichever applies and passes its
 * value, so both go through the same table.
 *
 * Inputs: L = hash of the live body, T = the stamp, S = hash of the shipped body,
 * U = `user-modified`. E (edited here) = U, or no stamp, or L != T. C (shipped
 * changed) = a stamp exists and S != T. First match wins:
 *  1. L = S and not U  → same-as-shipped
 *  4. E and C          → both-changed
 *  5. E and not C      → edited-not-confirmed
 *  6. C (so not E)     → update-ready
 *
 * @param args.shippedBody - Body of the shipped page
 * @param args.liveBody - Body of the live copy
 * @param args.stamp - The live copy's source-hash stamp, or undefined
 * @param args.userModified - The live copy's front-matter `user-modified` is true
 */
export function shippedPageState(args: {
  shippedBody: string;
  liveBody: string;
  stamp: string | undefined;
  userModified: boolean;
}): { state: ShippedPageStateName } {
  const shipped = pageSourceHash(args.shippedBody);
  const live = pageSourceHash(args.liveBody);
  if (live === shipped && !args.userModified) return { state: 'same-as-shipped' };

  const hasStamp = typeof args.stamp === 'string' && args.stamp.length > 0;
  const edited = args.userModified || !hasStamp || live !== args.stamp;
  const shippedChanged = hasStamp && shipped !== args.stamp;
  if (edited && shippedChanged) return { state: 'both-changed' };
  if (edited) return { state: 'edited-not-confirmed' };
  return { state: 'update-ready' };
}

/**
 * How a shipped item's sync status reads on an admin screen: the legacy status
 * word the screen's script keys on, plus the edit flag (`views/_sync-status.ejs`,
 * `views/_sync-button.ejs`, #1918).
 *
 *  - `status` — `modified` when the live copy is not Same as shipped.
 *  - `userModified` — edited on this site (Edited here, or Both changed): Sync
 *    does not replace it; Use shipped version does, after a confirm.
 */
export interface SyncRowState {
  status: 'current' | 'modified';
  userModified: boolean;
}

/**
 * Map a `shippedPageState` to the admin screen's row fields (#2389).
 *
 * @param state - `shippedPageState`'s answer for the live copy
 */
export function syncRowState(state: ShippedPageStateName): SyncRowState {
  return {
    status: state === 'same-as-shipped' ? 'current' : 'modified',
    userModified: state === 'edited-not-confirmed' || state === 'both-changed'
  };
}
