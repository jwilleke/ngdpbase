import { guardedFetch } from '../../../../src/http/guardedFetch.js';
import type { EgressPolicy } from '../../../../src/http/ssrf.js';
import { isOk, reason } from './http.js';
/**
 * xml adapter (#685 slice 8) — dependency: fast-xml-parser (itself zero-dep).
 *
 * Generic XML GET → records, for feeds with no JSON surface (e.g. VAAC ash
 * advisories, geohazardwatch#5). The document is parsed to plain objects so the
 * framework's existing dot-path machinery applies unchanged: locate the items
 * array via `cfg.itemsPath` (e.g. 'rss.channel.item' or 'advisories.advisory'),
 * map fields via `cfg.map` / `cfg.recordIdField`.
 *
 * XML-specific shape rules:
 * - Attributes are kept, prefixed '@' — dot-path them as e.g. 'link.@href'.
 * - Element text alongside attributes lands under '#text'.
 * - A single repeated element parses as an object, not a 1-element array —
 *   the adapter coerces the located items to an array, so `itemsPath` behaves
 *   identically for 1 and N items.
 */

import { XMLParser } from 'fast-xml-parser';
import type { SourceAdapter, RawRecord, NormalizedRecord } from './types.js';
import type { FeedSourceConfig } from '../types.js';
import { getByPath } from './dotpath.js';
import { buildRecord, pickItemsArray } from './buildRecord.js';

/**
 * Shared fast-xml-parser instance — reused by the rss-atom (#913) and xml-index
 * (#912) adapters so XML shape rules stay identical across all XML-based feeds.
 */
export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Keep values as strings except obvious numbers/booleans; entities decoded.
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true
});

/** XML parses a lone repeated element as an object — normalize to an array. */
export function coerceItems(located: unknown): RawRecord[] {
  if (Array.isArray(located)) return located as RawRecord[];
  if (located && typeof located === 'object') return [located as RawRecord];
  return [];
}

export const xmlAdapter: SourceAdapter = {
  name: 'xml',

  async fetch(cfg: FeedSourceConfig, policy: EgressPolicy): Promise<RawRecord[]> {
    const res = await guardedFetch(cfg.url, { policy });
    if (!isOk(res)) {
      throw new Error(`feed '${cfg.sourceId}': HTTP ${res.status} ${reason(res)} from ${cfg.url}`);
    }
    const doc: unknown = xmlParser.parse(res.body.toString('utf8'));
    if (cfg.itemsPath) return coerceItems(getByPath(doc, cfg.itemsPath));
    // No itemsPath: unwrap the (single) document root, then envelope-detect.
    const root = doc && typeof doc === 'object' && !Array.isArray(doc)
      ? Object.values(doc as Record<string, unknown>)[0]
      : doc;
    return coerceItems(pickItemsArray(root));
  },

  parse(raw: RawRecord, cfg: FeedSourceConfig): NormalizedRecord | null {
    // The element itself is the record; lift its own fields when no map is set.
    return buildRecord(raw, cfg, raw);
  }
};
