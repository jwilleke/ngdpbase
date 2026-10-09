/**
 * The shutdown handoff (#1717, epic #1611 §7): at shutdown no slot starts, a
 * running job's signal is aborted, and a run that did not finish is saved as
 * interrupted, its lock let go, so the next start resumes it at once without
 * counting an attempt. A hard kill is the other path: the lock expires, and
 * the resume counts.
 *
 * The signal tests run a real child process (__fixtures__/scheduledJobProcess.ts)
 * and send it SIGTERM (Docker, k8s), SIGINT (PM2, a terminal) or SIGKILL.
 * Each test works in its own temporary directory and removes only that.
 */
vi.unmock('../BackgroundJobManager');

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BackgroundJobManager, { type JobRunContext } from '../BackgroundJobManager';
import FileJobStateProvider from '../../providers/FileJobStateProvider';
import WikiEngine from '../../WikiEngine';

const SLOT = '2026-10-09T10:00:00.000Z';
const FIXTURE = path.join(__dirname, '__fixtures__', 'scheduledJobProcess.ts');
const TSX = path.resolve(__dirname, '..', '..', '..', 'node_modules', '.bin', 'tsx');

let dir: string;
let clock: number;
let settings: Record<string, unknown>;
let events: Record<string, unknown>[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1717-'));
  clock = Date.parse('2026-10-09T09:30:00Z');
  settings = { 'ngdpbase.default.timezone': 'UTC', 'ngdpbase.jobs.shutdown-grace-ms': 200 };
  events = [];
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const provider = (): FileJobStateProvider => new FileJobStateProvider(dir, { now: () => clock });

function manager(state = provider()): BackgroundJobManager {
  const engine = {
    getManager: (name: string) => {
      if (name === 'AuditManager') return { logAuditEvent: (e: Record<string, unknown>) => { events.push(e); return Promise.resolve('id'); } };
      if (name === 'ConfigurationManager') return { getProperty: (key: string, fallback: unknown) => (key in settings ? settings[key] : fallback) };
      return null;
    }
  } as never;
  return new BackgroundJobManager(engine, { stateProvider: state, now: () => new Date(clock), checkpointThrottleMs: 0 });
}

const named = (type: string) => events.filter((e) => e.eventType === type);

/** A job that saves a checkpoint, then waits for its signal (or ignores it). */
function closeJob(mode: 'cooperative' | 'stubborn', seen: JobRunContext[] = []) {
  return {
    id: 'test.close',
    displayName: 'Close',
    schedule: 'hourly',
    run: (_progress: unknown, ctx: JobRunContext) => new Promise<{ success: boolean; error?: string }>((resolve) => {
      seen.push(ctx);
      if (ctx.resume) {
        resolve({ success: true });
        return;
      }
      ctx.checkpoint({ doneThrough: 311 });
      if (mode === 'cooperative') ctx.signal.addEventListener('abort', () => resolve({ success: false, error: 'stopped' }));
    })
  };
}

/** Start the 10:00 slot and wait until the job is running. */
async function startSlot(m: BackgroundJobManager): Promise<void> {
  await m.tick();
  clock = Date.parse('2026-10-09T10:00:05Z');
  await m.tick();
  await vi.waitFor(() => { expect(m.getActiveJobs()).toHaveLength(1); });
}

/** What the next start finds, and what it does with it. */
async function nextStart(state: FileJobStateProvider) {
  const seen: JobRunContext[] = [];
  const m = manager(state);
  m.registerJob(closeJob('cooperative', seen));
  await m.tick();
  await m.whenIdle();
  return seen;
}

describe('engine.shutdown', () => {
  test('hands off scheduled jobs before any manager stops, an add-on included', async () => {
    const order: string[] = [];
    const engine = Object.create(WikiEngine.prototype) as WikiEngine;
    (engine as unknown as { managers: Map<string, unknown> }).managers = new Map<string, unknown>([
      ['DatabaseManager', { shutdown: () => { order.push('database'); return Promise.resolve(); } }],
      ['BackgroundJobManager', {
        handOff: () => { order.push('hand off'); return Promise.resolve(); },
        shutdown: () => { order.push('jobs'); return Promise.resolve(); }
      }],
      ['AddonsManager', { shutdown: () => { order.push('add-ons'); return Promise.resolve(); } }]
    ]);
    await engine.shutdown();
    expect(order).toEqual(['hand off', 'add-ons', 'jobs', 'database']);
  });
});

describe('handOff, in one process', () => {
  test('a job that stops on its signal is saved as interrupted, with its checkpoint, its lock let go, and no failure', async () => {
    const state = provider();
    const m = manager(state);
    m.registerJob(closeJob('cooperative'));
    await startSlot(m);
    await m.shutdown();

    expect((await state.getState('test.close'))?.current).toMatchObject({ status: 'interrupted', attempt: 1, slot: SLOT });
    expect(await state.loadCheckpoint('test.close', (await state.getState('test.close'))!.current!.runId)).toEqual({ doneThrough: 311 });
    expect(await state.takeLock('test.close', SLOT, 'someone-else', 60_000)).toBe(true);
    expect(named('job-interrupted')).toHaveLength(1);
    expect(named('job-failed')).toHaveLength(0);
  });

  test('a job that ignores its signal is handed off when the grace ends', async () => {
    const state = provider();
    const m = manager(state);
    m.registerJob(closeJob('stubborn'));
    await startSlot(m);
    const started = Date.now();
    await m.shutdown();
    expect(Date.now() - started).toBeGreaterThanOrEqual(180);
    expect((await state.getState('test.close'))?.current?.status).toBe('interrupted');
  });

  test('after shutdown begins, no slot starts', async () => {
    const seen: JobRunContext[] = [];
    const m = manager();
    m.registerJob(closeJob('cooperative', seen));
    await m.tick();
    await m.handOff();
    clock = Date.parse('2026-10-09T10:00:05Z');
    await m.tick();
    await m.whenIdle();
    expect(seen).toHaveLength(0);
  });

  test('the next start resumes an interrupted run at once, as the same attempt, from its checkpoint', async () => {
    const state = provider();
    const m = manager(state);
    m.registerJob(closeJob('cooperative'));
    await startSlot(m);
    await m.shutdown();
    const seen = await nextStart(state);
    expect(seen[0].resume).toEqual({ attempt: 1, checkpoint: { doneThrough: 311 }, reason: 'interrupted' });
    expect((await state.getState('test.close'))).toMatchObject({ current: null, lastSlotDone: SLOT });
  });
});

describe('a real process, ended by a signal', () => {
  function startProcess(mode: 'cooperative' | 'stubborn'): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
      const child = spawn(TSX, [FIXTURE, dir, mode], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        out += chunk.toString();
        if (out.includes('RUNNING')) resolve(child);
      });
      child.on('exit', (code) => reject(new Error(`the process exited (${code}) before its job ran: ${out}`)));
    });
  }

  const exited = (child: ChildProcess): Promise<void> => new Promise((resolve) => child.once('exit', () => resolve()));

  test.each(['SIGTERM', 'SIGINT'] as const)('%s: interrupted, lock let go, resumed at once with the attempt unchanged', async (signal) => {
    const child = await startProcess('cooperative');
    const gone = exited(child);
    child.kill(signal);
    await gone;

    const state = provider();
    clock = Date.parse('2026-10-09T10:00:06Z');
    expect((await state.getState('test.close'))?.current).toMatchObject({ status: 'interrupted', attempt: 1 });
    const seen = await nextStart(state);
    expect(seen[0].resume).toEqual({ attempt: 1, checkpoint: { doneThrough: 311 }, reason: 'interrupted' });
  }, 30_000);

  test('SIGTERM to a job that ignores its signal: handed off when the grace ends', async () => {
    const child = await startProcess('stubborn');
    const gone = exited(child);
    child.kill('SIGTERM');
    await gone;
    clock = Date.parse('2026-10-09T10:00:06Z');
    expect((await provider().getState('test.close'))?.current?.status).toBe('interrupted');
  }, 30_000);

  test('SIGKILL: nothing is handed off; the run resumes once its lock expires, as the next attempt', async () => {
    const child = await startProcess('cooperative');
    const gone = exited(child);
    child.kill('SIGKILL');
    await gone;

    const state = provider();
    clock = Date.parse('2026-10-09T10:00:06Z');
    expect((await state.getState('test.close'))?.current?.status).toBe('running');
    // Its lock is still held by the dead process: left alone.
    expect(await nextStart(state)).toHaveLength(0);
    // The lock expires; the run counts as a failed attempt and is tried after its backoff.
    clock += 61_000;
    expect(await nextStart(state)).toHaveLength(0);
    clock += 61_000;
    const seen = await nextStart(state);
    expect(seen[0].resume).toEqual({ attempt: 2, checkpoint: { doneThrough: 311 }, reason: 'the server stopped during the run' });
  }, 30_000);
});
