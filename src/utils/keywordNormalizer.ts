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
 * Parse hierarchical tag values (#917) into `/`-joined canonical-value paths.
 * digiKam/Lightroom store the tag tree two ways; both are unioned + deduped:
 *   - `XMP-lr:HierarchicalSubject` — `|`-separated (`Places|USA|Colorado|Denver`)
 *   - `XMP-digiKam:TagsList`       — `/`-separated (`Places/USA/Colorado/Denver`)
 * Each segment is run through `normalizeKeywordValue`, so a path becomes
 * `places/usa/colorado/denver` (leaf = last segment). Empty segments are
 * dropped; a value that is a scalar string is treated as a single-entry list.
 */
export function parseHierarchicalTags(hierarchicalSubject: unknown, tagsList: unknown): string[] {
  const out = new Set<string>();
  const add = (raw: unknown, sep: string): void => {
    const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : []);
    for (const entry of list) {
      if (typeof entry !== 'string') continue;
      const segs = entry.split(sep).map(s => normalizeKeywordValue(s)).filter(Boolean);
      if (segs.length) out.add(segs.join('/'));
    }
  };
  add(hierarchicalSubject, '|');
  add(tagsList, '/');
  return [...out];
}

/**
 * Reconcile a file's hierarchical tag tree against an edited flat keyword list
 * (#918). Preserves the operator's digiKam hierarchy through an ngdpbase edit —
 * paths are kept in their original DISPLAY form (never rewritten to slugs, which
 * would corrupt the tree on re-read).
 *
 * Rules (only when the file already carries hierarchy — a flat-only file gets
 * `null`, i.e. leave it flat):
 *   - a KEPT keyword keeps its existing path (`~WHO/Crotty/Lyman …` stays);
 *   - a REMOVED keyword's path is dropped;
 *   - `auto/*` machine-tag paths are always preserved untouched (principle #5);
 *   - a NEW keyword lands at the ROOT as a single-segment path in its display
 *     form. (Cross-library placement at a known leaf path — via #917's leaf map
 *     in display form — is a later refinement; root is the safe default.)
 *
 * `hierarchicalSubject`/`tagsList` are the file's current raw tag values (string
 * or string[]). Returns the new values for BOTH encodings, or null to leave the
 * file's hierarchy untouched.
 */
export function reconcileHierarchicalTags(
  keywords: readonly string[],
  hierarchicalSubject: unknown,
  tagsList: unknown
): { hierarchicalSubject: string[]; tagsList: string[] } | null {
  // Collect existing paths as display-segment arrays, deduped by value-path so
  // the `|` and `/` encodings of the same path collapse to one.
  const existing = new Map<string, string[]>();
  const collect = (raw: unknown, sep: string): void => {
    const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : []);
    for (const e of list) {
      if (typeof e !== 'string') continue;
      const segs = e.split(sep).map(s => s.trim()).filter(Boolean);
      const vpath = segs.map(normalizeKeywordValue).filter(Boolean).join('/');
      if (segs.length && vpath && !existing.has(vpath)) existing.set(vpath, segs);
    }
  };
  collect(hierarchicalSubject, '|');
  collect(tagsList, '/');
  if (existing.size === 0) return null; // flat-only file — impose no tree

  const wantValues = new Set(keywords.map(normalizeKeywordValue).filter(Boolean));
  const kept: string[][] = [];
  const keptLeafValues = new Set<string>();
  for (const segs of existing.values()) {
    const rootVal = normalizeKeywordValue(segs[0]);
    const leafVal = normalizeKeywordValue(segs[segs.length - 1]);
    if (rootVal === 'auto') { kept.push(segs); continue; } // machine tag — untouched
    if (wantValues.has(leafVal)) { kept.push(segs); keptLeafValues.add(leafVal); }
    // else: removed keyword → drop this path
  }
  // New keywords not already represented by a kept path's leaf → add at root.
  for (const kw of keywords) {
    const v = normalizeKeywordValue(kw);
    if (v && !keptLeafValues.has(v)) { kept.push([kw.trim()]); keptLeafValues.add(v); }
  }
  // Dedupe by value-path, preserving order.
  const seen = new Set<string>();
  const finalSegs = kept.filter(segs => {
    const vp = segs.map(normalizeKeywordValue).filter(Boolean).join('/');
    if (!vp || seen.has(vp)) return false;
    seen.add(vp);
    return true;
  });
  return {
    hierarchicalSubject: finalSegs.map(s => s.join('|')),
    tagsList: finalSegs.map(s => s.join('/'))
  };
}

/**
 * Build a leaf→path map from many hierarchical paths (#917) — the library-wide
 * "where does this leaf keyword live" lookup #918 uses to place a newly-added
 * keyword at its known hierarchical home. Leaf = last path segment; on conflict
 * the most frequently-seen path wins (ties broken by longest, then first).
 */
export function buildLeafPathMap(paths: Iterable<string>): Map<string, string> {
  const counts = new Map<string, Map<string, number>>(); // leaf → path → count
  for (const p of paths) {
    if (typeof p !== 'string' || !p) continue;
    const segs = p.split('/');
    const leaf = segs[segs.length - 1];
    if (!leaf) continue;
    const byPath = counts.get(leaf) ?? new Map<string, number>();
    byPath.set(p, (byPath.get(p) ?? 0) + 1);
    counts.set(leaf, byPath);
  }
  const map = new Map<string, string>();
  for (const [leaf, byPath] of counts) {
    let best = '', bestN = -1;
    for (const [p, n] of byPath) {
      if (n > bestN || (n === bestN && (p.length > best.length || (p.length === best.length && p < best)))) {
        best = p; bestN = n;
      }
    }
    // Only a genuine hierarchy is useful — a leaf whose only "path" is itself
    // (root-level tag) carries no placement information.
    if (best.includes('/')) map.set(leaf, best);
  }
  return map;
}

/** One keyword display form seen somewhere, with where it was seen (#919). */
export interface KeywordFormStat {
  form: string;
  pageCount?: number;
  mediaCount?: number;
  catalogued?: boolean;
  catalogId?: string;
}

/** A cluster of display forms that share one canonical value (#919). */
export interface KeywordVariantGroup {
  value: string;
  canonicalForm: string;
  canonicalId?: string;
  forms: Array<{ form: string; pageCount: number; mediaCount: number; catalogued: boolean; catalogId?: string }>;
  total: number;
  mergeable: boolean;
}

/**
 * Group keyword display forms into variant clusters (#919, #869 Slice 4).
 * Forms are deduped by exact string (summing counts), grouped by
 * `normalizeKeywordValue` (folds case/space/accent/punctuation — stronger than
 * a lowercase match), and only values carried by **2+ distinct forms** are
 * returned. Canonical form = the catalogued form if any, else the most-used.
 * `mergeable` is true when the canonical and at least one other form are both
 * catalog terms (the page-retag merge keys on catalog ids). Pure.
 */
export function groupKeywordVariants(forms: readonly KeywordFormStat[]): KeywordVariantGroup[] {
  const byForm = new Map<string, { form: string; pageCount: number; mediaCount: number; catalogued: boolean; catalogId?: string }>();
  for (const f of forms) {
    if (typeof f?.form !== 'string' || !f.form.trim() || !normalizeKeywordValue(f.form)) continue;
    const rec = byForm.get(f.form) ?? { form: f.form, pageCount: 0, mediaCount: 0, catalogued: false };
    rec.pageCount += f.pageCount ?? 0;
    rec.mediaCount += f.mediaCount ?? 0;
    if (f.catalogued) { rec.catalogued = true; rec.catalogId = f.catalogId; }
    byForm.set(f.form, rec);
  }
  const byValue = new Map<string, Array<{ form: string; pageCount: number; mediaCount: number; catalogued: boolean; catalogId?: string }>>();
  for (const rec of byForm.values()) {
    const v = normalizeKeywordValue(rec.form);
    const arr = byValue.get(v) ?? [];
    arr.push(rec);
    byValue.set(v, arr);
  }
  return [...byValue.entries()]
    .filter(([, fs]) => fs.length > 1)
    .map(([value, fs]) => {
      fs.sort((a, b) => (b.pageCount + b.mediaCount) - (a.pageCount + a.mediaCount) || a.form.localeCompare(b.form));
      const canonical = fs.find(f => f.catalogued) ?? fs[0];
      const total = fs.reduce((s, f) => s + f.pageCount + f.mediaCount, 0);
      const mergeable = !!canonical.catalogId && fs.some(f => f !== canonical && f.catalogId);
      return { value, canonicalForm: canonical.form, canonicalId: canonical.catalogId, forms: fs, total, mergeable };
    })
    .sort((a, b) => b.total - a.total);
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
