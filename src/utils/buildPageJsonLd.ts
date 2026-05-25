/**
 * Slice 6a of #760 (#765) — build the schema.org Article JSON-LD payload
 * embedded on every `/view/:page` rendered output.
 *
 * **#773 update (v3.35.0):** this function is now a thin compose over the
 * unified page-shape logic: `pageToArticle()` produces the internal `Article`
 * record, then `articleToPageJsonLd()` converts to the render shape. Single
 * source of truth for the page→Article mapping. Before #773 this function
 * carried its own keyword-merging, author/editor, and @type-fallback logic;
 * that logic now lives in the two split mappers.
 *
 * One ratified behavior shift came with #773: the legacy CreativeWork
 * fallback for very-sparse pages is GONE — every page emits `@type: Article`
 * (consistent with `PageManager.types = ['Article']` and the EPIC #755
 * Decision 1 "Article-first" policy). In practice every page on the system
 * carries at least `lastModified`, so this only affects synthetic / null
 * metadata inputs.
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

import { pageToArticle } from './pageToArticle.js';
import { articleToPageJsonLd } from './articleToPageJsonLd.js';

/** Minimal Person reference used in `author` / `editor`. */
interface JsonLdPerson {
  '@type': 'Person';
  name: string;
}

/** Output shape — a subset of schema.org `Article` (no `articleBody` etc.). */
export interface PageJsonLd {
  '@context': 'https://schema.org';
  /**
   * JSON-LD render @type. Default `'Article'` (matches the internal `Article`
   * record); operator-configurable Article subtypes via the
   * `ngdpbase.schema-types` config block (per #791). Includes the shipped-
   * subtype set; operators may configure non-Article schema.org types per
   * deployment but consumers should defensively treat `@type` as `string`
   * when handling operator-overridden values.
   */
  '@type': 'Article' | 'BlogPosting' | 'TechArticle' | 'NewsArticle'
    | 'ScholarlyArticle' | 'MedicalScholarlyArticle' | 'Report'
    | 'SatiricalArticle' | 'APIReference' | 'SocialMediaPosting'
    | 'DiscussionForumPosting' | 'AdvertiserContentArticle' | 'CreativeWork';
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

/**
 * Build the JSON-LD payload for a single page.
 *
 * Thin compose: `pageToArticle()` produces the internal `Article` from
 * frontmatter, then `articleToPageJsonLd()` converts to the render shape.
 * See `pageToArticle.ts` and `articleToPageJsonLd.ts` for the per-mapping
 * detail.
 */
export function buildPageJsonLd(
  pageName: string,
  metadata: PageMetadataLike | null | undefined,
  options: BuildPageJsonLdOptions = {}
): PageJsonLd {
  // pageToArticle expects PageFrontmatter; PageMetadataLike is a structurally
  // compatible loose superset (extra fields ignored). The cast is safe.
  const article = pageToArticle(
    pageName,
    metadata as unknown as Parameters<typeof pageToArticle>[1],
    { baseUrl: options.baseUrl, autoTaggedKeywords: options.autoTaggedKeywords }
  );
  return articleToPageJsonLd(article);
}

// The lonely `coerceKeywordList` helper used to live here; it's now in
// `pageToArticle.ts` (the new source of truth for the merge). Keeping the
// import list above clean is intentional — adding it back here would
// reintroduce the duplication this refactor removed.
