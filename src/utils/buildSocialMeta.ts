/**
 * buildSocialMeta — OpenGraph + Twitter card tags for page views (#886).
 *
 * Makes a shared page URL unfurl properly in chat apps and improves indexing.
 * Pure function: takes what the route already resolved, returns tag
 * descriptors. The template escapes them.
 *
 * ## Scope, and what already exists
 *
 * schema.org structured data is NOT built here — `buildPageJsonLd` already
 * emits a JSON-LD block on every page view (#760/#765), and Decision 9 of #755
 * settled that structured data is JSON-LD only, never HTML microdata. This adds
 * the OpenGraph/Twitter half that was missing, and deliberately leaves the
 * JSON-LD path alone.
 *
 * ## Why descriptions are derived rather than read
 *
 * `pageToArticle` reads a `description` frontmatter key, but no page in the
 * corpus sets one (0 of 3,000 sampled), so a description-from-frontmatter-only
 * implementation would emit nothing on essentially every page. An excerpt from
 * the rendered content is derived instead, with frontmatter still winning when
 * present.
 */

/** A single meta tag. OpenGraph uses `property`, Twitter uses `name`. */
export interface MetaTag {
  property?: string;
  name?: string;
  content: string;
}

export interface SocialMetaInput {
  /** Page name — the fallback title and part of the canonical URL. */
  pageName: string;
  /** Frontmatter, when available. */
  metadata?: {
    title?: string;
    description?: string;
    slug?: string;
    lastModified?: string;
    author?: string;
  } | null;
  /** Rendered page HTML, used to derive a description and find an image. */
  contentHtml?: string;
  /** Canonical site base URL, e.g. `https://example.com`. */
  baseUrl: string;
  /** Site name for `og:site_name`. */
  applicationName: string;
}

/** Longest description emitted. Past ~200 chars every consumer truncates anyway. */
const MAX_DESCRIPTION = 200;

/** Strip tags, entities and whitespace runs from rendered HTML. */
function toPlainText(html: string): string {
  return html
    // Drop anything whose text is not prose before the tag strip, or their
    // contents survive as words: a <script> body would otherwise become the
    // description of the page.
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncate at a word boundary, appending an ellipsis only when text was cut.
 * Exported for the tests that pin the boundary behaviour.
 */
export function excerpt(text: string, max = MAX_DESCRIPTION): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // A single word longer than the limit has no boundary to break on; hard-cut
  // rather than returning an empty string.
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

/** First `<img src>` in the rendered HTML, or undefined. */
function firstImage(html: string): string | undefined {
  const m = /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(html);
  return m ? m[1] : undefined;
}

/**
 * Resolve a possibly-relative URL against the base.
 *
 * Returns undefined rather than a broken value when the base is unusable —
 * a relative `og:image` is ignored by every consumer, so emitting one is
 * worse than emitting none.
 */
export function absoluteUrl(pathOrUrl: string, baseUrl: string): string | undefined {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = (baseUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) return undefined;
  return base + (pathOrUrl.startsWith('/') ? pathOrUrl : '/' + pathOrUrl);
}

/**
 * Build the OpenGraph + Twitter tags for one page view.
 *
 * Returns `[]` when there is nothing worth emitting, so the caller can render
 * unconditionally without a length check.
 */
export function buildSocialMeta(input: SocialMetaInput): MetaTag[] {
  const { pageName, metadata, contentHtml = '', baseUrl, applicationName } = input;
  if (!pageName) return [];

  const title = (metadata?.title || pageName).trim();
  const slug = metadata?.slug || pageName;
  const url = absoluteUrl('/view/' + encodeURIComponent(slug), baseUrl);

  const description = (metadata?.description || '').trim()
    || excerpt(toPlainText(contentHtml));

  const rawImage = firstImage(contentHtml);
  const image = rawImage ? absoluteUrl(rawImage, baseUrl) : undefined;

  const tags: MetaTag[] = [
    { property: 'og:type', content: 'article' },
    { property: 'og:title', content: title }
  ];

  if (applicationName) tags.push({ property: 'og:site_name', content: applicationName });
  if (url) tags.push({ property: 'og:url', content: url });
  if (description) tags.push({ property: 'og:description', content: description });
  if (image) tags.push({ property: 'og:image', content: image });

  if (metadata?.lastModified) {
    tags.push({ property: 'article:modified_time', content: metadata.lastModified });
  }
  if (metadata?.author) {
    tags.push({ property: 'article:author', content: metadata.author });
  }

  // Twitter falls back to the og:* values for title/description/image, so only
  // the card type is required. `summary_large_image` on a page with no image
  // renders as an empty banner, hence the conditional.
  tags.push({ name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' });

  // A canonical URL is standard alongside og:url and costs nothing here; the
  // template renders it as <link rel="canonical">.
  return tags;
}
