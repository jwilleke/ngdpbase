/**
 * Slice 6a of #760 (#765) — build the schema.org Article JSON-LD payload
 * embedded on every `/view/:page` rendered output.
 *
 * Intentionally NOT a CatalogSource yet. Slice 4 (PageManager-as-
 * CatalogSource) is gated on #754 (per-page `created` timestamp + ~17K-page
 * backfill); when that lands, this mapper will be replaced by a
 * `CatalogManager.getCreativeWork('pages', pageId)` delegate. Keeping the
 * page→Article shape mapping centralised here makes that future refactor a
 * 10-line move rather than scattering shape logic across the view handler.
 *
 * The output adheres to `docs/schemas.md` (ratified 2026-05-20) and to the
 * ratified decisions referenced in #755:
 *   - Decision 4: `@id` = canonical URL; UUID = schema.org `identifier`.
 *   - Decision 9: structured-data is JSON-LD only — supersedes #149's
 *     microdata. (The microdata block in `view.ejs` is removed in tandem
 *     with this slice landing.)
 *   - Decision 10: `author` is the immutable original creator; `editor` is
 *     the mutable last-saver.
 *   - Decision 14: keywords are scalar tags; no link-not-duplicate handling
 *     needed (that rule applies to `mentions` / `image`, not `keywords`).
 *
 * Fields are omitted (not emitted as null/empty) when the source page lacks
 * them — JSON-LD consumers prefer absent over null. The output is safe to
 * embed via `JSON.stringify` inside a `<script type="application/ld+json">`
 * tag; values pass through `JSON.stringify`'s built-in `<` / `>` escaping
 * which the EJS template caller is responsible for (we don't double-escape
 * here).
 */

/** Minimal Person reference used in `author` / `editor`. */
interface JsonLdPerson {
  '@type': 'Person';
  name: string;
}

/** Output shape — a subset of schema.org `Article` (no `articleBody` etc.). */
export interface PageJsonLd {
  '@context': 'https://schema.org';
  '@type': 'Article' | 'CreativeWork';
  '@id': string;
  identifier?: string;
  url: string;
  name: string;
  description?: string;
  dateCreated?: string;
  dateModified?: string;
  author?: JsonLdPerson;
  editor?: JsonLdPerson;
  articleSection?: string;
  keywords?: string[];
  inLanguage?: string;
}

/** Loose metadata shape — mirrors what `pageManager.getPageMetadata()` returns. */
export interface PageMetadataLike {
  title?: string;
  description?: string;
  author?: string;
  editor?: string;
  created?: string;
  lastModified?: string;
  'system-category'?: string;
  'user-keywords'?: unknown;
  'system-keywords'?: unknown;
  uuid?: string;
  language?: string;
  inLanguage?: string;
  [key: string]: unknown;
}

export interface BuildPageJsonLdOptions {
  /**
   * Canonical base URL (e.g. `https://wiki.example.com`). Optional — when
   * absent, `@id` and `url` are emitted as the path-only form `/view/<slug>`
   * which is still valid JSON-LD (relative IRI). Set this from the
   * `Host` request header or `ngdpbase.base-url` config when one is configured.
   */
  baseUrl?: string;
  /**
   * Auto-tagged keywords from the search index (#507 / TaggingService). Merged
   * with frontmatter `user-keywords` + `system-keywords` and deduplicated.
   */
  autoTaggedKeywords?: string[];
}

/**
 * Coerce a value to a non-empty string array. Handles arrays, comma /
 * whitespace-separated strings, single strings, and nullish.
 */
function coerceKeywordList(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) {
    return raw.filter((k): k is string => typeof k === 'string' && k.length > 0);
  }
  if (typeof raw === 'string') {
    return raw.split(/[\s,]+/).filter(Boolean);
  }
  return [];
}

/**
 * Slice 6b of #760 (#766) — content-negotiation gate. Returns true when
 * the client's `Accept` header signals it wants the JSON-LD representation
 * of a resource instead of the default (usually HTML).
 *
 * Intentionally simple: a substring check for `application/ld+json`.
 * Quality values (`;q=0.9`), surrounding whitespace, and ordering relative
 * to other MIME types in the header are tolerated. We don't do strict
 * `Accept`-header parsing here — if a real client ever needs preference
 * resolution like "text/html;q=0.5, application/ld+json;q=1.0 → JSON-LD
 * wins", upgrade to a proper RFC 7231 parser. For now: if the header
 * mentions it, the client gets it.
 */
export function wantsJsonLd(req: { headers?: { accept?: string | string[] | undefined } } | null | undefined): boolean {
  if (!req || !req.headers) return false;
  const raw = req.headers.accept;
  if (!raw) return false;
  const flat = Array.isArray(raw) ? raw.join(',') : raw;
  return /application\/ld\+json/i.test(flat);
}

/**
 * Stringify a JSON-LD object safely for embedding inside a
 * `<script type="application/ld+json">` element. `JSON.stringify` alone
 * doesn't escape `<` / `>` / `&`, so attacker-controlled metadata containing
 * `</script>` would close the tag prematurely. We post-process the output to
 * replace the three problematic sequences with their `\uXXXX` JSON-escape
 * forms — valid JSON, safe HTML, no behavior change for any consumer.
 *
 * Reference: OWASP "JSON in HTML" guidance.
 */
export function stringifyJsonLdForScript(payload: unknown): string {
  return JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** Build the JSON-LD payload for a single page. */
export function buildPageJsonLd(
  pageName: string,
  metadata: PageMetadataLike | null | undefined,
  options: BuildPageJsonLdOptions = {}
): PageJsonLd {
  const slug = encodeURIComponent(pageName);
  const base = options.baseUrl?.replace(/\/$/, '') ?? '';
  const canonical = `${base}/view/${slug}`;

  // Keywords: union of user-keywords + system-keywords + auto-tagged + system-category.
  // Deduplicated case-sensitively; preserves first-seen ordering.
  const keywordSet = new Set<string>();
  for (const kw of coerceKeywordList(metadata?.['user-keywords'])) keywordSet.add(kw);
  for (const kw of coerceKeywordList(metadata?.['system-keywords'])) keywordSet.add(kw);
  for (const kw of options.autoTaggedKeywords ?? []) {
    if (typeof kw === 'string' && kw) keywordSet.add(kw);
  }
  // system-category is a single scalar, included in keywords AND surfaced as
  // articleSection (the schema.org-canonical field for a page's section).
  const sysCat = typeof metadata?.['system-category'] === 'string' ? metadata['system-category'] : undefined;
  if (sysCat) keywordSet.add(sysCat);
  const keywords = keywordSet.size > 0 ? Array.from(keywordSet) : undefined;

  // Author / editor — Decision 10: author = immutable original creator;
  // editor = mutable last-saver. Many legacy pages only have `author` and no
  // separate `editor` — emit `author` only in that case.
  const authorName = typeof metadata?.author === 'string' && metadata.author ? metadata.author : undefined;
  const editorName = typeof metadata?.editor === 'string' && metadata.editor && metadata.editor !== authorName
    ? metadata.editor
    : undefined;

  // Determine @type: Article when we have any Article-distinctive field
  // (dateModified, author, system-category). Fall back to CreativeWork base
  // for very-sparse pages. (Schema.org allows narrow → broad fallback.)
  const hasArticleSignal =
    typeof metadata?.lastModified === 'string' && metadata.lastModified ||
    !!authorName ||
    !!sysCat;
  const type: 'Article' | 'CreativeWork' = hasArticleSignal ? 'Article' : 'CreativeWork';

  // inLanguage — pages may carry this in either `language` (legacy) or
  // `inLanguage` (schema.org-aligned). Prefer inLanguage.
  const lang = typeof metadata?.inLanguage === 'string' && metadata.inLanguage
    ? metadata.inLanguage
    : typeof metadata?.language === 'string' && metadata.language
      ? metadata.language
      : undefined;

  const out: PageJsonLd = {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': canonical,
    url: canonical,
    name: typeof metadata?.title === 'string' && metadata.title ? metadata.title : pageName
  };

  // identifier — Decision 4: @id is the URL; uuid is the schema.org identifier.
  if (typeof metadata?.uuid === 'string' && metadata.uuid) {
    out.identifier = metadata.uuid;
  }
  if (typeof metadata?.description === 'string' && metadata.description) {
    out.description = metadata.description;
  }
  // dateCreated lands once Slice 4 / #754 ships per-page `created`. Emit
  // when present so the consumer side already handles it.
  if (typeof metadata?.created === 'string' && metadata.created) {
    out.dateCreated = metadata.created;
  }
  if (typeof metadata?.lastModified === 'string' && metadata.lastModified) {
    out.dateModified = metadata.lastModified;
  }
  if (authorName) out.author = { '@type': 'Person', name: authorName };
  if (editorName) out.editor = { '@type': 'Person', name: editorName };
  if (sysCat) out.articleSection = sysCat;
  if (keywords) out.keywords = keywords;
  if (lang) out.inLanguage = lang;

  return out;
}
