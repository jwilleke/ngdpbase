/**
 * Single source of truth for addon-seeded page reseed detection (#931).
 *
 * Before this module, two independent definitions of "is this addon page
 * modified?" existed and could disagree:
 *   - the boot pass (`AddonsManager.seedAddonPages`) used a three-way
 *     `addon-source-hash` comparison;
 *   - the Required Pages Sync admin surface (#513) used a source-vs-live
 *     content normalize plus a `user-modified` frontmatter flag, and never
 *     read `addon-source-hash` at all.
 *
 * Both now call `evaluateSeededAddonPage()` so their status and behavior can
 * no longer drift. Required pages use it too (#1395), stamped under
 * `REQUIRED_SOURCE_HASH_KEY`. The hash is content-derived (the stronger signal); the
 * `user-modified` flag remains a secondary manual override at the call sites
 * that want it.
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
 * `addon-source-hash`, read by the same `evaluateSeededAddonPage()`.
 */
export const REQUIRED_SOURCE_HASH_KEY = 'required-source-hash';

/** Reseed status of an addon page that ALREADY exists in the instance. */
export type SeededAddonPageStatus = 'current' | 'outdated' | 'locally-modified';

/**
 * Decide what should happen to an already-seeded addon page, given its source
 * body, its current live body, and the `addon-source-hash` stamped at seed time.
 *
 *  - `current`          — live body already matches source; nothing to do.
 *  - `outdated`         — source changed and the live page is unmodified since
 *                         seed (stored hash matches live), OR the page is legacy
 *                         (no stored hash — pre-#920 seed; treated as reseedable
 *                         since the previous body is kept as a revertable version).
 *                         Safe to reseed.
 *  - `locally-modified` — source changed but the live body differs from what was
 *                         last seeded (⇒ operator-edited). Skip; never clobber.
 */
export function evaluateSeededAddonPage(args: {
  sourceContent: string;
  liveContent: string;
  storedHash: string | undefined;
}): SeededAddonPageStatus {
  const srcHash = pageSourceHash(args.sourceContent);
  const liveHash = pageSourceHash(args.liveContent);
  if (srcHash === liveHash) return 'current';

  const hasHash = typeof args.storedHash === 'string' && args.storedHash.length > 0;
  const unmodified = hasHash && args.storedHash === liveHash;
  const legacy = !hasHash;
  return unmodified || legacy ? 'outdated' : 'locally-modified';
}

/**
 * Default edit access for a page ngdpbase ships (#971, #1411): a `general`
 * page is instance-owned and gets no stamp; any other category — system,
 * documentation, addon, unclassified — is administrator-edit only. A source
 * that declares its own `access` overrides this.
 *
 * @param category - The page's resolved `system-category`
 * @returns The access object to stamp, or undefined to leave the page unprotected
 */
export function defaultShippedPageAccess(category: unknown): { edit: string[] } | undefined {
  if (category === 'general') return undefined;
  return { edit: ['admin'] };
}

