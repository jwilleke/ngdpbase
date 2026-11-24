/**
 * NOT BUILT YET (#2468 PR 2, red commit): stubs so the tests load and fail on what they assert.
 */
import type { PerformanceMeasure } from './ParserPerformanceHistory.js';

/** The fixed start of the title every old alert carries. */
export const LEGACY_TITLE_PREFIX = 'MarkupParser Performance Alert: ';

/** One old over-limit minute, kept apart from the per-minute lines. */
export interface LegacySample {
  t: string;
  measure: PerformanceMeasure;
  /** Milliseconds for `parse`; a ratio from 0 to 1 for `hit` and `err`. */
  value: number;
}

export interface LegacyAlertsFile {
  importedAt: string;
  skipped: number;
  samples: LegacySample[];
  removedAt?: string;
  removed?: number;
}

export interface LegacyAlertSource {
  getAllNotifications(includeExpired?: boolean): Array<{ title: string; message: string; createdAt: Date | string }>;
  removeByTitlePrefix(prefix: string): Promise<number>;
}

export function parseLegacyAlert(_n: { title: string; message: string; createdAt: Date | string }): LegacySample | null {
  return null;
}

export async function importLegacyAlerts(_dir: string, _source: LegacyAlertSource, _now: number): Promise<{ imported: number; skipped: number; removed: number } | null> {
  return null;
}

export async function readLegacyAlerts(_dir: string): Promise<LegacyAlertsFile | null> {
  return null;
}

export function legacyStats(_samples: LegacySample[], _now: number): Record<PerformanceMeasure, import('./ParserPerformanceHistory.js').MeasureStats | null> {
  return { parse: null, hit: null, err: null };
}
