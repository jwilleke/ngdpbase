/**
 * GeoJSON shim (#685 slice 4; a core shim since #2109) — zero dependency (JSON.parse).
 *
 * Handles a GeoJSON FeatureCollection (`{ features: [...] }`), a bare array of
 * features, or a single Feature. Per feature, the id comes from the
 * `recordIdField` option (dot-path) or the feature's own `id`; properties come
 * from the `map` option (dot-path per field) or, with no map, the feature's
 * `properties` object.
 *
 * Reference feed: the USGS earthquakes GeoJSON
 * (https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson).
 */

import { ANY_RECEIVER, type IceRecordData, type IceShim } from '../types.js';
import { buildRecord, RECORD_KIND, recordItems, recordOptions, type RecordShimOptions, type RawRecord } from './record.js';

/** The features of a GeoJSON document. */
export function geojsonFeatures(data: unknown): RawRecord[] {
  if (data && typeof data === 'object' && Array.isArray((data as { features?: unknown }).features)) {
    return (data as { features: RawRecord[] }).features;
  }
  if (Array.isArray(data)) return data as RawRecord[];
  if (data && typeof data === 'object') return [data as RawRecord]; // single feature
  return [];
}

/** One feature as a record. With no map, the feature's own `properties` object is lifted. */
export function geojsonRecord(raw: RawRecord, opts: RecordShimOptions): IceRecordData | null {
  const fp = (raw as { properties?: unknown }).properties;
  const defaultProps = fp && typeof fp === 'object' && !Array.isArray(fp) ? (fp as Record<string, unknown>) : undefined;
  return buildRecord(raw, opts, defaultProps);
}

export const geojsonShim: IceShim = {
  name: 'geojson',
  label: 'GeoJSON',
  direction: 'in',
  accepts: { extensions: ['.geojson'], mediaTypes: ['application/geo+json'] },
  produces: RECORD_KIND,
  receivers: [ANY_RECEIVER],
  duplicates: 'item',

  async read(input, tools) {
    const opts = recordOptions(tools.options);
    const features = geojsonFeatures(JSON.parse(input.text ?? ''));
    return { items: recordItems(input, features.map(f => geojsonRecord(f, opts))) };
  }
};
