/**
 * What core's record shims share (#685 slice 8; core shims since #2109): the
 * options a run hands its shim, turning one raw item into a `record` item,
 * and the item's key.
 *
 * Nothing here is about any one receiver. A record shim reads one format
 * into `record` items (`data` is `{ id, properties }`, `IceRecordData`); which
 * receiver takes them, and what it does with them, is the receiver's
 * business. So the same CSV shim serves a feed (the feeds add-on's
 * `feeds.items`) and a bank-statement import alike, with neither add-on's
 * code (operator, 2026-10-29: generic work goes to core).
 *
 * id ← the `recordIdField` option (dot-path) or the item's own `id`.
 * properties ← the `map` option (dot-path per field), or — with no map — the
 * supplied `defaultProps` object (geojson lifts `feature.properties`;
 * rest-json lifts the item itself). No id resolves → no record (skipped).
 */

import { createHash } from 'node:crypto';
import type { IceItem, IceRecordData, IceWarning } from '../types.js';
import { getByPath } from './dotpath.js';

/** One raw item straight off the wire (a GeoJSON feature, an RSS item, a CSV row, …). */
export type RawRecord = Record<string, unknown>;

/** The kind every record shim produces: core's generic record (#2109). */
export const RECORD_KIND = 'record';

/**
 * A record shim's options (#2109): the site's `ngdpbase.import.shims.<id>.options`,
 * with the run's own over them (a feed source's settings, an import's).
 * Each is optional and generic: where the items are, which field is the id,
 * a field map, and the few format settings (CSV's delimiter and preamble, an
 * index's links).
 */
export interface RecordShimOptions {
  /** Dot-path to each item's id. */
  recordIdField?: string;
  /** Dot-path map: property → source path. */
  map?: Record<string, string>;
  /** Dot-path to the items array (rest-json, xml, rss-atom, xml-index). */
  itemsPath?: string;
  /** csv: the field delimiter. Default ','. */
  delimiter?: string;
  /** csv: lines skipped before the header (#1102). Default 0. */
  skipLines?: number;
  /** xml-index: a regex matched against the index's hrefs. */
  linkPattern?: string;
  /** xml-index: the most item documents fetched in one run. */
  maxItems?: number;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/**
 * The options as a shim reads them: each of the right type, or absent. The
 * caller (a feed's configuration) validated its own; this only refuses a
 * value of the wrong type from anywhere.
 */
export function recordOptions(raw: Record<string, unknown>): RecordShimOptions {
  const out: RecordShimOptions = {};
  const id = str(raw.recordIdField);
  if (id) out.recordIdField = id;
  if (raw.map && typeof raw.map === 'object' && !Array.isArray(raw.map)) {
    const m: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.map as Record<string, unknown>)) if (typeof v === 'string') m[k] = v;
    out.map = m;
  }
  const itemsPath = str(raw.itemsPath);
  if (itemsPath) out.itemsPath = itemsPath;
  const delimiter = str(raw.delimiter);
  if (delimiter) out.delimiter = delimiter;
  if (typeof raw.skipLines === 'number' && Number.isInteger(raw.skipLines) && raw.skipLines >= 0) out.skipLines = raw.skipLines;
  const linkPattern = str(raw.linkPattern);
  if (linkPattern) out.linkPattern = linkPattern;
  if (typeof raw.maxItems === 'number' && Number.isFinite(raw.maxItems) && raw.maxItems > 0) out.maxItems = raw.maxItems;
  return out;
}

export function buildRecord(
  raw: RawRecord,
  opts: RecordShimOptions,
  defaultProps: Record<string, unknown> | undefined
): IceRecordData | null {
  const idRaw = opts.recordIdField ? getByPath(raw, opts.recordIdField) : raw.id;
  const id = typeof idRaw === 'string' || typeof idRaw === 'number' ? String(idRaw) : '';
  if (!id) return null;

  const properties: Record<string, unknown> = {};
  if (opts.map) {
    for (const [key, path] of Object.entries(opts.map)) properties[key] = getByPath(raw, path);
  } else if (defaultProps && typeof defaultProps === 'object' && !Array.isArray(defaultProps)) {
    Object.assign(properties, defaultProps);
  }

  return { id, properties };
}

/** Stable JSON (recursively sorted keys), so the key does not depend on property order. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * The key the engine knows a record by (per-item duplicates, #2109): its own
 * id with a hash of its content. The id alone would skip a record that
 * changed upstream under the same id (a revised advisory), so the hash is
 * the version. A receiver's own duplicate check is still its own (the feeds
 * add-on compares the hash its record store keeps).
 */
export function recordItemKey(rec: IceRecordData): string {
  const hash = createHash('sha256').update(stableStringify({ id: rec.id, properties: rec.properties }), 'utf8').digest('hex');
  return `${rec.id}#${hash}`;
}

/** The `record` items of one read, from its records in order; null records (no id) are dropped. */
export function recordItems(input: IceItem, records: Array<IceRecordData | null>, warnings: IceWarning[] = []): IceItem[] {
  const items: IceItem[] = [];
  for (const rec of records) {
    if (!rec) continue;
    items.push({ kind: RECORD_KIND, name: input.name, data: rec, itemKey: recordItemKey(rec) });
  }
  // A note about the whole read rides on its first item, once.
  if (items.length > 0 && warnings.length > 0) items[0].warnings = warnings;
  return items;
}

/**
 * Locate the items array in a JSON response when no explicit `itemsPath` is
 * configured: the body itself if it's an array, else the first array found
 * under common envelope keys, else any array-valued property, else [].
 */
export function pickItemsArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const k of ['results', 'data', 'items', 'records', 'features']) {
      if (Array.isArray(obj[k])) return obj[k] as unknown[];
    }
    for (const v of Object.values(obj)) if (Array.isArray(v)) return v;
  }
  return [];
}
