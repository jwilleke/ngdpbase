/**
 * Shared adapter helper (#685 slice 8) — build a NormalizedRecord from a raw
 * item, used by both the geojson and rest-json adapters (no per-adapter copy).
 *
 * id ← `cfg.recordIdField` (dot-path) or the item's own `id`.
 * properties ← `cfg.map` (dot-path per field), or — with no map — the supplied
 * `defaultProps` object (geojson lifts `feature.properties`; rest-json lifts
 * the item itself). Returns null when no id resolves (caller skips the item).
 */

import type { RawRecord, NormalizedRecord } from './types.js';
import type { FeedSourceConfig } from '../types.js';
import { getByPath } from './dotpath.js';

export function buildRecord(
  raw: RawRecord,
  cfg: FeedSourceConfig,
  defaultProps: Record<string, unknown> | undefined
): NormalizedRecord | null {
  const idRaw = cfg.recordIdField ? getByPath(raw, cfg.recordIdField) : raw.id;
  const sourceRecordId = typeof idRaw === 'string' || typeof idRaw === 'number' ? String(idRaw) : '';
  if (!sourceRecordId) return null;

  const properties: Record<string, unknown> = {};
  if (cfg.map) {
    for (const [key, path] of Object.entries(cfg.map)) properties[key] = getByPath(raw, path);
  } else if (defaultProps && typeof defaultProps === 'object' && !Array.isArray(defaultProps)) {
    Object.assign(properties, defaultProps);
  }

  return { sourceRecordId, fetchedAt: new Date().toISOString(), properties };
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
