import type { EgressPolicy } from '../../../../dist/src/http/ssrf.js';
/**
 * SourceAdapter contract (#685 slice 4).
 *
 * An adapter translates one wire format into a normalized record stream.
 * It is STATELESS — scheduling, change-detection and persistence live in
 * FeedManager/RecordStore, not the adapter. Adapters reach the network only
 * through `guardedFetch`, with the egress policy they are handed (#1133).
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
  /**
   * Fetch the feed and return its raw items. Throws on transport/HTTP error.
   *
   * `policy` is __mandatory and positional__ (#1133). These adapters called the
   * global `fetch` on operator-supplied URLs from July 2026 until #1139 widened
   * the boundary check to scan `addons/` — no egress policy, no guarded DNS, no
   * redirect re-check, and none of guardedFetch's size or time bounds.
   *
   * An optional parameter, or a module-level `configure()` at register time,
   * would have been less churn and is what P1 in docs/security-posture.md
   * rules out: the weak path is the one where it is omitted, and ambient
   * propagation makes a missing guard invisible at review. Required here means
   * an adapter that was not handed a policy does not compile.
   *
   * The policy is resolved per ingest by `FeedManager`, not captured at
   * construction, so an operator who tightens `ngdpbase.security.egress.*`
   * does not have to restart before it applies.
   */
  fetch(cfg: FeedSourceConfig, policy: EgressPolicy): Promise<RawRecord[]>;
  /** Normalize one raw item. Returns null to skip (e.g. no resolvable id). */
  parse(raw: RawRecord, cfg: FeedSourceConfig): NormalizedRecord | null;
}
