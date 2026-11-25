/**
 * #2467: the reindex lines on the Media Management card of the /admin dashboard.
 */
import { automaticReindexLabel, describeEvery, latestReindex } from '../reindexLines';
import type { JobLastRun } from '../../managers/BackgroundJobManager';

function entry(jobId: string, completedAt: string | null, extra: Partial<NonNullable<JobLastRun['lastRun']>> = {}): JobLastRun {
  return {
    jobId,
    displayName: jobId,
    sinceStart: false,
    lastRun: completedAt ? { startedAt: completedAt, completedAt, status: 'completed', ranBy: 'jim', ...extra } : null
  };
}

describe('describeEvery', () => {
  test.each([
    [3_600_000, 'every hour'],
    [7_200_000, 'every 2 hours'],
    [1_800_000, 'every 30 minutes'],
    [60_000, 'every minute'],
    [5_400_000, 'every 90 minutes'],
    // The scheduler runs a tick in whole minutes, at least one.
    [90_000, 'every 2 minutes'],
    [10, 'every minute']
  ])('%i ms is %s', (ms, text) => {
    expect(describeEvery(ms)).toBe(text);
  });
});

describe('automaticReindexLabel', () => {
  test('follows the configured interval', () => {
    expect(automaticReindexLabel(3_600_000)).toBe('Automatic reindex (every hour)');
    expect(automaticReindexLabel(1_800_000)).toBe('Automatic reindex (every 30 minutes)');
  });

  test('says so when the interval turns it off', () => {
    expect(automaticReindexLabel(0)).toBe('Automatic reindex (off)');
    expect(automaticReindexLabel(Number.NaN)).toBe('Automatic reindex (off)');
  });
});

describe('latestReindex: a Rebuild is also a reindex', () => {
  test('the Rebuild when it is the later', () => {
    const line = latestReindex(entry('media.rescan', '2026-11-10T08:00:00.000Z'), entry('media.rebuild', '2026-11-19T09:00:00.000Z', { ranBy: 'clara' }));
    expect(line!.lastRun).toMatchObject({ completedAt: '2026-11-19T09:00:00.000Z', ranBy: 'clara' });
    expect(line!.via).toBe('rebuild');
  });

  test('the Reindex when it is the later', () => {
    const line = latestReindex(entry('media.rescan', '2026-11-20T08:00:00.000Z'), entry('media.rebuild', '2026-11-19T09:00:00.000Z'));
    expect(line!.lastRun!.completedAt).toBe('2026-11-20T08:00:00.000Z');
    expect(line!.via).toBeNull();
  });

  test('only a Rebuild has run', () => {
    const line = latestReindex(entry('media.rescan', null), entry('media.rebuild', '2026-11-19T09:00:00.000Z'));
    expect(line!.via).toBe('rebuild');
  });

  test('only a Reindex has run', () => {
    const line = latestReindex(entry('media.rescan', '2026-11-19T09:00:00.000Z'), null);
    expect(line!.via).toBeNull();
  });

  test('neither has run: a line with no run', () => {
    expect(latestReindex(entry('media.rescan', null), entry('media.rebuild', null))).toMatchObject({ lastRun: null, via: null });
    expect(latestReindex(null, null)).toBeNull();
  });
});
