/**
 * Config + record types for the feeds addon (#685).
 *
 * Per-source configuration lives under `ngdpbase.addons.feeds.sources.<sourceId>`
 * in app-custom-config.json (the established `ngdpbase.addons.<name>.*` namespace).
 */

/** One configured feed source. The map key is the `sourceId`. */
export interface FeedSourceConfig {
  /** Stable id — the config key; also the CatalogSource.sourceId. */
  sourceId: string;
  /** Adapter name — 'geojson' | 'rest-json' | 'rss-atom' | 'csv' | 'xls' (adapters land slice 4+). */
  adapter: string;
  /** Upstream feed URL. */
  url: string;
  /** Poll cadence — minutes between polls. Either this or `dailyAt` (scheduler lands slice 6). */
  intervalMinutes?: number;
  /** Poll cadence — daily wall-clock time "HH:MM". */
  dailyAt?: string;
  /** schema.org @type this source's records map to (e.g. 'Event', 'NewsArticle'). */
  type: string;
  /** Dot-path to the per-record stable id within a raw record (no JSONPath DSL — see design §7). */
  recordIdField?: string;
  /** Optional dot-path map: normalized property → source path. Adapter may instead return shaped records. */
  map?: Record<string, string>;
}
