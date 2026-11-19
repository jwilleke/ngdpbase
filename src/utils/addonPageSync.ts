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
import { describeWorkingChanges, workingParts } from './pluginCalls.js';

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
 * Frontmatter keys for the release label (#2389 slice 3): the release a live copy
 * matches, written with the stamp. A core page holds the ngdpbase version, an
 * add-on page that add-on's version. Display only: the body hash decides the state.
 */
export const REQUIRED_SOURCE_RELEASE_KEY = 'required-source-release';
export const ADDON_SOURCE_RELEASE_KEY = 'addon-source-release';

/**
 * A release as text, without a leading "v" (#2389 slice 3). The one place a
 * version is read for the label, whether it is written, compared or shown.
 *
 * @param version - A version from config, a package or front matter
 * @returns The text, or undefined when the version is not known
 */
export function releaseText(version: unknown): string | undefined {
  if (typeof version !== 'string' && typeof version !== 'number') return undefined;
  const text = String(version).trim().replace(/^v/i, '');
  return text.length > 0 ? text : undefined;
}

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
 *  - `kept-for-site`        — the admin chose Keep edited version and nothing about
 *                              how the shipped page works changed since (#2389 slice 2).
 *  - `kept-needs-review`    — kept, and the shipped page's plugin calls or
 *                              behaviour settings now differ from the ones recorded
 *                              when it was kept. Sync All leaves it.
 */
export type ShippedPageStateName =
  | 'same-as-shipped'
  | 'update-ready'
  | 'edited-not-confirmed'
  | 'both-changed'
  | 'kept-for-site'
  | 'kept-needs-review';

/** Front-matter keys the Keep edited version action writes (#2389 slice 2). */
export const KEPT_EDITED_KEY = 'kept-edited';
export const KEPT_SHIPPED_HASH_KEY = 'kept-shipped-hash';
export const KEPT_WORKING_PARTS_KEY = 'kept-working-parts';

/**
 * Decide a shipped page's state. Core pages stamp `required-source-hash`, add-on
 * pages `addon-source-hash`; the caller reads whichever applies and passes its
 * value, so both go through the same table.
 *
 * Inputs: L = hash of the live body, T = the stamp, S = hash of the shipped body,
 * U = `user-modified`, K = the kept mark, W = the shipped page's working parts
 * differ from the parts recorded when it was kept. E (edited here) = U, or no
 * stamp, or L != T. C (shipped changed) = a stamp exists and S != T. First match
 * wins:
 *  1. L = S and not U  → same-as-shipped
 *  2. K and W          → kept-needs-review
 *  3. K and not W      → kept-for-site (`newerAvailable` when S differs from
 *                        the shipped hash recorded at keep time)
 *  4. E and C          → both-changed
 *  5. E and not C      → edited-not-confirmed
 *  6. C (so not E)     → update-ready
 *
 * W is false when the page has no recorded baseline (`keptParts` undefined): a
 * change that cannot be named is never flagged.
 *
 * @param args.shippedBody - Body of the shipped page
 * @param args.liveBody - Body of the live copy
 * @param args.stamp - The live copy's source-hash stamp, or undefined
 * @param args.userModified - The live copy's front-matter `user-modified` is true
 * @param args.kept - The live copy carries `kept-edited: true`
 * @param args.keptShippedHash - `kept-shipped-hash`: the shipped hash when it was kept
 * @param args.keptParts - `kept-working-parts`: the shipped page's working parts when it was kept
 * @param args.shippedParts - The shipped page's working parts now
 */
export function shippedPageState(args: {
  shippedBody: string;
  liveBody: string;
  stamp: string | undefined;
  userModified: boolean;
  kept?: boolean;
  keptShippedHash?: string;
  keptParts?: string[];
  shippedParts?: string[];
}): { state: ShippedPageStateName; newerAvailable: boolean; workingChanges: string[] } {
  const shipped = pageSourceHash(args.shippedBody);
  const live = pageSourceHash(args.liveBody);
  if (live === shipped && !args.userModified) return { state: 'same-as-shipped', newerAvailable: false, workingChanges: [] };

  if (args.kept === true) {
    const workingChanges = args.keptParts && args.shippedParts ? describeWorkingChanges(args.keptParts, args.shippedParts) : [];
    if (workingChanges.length > 0) return { state: 'kept-needs-review', newerAvailable: false, workingChanges };
    const newerAvailable = typeof args.keptShippedHash === 'string' && args.keptShippedHash.length > 0 && shipped !== args.keptShippedHash;
    return { state: 'kept-for-site', newerAvailable, workingChanges: [] };
  }

  const hasStamp = typeof args.stamp === 'string' && args.stamp.length > 0;
  const edited = args.userModified || !hasStamp || live !== args.stamp;
  const shippedChanged = hasStamp && shipped !== args.stamp;
  if (edited && shippedChanged) return { state: 'both-changed', newerAvailable: false, workingChanges: [] };
  if (edited) return { state: 'edited-not-confirmed', newerAvailable: false, workingChanges: [] };
  return { state: 'update-ready', newerAvailable: false, workingChanges: [] };
}

/**
 * The kept-mark inputs of `shippedPageState`, read from a live copy's
 * front-matter and the shipped page (#2389 slice 2). Every caller (the lists
 * and Sync) reads them here so they cannot disagree.
 *
 * @param liveMeta - The live copy's front-matter
 * @param shipped - The shipped page, parsed
 */
export function keptInputs(
  liveMeta: Record<string, unknown>,
  shipped: { data: Record<string, unknown>; content: string }
): { kept: boolean; keptShippedHash?: string; keptParts?: string[]; shippedParts?: string[] } {
  const kept = liveMeta[KEPT_EDITED_KEY] === true;
  if (!kept) return { kept: false };
  const hash = liveMeta[KEPT_SHIPPED_HASH_KEY];
  const parts = liveMeta[KEPT_WORKING_PARTS_KEY];
  const keptParts = Array.isArray(parts) && parts.every((p) => typeof p === 'string') ? (parts) : undefined;
  return {
    kept,
    ...(typeof hash === 'string' ? { keptShippedHash: hash } : {}),
    ...(keptParts ? { keptParts, shippedParts: workingParts(shipped.content, shipped.data) } : {})
  };
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
    userModified: state === 'edited-not-confirmed' || state === 'both-changed' || state === 'kept-for-site' || state === 'kept-needs-review'
  };
}

/**
 * A page file's text without the kept mark in its front-matter, for the diff the
 * Review dialog shows: the admin ticked a box, they did not edit the page, so the
 * three kept keys (and the list under `kept-working-parts`) stay out of it.
 * Only the front-matter block is touched.
 *
 * @param raw - The whole file, front-matter and body
 * @returns The same text without the kept-edited, kept-shipped-hash and kept-working-parts lines
 */
export function withoutKeptMarks(raw: string): string {
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(raw);
  if (!match) return raw;
  const front = match[2]
    .replace(/^kept-(?:edited|shipped-hash):[^\n]*(?:\n|$)/gm, '')
    .replace(/^kept-working-parts:[^\n]*(?:\n(?:[ \t]+|-)[^\n]*)*(?:\n|$)/gm, '')
    .replace(/\n$/, '');
  return `${match[1]}${front}${match[3]}${raw.slice(match[0].length)}`;
}
