/**
 * The scheduler in BackgroundJobManager (#1715, epic #1611): slots, catch-up,
 * overlap, timeout, configuration overrides, locks.
 *
 * State lives in a real FileJobStateProvider in a temporary directory, so a
 * "restart" is a second manager over the same directory. Each test removes
 * only its own directory.
 */
vi.unmock('../BackgroundJobManager');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BackgroundJobManager, { type JobDefinition, type JobRunContext } from '../BackgroundJobManager';
import FileJobStateProvider from '../../providers/FileJobStateProvider';
import { CATCH_UP_ALL_CAP } from '../../utils/jobSlots';

const HOUR = 60 * 60 * 1000;

let dir: string;
let clock: number;
let settings: Record<string, unknown>;
let events: Record<string, unknown>[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1715-'));
  clock = Date.parse('2026-10-09T09:30:00Z');
  settings = { 'ngdpbase.default.timezone': 'UTC' };
  events = [];
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function provider(): FileJobStateProvider {
  return new FileJobStateProvider(path.join(dir, 'jobs'), { now: () => clock });
}

/** A manager over the shared state directory; a second one is a restart. */
function manager(state = provider()): BackgroundJobManager {
  const engine = {
    getManager: (name: string) => {
      if (name === 'AuditManager') return { logAuditEvent: (e: Record<string, unknown>) => { events.push(e); return Promise.resolve('id'); } };
      if (name === 'ConfigurationManager') return { getProperty: (key: string, fallback: unknown) => (key in settings ? settings[key] : fallback) };
      return null;
    }
  } as never;
  return new BackgroundJobManager(engine, { stateProvider: state, now: () => new Date(clock) });
}

/** A job that records each slot it ran, and can be held open. */
function job(overrides: Partial<JobDefinition> = {}) {
  const slots: string[] = [];
  const contexts: JobRunContext[] = [];
  let release: (() => void) | null = null;
  let hold = false;
  const def: JobDefinition = {
    id: 'test.hourly',
    displayName: 'Test hourly',
    schedule: 'hourly',
    run: async (_progress, ctx) => {
      slots.push(ctx.slot ?? 'none');
      contexts.push(ctx);
      if (hold) await new Promise<void>((r) => { release = r; });
      return { success: true };
    },
    ...overrides
  };
  return {
    def, slots, contexts,
    holdNext: () => { hold = true; },
    release: () => { hold = false; release?.(); }
  };
}

/** Let the scheduled runs a look started finish. */
const settle = (m: BackgroundJobManager): Promise<void> => m.whenIdle();

const named = (type: string) => events.filter((e) => e.eventType === type);

describe('registration', () => {
  test('a schedule that does not compile is refused, naming the job', () => {
    expect(() => manager().registerJob(job({ schedule: 'fortnightly' }).def)).toThrow(/Scheduled job 'test.hourly': Unknown schedule/);
  });

  test('an unknown catch-up or overlap rule is refused', () => {
    expect(() => manager().registerJob(job({ catchUp: 'most' as never }).def)).toThrow(/catchUp 'most'/);
    expect(() => manager().registerJob(job({ overlap: 'both' as never }).def)).toThrow(/overlap 'both'/);
  });

  test('a persisted job needs state to be open', () => {
    const m = new BackgroundJobManager({ getManager: () => null });
    expect(() => m.registerJob(job().def)).toThrow(/no scheduled-job state is open/);
    expect(() => m.registerJob(job({ persist: false }).def)).not.toThrow();
  });
});

describe('slots', () => {
  test('a job seen for the first time starts from now and runs nothing yet', async () => {
    const t = job();
    const m = manager();
    m.registerJob(t.def);
    await m.tick();
    expect(t.slots).toEqual([]);
    expect((await provider().getState('test.hourly'))?.nextSlot).toBe('2026-10-09T10:00:00.000Z');
  });

  test('a slot that comes due runs once, as the system principal from the schedule', async () => {
    const t = job();
    const m = manager();
    m.registerJob(t.def);
    await m.tick();
    clock = Date.parse('2026-10-09T10:00:05Z');
    await m.tick();
    await settle(m);
    await m.tick();
    await settle(m);
    expect(t.slots).toEqual(['2026-10-09T10:00:00.000Z']);
    expect(t.contexts[0].origin).toBe('schedule');
    const state = await provider().getState('test.hourly');
    expect(state).toMatchObject({ lastSlotDone: '2026-10-09T10:00:00.000Z', nextSlot: '2026-10-09T11:00:00.000Z', current: null });
    expect((await provider().listRuns('test.hourly'))[0]).toMatchObject({ slot: '2026-10-09T10:00:00.000Z', status: 'completed' });
  });

  test('switched off by configuration, it runs nothing', async () => {
    const t = job();
    const m = manager();
    m.registerJob(t.def);
    await m.tick();
    settings['ngdpbase.jobs.test.hourly.enabled'] = false;
    clock = Date.parse('2026-10-09T10:00:05Z');
    await m.tick();
    await settle(m);
    expect(t.slots).toEqual([]);
  });
});

describe('catch-up across a restart: N missed slots give 0 / 1 / min(N, 12) runs', () => {
  async function missed(n: number, catchUp: 'none' | 'latest' | 'all') {
    const state = provider();
    const before = manager(state);
    before.registerJob(job({ catchUp }).def);
    await before.tick();
    // Down from 09:30 until n slots have passed, and back a while after the last.
    clock = Date.parse('2026-10-09T10:00:00Z') + (n - 1) * HOUR + 10 * 60_000;
    const t = job({ catchUp });
    const after = manager(state);
    after.registerJob(t.def);
    await after.tick();
    await settle(after);
    return t;
  }

  test('none: no run, all skipped and audited', async () => {
    const t = await missed(5, 'none');
    expect(t.slots).toEqual([]);
    expect(named('job-skipped')).toHaveLength(1);
    expect((named('job-skipped')[0].metadata as Record<string, unknown>).count).toBe(5);
  });

  test('latest: the newest runs, the rest are skipped', async () => {
    const t = await missed(5, 'latest');
    expect(t.slots).toEqual(['2026-10-09T14:00:00.000Z']);
    expect((named('job-skipped')[0].metadata as Record<string, unknown>).count).toBe(4);
  });

  test('all: each runs, oldest first', async () => {
    const t = await missed(5, 'all');
    expect(t.slots).toEqual(['10', '11', '12', '13', '14'].map((h) => `2026-10-09T${h}:00:00.000Z`));
    expect(named('job-skipped')).toHaveLength(0);
  });

  test(`all: no more than ${CATCH_UP_ALL_CAP}; the older ones are skipped and kept in history`, async () => {
    const t = await missed(20, 'all');
    expect(t.slots).toHaveLength(CATCH_UP_ALL_CAP);
    // Slots 10:00 … 05:00 the next day; the newest twelve begin at 18:00.
    expect(t.slots[0]).toBe('2026-10-09T18:00:00.000Z');
    expect((named('job-skipped')[0].metadata as Record<string, unknown>).count).toBe(20 - CATCH_UP_ALL_CAP);
    expect((await provider().listRuns('test.hourly')).filter((r) => r.status === 'skipped')).toHaveLength(20 - CATCH_UP_ALL_CAP);
  });

  test('one slot missed over a restart is caught up exactly once, and audited as from the schedule', async () => {
    const t = await missed(1, 'latest');
    expect(t.slots).toEqual(['2026-10-09T10:00:00.000Z']);
    const started = named('job-started');
    expect(started).toHaveLength(1);
    expect((started[0].metadata as Record<string, unknown>).origin).toBe('schedule');
  });
});

describe('overlap: slots that come due while the job runs', () => {
  async function overlapping(overlap: 'queue' | 'skip') {
    const t = job({ overlap, schedule: 'every 15m', catchUp: 'none' });
    const m = manager();
    m.registerJob(t.def);
    await m.tick();
    clock = Date.parse('2026-10-09T09:45:05Z');
    t.holdNext();
    await m.tick();
    await vi.waitFor(() => { expect(t.slots).toHaveLength(1); });
    // Three more slots come due while it runs; looks meanwhile start nothing.
    clock = Date.parse('2026-10-09T10:30:10Z');
    await m.tick();
    expect(t.slots).toHaveLength(1);
    t.release();
    await settle(m);
    await m.tick();
    await settle(m);
    return t;
  }

  test('queue: one waits, the newest, and runs after', async () => {
    const t = await overlapping('queue');
    expect(t.slots).toEqual(['2026-10-09T09:45:00.000Z', '2026-10-09T10:30:00.000Z']);
    expect((named('job-skipped')[0].metadata as Record<string, unknown>).count).toBe(2);
  });

  test('skip: none of them runs', async () => {
    const t = await overlapping('skip');
    expect(t.slots).toEqual(['2026-10-09T09:45:00.000Z']);
    expect((named('job-skipped')[0].metadata as Record<string, unknown>).count).toBe(3);
  });
});

describe('timeout', () => {
  test('a run past its timeout is aborted and failed as timed out', async () => {
    let aborted = false;
    const m = manager();
    m.registerJob({
      id: 'test.slow',
      displayName: 'Slow',
      schedule: 'hourly',
      timeout: 30,
      run: (_progress, ctx) => new Promise((resolve) => {
        ctx.signal.addEventListener('abort', () => { aborted = true; resolve({ success: true }); });
      })
    });
    await m.tick();
    clock = Date.parse('2026-10-09T10:00:05Z');
    await m.tick();
    await settle(m);
    expect(aborted).toBe(true);
    expect((await provider().listRuns('test.slow'))[0]).toMatchObject({ status: 'failed', error: 'timed out after 30 ms' });
    expect(named('job-failed')).toHaveLength(1);
  });

  test('ngdpbase.jobs.max-timeout-ms caps a job that asked for no limit', async () => {
    settings['ngdpbase.jobs.max-timeout-ms'] = 30;
    let aborted = false;
    const m = manager();
    m.registerJob({
      id: 'test.unbounded',
      displayName: 'Unbounded',
      schedule: 'hourly',
      timeout: 0,
      run: (_progress, ctx) => new Promise((resolve) => {
        ctx.signal.addEventListener('abort', () => { aborted = true; resolve({ success: true }); });
      })
    });
    await m.tick();
    clock = Date.parse('2026-10-09T10:00:05Z');
    await m.tick();
    await settle(m);
    expect(aborted).toBe(true);
  });
});

describe('configuration overrides', () => {
  test('a changed rule counts from now, catches nothing up for the old one, and is audited', async () => {
    const t = job({ catchUp: 'all' });
    const m = manager();
    m.registerJob(t.def);
    await m.tick();
    clock = Date.parse('2026-10-09T13:10:00Z');
    settings['ngdpbase.jobs.test.hourly.schedule'] = 'daily 06:00';
    await m.tick();
    await settle(m);
    expect(t.slots).toEqual([]);
    expect((await provider().getState('test.hourly'))?.nextSlot).toBe('2026-10-10T06:00:00.000Z');
    expect(named('job-schedule-change')).toHaveLength(1);
  });

  test('an override that does not compile is refused and the schedule in force stays', async () => {
    const t = job();
    const m = manager();
    m.registerJob(t.def);
    await m.tick();
    settings['ngdpbase.jobs.test.hourly.schedule'] = 'whenever';
    clock = Date.parse('2026-10-09T10:00:05Z');
    await m.tick();
    await settle(m);
    expect(t.slots).toEqual(['2026-10-09T10:00:00.000Z']);
  });

  test('a rule changed while the server was down is seen at the next start', async () => {
    const state = provider();
    const before = manager(state);
    before.registerJob(job({ catchUp: 'all' }).def);
    await before.tick();
    clock = Date.parse('2026-10-09T13:10:00Z');
    const t = job({ catchUp: 'all', schedule: 'daily 06:00' });
    const after = manager(state);
    after.registerJob(t.def);
    await after.tick();
    await settle(after);
    expect(t.slots).toEqual([]);
    expect(named('job-schedule-change')).toHaveLength(1);
  });
});

describe('locks', () => {
  test('a slot another server holds is left to it', async () => {
    const state = provider();
    const t = job();
    const m = manager(state);
    m.registerJob(t.def);
    await m.tick();
    clock = Date.parse('2026-10-09T10:00:05Z');
    await state.takeLock('test.hourly', '2026-10-09T10:00:00.000Z', 'other-host:1:boot', 60_000);
    await m.tick();
    await settle(m);
    expect(t.slots).toEqual([]);
  });

  test('a lock its holder let expire is taken over', async () => {
    const state = provider();
    const t = job();
    const m = manager(state);
    m.registerJob(t.def);
    await m.tick();
    await state.takeLock('test.hourly', '2026-10-09T10:00:00.000Z', 'other-host:1:boot', 60_000);
    clock = Date.parse('2026-10-09T10:00:05Z');
    await m.tick();
    await settle(m);
    expect(t.slots).toEqual(['2026-10-09T10:00:00.000Z']);
  });
});

describe('persist: false', () => {
  test('runs from memory, with no state written', async () => {
    const t = job({ persist: false });
    const m = manager();
    m.registerJob(t.def);
    await m.tick();
    clock = Date.parse('2026-10-09T10:00:05Z');
    await m.tick();
    await settle(m);
    expect(t.slots).toEqual(['2026-10-09T10:00:00.000Z']);
    expect(await provider().getState('test.hourly')).toBeNull();
  });
});
