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
