/**
 * Slice 4 of #755 (#772) — page → schema.org `Article` mapper for the
 * CatalogSource surface.
 *
 * This is the **internal CreativeWork** projection consumed by
 * `CatalogManager.getCreativeWork('pages', uuid)` and the cross-source
 * `list()` fan-out. It returns the typed `Article` from `src/types/Schema.ts`
 * (no `@context`, no JSON-LD render quirks).
 *
 * Distinct from `src/utils/buildPageJsonLd.ts`, which builds the
 * inline-`<script type="application/ld+json">` payload (Slice 6a / #765) and
 * carries `@context` plus a few JSON-LD-render-only conventions. Per
 * `docs/schemas.md` Decision 11: "AssetRecord (internal) + CreativeWork
 * (JSON-LD render) coexist; render mapper converts." `pageToArticle` is the
 * internal record; `buildPageJsonLd` is the render mapper. Both share the
 * same source frontmatter and produce overlapping shapes — intentional, not
 * duplicated logic.
 *
 * Ratified decisions honored (`docs/schemas.md`):
 *   - Decision 4: `@id` = canonical URL `/view/<slug>`; UUID = `identifier`.
 *   - Decision 5: `system-category` maps to `ngdp:category` (custom field,
 *     `ngdp:` prefix policy).
 *   - Decision 9: structured-data is JSON-LD only — this is the internal
 *     record that the JSON-LD render step consumes.
 *   - Decision 10: `author` immutable (original creator); `editor` mutable
 *     (last-saver). Both surface here when present.
 *   - Decision 13: `dateModified` = latest revision's timestamp (always
 *     `lastModified`, never any older revision's timestamp).
 *
 * Required fields per `Article`:
 *   - `@id`, `@type`, `identifier`, `name`, `url`.
 * Optional fields are omitted (not emitted as `null`/empty) when source lacks
 * them — JSON-LD consumers prefer absent over null.
 */

import type { Article } from '../types/Schema.js';
import type { PageFrontmatter } from '../types/Page.js';

/**
 * Coerce a value to a non-empty string array. Handles arrays, comma /
 * whitespace-separated strings, single strings, and nullish. Mirrors the
 * helper in `buildPageJsonLd.ts` — kept local so this module has no
 * dependency on the render mapper.
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

export interface PageToArticleOptions {
  /**
   * Canonical base URL (e.g. `https://wiki.example.com`). When set, `@id` and
   * `url` are absolute; otherwise they're path-only `/view/<slug>` (still a
   * valid IRI per JSON-LD 1.1).
   */
  baseUrl?: string;

  /**
   * Auto-tagged keywords from the search index (#507 / TaggingService). Merged
   * with frontmatter `user-keywords` + `system-keywords` and deduplicated.
   */
  autoTaggedKeywords?: string[];
}

/**
 * Build the internal `Article` record for a single page.
 *
 * @param pageName    Page title — used as `name` and to compute `@id` / `url`.
 *                    For slug-bearing pages, pass the slug from `metadata.slug`
 *                    so the URL stays stable across renames.
 * @param metadata    Frontmatter object (typically from `PageManager.getPageMetadata`).
 * @param options     Optional `baseUrl` and `autoTaggedKeywords`.
 */
export function pageToArticle(
  pageName: string,
  metadata: PageFrontmatter | null | undefined,
  options: PageToArticleOptions = {}
): Article {
  // Slug-first URL when frontmatter has one (rename-stable); otherwise fall
  // back to URL-encoded title. Matches buildPageJsonLd's URL strategy.
  const slug = typeof metadata?.slug === 'string' && metadata.slug
    ? metadata.slug
    : encodeURIComponent(pageName);
  const base = options.baseUrl?.replace(/\/$/, '') ?? '';
  const canonical = `${base}/view/${slug}`;

  // Keywords: union of user-keywords + system-keywords + auto-tagged + system-category.
  const keywordSet = new Set<string>();
  for (const kw of coerceKeywordList(metadata?.['user-keywords'])) keywordSet.add(kw);
  for (const kw of coerceKeywordList(metadata?.['system-keywords'])) keywordSet.add(kw);
  for (const kw of options.autoTaggedKeywords ?? []) {
    if (typeof kw === 'string' && kw) keywordSet.add(kw);
  }
  const sysCat = typeof metadata?.['system-category'] === 'string' ? metadata['system-category'] : undefined;
  if (sysCat) keywordSet.add(sysCat);
  const keywords = keywordSet.size > 0 ? Array.from(keywordSet) : undefined;

  // Author / editor — Decision 10. Editor is omitted when it matches author
  // (avoids the "alice / alice" duplication that legacy pages emit).
  const authorName = typeof metadata?.author === 'string' && metadata.author ? metadata.author : undefined;
  const editorName = typeof metadata?.editor === 'string' && metadata.editor && metadata.editor !== authorName
    ? metadata.editor
    : undefined;

  // Language: prefer the schema.org-canonical `inLanguage`; fall back to a
  // bare `language` field if present (some legacy pages carry it).
  const inLanguage = typeof metadata?.inLanguage === 'string' && metadata.inLanguage
    ? metadata.inLanguage
    : (typeof (metadata as Record<string, unknown> | undefined)?.language === 'string'
      ? (metadata as Record<string, unknown>).language as string
      : undefined);

  // `description` is optional. PageFrontmatter doesn't declare it as a typed
  // field but plenty of pages carry one; read defensively.
  const description = typeof (metadata as Record<string, unknown> | undefined)?.description === 'string'
    ? (metadata as Record<string, unknown>).description as string
    : undefined;

  const article: Article = {
    '@id': canonical,
    '@type': 'Article',
    // Treat empty-string uuid as missing — Article.identifier is required
    // (non-empty) per the type. Falls back to pageName so the field is always
    // present even for legacy / synthetic pages without a real UUID.
    identifier: typeof metadata?.uuid === 'string' && metadata.uuid ? metadata.uuid : pageName,
    name: typeof metadata?.title === 'string' && metadata.title ? metadata.title : pageName,
    url: canonical,
    ...(description ? { description } : {}),
    ...(typeof metadata?.created === 'string' ? { dateCreated: metadata.created } : {}),
    ...(typeof metadata?.lastModified === 'string' ? { dateModified: metadata.lastModified } : {}),
    ...(authorName ? { author: authorName } : {}),
    ...(editorName ? { editor: editorName } : {}),
    ...(keywords ? { keywords } : {}),
    ...(inLanguage ? { inLanguage } : {}),
    ...(sysCat ? { 'ngdp:category': sysCat } : {}),
    ...(typeof metadata?.slug === 'string' && metadata.slug ? { 'ngdp:slug': metadata.slug } : {})
  };

  return article;
}
