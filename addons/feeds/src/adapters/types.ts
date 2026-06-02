/**
 * SourceAdapter contract (#685 slice 4).
 *
 * An adapter translates one wire format into a normalized record stream.
 * It is STATELESS — scheduling, change-detection and persistence live in
 * FeedManager/RecordStore, not the adapter. Adapters use native `fetch()`.
 */

import type { FeedSourceConfig } from '../types.js';

/** One raw item straight off the wire (a GeoJSON feature, an RSS item, …). */
export type RawRecord = Record<string, unknown>;

/** A source-agnostic normalized record. `properties` is the domain data bag. */
export interface NormalizedRecord {
  /** Stable per-record id within the source (from `recordIdField` or `id`). */
  sourceRecordId: string;
  /** ISO 8601 fetch timestamp — NOT part of the change-detection hash. */
  fetchedAt: string;
  /** Normalized domain fields (dot-path mapped, or lifted from the raw record). */
  properties: Record<string, unknown>;
}

export interface SourceAdapter {
  /** Adapter id — matches `FeedSourceConfig.adapter`. */
  readonly name: string;
  /** Fetch the feed and return its raw items. Throws on transport/HTTP error. */
  fetch(cfg: FeedSourceConfig): Promise<RawRecord[]>;
  /** Normalize one raw item. Returns null to skip (e.g. no resolvable id). */
  parse(raw: RawRecord, cfg: FeedSourceConfig): NormalizedRecord | null;
}
