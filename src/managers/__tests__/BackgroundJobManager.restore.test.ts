/**
 * #1876 slice 2 — file-based job state (`ngdpbase.jobs.state.dir`) is in the
 * backup and restores staged with the rest of the site, and a restore never
 * runs a job again: a run the backup caught in progress is closed, not
 * resumed or retried, and no slot between the backup and the restore is
 * caught up. The runs since the backup are read from the live state before
 * it is replaced, for the restore's notification.
 *
 * A real FileJobStateProvider over a temp directory; a second manager over
 * it is a restart. Each test removes only its own directory.
 */
vi.unmock('../BackgroundJobManager');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BackgroundJobManager, { type JobDefinition } from '../BackgroundJobManager';
import FileJobStateProvider from '../../providers/FileJobStateProvider';
import { beginSiteRestore, commitSiteRestore, readSiteRestore } from '../../utils/siteRestore';
import { BACKUP_KEY_ENV } from '../../utils/backupKey';

const SLOT = '2026-10-09T10:00:00.000Z';
const BACKUP_AT = '2026-10-09T10:00:05.000Z';
const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true };

let dir: string;
let clock: number;
let events: Record<string, unknown>[];
const savedKey = process.env[BACKUP_KEY_ENV];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1876-jobs-'));
  clock = Date.parse(BACKUP_AT);
  events = [];
  process.env[BACKUP_KEY_ENV] = 'backup-key-not-a-secret';
});

afterEach(() => {
  if (savedKey === undefined) delete process.env[BACKUP_KEY_ENV]; else process.env[BACKUP_KEY_ENV] = savedKey;
  // Only this test's own temp directory.
  fs.rmSync(dir, { recursive: true, force: true });
});

const stateDir = (): string => path.join(dir, 'jobs');
const siteFile = (): string => path.join(dir, 'site-restore.json');
const backups = (): string => path.join(dir, 'backups');

/** One start of the site's job manager, its state in files from the configuration. */
async function start(): Promise<BackgroundJobManager> {
  const config = {
    getProperty: (key: string, fallback: unknown) => (key === 'ngdpbase.default.timezone' ? 'UTC' : key === 'ngdpbase.jobs.state.provider' ? 'file' : fallback),
    getResolvedDataPath: (key: string, def: string) => (key === 'ngdpbase.jobs.state.dir' ? stateDir() : key === 'ngdpbase.backup.restore-manifest' ? siteFile() : path.join(dir, path.basename(def)))
  };
  const engine = {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') return config;
      if (name === 'AuditManager') return { logAuditEvent: (e: Record<string, unknown>) => { events.push(e); return Promise.resolve('id'); } };
      if (name === 'NotificationManager') return { addNotification: () => Promise.resolve('n') };
      return null;
    }
  } as never;
  const m = new BackgroundJobManager(engine, { now: () => new Date(clock) });
  await m.initialize();
  return m;
}

function hourly(): { def: JobDefinition; slots: string[] } {
  const slots: string[] = [];
  return {
    slots,
    def: { id: 'test.hourly', displayName: 'Test hourly', schedule: 'hourly', run: async (_p, ctx) => { slots.push(ctx.slot ?? 'none'); return { success: true }; } }
  };
}

/** The state a backup taken during the 10:00 run holds: the run in progress (with its lock held, when asked). */
async function inProgressAtBackup(withLock = false): Promise<FileJobStateProvider> {
  const state = new FileJobStateProvider(stateDir());
  const running = { runId: 'run-a', slot: SLOT, startedAt: SLOT, attempt: 1, status: 'running' as const, requestedBy: null };
  await state.putState({ jobId: 'test.hourly', lastSlotDone: '2026-10-09T09:00:00.000Z', nextSlot: SLOT, current: running, rule: null });
  await state.recordRun('test.hourly', running);
  if (withLock) await state.takeLock('test.hourly', SLOT, 'backup-host:1:boot', 60_000);
  return state;
}

async function backupAndStage(m: BackgroundJobManager): Promise<void> {
  fs.mkdirSync(backups(), { recursive: true });
  const data = await m.backup({ ctx: CTX, directory: backups(), stem: 'b1' });
  beginSiteRestore(siteFile(), { stagedAt: new Date(clock).toISOString(), backup: BACKUP_AT, source: 'b1.json.gz.enc', stagedBy: 'admin' });
  await m.restore(data, { ctx: CTX, directory: backups(), siteRestore: siteFile() });
  commitSiteRestore(siteFile());
}

describe('file job state in the backup (#1876)', () => {
  test('the backup holds the state, runs and checkpoints, encrypted, and not the slot locks', async () => {
    await inProgressAtBackup(true);
    expect(fs.readdirSync(path.join(stateDir(), 'locks'))).toHaveLength(1);
    const m = await start();
    fs.mkdirSync(backups(), { recursive: true });
    const data = await m.backup({ ctx: CTX, directory: backups(), stem: 'b1' });
    expect(data.data).toMatchObject({ format: 1, archive: 'b1.jobs.tar.enc', files: 2 });
    const { listTreeArchive } = await import('../../utils/treeArchive');
    const entries: string[] = [];
    await listTreeArchive(path.join(backups(), 'b1.jobs.tar.enc'), (e) => entries.push(e.path), { backupKey: process.env[BACKUP_KEY_ENV] });
    expect(entries.filter((e) => !e.endsWith('/')).sort()).toEqual(['runs/test.hourly.json', 'state/test.hourly.json']);
  });

  test('database job state is not in the file backup: it is in the database backup', async () => {
    const m = new BackgroundJobManager({ getManager: () => null }, { stateProvider: { backend: 'sqlite' } as never });
    expect((await m.backup({ ctx: CTX, directory: dir, stem: 'b1' })).data).toEqual({ backend: 'sqlite' });
  });
});

describe('a run in progress at backup time (#1876)', () => {
  test('without a restore, a restart treats it as a crashed attempt and runs it again (#1716) — the behaviour a restore must not inherit', async () => {
    await inProgressAtBackup();
    const t = hourly();
    const restarted = await start();
    restarted.registerJob(t.def);
    // The same looks as the restored site below gets: the run is found, failed as a crashed attempt, then retried after its backoff.
    for (let i = 0; i < 4; i++) {
      clock += 61_000;
      await restarted.tick();
      await restarted.whenIdle();
    }
    expect(t.slots[0]).toBe(SLOT);
  });

  test('after a restore it is closed as failed, never resumed or retried, and no slot since the backup is caught up', async () => {
    await inProgressAtBackup(true);
    const live = await start();
    live.registerJob(hourly().def);
    await backupAndStage(live);
    // The site ran on after the backup: two more hourly runs, in the live state only.
    const state = new FileJobStateProvider(stateDir());
    for (const at of ['2026-10-09T11:00:00.000Z', '2026-10-09T12:00:00.000Z']) {
      await state.recordRun('test.hourly', { runId: `run-${at}`, slot: at, startedAt: at, completedAt: at, attempt: 1, status: 'completed', requestedBy: null });
    }
    await state.recordRun('test.hourly', { runId: 'run-early', slot: '2026-10-09T09:00:00.000Z', startedAt: '2026-10-09T09:00:00.000Z', attempt: 1, status: 'completed', requestedBy: null });
    clock = Date.parse('2026-10-09T12:30:00Z');

    const t = hourly();
    const restored = await start();
    restored.registerJob(t.def);
    // The runs since the backup were read from the live state before it was replaced.
    expect(restored.getRunsReplacedAtStart().map((r) => r.startedAt).sort()).toEqual(['2026-10-09T11:00:00.000Z', '2026-10-09T12:00:00.000Z']);
    expect(fs.existsSync(`${stateDir()}.pre-restore`)).toBe(true);
    expect(readSiteRestore(siteFile())).toBeNull(); // every part applied: the manifest is done

    for (let i = 0; i < 4; i++) {
      clock += 61_000;
      await restored.tick();
      await restored.whenIdle();
    }
    expect(t.slots).toEqual([]);
    const after = await state.getState('test.hourly');
    expect(after).toMatchObject({ current: null, nextSlot: '2026-10-09T13:00:00.000Z' });
    const closed = (await state.listRuns('test.hourly')).find((r) => r.runId === 'run-a');
    expect(closed).toMatchObject({ status: 'failed', error: expect.stringMatching(/cut off by a restore/) });
    expect(closed?.retryAt).toBeUndefined();
    expect(events.find((e) => e.eventType === 'job-failed')).toBeTruthy();

    // The next slot after the restore runs as usual.
    clock = Date.parse('2026-10-09T13:00:30Z');
    await restored.tick();
    await restored.whenIdle();
    expect(t.slots).toEqual(['2026-10-09T13:00:00.000Z']);
  });
});
