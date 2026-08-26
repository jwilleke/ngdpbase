/**
 * Parse the `ngdpbase.addons.feeds.sources` config slice into FeedSourceConfig[].
 *
 * AddonsManager flattens `ngdpbase.addons.feeds.*` into a nested object and
 * passes it to register(); `config.sources` is therefore a map of
 * `{ <sourceId>: { adapter, url, ... } }`. This validates each entry, skipping
 * malformed ones (logged by the caller), and stamps the map key as `sourceId`.
 */

import logger from '../../../dist/src/utils/logger.js';
import { SUPPORTED_SCHEMA_TYPES } from './normalize.js';
import type { FeedSourceConfig } from './types.js';

/** Returns the valid source configs; ignores anything missing the required adapter+url. */
export function parseSourceConfigs(raw: unknown): FeedSourceConfig[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];

  const out: FeedSourceConfig[] = [];
  for (const [sourceId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    if (typeof v.adapter !== 'string' || typeof v.url !== 'string' || typeof v.type !== 'string') continue;

    // schemaType: default 'Article'; reject a configured-but-unimplemented value.
    const schemaType = typeof v.schemaType === 'string' ? v.schemaType : 'Article';
    if (!(SUPPORTED_SCHEMA_TYPES as readonly string[]).includes(schemaType)) {
      logger.warn(`[feeds] source '${sourceId}' skipped: schemaType '${schemaType}' not yet supported (implemented: ${SUPPORTED_SCHEMA_TYPES.join(', ')})`);
      continue;
    }

    const cfg: FeedSourceConfig = {
      sourceId,
      adapter: v.adapter,
      url: v.url,
      type: v.type,
      schemaType
    };
    if (typeof v.intervalMinutes === 'number') cfg.intervalMinutes = v.intervalMinutes;
    if (typeof v.dailyAt === 'string') cfg.dailyAt = v.dailyAt;
    if (typeof v.recordIdField === 'string') cfg.recordIdField = v.recordIdField;
    if (typeof v.itemsPath === 'string') cfg.itemsPath = v.itemsPath;

    // Adapter-specific keys. These are declared on FeedSourceConfig and read by
    // the csv / xml-index adapters, but were never carried through here — so a
    // configured `linkPattern` silently never reached the adapter and xml-index
    // sources could not be configured at all from app config (#989).
    if (typeof v.delimiter === 'string') cfg.delimiter = v.delimiter;
    // #1102. Validated, not coerced: a negative or fractional value would slice
    // the row array in ways that silently drop data rather than erroring.
    if (typeof v.skipLines === 'number' && Number.isInteger(v.skipLines) && v.skipLines >= 0) {
      cfg.skipLines = v.skipLines;
    }
    if (typeof v.linkPattern === 'string') cfg.linkPattern = v.linkPattern;
    if (typeof v.maxItems === 'number' && Number.isFinite(v.maxItems) && v.maxItems > 0) cfg.maxItems = v.maxItems;

    // Record shaping (#989). Validated rather than coerced: shaping runs before
    // upsertAll(), which REPLACES the store, so a bad value here deletes records
    // rather than merely mis-rendering them.
    if (typeof v.dedupeBy === 'string' && v.dedupeBy.trim()) cfg.dedupeBy = v.dedupeBy.trim();
    if (typeof v.dedupeDateField === 'string' && v.dedupeDateField.trim()) cfg.dedupeDateField = v.dedupeDateField.trim();
    if (v.maxAgeHours !== undefined) {
      if (typeof v.maxAgeHours === 'number' && Number.isFinite(v.maxAgeHours) && v.maxAgeHours > 0) {
        cfg.maxAgeHours = v.maxAgeHours;
      } else {
        logger.warn(`[feeds] source '${sourceId}': ignoring maxAgeHours=${JSON.stringify(v.maxAgeHours)} — must be a number > 0`);
      }
    }
    if (v.map && typeof v.map === 'object' && !Array.isArray(v.map)) {
      const m: Record<string, string> = {};
      for (const [k, val] of Object.entries(v.map as Record<string, unknown>)) {
        if (typeof val === 'string') m[k] = val;
      }
      cfg.map = m;
    }
    out.push(cfg);
  }
  return out;
}
