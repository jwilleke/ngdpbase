/**
 * rss-atom adapter (#913) — dependency: fast-xml-parser (shared with the xml
 * adapter). RSS 2.0 and Atom 1.0 are both XML, so this is a thin, sensible-
 * default wrapper over the shared XML machinery rather than a separate parser.
 *
 * Item location (when `cfg.itemsPath` is not set):
 *   - RSS 2.0 → `rss.channel.item`
 *   - Atom 1.0 → `feed.entry`
 *   - else the generic envelope detection (pickItemsArray)
 *
 * Id resolution (when `cfg.recordIdField` is not set): RSS `<guid>` → `<link>`;
 * Atom `<id>` → `<link href>`. guid/link may parse as objects (guid with
 * `@isPermaLink`, Atom link as an attribute-only element) — both are unwrapped.
 */

import type { SourceAdapter, RawRecord, NormalizedRecord } from './types.js';
import type { FeedSourceConfig } from '../types.js';
import { getByPath } from './dotpath.js';
import { buildRecord, pickItemsArray } from './buildRecord.js';
import { xmlParser, coerceItems } from './xml.js';

/** Stringify only scalars; objects/arrays/null → ''. */
function scalar(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
}

/** Unwrap a value that may be a scalar or an XML element object. */
function unwrap(v: unknown): string {
  if (v != null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return scalar(o['#text'] ?? o['@href']);
  }
  return scalar(v);
}

/** RSS/Atom id: guid → id → link. */
function feedItemId(raw: RawRecord): string {
  if (raw.guid != null) return unwrap(raw.guid);
  if (raw.id != null) return unwrap(raw.id);
  if (raw.link != null) return unwrap(raw.link);
  return '';
}

export const rssAtomAdapter: SourceAdapter = {
  name: 'rss-atom',

  async fetch(cfg: FeedSourceConfig): Promise<RawRecord[]> {
    const res = await fetch(cfg.url);
    if (!res.ok) {
      throw new Error(`feed '${cfg.sourceId}': HTTP ${res.status} ${res.statusText} from ${cfg.url}`);
    }
    const doc: unknown = xmlParser.parse(await res.text());
    if (cfg.itemsPath) return coerceItems(getByPath(doc, cfg.itemsPath));
    // Default: RSS items, then Atom entries, then generic envelope detection.
    const rssItems = getByPath(doc, 'rss.channel.item');
    if (rssItems != null) return coerceItems(rssItems);
    const atomEntries = getByPath(doc, 'feed.entry');
    if (atomEntries != null) return coerceItems(atomEntries);
    return coerceItems(pickItemsArray(doc));
  },

  parse(raw: RawRecord, cfg: FeedSourceConfig): NormalizedRecord | null {
    if (cfg.recordIdField) return buildRecord(raw, cfg, raw);
    const id = feedItemId(raw);
    const seed = id ? { ...raw, id } : raw;
    return buildRecord(seed, cfg, raw);
  }
};
