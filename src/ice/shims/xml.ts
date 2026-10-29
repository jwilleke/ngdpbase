/**
 * xml shim (#685 slice 8; a core shim since #2109) — dependency: fast-xml-parser
 * (itself zero-dep).
 *
 * Generic XML → records, for sources with no JSON surface (e.g. VAAC ash
 * advisories, geohazardwatch#5). The document is parsed to plain objects so
 * the existing dot-path machinery applies unchanged: locate the items array
 * via the `itemsPath` option (e.g. 'rss.channel.item' or
 * 'advisories.advisory'), map fields via `map` / `recordIdField`.
 *
 * XML-specific shape rules:
 * - Attributes are kept, prefixed '@' — dot-path them as e.g. 'link.@href'.
 * - Element text alongside attributes lands under '#text'.
 * - A single repeated element parses as an object, not a 1-element array —
 *   the shim coerces the located items to an array, so `itemsPath` behaves
 *   identically for 1 and N items.
 */

import { XMLParser } from 'fast-xml-parser';
import { ANY_RECEIVER, type IceShim } from '../types.js';
import { getByPath } from './dotpath.js';
import { buildRecord, pickItemsArray, RECORD_KIND, recordItems, recordOptions, type RawRecord } from './record.js';

/**
 * Shared fast-xml-parser instance — reused by the rss-atom (#913) and xml-index
 * (#912) shims so XML shape rules stay identical across all XML-based sources.
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

/** The items of an XML document: at `itemsPath`, else under its (single) root by envelope detection. */
export function xmlItems(text: string, itemsPath: string | undefined): RawRecord[] {
  const doc: unknown = xmlParser.parse(text);
  if (itemsPath) return coerceItems(getByPath(doc, itemsPath));
  const root = doc && typeof doc === 'object' && !Array.isArray(doc)
    ? Object.values(doc as Record<string, unknown>)[0]
    : doc;
  return coerceItems(pickItemsArray(root));
}

export const xmlShim: IceShim = {
  name: 'xml',
  label: 'XML',
  direction: 'in',
  accepts: { extensions: ['.xml'], mediaTypes: ['application/xml', 'text/xml'] },
  produces: RECORD_KIND,
  receivers: [ANY_RECEIVER],
  duplicates: 'item',

  async read(input, tools) {
    const opts = recordOptions(tools.options);
    // The element itself is the record; lift its own fields when no map is set.
    return { items: recordItems(input, xmlItems(input.text ?? '', opts.itemsPath).map(raw => buildRecord(raw, opts, raw))) };
  }
};
