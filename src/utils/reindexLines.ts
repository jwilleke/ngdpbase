/**
 * The reindex lines on the Media Management card of the /admin dashboard
 * (#2467): what the automatic reindex is called, and which run the "Last
 * reindex" line shows. Pure, so the route and its tests share it.
 *
 * @module utils/reindexLines
 */
import type { JobLastRun } from '../managers/BackgroundJobManager.js';

/** A "Last reindex" entry: the newest of the two runs, and whether it was a Rebuild. */
export type ReindexLine = JobLastRun & { via: 'rebuild' | null };

/**
 * An interval in words: "every hour", "every 30 minutes". Counted in whole
 * minutes, at least one, as `BackgroundJobManager.registerMaintenance` runs it.
 */
export function describeEvery(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes === 1) return 'every minute';
  if (minutes === 60) return 'every hour';
  if (minutes % 60 === 0) return `every ${minutes / 60} hours`;
  return `every ${minutes} minutes`;
}

/** The automatic reindex's label, following the configured scan interval (0 or unset turns it off). */
export function automaticReindexLabel(scanIntervalMs: number): string {
  return scanIntervalMs > 0 ? `Automatic reindex (${describeEvery(scanIntervalMs)})` : 'Automatic reindex (off)';
}

/**
 * A Rebuild is also a reindex: the later of the last Reindex and the last
 * Rebuild. `via` says which one it was. Null when neither job is registered.
 */
export function latestReindex(rescan: JobLastRun | null, rebuild: JobLastRun | null): ReindexLine | null {
  if (!rescan && !rebuild) return null;
  const rescanRun = rescan?.lastRun ?? null;
  const rebuildRun = rebuild?.lastRun ?? null;
  const rebuildLater = rebuildRun !== null && (rescanRun === null || rebuildRun.completedAt > rescanRun.completedAt);
  const source = (rebuildLater ? rebuild : rescan) ?? rebuild ?? rescan;
  if (!source) return null;
  return { ...source, lastRun: rebuildLater ? rebuildRun : rescanRun, via: rebuildLater ? 'rebuild' : null };
}
