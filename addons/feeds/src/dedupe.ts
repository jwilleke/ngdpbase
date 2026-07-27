/**
 * Post-normalization record shaping for the feeds addon (#989).
 *
 * Sits between `adapter.parse` and `RecordStore.upsertAll` in
 * `FeedManager.ingest()` and expresses two things no adapter can:
 *
 *   `dedupeBy`      keep only the newest record per distinct value of a mapped
 *                   property (latest advisory per volcano, latest reading per
 *                   station, …)
 *   `maxAgeHours`   discard records older than N hours — after grouping, so it
 *                   reads as "this entity has not been reissued", not merely
 *                   "this document is old"
 *
 * Adapter-agnostic by construction: it operates on `NormalizedRecord.properties`,
 * so it works identically for geojson, rest-json, csv or xml-index sources. That
 * is why it lives here and not in an adapter — "latest per group key" is not an
 * XML concept — and not in `DataFeedPlugin`, which would leave every other
 * consumer of the store (the `/api/*` surfaces, `toMarqueeText()`, a future
 * plugin) reading duplicates that only one renderer knew to filter.
 *
 * ## Why the defaults are all "keep"
 *
 * `RecordStore.upsertAll()` REPLACES the store — anything absent from the
 * incoming array is removed, not merged. Shaping is therefore destructive, and
 * every ambiguous case here resolves toward keeping the record:
 *
 * - A record with no `dedupeBy` property is **not** grouped and always passes
 *   through. Bucketing them all under one "undefined" key would mean a typo in
 *   `dedupeBy` collapses an entire feed to a single record and deletes the rest
 *   on the next poll. Instead a typo is a no-op.
 * - A record with no resolvable date is **kept** by `maxAgeHours`. Unknown age
 *   is not evidence of staleness.
 * - Within a group, an undated record never displaces a dated one, and among
 *   all-undated records the first wins — so the result is stable across polls
 *   rather than flapping on upstream ordering.
 */

import { recordDateIso } from './normalize.js';
import type { NormalizedRecord } from './adapters/types.js';
import type { FeedSourceConfig } from './types.js';

/** Outcome of a shaping pass — the counts drive ingest logging. */
export interface ShapeResult {
  /** Survivors, in their original relative order. */
  records: NormalizedRecord[];
  /** Records discarded as an older member of their group. */
  droppedDuplicates: number;
  /** Records discarded for exceeding `maxAgeHours`. */
  droppedStale: number;
}

/**
 * The group key for a property value, or null when the record cannot be grouped.
 *
 * Only primitives group. An object or array value would stringify to
 * `[object Object]` and silently merge every such record into ONE group — the
 * exact feed-collapsing outcome this module exists to avoid — so a non-primitive
 * is treated as "no key" and the record passes through untouched instead.
 *
 * @param value - Raw property value from `NormalizedRecord.properties`
 * @returns A stable string key, or null to skip grouping for this record
 */
function groupKeyOf(value: unknown): string | null {
  if (typeof value === 'string') return value === '' ? null : value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'boolean') return String(value);
  return null;
}

/** Epoch ms for a record, or undefined when no date resolves. */
function timestampOf(rec: NormalizedRecord, cfg: FeedSourceConfig): number | undefined {
  const iso = recordDateIso(rec, cfg);
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * True when `a` is strictly newer than `b`, treating undefined as oldest.
 * Equal timestamps are NOT newer, so the first record encountered wins and the
 * pass is stable.
 */
function isNewer(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined) return false;
  if (b === undefined) return true;
  return a > b;
}

/**
 * Apply the source's `dedupeBy` / `maxAgeHours` shaping to a normalized batch.
 *
 * @param records - Records straight out of `adapter.parse`
 * @param cfg - Source config; with neither key set this is a pass-through
 * @param now - Epoch ms treated as "now", injectable for tests
 * @returns The survivors plus per-reason drop counts
 */
export function shapeRecords(
  records: NormalizedRecord[],
  cfg: FeedSourceConfig,
  now: number = Date.now()
): ShapeResult {
  const hasMaxAge = typeof cfg.maxAgeHours === 'number' && cfg.maxAgeHours > 0;
  if (!cfg.dedupeBy && !hasMaxAge) {
    return { records, droppedDuplicates: 0, droppedStale: 0 };
  }

  let kept = records;
  let droppedDuplicates = 0;

  if (cfg.dedupeBy) {
    const groupKey = cfg.dedupeBy;
    const winners = new Map<string, { rec: NormalizedRecord; ts: number | undefined }>();
    const survivors = new Set<NormalizedRecord>();

    for (const rec of records) {
      const key = groupKeyOf(rec.properties[groupKey]);
      // Ungrouped records bypass dedupe entirely — see the header note on why a
      // missing group key must not become a shared bucket.
      if (key === null) {
        survivors.add(rec);
        continue;
      }

      const ts = timestampOf(rec, cfg);
      const prev = winners.get(key);
      if (!prev || isNewer(ts, prev.ts)) winners.set(key, { rec, ts });
    }

    for (const { rec } of winners.values()) survivors.add(rec);
    kept = records.filter(r => survivors.has(r));
    droppedDuplicates = records.length - kept.length;
  }

  let droppedStale = 0;
  if (hasMaxAge) {
    const cutoff = now - (cfg.maxAgeHours as number) * 3_600_000;
    kept = kept.filter(rec => {
      const ts = timestampOf(rec, cfg);
      if (ts === undefined || ts >= cutoff) return true;
      droppedStale++;
      return false;
    });
  }

  return { records: kept, droppedDuplicates, droppedStale };
}
