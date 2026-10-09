/**
 * Scheduled-job state (#1714): one contract, run against every backend, then
 * what only one backend has to prove.
 *
 * Every test works in its own temporary directory and removes only that.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fsExtra from 'fs-extra';
import FileJobStateProvider from '../FileJobStateProvider';
import SqliteJobStateProvider from '../SqliteJobStateProvider';
import SqliteDatabaseProvider from '../SqliteDatabaseProvider';
import DATABASE_MIGRATIONS from '../databaseMigrations';
import { selectJobStateBackend, slotKey, type JobRunRecord, type JobStateProvider } from '../jobState';

let dir: string;
let clock: number;
const opened: SqliteDatabaseProvider[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1714-'));
  clock = Date.parse('2026-10-08T06:00:00Z');
});

afterEach(() => {
  while (opened.length) opened.pop()?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const now = (): number => clock;

function sqlite(key = ''): SqliteJobStateProvider {
  const db = new SqliteDatabaseProvider(path.join(dir, 'app.db'), key, DATABASE_MIGRATIONS);
  opened.push(db);
  return new SqliteJobStateProvider(db.handle, { now, historyLimit: 3, checkpointMaxBytes: 64 });
}

const run = (n: number, status: JobRunRecord['status'] = 'completed'): JobRunRecord => ({
  runId: `run-${n}`,
  slot: new Date(Date.UTC(2026, 9, n)).toISOString(),
  startedAt: new Date(Date.UTC(2026, 9, n, 6)).toISOString(),
  attempt: 1,
  status
});

const SLOT = '2026-10-31T23:00:00.000Z';

describe.each([
  ['file', () => new FileJobStateProvider(path.join(dir, 'jobs'), { now, historyLimit: 3, checkpointMaxBytes: 64 })],
  ['sqlite', () => sqlite()],
  ['sqlite, encrypted', () => sqlite('a-test-key')]
] as Array<[string, () => JobStateProvider]>)('job state contract: %s', (_name, make) => {
  test('state round-trips, and a job never written has none', async () => {
    const p = make();
    expect(await p.getState('acct.month-close')).toBeNull();
    const state = {
      jobId: 'acct.month-close', lastSlotDone: '2026-09-30T23:00:00.000Z', nextSlot: SLOT, current: run(31, 'running'),
      rule: 'FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=23;BYMINUTE=0|2000-01-01T00:00:00|America/New_York'
    };
    await p.putState(state);
    expect(await p.getState('acct.month-close')).toEqual(state);
    await p.putState({ ...state, current: null, lastSlotDone: SLOT, rule: null });
    expect(await p.getState('acct.month-close')).toEqual({ ...state, current: null, lastSlotDone: SLOT, rule: null });
  });

  test('a skipped slot is recorded as skipped (#1715)', async () => {
    const p = make();
    await p.recordRun('acct.month-close', run(1, 'skipped'));
    expect((await p.listRuns('acct.month-close'))[0].status).toBe('skipped');
  });

  test('history keeps the newest runs up to the limit, and a run recorded again is replaced', async () => {
    const p = make();
    for (let n = 1; n <= 5; n++) await p.recordRun('acct.month-close', run(n));
    expect((await p.listRuns('acct.month-close')).map((r) => r.runId)).toEqual(['run-5', 'run-4', 'run-3']);
    await p.recordRun('acct.month-close', { ...run(5), status: 'failed', error: 'boom' });
    const runs = await p.listRuns('acct.month-close');
    expect(runs).toHaveLength(3);
    expect(runs[0]).toMatchObject({ runId: 'run-5', status: 'failed', error: 'boom' });
  });

  test('two contenders for one slot: exactly one wins', async () => {
    const p = make();
    const results = await Promise.all([
      p.takeLock('acct.month-close', SLOT, 'host-a', 60_000),
      p.takeLock('acct.month-close', SLOT, 'host-b', 60_000)
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await p.takeLock('acct.month-close', '2026-11-30T23:00:00.000Z', 'host-b', 60_000)).toBe(true);
  });

  test('a stale lock is stolen by exactly one contender', async () => {
    const p = make();
    expect(await p.takeLock('acct.month-close', SLOT, 'dead-host', 60_000)).toBe(true);
    clock += 61_000;
    const results = await Promise.all(['host-a', 'host-b', 'host-c'].map((o) => p.takeLock('acct.month-close', SLOT, o, 60_000)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await p.renewLock('acct.month-close', SLOT, 'dead-host', 60_000)).toBe(false);
  });

  test('renewing keeps a live lock; only its holder can renew or release it', async () => {
    const p = make();
    expect(await p.takeLock('acct.month-close', SLOT, 'host-a', 60_000)).toBe(true);
    clock += 45_000;
    expect(await p.renewLock('acct.month-close', SLOT, 'host-a', 60_000)).toBe(true);
    clock += 45_000; // 90 s after taking, 45 s after renewing: still live
    expect(await p.takeLock('acct.month-close', SLOT, 'host-b', 60_000)).toBe(false);
    expect(await p.renewLock('acct.month-close', SLOT, 'host-b', 60_000)).toBe(false);
    await p.releaseLock('acct.month-close', SLOT, 'host-b');
    expect(await p.takeLock('acct.month-close', SLOT, 'host-b', 60_000)).toBe(false);
    await p.releaseLock('acct.month-close', SLOT, 'host-a');
    expect(await p.takeLock('acct.month-close', SLOT, 'host-b', 60_000)).toBe(true);
  });

  test('checkpoints round-trip, clear, and are refused over the size cap', async () => {
    const p = make();
    expect(await p.loadCheckpoint('acct.month-close', 'run-1')).toBeNull();
    await p.saveCheckpoint('acct.month-close', 'run-1', { doneThrough: 311 });
    expect(await p.loadCheckpoint('acct.month-close', 'run-1')).toEqual({ doneThrough: 311 });
    await expect(p.saveCheckpoint('acct.month-close', 'run-1', { blob: 'x'.repeat(100) })).rejects.toThrow(/limit is 64/);
    expect(await p.loadCheckpoint('acct.month-close', 'run-1')).toEqual({ doneThrough: 311 });
    await p.clearCheckpoint('acct.month-close', 'run-1');
    expect(await p.loadCheckpoint('acct.month-close', 'run-1')).toBeNull();
  });

  test('a job id that could escape its folder or table is refused', async () => {
    const p = make();
    await expect(p.getState('../etc')).rejects.toThrow(/Job id/);
  });
});

describe('file backend', () => {
  test('state written before the rule was kept reads back with rule null (#1715)', async () => {
    const p = new FileJobStateProvider(path.join(dir, 'jobs'), { now });
    fs.mkdirSync(path.join(dir, 'jobs', 'state'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'jobs', 'state', 'acct.month-close.json'),
      JSON.stringify({ jobId: 'acct.month-close', lastSlotDone: null, nextSlot: SLOT, current: null }));
    expect((await p.getState('acct.month-close'))?.rule).toBeNull();
  });

  test('a crash between writing and renaming leaves the previous state whole', async () => {
    const p = new FileJobStateProvider(path.join(dir, 'jobs'), { now });
    const before = { jobId: 'acct.month-close', lastSlotDone: null, nextSlot: SLOT, current: null, rule: null };
    await p.putState(before);
    const rename = vi.spyOn(fsExtra, 'rename').mockRejectedValueOnce(new Error('simulated crash'));
    await expect(p.putState({ ...before, nextSlot: '2026-11-30T23:00:00.000Z' })).rejects.toThrow('simulated crash');
    rename.mockRestore();
    expect(await p.getState('acct.month-close')).toEqual(before);
    expect(fs.readdirSync(path.join(dir, 'jobs', 'state'))).toEqual(['acct.month-close.json']);
  });

  test('locks are files named by job and slot', async () => {
    const p = new FileJobStateProvider(path.join(dir, 'jobs'), { now });
    await p.takeLock('acct.month-close', SLOT, 'host-a', 60_000);
    expect(fs.readdirSync(path.join(dir, 'jobs', 'locks'))).toEqual([`acct.month-close@${slotKey(SLOT)}.lock`]);
  });

  test('refuses NFS and SMB, allows local disk', () => {
    const on = (type: number) => () => new FileJobStateProvider(path.join(dir, 'jobs'), { statfs: () => ({ type }), platform: 'linux' });
    expect(on(0x6969)).toThrow(/would live on NFS/);
    expect(on(0x517b)).toThrow(/would live on SMB/);
    expect(on(0xef53)).not.toThrow(); // ext4
  });
});

describe('sqlite backend', () => {
  test('the migration applies on a fresh database and is skipped on an existing one', () => {
    const file = path.join(dir, 'app.db');
    const first = new SqliteDatabaseProvider(file, '', DATABASE_MIGRATIONS);
    expect(first.migrations.applied).toContain('20261008180000');
    first.close();
    const second = new SqliteDatabaseProvider(file, '', DATABASE_MIGRATIONS);
    expect(second.migrations.applied).toEqual([]);
    expect(second.migrations.skipped).toBe(DATABASE_MIGRATIONS.length);
    second.close();
  });
});

describe('choosing a backend (ngdpbase.jobs.state.provider)', () => {
  test('auto picks sqlite when the application database is open, else file', () => {
    expect(selectJobStateBackend('auto', true)).toBe('sqlite');
    expect(selectJobStateBackend('auto', false)).toBe('file');
    expect(selectJobStateBackend(undefined, true)).toBe('sqlite');
  });

  test('file and sqlite are taken as named; sqlite without a database is refused', () => {
    expect(selectJobStateBackend('file', true)).toBe('file');
    expect(selectJobStateBackend('SQLITE', true)).toBe('sqlite');
    expect(() => selectJobStateBackend('sqlite', false)).toThrow(/no application database is open/);
    expect(() => selectJobStateBackend('redis', true)).toThrow(/not one of auto, file, sqlite/);
  });
});
