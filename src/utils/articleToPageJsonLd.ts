/**
 * #773 — render adapter: internal `Article` → JSON-LD-render `PageJsonLd`.
 *
 * This is the "JSON-LD render mapper" that finally lets the WikiRoutes
 * view-page handler route its JSON-LD through `PageManager.toCreativeWork()`
 * instead of calling `buildPageJsonLd()` directly. The deferred follow-up
 * from #772 (Slice 4 of #755) — `src/utils/buildPageJsonLd.ts:5-10`
 * anticipated this slice explicitly.
 *
 * Per `docs/schemas.md` Decision 11: "AssetRecord (internal) + CreativeWork
 * (JSON-LD render) coexist; render mapper converts." This is the render
 * mapper.
 *
 * Conversions applied:
 *   - Adds `@context: 'https://schema.org'` (JSON-LD doc must declare it; the
 *     internal `Article` shape omits it).
 *   - `'ngdp:category'` → `articleSection` (the JSON-LD-canonical field name
 *     for a page's section/category; Decision 5's per-field render policy
 *     "map" lands here).
 *   - Bare-string `author` / `editor` → `{ '@type': 'Person', name }` Person
 *     objects (JSON-LD render convention; internal records keep the bare
 *     string for compactness).
 *
 * Pass-through (no shape change):
 *   - `@type`, `@id`, `identifier`, `url`, `name`, `description`,
 *     `dateCreated`, `dateModified`, `keywords`, `inLanguage`.
 *
 * Dropped from the internal record (no consumer in PageJsonLd yet):
 *   - `'ngdp:slug'` — redundant with `@id` for render output (Decision B,
 *     2026-05-20). Stays on the internal Article for catalog consumers.
 *   - `articleBody`, `mentions`, `version` — Slice 6 territory; not exposed
 *     in PageJsonLd today.
 */

import type { Article } from '../types/Schema.js';
import type { PageJsonLd } from './buildPageJsonLd.js';

/**
 * Convert an internal `Article` (from `pageToArticle` / `PageManager.toCreativeWork`)
 * into the JSON-LD-render shape `PageJsonLd` consumed by `view.ejs` and by
 * the `/view/<slug>` `Accept: application/ld+json` content-negotiation
 * branch. Pure function, no I/O.
 */
export function articleToPageJsonLd(article: Article): PageJsonLd {
  const out: PageJsonLd = {
    '@context': 'https://schema.org',
    '@type': article['@type'],
    '@id': article['@id'],
    url: article.url,
    name: article.name,
    identifier: article.identifier
  };

  if (article.description) out.description = article.description;
  if (article.dateCreated) out.dateCreated = article.dateCreated;
  if (article.dateModified) out.dateModified = article.dateModified;

  // author / editor: convert bare-string → Person object.
  if (typeof article.author === 'string' && article.author) {
    out.author = { '@type': 'Person', name: article.author };
  } else if (article.author && typeof article.author === 'object' && 'name' in article.author) {
    // Already a Person object (caller pre-built one) — pass through with
    // the JSON-LD-canonical @type field set.
    out.author = { '@type': 'Person', name: String(article.author.name) };
  }
  if (typeof article.editor === 'string' && article.editor) {
    out.editor = { '@type': 'Person', name: article.editor };
  } else if (article.editor && typeof article.editor === 'object' && 'name' in article.editor) {
    out.editor = { '@type': 'Person', name: String(article.editor.name) };
  }

  // ngdp:category (internal field name) → articleSection (JSON-LD-canonical).
  const sysCat = article['ngdp:category'];
  if (typeof sysCat === 'string' && sysCat) {
    out.articleSection = sysCat;
  }

  if (article.keywords && article.keywords.length > 0) {
    out.keywords = article.keywords;
  }
  if (article.inLanguage) {
    out.inLanguage = article.inLanguage;
  }

  return out;
}
