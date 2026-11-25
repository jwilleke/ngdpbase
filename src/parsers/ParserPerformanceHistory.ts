/**
 * Page-building history (#2468): the parser's once-a-minute check, kept.
 *
 * Every check appends one JSON line to that day's file,
 * `parser-performance-YYYY-MM-DD.jsonl`. Nothing is buffered, so a restart
 * loses nothing. The files are append-only and at most 1,440 lines a day;
 * files whose whole day is more than 30 days old are removed when the store
 * opens and once a day after that. A failed write logs a warning and drops
 * that one line: it never fails a page parse.
 *
 * A file name is built only from a real date, and a check that follows a torn
 * last line (a crash mid-write) starts on a new line, so it is not joined to
 * the fragment. The sums the admin page shows are computed from the lines
 * when the page is opened (`rollupSamples`).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import logger from '../utils/logger.js';

/** One check: the minute's numbers. A measure with nothing to measure is null. */
export interface PerformanceSample {
  /** When the check ran, ISO 8601 UTC. */
  t: string;
  /** Average fresh-parse time in ms over the last 20 fresh parses. */
  parse: number | null;
  /** Cache hit ratio over the minute, 0 to 1. */
  hit: number | null;
  /** Error rate over the minute, 0 to 1. */
  err: number | null;
  /** Pages built in the minute. */
  n: number;
}

/** How many days of checks are kept. */
export const HISTORY_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** True for a date that exists: the shape is right and it survives a round trip (not 2026-02-30 or 9999-99-99). */
function isRealDay(day: string): boolean {
  if (!DAY.test(day)) return false;
  const at = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day;
}
const DAY_FILE = /^parser-performance-(\d{4}-\d{2}-\d{2})\.jsonl$/;

export class ParserPerformanceHistory {
  private lastPrune = 0;

  constructor(
    readonly dir: string,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * Create the folder and remove files past the retention. Never throws. True when the folder is
   * there; false when it could not be made (a warning is logged), so nothing can be kept in it.
   */
  async open(): Promise<boolean> {
    try {
      await fs.mkdir(this.dir, { recursive: true });
    } catch (err) {
      logger.warn(`Page building history: could not open its folder: ${(err as Error).message}`);
      return false;
    }
    await this.prune();
    return true;
  }

  /** Append one line to the file for the sample's day. Never throws. */
  async record(sample: PerformanceSample): Promise<void> {
    if (this.now() - this.lastPrune >= DAY_MS) await this.prune();
    const day = typeof sample.t === 'string' ? sample.t.slice(0, 10) : '';
    if (!isRealDay(day)) {
      logger.warn('Page building history: a check with no usable date was dropped.');
      return;
    }
    try {
      await this.append(path.join(this.dir, `parser-performance-${day}.jsonl`), JSON.stringify(sample));
    } catch (err) {
      logger.warn(`Page building history: could not record a check, dropped it: ${(err as Error).message}`);
    }
  }

  /**
   * Every line in the kept files, oldest day first. With `since`, days that end before it are not
   * opened. A line that does not parse (a torn line after a crash) is skipped.
   */
  async read(since?: number): Promise<PerformanceSample[]> {
    let names: string[];
    try {
      names = (await fs.readdir(this.dir)).filter((n) => DAY_FILE.test(n)).sort();
    } catch {
      return [];
    }
    if (since !== undefined) {
      const firstDay = new Date(since).toISOString().slice(0, 10);
      names = names.filter((n) => (DAY_FILE.exec(n)?.[1] ?? '') >= firstDay);
    }
    const samples: PerformanceSample[] = [];
    for (const name of names) {
      const text = await fs.readFile(path.join(this.dir, name), 'utf8').catch(() => '');
      for (const line of text.split('\n')) {
        if (!line) continue;
        try {
          samples.push(JSON.parse(line) as PerformanceSample);
        } catch {
          // torn line after a crash
        }
      }
    }
    return samples;
  }

  /** Append one line. A file that does not end in a new line (a torn last line) gets one first, so the fragment stays alone. */
  private async append(file: string, line: string): Promise<void> {
    const handle = await fs.open(file, 'a+');
    try {
      const { size } = await handle.stat();
      let prefix = '';
      if (size > 0) {
        const last = Buffer.alloc(1);
        await handle.read(last, 0, 1, size - 1);
        if (last[0] !== 0x0a) prefix = '\n';
      }
      await handle.appendFile(`${prefix}${line}\n`);
    } finally {
      await handle.close();
    }
  }

  /** Remove day files that end before the retention window starts. Other files are left alone. Never throws; one file that cannot be removed does not stop the others. */
  private async prune(): Promise<void> {
    this.lastPrune = this.now();
    const oldestKept = new Date(this.now() - HISTORY_RETENTION_DAYS * DAY_MS).toISOString().slice(0, 10);
    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch (err) {
      logger.warn(`Page building history: could not look for old files: ${(err as Error).message}`);
      return;
    }
    for (const name of names) {
      const day = DAY_FILE.exec(name)?.[1];
      if (!day || day >= oldestKept) continue;
      try {
        await fs.rm(path.join(this.dir, name), { force: true });
      } catch (err) {
        logger.warn(`Page building history: could not remove an old file: ${(err as Error).message}`);
      }
    }
  }
}

/** The three measures a check takes. */
export type PerformanceMeasure = 'parse' | 'hit' | 'err';

/** The windows the admin page sums up. */
export type RollupWindow = 'hour' | 'day' | 'week' | 'month';

/** What a window's checks came to, for one measure. */
export interface MeasureStats {
  /** Checks with a value for this measure. */
  count: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

export type Rollup = Record<RollupWindow, Record<PerformanceMeasure, MeasureStats | null>>;

/** The window lengths, in milliseconds. */
export const ROLLUP_WINDOWS: Record<RollupWindow, number> = {
  hour: 60 * 60 * 1000,
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: HISTORY_RETENTION_DAYS * DAY_MS
};

const MEASURES: PerformanceMeasure[] = ['parse', 'hit', 'err'];

/** The value at a percentile by nearest rank, from values sorted smallest first. */
function nearestRank(sorted: number[], percentile: number): number {
  const rank = Math.max(1, Math.ceil((percentile / 100) * sorted.length));
  return sorted[rank - 1];
}

/** p50, p95, max and the plain mean of a set of values; null when there are none. */
export function measureStats(values: number[]): MeasureStats | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: nearestRank(sorted, 50),
    p95: nearestRank(sorted, 95),
    max: sorted[sorted.length - 1],
    mean: sorted.reduce((sum, v) => sum + v, 0) / sorted.length
  };
}

/**
 * Sum up the checks for each window: the last hour, 24 hours, 7 days and 30 days up to
 * `now`, the edge included. A measure with no value in a check (null) is skipped, and a
 * line that is not a check is ignored.
 */
export function rollupSamples(samples: PerformanceSample[], now: number): Rollup {
  const rollup = {} as Rollup;
  for (const [window, length] of Object.entries(ROLLUP_WINDOWS) as Array<[RollupWindow, number]>) {
    const inside = samples.filter((s) => {
      const at = typeof s?.t === 'string' ? Date.parse(s.t) : NaN;
      return at >= now - length && at <= now;
    });
    const stats = {} as Record<PerformanceMeasure, MeasureStats | null>;
    for (const measure of MEASURES) {
      stats[measure] = measureStats(inside.map((s) => s[measure]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)));
    }
    rollup[window] = stats;
  }
  return rollup;
}

/** How many checks each window holds, whichever numbers a check carried. */
export function countChecks(samples: PerformanceSample[], now: number): Record<RollupWindow, number> {
  const counts = {} as Record<RollupWindow, number>;
  for (const [window, length] of Object.entries(ROLLUP_WINDOWS) as Array<[RollupWindow, number]>) {
    counts[window] = samples.filter((s) => {
      const at = typeof s?.t === 'string' ? Date.parse(s.t) : NaN;
      return at >= now - length && at <= now;
    }).length;
  }
  return counts;
}

/** What MarkupParser hands the admin page. */
export interface PerformanceReport {
  rollup: Rollup;
  /** Checks in each window, shown once in the column headings. */
  checks: Record<RollupWindow, number>;
  /** The old over-limit minutes, kept apart from the checks. */
  legacy: Record<PerformanceMeasure, MeasureStats | null>;
  limits: { parseTime: number; cacheHitRatio: number; errorRate: number };
  /** False when no folder is configured or it could not be made, so nothing is kept. */
  recording: boolean;
}
