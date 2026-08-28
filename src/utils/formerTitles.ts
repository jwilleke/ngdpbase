/**
 * Former-title tracking for renamed pages (#1105).
 *
 * A rename leaves every inbound link pointing at a name that no longer exists.
 * `rewriteInboundLinksAfterRename` repairs the links *inside* pages, but it is
 * structurally unable to help a bookmark, a search result, or a link on someone
 * else's site — those are not ours to rewrite.
 *
 * The record therefore lives in the page's own frontmatter:
 *
 * ```yaml
 * title: New Title
 * formerTitles:
 *   - Old Title
 * ```
 *
 * The page is its own durable record. No sidecar to drift from the pages it
 * describes, no retention window to expire, and it survives backup/restore,
 * export/import and a full index rebuild — because it *is* the data rather than
 * a cache of it. This replaced an earlier design that rehydrated from
 * `page.rename` audit events, which carry a 90-day retention: a page renamed and
 * then left alone would have had its old URL start failing again months later,
 * silently.
 *
 * Two rules carried over from the rename map this supersedes (#1082):
 *
 * **Consulted only after live resolution fails.** The caller tries the real page
 * set first, so a former title can never shadow an existing page.
 *
 * **Ambiguity is refused, never guessed.** If one former title is claimed by more
 * than one page, no answer is given. A confidently wrong redirect to a page that
 * merely once shared a name is worse than the 404 it replaces, because a 404 is
 * visibly broken and a wrong page is not.
 */

/** Sentinel for a former title claimed by more than one page. */
export const AMBIGUOUS = Symbol('ambiguous');

/** Minimal page shape needed to derive the index. */
export interface FormerTitleSource {
  title: string;
  formerTitles?: unknown;
}

/** Coerce an unknown frontmatter value into a clean list of titles. */
function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

/**
 * Work out what `formerTitles` should be after a save.
 *
 * Returns `undefined` when there is nothing to record and nothing already held,
 * so an ordinary save on a never-renamed page does not add an empty key to its
 * frontmatter.
 *
 * @param existing - Current `formerTitles` value, straight off disk and untrusted
 * @param previousTitle - The title the page had before this save
 * @param newTitle - The title it is being given
 * @returns The new list, or undefined when the field should stay absent
 */
export function computeFormerTitles(
  existing: unknown,
  previousTitle: string | undefined | null,
  newTitle: string | undefined | null
): string[] | undefined {
  const held = normalizeList(existing);
  const from = (previousTitle ?? '').trim();
  const to = (newTitle ?? '').trim();

  // Not a rename — leave whatever is held untouched.
  if (!from || !to || from === to) {
    return held.length ? held : undefined;
  }

  const merged = held.includes(from) ? held : [...held, from];

  // A -> B -> A: the page holds its own current name as a former title. Drop it,
  // or the page would claim a title it currently *is*, which the index then has
  // to treat as ambiguous against itself.
  const result = merged.filter((t) => t !== to);
  return result.length ? result : undefined;
}

/**
 * Derive a former-title → current-title lookup from the page set.
 *
 * Keys are lowercased, so resolution is case-insensitive in the same way the
 * provider's title index is.
 *
 * A title held by a **live** page is marked ambiguous rather than resolving to
 * whoever once held it: live resolution runs first and will have answered
 * already, so reaching this map for a live title means something is wrong, and
 * refusing is the safe reading.
 *
 * @param pages - Every page, with its title and raw `formerTitles` frontmatter
 * @returns Map of lowercased former title → current title, or AMBIGUOUS
 */
export function buildFormerTitleIndex(
  pages: readonly FormerTitleSource[]
): Map<string, string | typeof AMBIGUOUS> {
  const index = new Map<string, string | typeof AMBIGUOUS>();
  const live = new Set<string>();

  for (const page of pages) {
    const title = (page?.title ?? '').trim();
    if (title) live.add(title.toLowerCase());
  }

  for (const page of pages) {
    const title = (page?.title ?? '').trim();
    if (!title) continue;

    for (const former of normalizeList(page.formerTitles)) {
      const key = former.toLowerCase();

      // A page listing its own current title is a no-op, not a conflict.
      if (key === title.toLowerCase()) continue;

      // Reused by a live page — that page wins, and this map must not answer.
      if (live.has(key)) {
        index.set(key, AMBIGUOUS);
        continue;
      }

      const existing = index.get(key);
      if (existing === undefined) {
        index.set(key, title);
      } else if (existing !== title) {
        index.set(key, AMBIGUOUS);
      }
    }
  }

  return index;
}
