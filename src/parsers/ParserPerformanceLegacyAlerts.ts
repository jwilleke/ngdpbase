/**
 * The old page building alerts (#2468).
 *
 * Before the parser kept every check, it saved a notification for each minute
 * a number went over its limit, titled "MarkupParser Performance Alert: ...".
 * Those notifications are the only record of how bad the slow minutes were.
 * This module copies their numbers into `legacy-alerts.json`, in the folder
 * of the per-minute files but apart from them, and only then deletes the
 * notifications. It runs once, when the parser starts:
 *
 * 1. no file: read the notifications, write the file (a temporary name, then a
 *    rename, so a crash never leaves half a file), then delete them;
 * 2. a file without `removedAt` (a crash between the write and the delete):
 *    only the delete is tried again, so nothing is imported twice or lost;
 * 3. a file with `removedAt`: nothing runs;
 * 4. a file that cannot be read is left as it is, and nothing is deleted.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import logger from '../utils/logger.js';
import { HISTORY_RETENTION_DAYS, measureStats, type MeasureStats, type PerformanceMeasure } from './ParserPerformanceHistory.js';

/** The fixed start of the title every old alert carries. */
export const LEGACY_TITLE_PREFIX = 'MarkupParser Performance Alert: ';

const LEGACY_FILE = 'legacy-alerts.json';
const DAY_MS = 24 * 60 * 60 * 1000;

/** One old over-limit minute, kept apart from the per-minute lines. */
export interface LegacySample {
  t: string;
  measure: PerformanceMeasure;
  /** Milliseconds for `parse`; a ratio from 0 to 1 for `hit` and `err`. */
  value: number;
}

export interface LegacyAlertsFile {
  importedAt: string;
  /** Old alerts whose message was not one of the three known shapes. */
  skipped: number;
  samples: LegacySample[];
  removedAt?: string;
  removed?: number;
}

/** What the import needs of NotificationManager. */
export interface LegacyAlertSource {
  getAllNotifications(includeExpired?: boolean): Array<{ title: string; message: string; createdAt: Date | string }>;
  removeByTitles(titles: readonly string[]): Promise<number>;
}

/** The three message shapes the parser used, by the alert type in the title. */
const SHAPES: Record<string, { measure: PerformanceMeasure; pattern: RegExp; scale: number }> = {
  SLOW_PARSING: { measure: 'parse', pattern: /^Average parse time (\d+(?:\.\d+)?)\s*ms\b/, scale: 1 },
  LOW_CACHE_HIT_RATIO: { measure: 'hit', pattern: /^Cache hit ratio (\d+(?:\.\d+)?)%/, scale: 100 },
  HIGH_ERROR_RATE: { measure: 'err', pattern: /^Error rate (\d+(?:\.\d+)?)%/, scale: 100 }
};

/** The sample an old alert recorded, or null when its title, message or date is not one the parser wrote. */
export function parseLegacyAlert(n: { title: string; message: string; createdAt: Date | string }): LegacySample | null {
  if (typeof n.title !== 'string' || !n.title.startsWith(LEGACY_TITLE_PREFIX)) return null;
  const shape = SHAPES[n.title.slice(LEGACY_TITLE_PREFIX.length)];
  const match = shape && typeof n.message === 'string' ? shape.pattern.exec(n.message) : null;
  const at = n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt);
  if (!shape || !match || Number.isNaN(at.getTime())) return null;
  return { t: at.toISOString(), measure: shape.measure, value: Number(match[1]) / shape.scale };
}

/** The three whole titles the old code wrote, one for each alert type. Only these are imported and deleted. */
export const LEGACY_TITLES: readonly string[] = Object.keys(SHAPES).map((type) => `${LEGACY_TITLE_PREFIX}${type}`);

type Loaded = { state: 'missing' } | { state: 'unreadable' } | { state: 'ok'; file: LegacyAlertsFile };

async function load(dir: string): Promise<Loaded> {
  let text: string;
  try {
    text = await fs.readFile(path.join(dir, LEGACY_FILE), 'utf8');
  } catch (err) {
    return { state: (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unreadable' };
  }
  try {
    const file = JSON.parse(text) as LegacyAlertsFile;
    return Array.isArray(file?.samples) && typeof file.importedAt === 'string' ? { state: 'ok', file } : { state: 'unreadable' };
  } catch {
    return { state: 'unreadable' };
  }
}

/** The kept old alerts, or null when there are none or the file cannot be read. */
export async function readLegacyAlerts(dir: string): Promise<LegacyAlertsFile | null> {
  const loaded = await load(dir);
  return loaded.state === 'ok' ? loaded.file : null;
}

async function write(dir: string, file: LegacyAlertsFile): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const temporary = path.join(dir, `${LEGACY_FILE}.tmp`);
  await fs.writeFile(temporary, JSON.stringify(file, null, 2));
  await fs.rename(temporary, path.join(dir, LEGACY_FILE));
}

/**
 * Keep the old alerts' numbers, then delete the old alerts. Returns what it did, or null when
 * there was nothing to do or something failed (a warning is logged; nothing is deleted before
 * the file is safely written). Never throws.
 */
export async function importLegacyAlerts(
  dir: string,
  source: LegacyAlertSource,
  now: number
): Promise<{ imported: number; skipped: number; removed: number } | null> {
  try {
    const loaded = await load(dir);
    if (loaded.state === 'unreadable') {
      logger.warn('Page building history: the file of earlier warnings could not be read, so the old notifications were left as they are.');
      return null;
    }
    if (loaded.state === 'ok' && loaded.file.removedAt) return null;

    let file: LegacyAlertsFile;
    let imported = 0;
    let skipped = 0;
    if (loaded.state === 'ok') {
      file = loaded.file; // a crash after the write: only the removal is tried again
    } else {
      const samples: LegacySample[] = [];
      for (const n of source.getAllNotifications(true)) {
        if (!LEGACY_TITLES.includes(n.title)) continue;
        const sample = parseLegacyAlert(n);
        if (sample) samples.push(sample);
        else skipped++;
      }
      imported = samples.length;
      file = { importedAt: new Date(now).toISOString(), skipped, samples };
      await write(dir, file); // before anything is deleted
    }

    const removed = await source.removeByTitles(LEGACY_TITLES);
    await write(dir, { ...file, removedAt: new Date(now).toISOString(), removed });
    logger.info(`Page building history: imported ${imported}, skipped ${skipped}, removed ${removed} earlier warnings.`);
    return { imported, skipped, removed };
  } catch (err) {
    logger.warn(`Page building history: the earlier warnings were not fully moved: ${(err as Error).message}`);
    return null;
  }
}

/** The old over-limit minutes of the last 30 days, summed up per measure. */
export function legacyStats(samples: LegacySample[], now: number): Record<PerformanceMeasure, MeasureStats | null> {
  const from = now - HISTORY_RETENTION_DAYS * DAY_MS;
  const inside = samples.filter((s) => {
    const at = Date.parse(s.t);
    return at >= from && at <= now;
  });
  const of = (measure: PerformanceMeasure): MeasureStats | null => measureStats(inside.filter((s) => s.measure === measure).map((s) => s.value));
  return { parse: of('parse'), hit: of('hit'), err: of('err') };
}
