/**
 * Unit tests for FeedScheduler (#685 slice 6) — due calc, back-off, stale WARN.
 * Clock + ingest + notify are injected, so no real timers or network.
 *
 * @jest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { FeedScheduler } from '../src/FeedScheduler';
import type { FeedSourceConfig } from '../src/types';

const MIN = 60_000;
const cfg = (over: Partial<FeedSourceConfig> = {}): FeedSourceConfig => ({
  sourceId: 's', adapter: 'geojson', url: 'u', type: 'Event', intervalMinutes: 60, ...over
});
const ok = { added: 0, updated: 0, unchanged: 0, removed: 0 };

/** Mutable clock helper. */
function clock(start = 0) {
  const ref = { t: start };
  return { now: () => ref.t, set: (t: number) => { ref.t = t; }, advance: (ms: number) => { ref.t += ms; } };
}

describe('FeedScheduler (#685)', () => {
  it('ingests immediately (never attempted), then waits the interval', async () => {
    const c = clock();
    const ingest = vi.fn(async () => ok);
    const s = new FeedScheduler([cfg()], ingest, { now: c.now });

    await s.tick();                 // t=0 → never attempted → due
    expect(ingest).toHaveBeenCalledTimes(1);

    c.set(30 * MIN); await s.tick(); // within 60m → not due
    expect(ingest).toHaveBeenCalledTimes(1);

    c.set(60 * MIN); await s.tick(); // interval elapsed → due
    expect(ingest).toHaveBeenCalledTimes(2);
  });

  it('backs off after a failure (effective interval doubles)', async () => {
    const c = clock();
    const ingest = vi.fn(async () => { throw new Error('boom'); });
    const s = new FeedScheduler([cfg()], ingest, { now: c.now });

    await s.tick();                  // t=0 fail → failures=1 → next interval = 120m
    expect(ingest).toHaveBeenCalledTimes(1);

    c.set(60 * MIN); await s.tick();  // 60m < 120m backed-off interval → not due
    expect(ingest).toHaveBeenCalledTimes(1);

    c.set(120 * MIN); await s.tick(); // 120m → due
    expect(ingest).toHaveBeenCalledTimes(2);
  });

  it('resets back-off after a success', async () => {
    const c = clock();
    const ingest = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(ok);
    const s = new FeedScheduler([cfg()], ingest, { now: c.now });

    await s.tick();                   // fail → failures=1
    c.set(120 * MIN); await s.tick();  // due → success → failures reset
    expect(ingest).toHaveBeenCalledTimes(2);
    c.set(180 * MIN); await s.tick();  // base 60m interval again → due
    expect(ingest).toHaveBeenCalledTimes(3);
  });

  it('emits a single stale WARN after repeated failures, via notify', async () => {
    const c = clock();
    const ingest = vi.fn(async () => { throw new Error('down'); });
    const notify = vi.fn();
    const s = new FeedScheduler([cfg()], ingest, { now: c.now, notify });

    // Huge gaps → always due; accrue failures. Stale (never-succeeded) fires at failures>=3.
    await s.tick();                 // f=1
    c.set(1e9); await s.tick();      // f=2
    c.set(2e9); await s.tick();      // f=3
    c.set(3e9); await s.tick();      // checkStale sees f>=3 → WARN
    c.set(4e9); await s.tick();      // still stale, but staleWarned → no repeat

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ level: 'warning', title: 'Stale data feed' }));
  });

  it('does not run when no sources are configured', async () => {
    const ingest = vi.fn(async () => ok);
    const s = new FeedScheduler([], ingest, {});
    s.start(); // no-op
    await s.tick();
    expect(ingest).not.toHaveBeenCalled();
    s.stop();
  });

  it('dailyAt: due after the wall-clock time, once per day', async () => {
    // 09:00 target. now = 10:00 local on day 1 → due; after a run, same day → not due.
    const day1at10 = new Date(2026, 5, 2, 10, 0, 0).getTime();
    const c = clock(day1at10);
    const ingest = vi.fn(async () => ok);
    const s = new FeedScheduler([cfg({ intervalMinutes: undefined, dailyAt: '09:00' })], ingest, { now: c.now });

    await s.tick();                                   // 10:00 > 09:00, not run today → due
    expect(ingest).toHaveBeenCalledTimes(1);
    c.set(new Date(2026, 5, 2, 14, 0, 0).getTime());  // later same day → already ran
    await s.tick();
    expect(ingest).toHaveBeenCalledTimes(1);
    c.set(new Date(2026, 5, 3, 9, 30, 0).getTime());  // next day after 09:00 → due
    await s.tick();
    expect(ingest).toHaveBeenCalledTimes(2);
  });
});
