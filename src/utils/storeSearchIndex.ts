/**
 * A private store's own saved search index (#1458, epic #1454).
 *
 * A private page is in NO shared index (#1456), so its owner could not search
 * it at all. Each store therefore keeps its own search index beside its page
 * index — `{store}/search-index.json`, written through the store's own I/O, so
 * it is ciphertext at rest exactly when the store is (operator, 2026-09-22:
 * "each store keeps its own saved search index").
 *
 * It is SAVED, not built at search time: a document per page holds everything
 * a match needs — title, body text, tags, category and `lastModified` — so a
 * search reads one small file per store and never opens a page file. Building
 * from the pages at search time was rejected as too slow for a large store.
 *
 * This module holds the shape and the matching rule and nothing else: no I/O,
 * no config, no access decision. Who may read a store's index is decided
 * before anyone gets here (PageManager, with the requester's context).
 */

/** One page, as its store's search index holds it. */
export interface StoreSearchDocument {
  uuid: string;
  title: string;
  /** The page body — what a full-text match reads. */
  text: string;
  /** Frontmatter `tags` and `user-keywords`, folded into one list. */
  tags: string[];
  /** Frontmatter `system-category`, empty when the page carries none. */
  category: string;
  lastModified: string;
}

/** The file: `{ version, documents: { [uuid]: StoreSearchDocument } }`. */
export interface StoreSearchIndexFile {
  version: number;
  documents: Record<string, StoreSearchDocument>;
}

export const STORE_SEARCH_INDEX_VERSION = 1;

/** What a caller asks a store's index. Every field is optional; all of them narrow. */
export interface StoreSearchQuery {
  /** Free text. Empty means "every document", as the shared no-text branch does. */
  query?: string;
  /** `system-category` values; a document matches when it carries one of them. */
  categories?: string[];
  /** `user-keywords` / tags; a document matches when it carries one of them. */
  userKeywords?: string[];
  /** Which fields the free text is matched in: `title`, `content`, `category`, `keywords`, or `all`. */
  searchIn?: string[];
  /** Longest snippet returned. Default 200, as the Lunr provider's default is. */
  snippetLength?: number;
}

export interface StoreSearchMatch {
  document: StoreSearchDocument;
  score: number;
  snippet: string;
}

const toStr = (value: unknown): string =>
  typeof value === 'string' ? value
    : typeof value === 'number' || typeof value === 'boolean' ? String(value)
      : value instanceof Date ? value.toISOString()
        : '';

const toStrArr = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(toStr).filter(Boolean);
  const text = toStr(value);
  return text ? text.split(',').map((s) => s.trim()).filter(Boolean) : [];
};

/**
 * The document for one page of a store, from what a save already has in hand.
 *
 * The same frontmatter fields the shared index reads (`tags`,
 * `user-keywords`, `system-category`), so a private page and a public one are
 * found by the same words.
 */
export function storeSearchDocument(args: {
  uuid: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}): StoreSearchDocument {
  const metadata = args.metadata ?? {};
  const tags = [...toStrArr(metadata['tags']), ...toStrArr(metadata['user-keywords'])];
  return {
    uuid: args.uuid,
    title: args.title,
    text: args.content,
    // Folded so a tag written in both places is held once.
    tags: [...new Set(tags)],
    category: toStr(metadata['system-category']),
    lastModified: toStr(metadata['lastModified'])
  };
}

/**
 * The query's terms: lower case, punctuation dropped.
 *
 * Deliberately NOT the Lunr query language — a store index is matched here,
 * in plain JavaScript, and a caller's `+title:word` would be nonsense to it.
 * A term that is a prefix of a word in the page counts, so a search for
 * "merg" finds "merger", which is what a reader of their own notes expects.
 */
function terms(query: string): string[] {
  return query.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
}

/** The fields the free text is matched in, from `searchIn`. Default: all of them. */
function fieldsOf(searchIn: string[] | undefined): { title: boolean; text: boolean; tags: boolean; category: boolean } {
  const asked = (searchIn ?? []).filter((s) => s.trim() !== '');
  if (asked.length === 0 || asked.includes('all')) {
    return { title: true, text: true, tags: true, category: true };
  }
  return {
    title: asked.includes('title'),
    text: asked.includes('content'),
    tags: asked.includes('keywords'),
    category: asked.includes('category')
  };
}

/** Where `term` sits in `haystack` (already folded), or -1. */
function positionOf(haystack: string, term: string): number {
  return haystack.indexOf(term);
}

/**
 * A snippet of the page body around the first term that matched, with the
 * terms marked — the same `<mark>` the shared provider emits, so one result
 * list renders the same whichever index a row came from.
 */
function snippetFor(text: string, matched: string[], maxLength: number): string {
  if (!text) return '';
  const folded = text.toLowerCase();
  let at = 0;
  for (const term of matched) {
    const found = positionOf(folded, term);
    if (found >= 0) { at = found; break; }
  }
  const start = Math.max(0, at - Math.floor(maxLength / 4));
  let snippet = text.slice(start, start + maxLength);
  if (start > 0) snippet = `…${snippet}`;
  if (start + maxLength < text.length) snippet = `${snippet}…`;
  for (const term of matched) {
    // The terms come from a tokenised query — letters and digits only — so
    // there is nothing here to escape for the RegExp.
    snippet = snippet.replace(new RegExp(`(${term})`, 'gi'), '<mark>$1</mark>');
  }
  return snippet;
}

/**
 * The documents of one store that match, best first.
 *
 * Every term must match somewhere (AND), as the field-scoped shared search
 * does. A title match scores far above a body match, so the page a reader
 * named comes first.
 */
export function matchStoreSearch(
  documents: Record<string, StoreSearchDocument>,
  ask: StoreSearchQuery = {}
): StoreSearchMatch[] {
  const wanted = terms(ask.query ?? '');
  const fields = fieldsOf(ask.searchIn);
  const categories = (ask.categories ?? []).map((c) => c.toLowerCase()).filter(Boolean);
  const keywords = (ask.userKeywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);
  const maxLength = ask.snippetLength ?? 200;
  const out: StoreSearchMatch[] = [];

  for (const document of Object.values(documents)) {
    const title = document.title.toLowerCase();
    const text = document.text.toLowerCase();
    const tags = document.tags.map((t) => t.toLowerCase());
    const category = document.category.toLowerCase();

    if (categories.length > 0 && !categories.includes(category)) continue;
    if (keywords.length > 0 && !keywords.some((k) => tags.includes(k))) continue;

    let score = 0;
    let matchedAll = true;
    for (const term of wanted) {
      let termScore = 0;
      if (fields.title && positionOf(title, term) >= 0) termScore += 10;
      if (fields.tags && tags.some((t) => positionOf(t, term) >= 0)) termScore += 5;
      if (fields.category && positionOf(category, term) >= 0) termScore += 5;
      if (fields.text && positionOf(text, term) >= 0) termScore += 1;
      if (termScore === 0) { matchedAll = false; break; }
      score += termScore;
    }
    if (!matchedAll) continue;

    out.push({
      document,
      // A no-text browse gives every document the same score, as the shared
      // no-text branch does; there is nothing to rank them by.
      score: wanted.length === 0 ? 1 : score,
      snippet: wanted.length === 0
        ? document.text.slice(0, maxLength)
        : snippetFor(document.text, wanted, maxLength)
    });
  }

  return out.sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title));
}
