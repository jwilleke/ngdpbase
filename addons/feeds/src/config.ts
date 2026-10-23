/**
 * Parse the `ngdpbase.addons.feeds.sources` config slice into FeedSourceConfig[].
 *
 * AddonsManager flattens `ngdpbase.addons.feeds.*` into a nested object and
 * passes it to register(); `config.sources` is therefore a map of
 * `{ <sourceId>: { adapter, url, ... } }`. This validates each entry, skipping
 * malformed ones (logged by the caller), and stamps the map key as `sourceId`.
 */

import { validateHeaderName, validateHeaderValue } from 'node:http';
import type { AddonHost } from '../../../dist/src/utils/addonHost.js';
import { SUPPORTED_SCHEMA_TYPES } from './normalize.js';
import type { FeedSourceConfig } from './types.js';

/**
 * Addon-wide settings (#1955), from `ngdpbase.addons.feeds.*`. The shipped
 * values are in this addon's `config/default-config.json`; these are only the
 * fallback when a key is missing or unusable.
 */
export interface FeedSettings {
  /** `max-concurrent-ingests`: due sources ingested at once. */
  maxConcurrentIngests: number;
  /** `timeout-min-ms` / `timeout-max-ms`: the range a source's `timeoutMs` must fall in. */
  timeoutMinMs: number;
  timeoutMaxMs: number;
}

export const FEED_SETTING_DEFAULTS: Readonly<FeedSettings> = Object.freeze({
  maxConcurrentIngests: 4,
  timeoutMinMs: 5_000,
  timeoutMaxMs: 300_000
});

/** Where a refused setting is reported: the host's logger (#1813). */
export type FeedLog = Pick<AddonHost['logger'], 'warn'>;

const positiveInteger = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

/** Read the addon-wide settings from the `config` handed to `register()`. */
export function readFeedSettings(config: Record<string, unknown>, logger: FeedLog): FeedSettings {
  const out: FeedSettings = { ...FEED_SETTING_DEFAULTS };
  const read = (key: string, field: keyof FeedSettings): void => {
    const v = config[key];
    if (v === undefined) return;
    if (positiveInteger(v)) out[field] = v;
    else logger.warn(`[feeds] ignoring ${key}=${JSON.stringify(v)} — must be a whole number > 0; using ${out[field]}`);
  };
  read('max-concurrent-ingests', 'maxConcurrentIngests');
  read('timeout-min-ms', 'timeoutMinMs');
  read('timeout-max-ms', 'timeoutMaxMs');
  if (out.timeoutMinMs > out.timeoutMaxMs) {
    logger.warn(`[feeds] ignoring timeout-min-ms ${out.timeoutMinMs} > timeout-max-ms ${out.timeoutMaxMs}; using ${FEED_SETTING_DEFAULTS.timeoutMinMs}–${FEED_SETTING_DEFAULTS.timeoutMaxMs}`);
    out.timeoutMinMs = FEED_SETTING_DEFAULTS.timeoutMinMs;
    out.timeoutMaxMs = FEED_SETTING_DEFAULTS.timeoutMaxMs;
  }
  return out;
}

/**
 * Headers a source may not set (#1947). Hop-by-hop and framing headers belong
 * to the connection guardedFetch makes, and `Host` would point a validated
 * connection at another name. Credentials are refused too: a literal one would
 * sit in the config file, and an unset `$NAME` reference inside `sources`
 * drops the whole map, so every feed would stop for one missing variable.
 */
const REFUSED_HEADERS = new Set([
  'host', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'proxy-connection',
  'te', 'trailer', 'upgrade', 'expect', 'cookie', 'authorization', 'proxy-authorization', 'proxy-authenticate'
]);

/** A source's `headers` map plus its `userAgent`, each entry checked; a bad one is refused with a warning. */
function parseHeaders(logger: FeedLog, sourceId: string, raw: unknown, userAgent: unknown): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  const add = (name: string, value: unknown): void => {
    const refuse = (why: string): void => {
      logger.warn(`[feeds] source '${sourceId}': ignoring header '${name}' — ${why}`);
    };
    if (REFUSED_HEADERS.has(name.toLowerCase())) { refuse('a source may not set it'); return; }
    if (typeof value !== 'string' || value.trim() === '') { refuse('the value must be a non-empty string'); return; }
    try {
      validateHeaderName(name);
      validateHeaderValue(name, value);
    } catch {
      refuse('not a valid HTTP header');
      return;
    }
    // One entry per name, whatever its case: the later one wins.
    for (const existing of Object.keys(out)) {
      if (existing.toLowerCase() === name.toLowerCase()) delete out[existing];
    }
    out[name] = value;
  };
  if (raw !== undefined) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [name, value] of Object.entries(raw as Record<string, unknown>)) add(name, value);
    } else {
      logger.warn(`[feeds] source '${sourceId}': ignoring headers=${JSON.stringify(raw)} — must be a map of name to value`);
    }
  }
  if (userAgent !== undefined) add('User-Agent', userAgent);
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Returns the valid source configs; ignores anything missing the required adapter+url. */
export function parseSourceConfigs(raw: unknown, logger: FeedLog, settings: FeedSettings = FEED_SETTING_DEFAULTS): FeedSourceConfig[] {
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
    // Request options (#1947, #1955), handed to guardedFetch by every adapter.
    const headers = parseHeaders(logger, sourceId, v.headers, v.userAgent);
    if (headers) cfg.headers = headers;
    if (v.timeoutMs !== undefined) {
      const { timeoutMinMs: min, timeoutMaxMs: max } = settings;
      if (typeof v.timeoutMs === 'number' && Number.isInteger(v.timeoutMs) && v.timeoutMs >= min && v.timeoutMs <= max) {
        cfg.timeoutMs = v.timeoutMs;
      } else {
        logger.warn(`[feeds] source '${sourceId}': ignoring timeoutMs=${JSON.stringify(v.timeoutMs)} — must be a whole number of ms from ${min} to ${max}; the default applies`);
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
