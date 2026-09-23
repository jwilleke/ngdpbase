/**
 * `[Title]` → `[store/Title]` inside a private store (#1457, epic #1454).
 *
 * A private page's links were written before the syntax existed: inside
 * `private/{owner}/{store}/…`, `[Diary]` was the only way to name a sibling,
 * and it resolves against the PUBLIC name list — so it renders red and points
 * at `/edit/Diary`. `[store/Title]` is the syntax that reaches the page
 * (slice A); the one-time migration below writes it.
 *
 * ## What it rewrites, and what it must not
 *
 * Only a target that names a page in the SAME store as the page the link sits
 * in. Never a title that store does not have — a link to a public page is a
 * link to a public page, and pointing it into a store would break it. Never a
 * cross-store target: `[other/Diary]` already parses as a private link
 * ({@link parsePrivateLinkTarget}) and is left exactly as it is, which is also
 * what makes a second run write nothing.
 *
 * ## The text half only
 *
 * Pure, synchronous, no engine, no I/O — the split `renameLinkRewrite`
 * established. Which pages to feed it, reading them and writing the results
 * are `PageManager.migratePrivateLinks`'s job.
 *
 * The matching rules are not restated here: this hands a resolver to
 * {@link rewriteLinkTargetsBy}, so the bracket forms, the checkbox case, the
 * non-page targets and the `#fragment` handling are the ones the rename
 * rewrite uses, and the two cannot drift. The case rule comes with them —
 * `[Title]` byte-exact, `[Display|title]` case-insensitively — for the same
 * reason: in the display form the target is prose somebody wrote.
 */

import { parsePrivateLinkTarget } from './privateStorePath.js';
import { rewriteLinkTargetsBy, type LinkRewriteResult } from './renameLinkRewrite.js';

/**
 * Point this page's `[Title]` links at the store they are already in.
 *
 * @param content - The private page's markdown.
 * @param store - The store the page lives in; the prefix its links gain.
 * @param titles - Every page title in that store.
 * @returns The rewritten content and a report — the input unchanged, and
 *   `rewritten: 0`, when nothing in it names a page of this store.
 */
export function rewriteToPrivateLinks(
  content: string,
  store: string,
  titles: Iterable<string>
): LinkRewriteResult {
  const exact = new Set<string>();
  const byLower = new Map<string, string>();
  for (const title of titles) {
    if (!title) continue;
    exact.add(title);
    // First one wins: two titles differing only in case cannot both be the
    // page a piped target meant, and a store refuses the second anyway.
    if (!byLower.has(title.toLowerCase())) byLower.set(title.toLowerCase(), title);
  }
  if (exact.size === 0) return { content, rewritten: 0, unchangedTargets: [] };

  return rewriteLinkTargetsBy(content, (base, targetIsDisplayText) => {
    // Already a private link — this store's or another's. Left alone, which is
    // what makes the migration idempotent.
    if (parsePrivateLinkTarget(base)) return null;
    const title = targetIsDisplayText
      ? (exact.has(base) ? base : undefined)
      : (exact.has(base) ? base : byLower.get(base.toLowerCase()));
    return title === undefined ? null : `${store}/${title}`;
  });
}
