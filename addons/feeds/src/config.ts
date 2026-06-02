/**
 * Parse the `ngdpbase.addons.feeds.sources` config slice into FeedSourceConfig[].
 *
 * AddonsManager flattens `ngdpbase.addons.feeds.*` into a nested object and
 * passes it to register(); `config.sources` is therefore a map of
 * `{ <sourceId>: { adapter, url, ... } }`. This validates each entry, skipping
 * malformed ones (logged by the caller), and stamps the map key as `sourceId`.
 */

import type { FeedSourceConfig } from './types.js';

/** Returns the valid source configs; ignores anything missing the required adapter+url. */
export function parseSourceConfigs(raw: unknown): FeedSourceConfig[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];

  const out: FeedSourceConfig[] = [];
  for (const [sourceId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    if (typeof v.adapter !== 'string' || typeof v.url !== 'string' || typeof v.type !== 'string') continue;

    const cfg: FeedSourceConfig = {
      sourceId,
      adapter: v.adapter,
      url: v.url,
      type: v.type
    };
    if (typeof v.intervalMinutes === 'number') cfg.intervalMinutes = v.intervalMinutes;
    if (typeof v.dailyAt === 'string') cfg.dailyAt = v.dailyAt;
    if (typeof v.recordIdField === 'string') cfg.recordIdField = v.recordIdField;
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
