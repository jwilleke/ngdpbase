/**
 * buildSitemap — sitemaps.org 0.9 XML for public instances (#885).
 *
 * Pure functions: the caller decides WHICH pages belong (an authorization
 * question, answered in the route against the real ACL evaluator) and this
 * turns an already-filtered list into XML. Keeping the two apart matters —
 * a sitemap that lists a URL an anonymous visitor cannot fetch leaks the
 * existence and slug of a restricted page, so the filtering deserves to be
 * tested on its own rather than buried in a string builder.
 */

/** One `<url>` entry. */
export interface SitemapEntry {
  /** Absolute URL. Relative values are rejected by the spec and by consumers. */
  loc: string;
  /** W3C datetime, optional. */
  lastmod?: string;
}

/**
 * sitemaps.org caps a single file at 50,000 URLs (and 50MB uncompressed).
 * Past this the caller must emit a sitemap index pointing at several files.
 */
export const SITEMAP_MAX_URLS = 50_000;

/**
 * Escape the five XML predefined entities.
 *
 * `&` must be replaced first or the replacements themselves get re-escaped —
 * `<` would become `&amp;lt;`.
 */
export function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Normalise a timestamp to W3C datetime, or drop it.
 *
 * An unparseable `lastmod` is omitted rather than passed through: a malformed
 * date makes a consumer distrust the whole file, while a missing one is
 * explicitly allowed by the spec.
 */
export function toW3CDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** `<urlset>` document for one batch of entries. */
export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map((e) => {
    const lastmod = toW3CDate(e.lastmod);
    return '  <url>\n'
      + `    <loc>${escapeXml(e.loc)}</loc>\n`
      + (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '')
      + '  </url>';
  }).join('\n');

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + (urls ? urls + '\n' : '')
    + '</urlset>\n';
}

/** `<sitemapindex>` document pointing at the paginated files. */
export function buildSitemapIndexXml(locs: string[], lastmod?: string): string {
  const stamp = toW3CDate(lastmod);
  const items = locs.map((loc) =>
    '  <sitemap>\n'
    + `    <loc>${escapeXml(loc)}</loc>\n`
    + (stamp ? `    <lastmod>${stamp}</lastmod>\n` : '')
    + '  </sitemap>'
  ).join('\n');

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + (items ? items + '\n' : '')
    + '</sitemapindex>\n';
}

/** The page-index fields this filter reads. Mirrors VersioningFileProvider. */
export interface SitemapIndexEntry {
  title?: string;
  slug?: string;
  lastModified?: string;
  /** `'private'` marks a private page; other values are ordinary storage. */
  location?: string;
  /** Denormalised at write time from frontmatter `audience` / `access.view`. */
  audienceRoles?: string[];
  isPrivate?: boolean;
}

/** Frontmatter fields that restrict who may read a page. */
export interface RestrictableMetadata {
  private?: unknown;
  audience?: unknown;
  access?: unknown;
}

/**
 * Whether a page's own frontmatter restricts it to named principals (#885).
 *
 * The page index carries a denormalised `audienceRoles` copy of this, and
 * relying on that copy alone was a LEAK: it is written on save, so any page not
 * re-saved since #754 has the restriction in frontmatter and nothing in the
 * index. On jimstest that was 345 of 347 audience-restricted pages — personal
 * journal entries — which sailed into a generated sitemap during development.
 * The field's own docs say it plainly: "the page-frontmatter is the source of
 * truth". So the index is used to enumerate, and this decides.
 *
 * Deliberately blunt: ANY audience or access rule excludes the page, whatever
 * it says. An anonymous visitor is in no audience and holds no role, so a rule
 * that happens to be permissive is not worth parsing for — omitting a public
 * page costs a missed crawl, listing a restricted one leaks its existence.
 */
export function isRestrictedByMetadata(meta: RestrictableMetadata | null | undefined): boolean {
  if (!meta) return false;
  if (meta.private === true || meta.private === 'true') return true;

  const nonEmpty = (v: unknown): boolean =>
    Array.isArray(v) ? v.length > 0
      : typeof v === 'string' ? v.trim() !== ''
        : typeof v === 'object' && v !== null ? Object.keys(v).length > 0
          : false;

  return nonEmpty(meta.audience) || nonEmpty(meta.access);
}

/**
 * Index-level pre-filter for sitemap candidates (#885).
 *
 * Cheap and in-memory, but NOT sufficient on its own — see
 * {@link isRestrictedByMetadata} for why the index's `audienceRoles` cannot be
 * trusted as the last word. The caller must verify each survivor against its
 * real frontmatter; this pass exists to drop the obvious cases and to build the
 * URL and lastmod, not to make the security decision.
 *
 * Also does not model Tier 2 global policy — whether anonymous `page-read` is
 * allowed at all, and whether any policy is page-scoped. The route settles that
 * before calling.
 */
export function selectPublicSitemapEntries(
  entries: SitemapIndexEntry[],
  baseUrl: string
): SitemapEntry[] {
  const base = (baseUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) return [];

  const out: SitemapEntry[] = [];
  for (const e of entries) {
    if (!e) continue;

    // ALLOW-list the ordinary page store, rather than deny-listing `private`.
    // Deny-listing admits every other store by default, which is the wrong
    // direction here and was already wrong in practice: `required-pages`
    // entries were included, and at least one of them (`using-formplugin`)
    // 404s on /view/ — a dead URL in a sitemap wastes crawl budget and reads
    // as a broken site. A new store type should have to be opted in, not
    // published by omission.
    if (e.location !== 'pages') continue;
    if (e.isPrivate === true) continue;
    if (Array.isArray(e.audienceRoles) && e.audienceRoles.length > 0) continue;

    const slug = (e.slug || e.title || '').trim();
    if (!slug) continue;

    out.push({
      loc: `${base}/view/${encodeURIComponent(slug)}`,
      lastmod: e.lastModified
    });
  }
  return out;
}

/** Split entries into files of at most {@link SITEMAP_MAX_URLS}. */
export function paginate(entries: SitemapEntry[], size = SITEMAP_MAX_URLS): SitemapEntry[][] {
  if (entries.length === 0) return [[]];
  const pages: SitemapEntry[][] = [];
  for (let i = 0; i < entries.length; i += size) pages.push(entries.slice(i, i + size));
  return pages;
}
