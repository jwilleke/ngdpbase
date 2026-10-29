/**
 * rss-atom shim (#913; a core shim since #2109) — dependency: fast-xml-parser
 * (shared with the xml shim). RSS 2.0 and Atom 1.0 are both XML, so this is a
 * thin, sensible-default wrapper over the shared XML machinery rather than a
 * separate parser.
 *
 * Item location (when the `itemsPath` option is not set):
 *   - RSS 2.0 → `rss.channel.item`
 *   - Atom 1.0 → `feed.entry`
 *   - else the generic envelope detection (pickItemsArray)
 *
 * Id resolution (when `recordIdField` is not set): RSS `<guid>` → `<link>`;
 * Atom `<id>` → `<link href>`. guid/link may parse as objects (guid with
 * `@isPermaLink`, Atom link as an attribute-only element) — both are unwrapped.
 */

import { ANY_RECEIVER, type IceRecordData, type IceShim } from '../types.js';
import { getByPath } from './dotpath.js';
import { buildRecord, pickItemsArray, RECORD_KIND, recordItems, recordOptions, type RecordShimOptions, type RawRecord } from './record.js';
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

/** The items of an RSS or Atom document. */
export function rssAtomItems(text: string, itemsPath: string | undefined): RawRecord[] {
  const doc: unknown = xmlParser.parse(text);
  if (itemsPath) return coerceItems(getByPath(doc, itemsPath));
  // Default: RSS items, then Atom entries, then generic envelope detection.
  const rssItems = getByPath(doc, 'rss.channel.item');
  if (rssItems != null) return coerceItems(rssItems);
  const atomEntries = getByPath(doc, 'feed.entry');
  if (atomEntries != null) return coerceItems(atomEntries);
  return coerceItems(pickItemsArray(doc));
}

/** One RSS item or Atom entry as a record. */
export function rssAtomRecord(raw: RawRecord, opts: RecordShimOptions): IceRecordData | null {
  if (opts.recordIdField) return buildRecord(raw, opts, raw);
  const id = feedItemId(raw);
  const seed = id ? { ...raw, id } : raw;
  return buildRecord(seed, opts, raw);
}

export const rssAtomShim: IceShim = {
  name: 'rss-atom',
  label: 'RSS / Atom',
  direction: 'in',
  accepts: {
    extensions: ['.rss', '.atom'],
    mediaTypes: ['application/rss+xml', 'application/atom+xml']
  },
  produces: RECORD_KIND,
  receivers: [ANY_RECEIVER],
  duplicates: 'item',

  async read(input, tools) {
    const opts = recordOptions(tools.options);
    return { items: recordItems(input, rssAtomItems(input.text ?? '', opts.itemsPath).map(raw => rssAtomRecord(raw, opts))) };
  }
};
