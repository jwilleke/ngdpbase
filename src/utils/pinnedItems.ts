/**
 * pinnedItems — normalisation helpers for the My Links data shape.
 *
 * The on-disk shape evolved from `{pageName, title}` (wiki pages only) to a
 * unified `{url, title, pageName?, pinnedAt?}` so app-route URLs like
 * /my/journal can be pinned alongside wiki pages (#785). Existing stored
 * entries are migrated at read time by normalizePinnedItem.
 */

import type { PinnedItem } from '../types/User.js';

/**
 * Bring a raw stored entry into the canonical PinnedItem shape. Returns null
 * for malformed entries (neither url nor pageName present).
 *
 * Legacy entry `{pageName: "Foo", title: "Foo"}` → `{url: "/view/Foo", title, pageName}`.
 * New entry `{url: "/my/journal", title: "My Journal"}` → unchanged plus default title.
 */
export function normalizePinnedItem(raw: unknown): PinnedItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { url?: unknown; pageName?: unknown; title?: unknown; pinnedAt?: unknown };

  const url = typeof r.url === 'string' && r.url ? r.url : null;
  const pageName = typeof r.pageName === 'string' && r.pageName ? r.pageName : null;
  const title = typeof r.title === 'string' && r.title ? r.title : null;
  const pinnedAt = typeof r.pinnedAt === 'string' ? r.pinnedAt : undefined;

  if (!url && !pageName) return null;

  const canonicalUrl = url ?? `/view/${encodeURIComponent(pageName!)}`;
  const canonicalTitle = title ?? pageName ?? canonicalUrl;

  return {
    url: canonicalUrl,
    title: canonicalTitle,
    ...(pageName ? { pageName } : {}),
    ...(pinnedAt ? { pinnedAt } : {})
  };
}

/**
 * Normalise an array of stored entries, dropping any that fail to normalise.
 */
export function normalizePinnedItems(raw: unknown): PinnedItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizePinnedItem)
    .filter((item): item is PinnedItem => item !== null);
}

/**
 * Compute the canonical url for an entry being added — either the explicit
 * `url` field, or `/view/<encoded pageName>` if only pageName is provided.
 * Returns null when neither is usable.
 */
export function deriveCanonicalUrl(input: { url?: string; pageName?: string }): string | null {
  if (input.url && typeof input.url === 'string') return input.url;
  if (input.pageName && typeof input.pageName === 'string') {
    return `/view/${encodeURIComponent(input.pageName)}`;
  }
  return null;
}
