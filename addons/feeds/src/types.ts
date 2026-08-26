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
  /** Domain genre/label carried as a keyword + ngdp:category (e.g. 'Event', 'Earthquake'). */
  type: string;
  /**
   * CreativeWork union member this source's records project to + register as
   * (design §4.2). Default 'Article'. Must be a SUPPORTED schema type — slice 4
   * implements 'Article'; ImageObject/VideoObject/AudioObject/DigitalDocument
   * mappers land per media-feed driver. A configured-but-unimplemented value is
   * rejected at parse time.
   */
  schemaType?: string;
  /** Dot-path to the per-record stable id within a raw record (no JSONPath DSL — see design §7). */
  recordIdField?: string;
  /** rest-json / xml / rss-atom / xml-index: dot-path to the items array (e.g. 'results', 'rss.channel.item'). */
  itemsPath?: string;
  /** csv only: field delimiter. Default ','. Use '\t' for TSV. */
  delimiter?: string;
  /**
   * csv only: skip N leading lines before the header row. Default 0.
   *
   * For feeds that emit a human-readable caption above the real header — common
   * in government data exports. Without it the caption is taken as the header,
   * the real header is consumed as the first record, and every column but the
   * first is discarded, all without erroring (#1102).
   */
  skipLines?: number;
  /** xml-index only: regex matched against index-page hrefs to discover item URLs (e.g. 'xml_files/.*\\.xml$'). */
  linkPattern?: string;
  /** xml-index only: cap on item documents fetched per poll. Default 100. */
  maxItems?: number;
  /** Optional dot-path map: normalized property → source path. Adapter may instead return shaped records. */
  map?: Record<string, string>;
  /**
   * Keep only the newest record per distinct value of this normalized property
   * (#989) — e.g. 'volcanoName' to hold one advisory per volcano. Records that
   * lack the property are never grouped and always survive, so a typo here is a
   * no-op rather than a feed-wiping collapse.
   */
  dedupeBy?: string;
  /**
   * Discard records older than this many hours. Applied after `dedupeBy`, so it
   * reads as "this entity has not been reissued within N hours". Records with no
   * resolvable date are kept — unknown age is not evidence of staleness. Must be
   * > 0; config-parse rejects anything else.
   */
  maxAgeHours?: number;
  /**
   * Property holding the record's timestamp, for `dedupeBy` ordering and
   * `maxAgeHours`. Defaults to the conventional chain
   * (`occurredAt` → `time` → `date` → `pubDate` → `published`), which is also
   * what the catalog projection's `dateCreated` uses.
   */
  dedupeDateField?: string;
}
