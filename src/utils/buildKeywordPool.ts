/**
 * buildKeywordPool — the one place the keyword suggestion pool is built (#1053).
 *
 * The same derivation was copy-pasted into `_basicEditor.ejs` and `create.ejs`,
 * while `media-item.ejs` carried a third, degraded variant using the catalog
 * ALONE. On jimstest that meant page editors offered 313 suggestions and the
 * media editor 110, from the same underlying data — reported in #1053 as "no
 * suggested and it is just different".
 *
 * The page widget's own comment says it "mirrors the proven media-item widget
 * (#866)": media was the original, pages gained the observed-keywords half in
 * #897, and media was never brought along. Three copies drift exactly like
 * that, so the logic lives here and the templates only render.
 */

/** Catalog entries may be plain labels or vocabulary objects. */
export type KeywordCatalogEntry = string | { label?: string; id?: string } | null | undefined;

/**
 * Buckets that are not free-text keywords. Excluded from SUGGESTIONS only —
 * typing one anyway is self-correcting, since save-time normalization (#893)
 * migrates it to the right bucket.
 */
export const KEYWORD_POOL_SKIP = ['private', 'draft', 'review', 'published', 'capture'];

/** Label of a catalog entry, or '' when it has none. */
function labelOf(entry: KeywordCatalogEntry): string {
  if (entry === null || entry === undefined) return '';
  if (typeof entry === 'string') return entry;
  return entry.label || entry.id || '';
}

/**
 * Merge the vocabulary catalog with keywords observed in the page index into
 * one sorted, deduplicated suggestion list.
 *
 * Dedupe is case-insensitive and first-seen casing wins, so `journal` from
 * migrated entries and `Journal` from seed pages do not both appear. Catalog
 * order is therefore meaningful: it is consulted first, so the curated casing
 * beats whatever happens to be in the index.
 *
 * @param catalog  vocabulary catalog — strings or `{label, id}`
 * @param observed keyword labels seen on real pages
 */
export function buildKeywordPool(
  catalog: KeywordCatalogEntry[] | null | undefined,
  observed: (string | null | undefined)[] | null | undefined
): string[] {
  const skip = new Set(KEYWORD_POOL_SKIP);

  const usable = (label: string): boolean =>
    label !== '' && !skip.has(label.toLowerCase());

  const catalogLabels = (Array.isArray(catalog) ? catalog : [])
    .map(labelOf)
    .filter(usable);

  const observedLabels = (Array.isArray(observed) ? observed : [])
    .map((l) => (typeof l === 'string' ? l : ''))
    .filter(usable);

  const seen = new Set<string>();
  return [...catalogLabels, ...observedLabels]
    .filter((l) => {
      const k = l.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
}
