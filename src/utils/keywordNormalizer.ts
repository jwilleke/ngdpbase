/**
 * Keyword normalizer (#869) — the title↔value canonical form for the unified
 * keyword vocabulary.
 *
 * Per the epic's design principle #2, every keyword is `{ value, title }`:
 *   - `title` (CatalogTerm.label) — display form, kept verbatim, written to files.
 *   - `value` (CatalogTerm.term) — ngdpbase-internal canonical form: lowercase,
 *     spaces/punctuation → single hyphens, diacritics transliterated, ≤ 64 chars
 *     (IPTC IIM 2:25 limit), comma-free (comma is a list delimiter in many tools).
 *
 * `value` is what the media index, search, page metadata and URLs key on, so two
 * titles that differ only by case/spacing/accent collapse to ONE value — the
 * mechanism that makes `Dining` and `dining` impossible to hold as distinct
 * keywords. This module is pure (no I/O); enforcement (routing all keyword input
 * through it) is wired by its consumers.
 *
 * Differs deliberately from `simpleSlug` (pluginFormatters): that DROPS accented
 * characters (`José` → `jos`), which would silently corrupt personal-name
 * keywords; this TRANSLITERATES them (`José` → `jose`) and enforces the length
 * cap.
 */

/** Max length of a keyword value (IPTC IIM 2:25 keyword field limit). */
export const KEYWORD_VALUE_MAX = 64;

/**
 * Canonical value for a keyword title. Idempotent: `normalizeKeywordValue(v)`
 * equals `v` for any already-valid value. Returns '' when the title has no
 * usable alphanumeric content.
 */
export function normalizeKeywordValue(title: string): string {
  if (typeof title !== 'string') return '';
  // Transliterate diacritics: decompose, then drop combining marks.
  const deaccented = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  let value = deaccented
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // spaces, punctuation, commas → hyphen
    .replace(/^-+|-+$/g, '');    // trim leading/trailing hyphens
  if (value.length > KEYWORD_VALUE_MAX) {
    value = value.slice(0, KEYWORD_VALUE_MAX).replace(/-+$/, '');
  }
  return value;
}

/**
 * True when `value` is already a canonical keyword value: non-empty, ≤ 64 chars,
 * comma-free, lowercase alphanumeric segments joined by single hyphens.
 */
export function isValidKeywordValue(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= KEYWORD_VALUE_MAX &&
    !value.includes(',') &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

/**
 * True when two titles normalize to the same (non-empty) value — i.e. they are
 * case/space/accent variants of one keyword.
 */
export function keywordsCollide(a: string, b: string): boolean {
  const va = normalizeKeywordValue(a);
  return va !== '' && va === normalizeKeywordValue(b);
}

/** Build a `{ term, label }` pair (CatalogTerm shape) from a display title. */
export function toKeywordTerm(title: string): { term: string; label: string } {
  return { term: normalizeKeywordValue(title), label: title.trim() };
}

/**
 * Collapse a keyword list to one entry per canonical value (#869 dedup
 * enforcement): case/space/accent variants of the same keyword are merged,
 * first occurrence wins ordering, empties dropped. When `canonicalByValue`
 * (value → registry title) is supplied, a kept keyword is snapped to the
 * registry's display title so `dining` converges on catalogued `Dining`;
 * otherwise the first-seen form is kept trimmed. Pure — the registry lookup
 * is passed in, not fetched here.
 */
export function dedupeKeywords(
  keywords: readonly string[],
  canonicalByValue?: ReadonlyMap<string, string>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const kw of keywords) {
    if (typeof kw !== 'string') continue;
    const value = normalizeKeywordValue(kw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(canonicalByValue?.get(value) ?? kw.trim());
  }
  return out;
}
