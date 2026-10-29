/**
 * Unit tests for FeedScheduler (#685 slice 6) — due calc, back-off, stale WARN.
 * Clock + ingest + notify are injected, so no real timers or network. Since
 * #2109 it keeps no timer: the job feeds.poll calls a pass with its context.
 *
 * @jest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { FeedScheduler } from '../src/FeedScheduler';
import type { FeedSourceConfig } from '../src/types';
import logger from '../../../dist/src/utils/logger.js';
import { jobContextFromSchedule } from '../../../dist/src/context/JobContext.js';

/** The job's context a pass runs under. */
const CTX = { ...jobContextFromSchedule('system', 'test: the feeds poll'), job: 'feeds.poll' };

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
    const s = new FeedScheduler([cfg()], ingest, logger, { now: c.now });

    await s.tick(CTX);                 // t=0 → never attempted → due
    expect(ingest).toHaveBeenCalledTimes(1);

    c.set(30 * MIN); await s.tick(CTX); // within 60m → not due
    expect(ingest).toHaveBeenCalledTimes(1);

    c.set(60 * MIN); await s.tick(CTX); // interval elapsed → due
    expect(ingest).toHaveBeenCalledTimes(2);
  });

  it('backs off after a failure (effective interval doubles)', async () => {
    const c = clock();
    const ingest = vi.fn(async () => { throw new Error('boom'); });
    const s = new FeedScheduler([cfg()], ingest, logger, { now: c.now });

    await s.tick(CTX);                  // t=0 fail → failures=1 → next interval = 120m
    expect(ingest).toHaveBeenCalledTimes(1);

    c.set(60 * MIN); await s.tick(CTX);  // 60m < 120m backed-off interval → not due
    expect(ingest).toHaveBeenCalledTimes(1);

    c.set(120 * MIN); await s.tick(CTX); // 120m → due
    expect(ingest).toHaveBeenCalledTimes(2);
  });

  it('resets back-off after a success', async () => {
    const c = clock();
    const ingest = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(ok);
    const s = new FeedScheduler([cfg()], ingest, logger, { now: c.now });

    await s.tick(CTX);                   // fail → failures=1
    c.set(120 * MIN); await s.tick(CTX);  // due → success → failures reset
    expect(ingest).toHaveBeenCalledTimes(2);
    c.set(180 * MIN); await s.tick(CTX);  // base 60m interval again → due
    expect(ingest).toHaveBeenCalledTimes(3);
  });

  it('emits a single stale WARN after repeated failures, via notify', async () => {
    const c = clock();
    const ingest = vi.fn(async () => { throw new Error('down'); });
    const notify = vi.fn();
    const s = new FeedScheduler([cfg()], ingest, logger, { now: c.now, notify });

    // Huge gaps → always due; accrue failures. Stale (never-succeeded) fires at failures>=3.
    await s.tick(CTX);                 // f=1
    c.set(1e9); await s.tick(CTX);      // f=2
    c.set(2e9); await s.tick(CTX);      // f=3
    c.set(3e9); await s.tick(CTX);      // checkStale sees f>=3 → WARN
    c.set(4e9); await s.tick(CTX);      // still stale, but staleWarned → no repeat

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ level: 'warning', title: 'Stale data feed' }));
  });

  it('does not run when no sources are configured', async () => {
    const ingest = vi.fn(async () => ok);
    const s = new FeedScheduler([], ingest, logger, {});
    await s.tick(CTX);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('dailyAt: due after the wall-clock time, once per day', async () => {
    // 09:00 target. now = 10:00 local on day 1 → due; after a run, same day → not due.
    const day1at10 = new Date(2026, 5, 2, 10, 0, 0).getTime();
    const c = clock(day1at10);
    const ingest = vi.fn(async () => ok);
    const s = new FeedScheduler([cfg({ intervalMinutes: undefined, dailyAt: '09:00' })], ingest, logger, { now: c.now });

    await s.tick(CTX);                                   // 10:00 > 09:00, not run today → due
    expect(ingest).toHaveBeenCalledTimes(1);
    c.set(new Date(2026, 5, 2, 14, 0, 0).getTime());  // later same day → already ran
    await s.tick(CTX);
    expect(ingest).toHaveBeenCalledTimes(1);
    c.set(new Date(2026, 5, 3, 9, 30, 0).getTime());  // next day after 09:00 → due
    await s.tick(CTX);
    expect(ingest).toHaveBeenCalledTimes(2);
  });
});

describe('FeedScheduler — each fetch carries the job\'s context (#2109)', () => {
  it('hands ingest the job context with a stated reason per source', async () => {
    const ingest = vi.fn(async () => ok);
    const s = new FeedScheduler([cfg({ sourceId: 'quakes' })], ingest, logger, { now: clock().now });
    await s.tick(CTX);
    expect(ingest).toHaveBeenCalledWith('quakes', expect.objectContaining({
      username: 'system', origin: 'schedule', job: 'feeds.poll', reason: "fetch feed 'quakes' on its schedule (#2109)"
    }));
  });

  it('pass() returns at once with the sources it started; done resolves when they finish', async () => {
    let release: () => void = () => undefined;
    const ingest = vi.fn(() => new Promise<typeof ok>(resolve => { release = () => resolve(ok); }));
    const s = new FeedScheduler([cfg({ sourceId: 'slow' })], ingest, logger, { now: clock().now });
    const pass = s.pass(CTX);
    expect(pass.started).toEqual(['slow']);
    let finished = false;
    void pass.done.then(() => { finished = true; });
    await new Promise(resolve => setImmediate(resolve));
    expect(finished).toBe(false);
    release();
    await pass.done;
    expect(finished).toBe(true);
  });
});

describe('FeedScheduler — one slow source holds no other (#1955)', () => {
  /** An ingest that hangs until released, like an upstream stalling to its timeout. */
  function hanging() {
    let release: () => void = () => undefined;
    const done = new Promise<typeof ok>(resolve => { release = () => resolve(ok); });
    return { done, release: () => release() };
  }
  const flush = () => new Promise(resolve => setImmediate(resolve));

  it('ingests the other due sources while one hangs', async () => {
    const slow = hanging();
    const ingest = vi.fn((id: string) => (id === 'slow' ? slow.done : Promise.resolve(ok)));
    const s = new FeedScheduler([cfg({ sourceId: 'slow' }), cfg({ sourceId: 'a' }), cfg({ sourceId: 'b' })], ingest, logger, { now: clock().now });

    const pass = s.tick(CTX);
    await flush();
    expect(ingest.mock.calls.map(([id]) => id)).toEqual(['slow', 'a', 'b']);

    slow.release();
    await pass;
  });

  it('never runs a source beside itself: a later tick skips one still running', async () => {
    const c = clock();
    const slow = hanging();
    const ingest = vi.fn(() => slow.done);
    const s = new FeedScheduler([cfg({ sourceId: 'slow' })], ingest, logger, { now: c.now });

    const pass = s.tick(CTX);
    c.set(1e9);
    await s.tick(CTX);
    expect(ingest).toHaveBeenCalledTimes(1);

    slow.release();
    await pass;
  });

  it('runs at most maxConcurrent at once; the rest start as slots free', async () => {
    const gates = new Map<string, ReturnType<typeof hanging>>();
    const ingest = vi.fn((id: string) => {
      const g = hanging();
      gates.set(id, g);
      return g.done;
    });
    const ids = ['a', 'b', 'c', 'd'];
    const s = new FeedScheduler(ids.map(sourceId => cfg({ sourceId })), ingest, logger, { now: clock().now, maxConcurrent: 2 });

    const pass = s.tick(CTX);
    await flush();
    expect(ingest.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);

    gates.get('a')?.release();
    await flush();
    expect(ingest.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c']);

    gates.get('b')?.release();
    gates.get('c')?.release();
    await flush();
    gates.get('d')?.release();
    await pass;
    expect(ingest).toHaveBeenCalledTimes(4);
  });
});
