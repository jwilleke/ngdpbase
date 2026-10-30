/**
 * #2138: the /admin dashboard shows when each Reindex and Rebuild last ran.
 * `lastFinishedRun` picks, per job, the newest run that ended — completed or
 * failed — from the history the manager already keeps: the job state for a
 * run started by hand, memory for a maintenance tick (`persist: false`).
 *
 * State lives in a real FileJobStateProvider in a temporary directory, so a
 * "restart" is a second manager over the same directory. Each test removes
 * only its own directory.
 */
vi.unmock('../BackgroundJobManager');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BackgroundJobManager, { type JobDefinition } from '../BackgroundJobManager';
import FileJobStateProvider from '../../providers/FileJobStateProvider';

let dir: string;
let clock: number;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-2138-'));
  clock = Date.parse('2026-10-30T09:30:00Z');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function provider(): FileJobStateProvider {
  return new FileJobStateProvider(path.join(dir, 'jobs'), { now: () => clock });
}

/** A manager over the shared state directory (a second one is a restart), or with no job state open. */
function manager(options: { noState?: boolean } = {}): BackgroundJobManager {
  const engine = {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') return { getProperty: (_key: string, fallback: unknown) => (_key === 'ngdpbase.default.timezone' ? 'UTC' : fallback) };
      return null;
    }
  } as never;
  return new BackgroundJobManager(engine, { ...(options.noState ? {} : { stateProvider: provider() }), now: () => new Date(clock) });
}

const jim = { username: 'jim', origin: 'request' as const, requestedAt: '2026-10-30T09:00:00.000Z' };
const ann = { username: 'ann', origin: 'request' as const, requestedAt: '2026-10-30T09:00:00.000Z' };

/** An on-demand job, like pages.reindex; each run ends as `outcome` says. */
function handJob(outcome: { next: 'ok' | 'fail' | 'throw' }): JobDefinition {
  return {
    id: 'test.reindex',
    displayName: 'Reindex',
    persist: true,
    permission: 'admin-system',
    run: () => {
      if (outcome.next === 'throw') return Promise.reject(new Error('disk gone'));
      return Promise.resolve(outcome.next === 'ok' ? { success: true, summary: 'done' } : { success: false, error: 'index locked' });
    }
  };
}

describe('lastFinishedRun (#2138)', () => {
  test('none: a job that never ran says so, and its history is kept across restarts', async () => {
    const m = manager();
    m.registerJob(handJob({ next: 'ok' }));
    expect(await m.lastFinishedRun('test.reindex')).toEqual({ jobId: 'test.reindex', displayName: 'Reindex', lastRun: null, sinceStart: false });
  });

  test('an unregistered job is null', async () => {
    expect(await manager().lastFinishedRun('test.nothing')).toBeNull();
  });

  test('completed: the run, when it ended and who asked', async () => {
    const m = manager();
    m.registerJob(handJob({ next: 'ok' }));
    await m.enqueue('test.reindex', jim);
    await m.whenIdle();
    const { lastRun } = (await m.lastFinishedRun('test.reindex'))!;
    expect(lastRun).toMatchObject({ status: 'completed', startedAt: '2026-10-30T09:30:00.000Z', ranBy: 'jim' });
    expect(Number.isFinite(Date.parse(lastRun!.completedAt))).toBe(true);
  });

  test('failed: the newest run wins, even when it failed', async () => {
    const outcome: { next: 'ok' | 'fail' | 'throw' } = { next: 'ok' };
    const m = manager();
    m.registerJob(handJob(outcome));
    await m.enqueue('test.reindex', jim);
    await m.whenIdle();
    clock += 60_000;
    outcome.next = 'fail';
    await m.enqueue('test.reindex', ann);
    await m.whenIdle();
    expect((await m.lastFinishedRun('test.reindex'))!.lastRun).toMatchObject({ status: 'failed', ranBy: 'ann', startedAt: '2026-10-30T09:31:00.000Z' });

    clock += 60_000;
    outcome.next = 'throw';
    await m.enqueue('test.reindex', jim);
    await m.whenIdle();
    expect((await m.lastFinishedRun('test.reindex'))!.lastRun).toMatchObject({ status: 'failed', ranBy: 'jim', startedAt: '2026-10-30T09:32:00.000Z' });
  });

  test('a run still going is not a finished run: the one before it is shown', async () => {
    let hold = false;
    const held: { release: (() => void) | null } = { release: null };
    const m = manager();
    m.registerJob({
      ...handJob({ next: 'ok' }),
      run: () => (hold ? new Promise((r) => { held.release = () => r({ success: true }); }) : Promise.resolve({ success: true }))
    });
    await m.enqueue('test.reindex', jim);
    await m.whenIdle();
    hold = true;
    clock += 60_000;
    const runId = await m.enqueue('test.reindex', ann);
    await vi.waitFor(() => { expect(m.getStatus(runId)?.status).toBe('running'); });
    await vi.waitFor(() => { expect(held.release).not.toBeNull(); });
    expect((await m.lastFinishedRun('test.reindex'))!.lastRun).toMatchObject({ status: 'completed', ranBy: 'jim' });
    held.release?.();
    await m.whenIdle();
    expect((await m.lastFinishedRun('test.reindex'))!.lastRun).toMatchObject({ status: 'completed', ranBy: 'ann' });
  });

  test('a run started by hand is still there after a restart', async () => {
    const first = manager();
    first.registerJob(handJob({ next: 'ok' }));
    await first.enqueue('test.reindex', jim);
    await first.whenIdle();
    const second = manager();
    second.registerJob(handJob({ next: 'ok' }));
    expect((await second.lastFinishedRun('test.reindex'))!.lastRun).toMatchObject({ status: 'completed', ranBy: 'jim' });
  });

  test('a maintenance tick (persist: false) is kept in memory: "since start", run by its schedule', async () => {
    const m = manager();
    m.registerMaintenance({ id: 'test.folder-scan', displayName: 'Folder scan', everyMs: 60 * 60_000, run: () => Promise.resolve('0 new') });
    expect(await m.lastFinishedRun('test.folder-scan')).toEqual({ jobId: 'test.folder-scan', displayName: 'Folder scan', lastRun: null, sinceStart: true });
    await m.tick();
    clock = Date.parse('2026-10-30T10:00:05Z');
    await m.tick();
    await m.whenIdle();
    const view = (await m.lastFinishedRun('test.folder-scan'))!;
    expect(view.sinceStart).toBe(true);
    expect(view.lastRun).toMatchObject({ status: 'completed', ranBy: null, startedAt: '2026-10-30T10:00:05.000Z' });
    // A restart forgets it.
    const again = manager();
    again.registerMaintenance({ id: 'test.folder-scan', displayName: 'Folder scan', everyMs: 60 * 60_000, run: () => Promise.resolve() });
    expect((await again.lastFinishedRun('test.folder-scan'))!.lastRun).toBeNull();
  });

  test('with no job state open, a run by hand is still found in memory, "since start"', async () => {
    const m = manager({ noState: true });
    m.registerJob(handJob({ next: 'ok' }));
    await m.enqueue('test.reindex', jim);
    await m.whenIdle();
    expect(await m.lastFinishedRun('test.reindex')).toMatchObject({ sinceStart: true, lastRun: { status: 'completed', ranBy: 'jim' } });
  });
});
