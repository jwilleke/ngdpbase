/**
 * Page frontmatter whose names are always text — issue #1381.
 *
 * YAML reads an unquoted `title: true` as a boolean and `title: 2024-11-21` as
 * a date. Imported pages were written that way (the importer quoted only
 * strings containing `:`, `#` or `'`), so a page could come back with a Date
 * for a title: shown as "Wed Nov 20 2024 19:00:00 GMT-0500…" (a day off in
 * US time zones), unreachable at its own URL, and throwing
 * `title.toLowerCase is not a function` on save.
 *
 * A page's names are the fields that identify it: title, slug, uuid, and the
 * alias and former-title lists. `parsePageFrontmatter` returns each of them as
 * the text written in the file, taken from a strings-only (failsafe) parse of
 * the same frontmatter, so `2024-11-21` stays `2024-11-21` rather than going
 * through a Date. Every other field keeps its YAML type: `private: true` is
 * still a boolean.
 */
import matter from 'gray-matter';
import yaml from 'js-yaml';

const NAME_FIELDS = ['title', 'slug', 'uuid'] as const;
const NAME_LIST_FIELDS = ['aliases', 'formerTitles'] as const;

export interface ParsedPageFile {
  data: Record<string, unknown>;
  content: string;
}

function isText(value: unknown): boolean {
  return value == null || typeof value === 'string';
}

function hasNonTextName(data: Record<string, unknown>): boolean {
  if (NAME_FIELDS.some((f) => !isText(data[f]))) return true;
  return NAME_LIST_FIELDS.some((f) => Array.isArray(data[f]) && (data[f] as unknown[]).some((v) => !isText(v)));
}

/**
 * A name value as text, for values that no longer carry their written form
 * (metadata already parsed elsewhere). A Date becomes its ISO string, which is
 * what an imported timestamp title was written as.
 */
export function nameAsText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

/**
 * Make a metadata object's name fields text in place, and return it.
 *
 * For callers holding metadata that was parsed without
 * `parsePageFrontmatter`; a save must never meet a boolean or Date title.
 */
export function namesAsText<T extends Record<string, unknown>>(data: T): T {
  const d = data as Record<string, unknown>;
  for (const f of NAME_FIELDS) {
    if (!isText(d[f])) d[f] = nameAsText(d[f]);
  }
  for (const f of NAME_LIST_FIELDS) {
    const list: unknown = d[f];
    if (Array.isArray(list) && (list as unknown[]).some((v) => !isText(v))) {
      d[f] = (list as unknown[]).map((v) => (isText(v) ? v : nameAsText(v))).filter((v) => v != null);
    }
  }
  return data;
}

/**
 * Parse a page file. Name fields come back as the text written in the file.
 */
export function parsePageFrontmatter(raw: string): ParsedPageFile {
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  if (!hasNonTextName(data)) {
    return { data, content: parsed.content };
  }

  // gray-matter caches by input string and hands back the same object; copy
  // before changing it so the cache keeps what YAML actually said.
  const out: Record<string, unknown> = { ...data };
  let written: Record<string, unknown> = {};
  try {
    const loaded = yaml.load(parsed.matter, { schema: yaml.FAILSAFE_SCHEMA });
    if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
      written = loaded as Record<string, unknown>;
    }
  } catch {
    // The default parse succeeded, so this should not happen; fall back below.
  }
  for (const f of NAME_FIELDS) {
    if (isText(out[f])) continue;
    out[f] = typeof written[f] === 'string' ? written[f] : nameAsText(out[f]);
  }
  for (const f of NAME_LIST_FIELDS) {
    const list: unknown = out[f];
    if (!Array.isArray(list) || (list as unknown[]).every(isText)) continue;
    const writtenList = Array.isArray(written[f]) ? (written[f] as unknown[]) : [];
    out[f] = (list as unknown[])
      .map((v, i) => (isText(v) ? v : typeof writtenList[i] === 'string' ? writtenList[i] : nameAsText(v)))
      .filter((v) => v != null);
  }
  return { data: out, content: parsed.content };
}
