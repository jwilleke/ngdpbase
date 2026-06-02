/**
 * GeoJSON adapter (#685 slice 4) — zero dependency (native fetch + JSON.parse).
 *
 * Handles a GeoJSON FeatureCollection (`{ features: [...] }`), a bare array of
 * features, or a single Feature. Per feature, the id comes from `recordIdField`
 * (dot-path) or the feature's own `id`; properties come from the config `map`
 * (dot-path per field) or, with no map, the feature's `properties` object.
 *
 * Reference feed: the USGS earthquakes GeoJSON
 * (https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson).
 */

import type { SourceAdapter, RawRecord, NormalizedRecord } from './types.js';
import type { FeedSourceConfig } from '../types.js';
import { getByPath } from './dotpath.js';

export const geojsonAdapter: SourceAdapter = {
  name: 'geojson',

  async fetch(cfg: FeedSourceConfig): Promise<RawRecord[]> {
    const res = await fetch(cfg.url);
    if (!res.ok) {
      throw new Error(`feed '${cfg.sourceId}': HTTP ${res.status} ${res.statusText} from ${cfg.url}`);
    }
    const data: unknown = await res.json();
    if (data && typeof data === 'object' && Array.isArray((data as { features?: unknown }).features)) {
      return (data as { features: RawRecord[] }).features;
    }
    if (Array.isArray(data)) return data as RawRecord[];
    if (data && typeof data === 'object') return [data as RawRecord]; // single feature
    return [];
  },

  parse(raw: RawRecord, cfg: FeedSourceConfig): NormalizedRecord | null {
    const idRaw = cfg.recordIdField ? getByPath(raw, cfg.recordIdField) : raw.id;
    const sourceRecordId = typeof idRaw === 'string' || typeof idRaw === 'number' ? String(idRaw) : '';
    if (!sourceRecordId) return null;

    const properties: Record<string, unknown> = {};
    if (cfg.map) {
      for (const [key, path] of Object.entries(cfg.map)) {
        properties[key] = getByPath(raw, path);
      }
    } else {
      const featureProps = (raw as { properties?: unknown }).properties;
      if (featureProps && typeof featureProps === 'object' && !Array.isArray(featureProps)) {
        Object.assign(properties, featureProps);
      }
    }

    return { sourceRecordId, fetchedAt: new Date().toISOString(), properties };
  }
};
