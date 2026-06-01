/**
 * Conservative filename → capture-date parser (#809, slice C of #807).
 *
 * Last-resort fallback used by media providers when a file carries no usable
 * EXIF/QuickTime capture date. Many devices encode the capture time in the
 * filename (e.g. `PXL_20260113_123414708.jpg`, `2026-04-03-IMG_4654.jpg`,
 * `Feb_20_2026_19_25_04.jpg`); without this, those files index with
 * `dateTimeOriginal: null` and sort only by file `mtime`.
 *
 * Design constraints (from the issue):
 *   - **Conservative** — only a small set of high-confidence, anchored patterns
 *     are accepted. Anything ambiguous returns `null`, and the caller then
 *     falls back to `mtime` and surfaces the file to admins.
 *   - **Distinguishable provenance** — the caller records that the resulting
 *     date came from the filename (`captureDateSource: 'filename'`), so a
 *     parsed date never masquerades as authoritative EXIF metadata.
 *
 * Returns a `"YYYY-MM-DD HH:MM:SS"` string (the exact shape produced by the
 * EXIF extractor, so it flows through sort/filter identically), or `null`.
 * A date-only match yields a `00:00:00` time.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

/**
 * Range-validate the components and format them. Returns `null` when any
 * component is out of range — the parser treats that as "no high-confidence
 * match" and the caller falls back to mtime. Year bounds match the existing
 * `extractYear` convention (1800–2100); day is range-checked 1–31 only (no
 * per-month calendar check — kept simple, and the structured pattern is what
 * provides confidence, not a calendar lookup).
 */
function build(y: number, mo: number, d: number, h: number, mi: number, s: number): string | null {
  if (y < 1800 || y > 2100) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  if (h > 23 || mi > 59 || s > 59) return null;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`;
}

/**
 * Ordered matchers, most-specific first. Each tries to extract date
 * components from the filename; the first that both matches and range-validates
 * wins. Patterns are anchored on separators / month names so unstructured
 * digit runs (serials, counters) don't accidentally parse.
 */
const MATCHERS: ReadonlyArray<(name: string) => string | null> = [
  // Month-name form: Feb_20_2026[_19_25_04] / February_5_2026
  (name) => {
    const m = name.match(/(?:^|[^A-Za-z])(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[_\- ](\d{1,2})[_\- ](\d{4})(?:[_\- ](\d{1,2})[_\- ](\d{1,2})[_\- ](\d{1,2}))?/i);
    if (!m) return null;
    const mo = MONTHS[m[1].toLowerCase()];
    return build(+m[3], mo, +m[2], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  },

  // ISO date prefix: 2026-04-03[_14.00.00] / 2026-04-03-IMG_4654
  (name) => {
    const m = name.match(/(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?:[ T_](\d{2})[:.-](\d{2})[:.-](\d{2}))?/);
    if (!m) return null;
    return build(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  },

  // Compact form WITH a time component (the separator + time is what makes it
  // high-confidence): [PXL_|IMG_|VID_|Screenshot_]20260113_123414[708]
  (name) => {
    const m = name.match(/(?:^|[^\d])(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/);
    if (!m) return null;
    return build(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
  }
];

export function parseDateFromFilename(filename: string): string | null {
  if (!filename) return null;
  for (const matcher of MATCHERS) {
    const result = matcher(filename);
    if (result) return result;
  }
  return null;
}
