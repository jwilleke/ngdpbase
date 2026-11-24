/**
 * Page-building history (#2468): the parser's once-a-minute check, kept.
 *
 * Every check appends one JSON line to that day's file,
 * `parser-performance-YYYY-MM-DD.jsonl`. Nothing is buffered, so a restart
 * loses nothing. The files are append-only and at most 1,440 lines a day;
 * files whose whole day is more than 30 days old are removed when the store
 * opens and once a day after that. A failed write logs a warning and drops
 * that one line: it never fails a page parse.
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
const DAY_FILE = /^parser-performance-(\d{4}-\d{2}-\d{2})\.jsonl$/;

export class ParserPerformanceHistory {
  private lastPrune = 0;

  constructor(
    private readonly dir: string,
    private readonly now: () => number = Date.now
  ) {}

  /** Create the folder and remove files past the retention. Never throws. */
  async open(): Promise<void> {
    try {
      await fs.mkdir(this.dir, { recursive: true });
      await this.prune();
    } catch (err) {
      logger.warn(`Page building history: could not open its folder: ${(err as Error).message}`);
    }
  }

  /** Append one line to the file for the sample's day. Never throws. */
  async record(sample: PerformanceSample): Promise<void> {
    try {
      if (this.now() - this.lastPrune >= DAY_MS) await this.prune();
      const file = path.join(this.dir, `parser-performance-${sample.t.slice(0, 10)}.jsonl`);
      await fs.appendFile(file, JSON.stringify(sample) + '\n');
    } catch (err) {
      logger.warn(`Page building history: could not record a check, dropped it: ${(err as Error).message}`);
    }
  }

  /** Every line in the kept files, oldest day first. A line that does not parse (a torn last line) is skipped. */
  async read(): Promise<PerformanceSample[]> {
    let names: string[];
    try {
      names = (await fs.readdir(this.dir)).filter((n) => DAY_FILE.test(n)).sort();
    } catch {
      return [];
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

  /** Remove day files that end before the retention window starts. Other files are left alone. */
  private async prune(): Promise<void> {
    this.lastPrune = this.now();
    const oldestKept = new Date(this.now() - HISTORY_RETENTION_DAYS * DAY_MS).toISOString().slice(0, 10);
    for (const name of await fs.readdir(this.dir)) {
      const day = DAY_FILE.exec(name)?.[1];
      if (day && day < oldestKept) await fs.rm(path.join(this.dir, name), { force: true });
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

/** NOT BUILT YET (#2468 PR 2, red commit): stub so the tests load and fail on what they assert. */
export function rollupSamples(_samples: PerformanceSample[], _now: number): Rollup {
  const empty = { parse: null, hit: null, err: null };
  return { hour: { ...empty }, day: { ...empty }, week: { ...empty }, month: { ...empty } };
}

/** What MarkupParser hands the admin page. */
export interface PerformanceReport {
  rollup: Rollup;
  /** The old over-limit minutes, kept apart from the checks. */
  legacy: Record<PerformanceMeasure, MeasureStats | null>;
  limits: { parseTime: number; cacheHitRatio: number; errorRate: number };
  /** False when no folder is configured, so nothing is kept. */
  recording: boolean;
}
