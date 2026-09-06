/**
 * BackgroundJobManager tests
 *
 * @jest-environment node
 */
import BackgroundJobManager from '../BackgroundJobManager';
import { jobContextFromRequest } from '../../context/JobContext';

/**
 * #631: enqueue now requires a JobContext. These tests are about job mechanics,
 * not provenance — provenance has its own suite in backgroundJobProvenance.test.ts —
 * so one shared requester keeps them testing what they were written to test.
 */
const TEST_REQUESTER = jobContextFromRequest({ username: 'tester' });
import type { WikiEngine } from '../../types/WikiEngine';

function makeEngine(notificationManager?: unknown): WikiEngine {
  return {
    getManager: vi.fn((name: string) => {
      if (name === 'NotificationManager') return notificationManager ?? null;
      return null;
    })
  };
}

async function makeManager(notificationManager?: unknown): Promise<BackgroundJobManager> {
  const mgr = new BackgroundJobManager(makeEngine(notificationManager));
  await mgr.initialize();
  return mgr;
}

describe('BackgroundJobManager', () => {
  describe('initialize()', () => {
    test('initializes without error', async () => {
      const mgr = await makeManager();
      expect(mgr).toBeDefined();
    });
  });

  describe('registerJob()', () => {
    test('registers a job and it appears in getRegisteredJobIds()', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'test.job', displayName: 'Test Job', run: async () => ({ success: true }) });
      expect(mgr.getRegisteredJobIds()).toContain('test.job');
    });

    test('overwrites existing job without throwing', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'dup.job', displayName: 'First', run: async () => ({ success: true }) });
      expect(() => mgr.registerJob({ id: 'dup.job', displayName: 'Second', run: async () => ({ success: true }) }))
        .not.toThrow();
    });
  });

  describe('enqueue()', () => {
    test('throws for unknown jobId', async () => {
      const mgr = await makeManager();
      await expect(mgr.enqueue('unknown.job', TEST_REQUESTER)).rejects.toThrow("unknown job 'unknown.job'");
    });

    test('returns a runId string for registered job', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'quick.job', displayName: 'Quick', run: async () => ({ success: true }) });
      const runId = await mgr.enqueue('quick.job', TEST_REQUESTER);
      expect(typeof runId).toBe('string');
      expect(runId.length).toBeGreaterThan(0);
    });

    test('returns same runId when job already active', async () => {
      const mgr = await makeManager();
      let resolveFn!: () => void;
      const slowJob = new Promise<void>(r => { resolveFn = r; });
      mgr.registerJob({ id: 'slow.job', displayName: 'Slow', run: () => slowJob.then(() => ({ success: true })) });

      const runId1 = await mgr.enqueue('slow.job', TEST_REQUESTER);
      const runId2 = await mgr.enqueue('slow.job', TEST_REQUESTER);
      expect(runId1).toBe(runId2);
      resolveFn();
    });

    test('creates a new run when previous run has completed', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'fast.job', displayName: 'Fast', run: async () => ({ success: true }) });
      const runId1 = await mgr.enqueue('fast.job', TEST_REQUESTER);

      // Wait for job to complete
      await new Promise(r => setTimeout(r, 50));

      const runId2 = await mgr.enqueue('fast.job', TEST_REQUESTER);
      expect(runId2).not.toBe(runId1);
    });
  });

  describe('#1238 — a caller with no context cannot take the host down', () => {
    test('enqueue with no context is refused as a failed run, not thrown', async () => {
      const mgr = await makeManager();
      let ran = false;
      mgr.registerJob({ id: 'guarded.job', displayName: 'Guarded', run: async () => { ran = true; return { success: true }; } });

      // The shape the geohazardwatch addon used: one argument, from a timer, unawaited.
      const runId = await (mgr as unknown as { enqueue: (id: string) => Promise<string> }).enqueue('guarded.job');
      await new Promise((r) => setTimeout(r, 20));

      const run = mgr.getStatus(runId);
      expect(run?.status).toBe('failed');
      expect(run?.result?.error).toContain('without a JobContext');
      expect(ran).toBe(false);
      // A later, correct call still runs — the refusal left no stuck "active" entry.
      const okId = await mgr.enqueue('guarded.job', TEST_REQUESTER);
      await new Promise((r) => setTimeout(r, 20));
      expect(mgr.getStatus(okId)?.status).toBe('completed');
      expect(ran).toBe(true);
    });

    test('a non-context object is refused the same way', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'guarded2.job', displayName: 'Guarded', run: async () => ({ success: true }) });
      const runId = await mgr.enqueue('guarded2.job', { nope: true });
      expect(mgr.getStatus(runId)?.status).toBe('failed');
    });

    test('a job that throws outside its own handler becomes a failed run, not an unhandled rejection', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'boom.job', displayName: 'Boom', run: async () => ({ success: true }) });
      // Break the logging step executeJob runs before its try/catch.
      const runId = await mgr.enqueue('boom.job', { ...TEST_REQUESTER, get viaToken(): never { throw new Error('poisoned context'); } } as never);
      await new Promise((r) => setTimeout(r, 20));
      const run = mgr.getStatus(runId);
      expect(run?.status).toBe('failed');
      expect(run?.result?.error).toContain('poisoned context');
      // The job id is free again.
      const again = await mgr.enqueue('boom.job', TEST_REQUESTER);
      expect(again).not.toBe(runId);
    });
  });

  describe('getStatus()', () => {
    test('returns null for unknown runId', async () => {
      const mgr = await makeManager();
      expect(mgr.getStatus('nonexistent-run')).toBeNull();
    });

    test('returns run object for known runId', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'status.job', displayName: 'Status Test', run: async () => ({ success: true }) });
      const runId = await mgr.enqueue('status.job', TEST_REQUESTER);
      const status = mgr.getStatus(runId);
      expect(status).not.toBeNull();
      expect(status!.runId).toBe(runId);
      expect(status!.jobId).toBe('status.job');
    });

    test('run transitions to completed status', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'complete.job', displayName: 'Complete Job', run: async () => ({ success: true, summary: 'done' }) });
      const runId = await mgr.enqueue('complete.job', TEST_REQUESTER);

      await new Promise(r => setTimeout(r, 50));
      const status = mgr.getStatus(runId);
      expect(status!.status).toBe('completed');
      expect(status!.result?.success).toBe(true);
    });

    test('run transitions to failed status on error result', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'fail.result', displayName: 'Fail Result', run: async () => ({ success: false, error: 'something went wrong' }) });
      const runId = await mgr.enqueue('fail.result', TEST_REQUESTER);

      await new Promise(r => setTimeout(r, 50));
      const status = mgr.getStatus(runId);
      expect(status!.status).toBe('failed');
      expect(status!.result?.success).toBe(false);
    });

    test('run transitions to failed status when job throws', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'throw.job', displayName: 'Throw Job', run: async () => { throw new Error('crash'); } });
      const runId = await mgr.enqueue('throw.job', TEST_REQUESTER);

      await new Promise(r => setTimeout(r, 50));
      const status = mgr.getStatus(runId);
      expect(status!.status).toBe('failed');
      expect(status!.result?.error).toContain('crash');
    });

    test('reportProgress updates run.progress', async () => {
      const mgr = await makeManager();
      mgr.registerJob({
        id: 'progress.job',
        displayName: 'Progress Job',
        run: async (reportProgress) => {
          reportProgress('step 1 of 3');
          return { success: true };
        }
      });
      await mgr.enqueue('progress.job', TEST_REQUESTER);
      await new Promise(r => setTimeout(r, 50));
    });
  });

  describe('getActiveJobs()', () => {
    test('returns empty array when no jobs running', async () => {
      const mgr = await makeManager();
      expect(mgr.getActiveJobs()).toEqual([]);
    });

    test('returns active jobs while running', async () => {
      const mgr = await makeManager();
      let resolveFn!: () => void;
      const slowJob = new Promise<void>(r => { resolveFn = r; });
      mgr.registerJob({ id: 'active.job', displayName: 'Active Job', run: () => slowJob.then(() => ({ success: true })) });
      await mgr.enqueue('active.job', TEST_REQUESTER);

      const active = mgr.getActiveJobs();
      expect(active.length).toBe(1);
      expect(active[0].jobId).toBe('active.job');
      resolveFn();
    });
  });

  describe('getRegisteredJobIds()', () => {
    test('returns empty array before any jobs registered', async () => {
      const mgr = await makeManager();
      expect(mgr.getRegisteredJobIds()).toEqual([]);
    });

    test('returns all registered job ids', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'job.a', displayName: 'A', run: async () => ({ success: true }) });
      mgr.registerJob({ id: 'job.b', displayName: 'B', run: async () => ({ success: true }) });
      const ids = mgr.getRegisteredJobIds();
      expect(ids).toContain('job.a');
      expect(ids).toContain('job.b');
    });
  });

  describe('shutdown()', () => {
    test('shuts down without error when no active jobs', async () => {
      const mgr = await makeManager();
      await expect(mgr.shutdown()).resolves.not.toThrow();
    });

    test('shuts down with active jobs (warns but does not throw)', async () => {
      const mgr = await makeManager();
      let resolveFn!: () => void;
      const slowJob = new Promise<void>(r => { resolveFn = r; });
      mgr.registerJob({ id: 'shutdown.job', displayName: 'Shutdown Job', run: () => slowJob.then(() => ({ success: true })) });
      await mgr.enqueue('shutdown.job', TEST_REQUESTER);

      await expect(mgr.shutdown()).resolves.not.toThrow();
      resolveFn();
    });
  });

  describe('notification integration', () => {
    test('posts notification on successful job completion', async () => {
      const addNotification = vi.fn().mockResolvedValue('notif-id');
      const mgr = await makeManager({ addNotification });
      mgr.registerJob({ id: 'notify.job', displayName: 'Notify', run: async () => ({ success: true, summary: 'all good' }) });
      await mgr.enqueue('notify.job', TEST_REQUESTER);

      await new Promise(r => setTimeout(r, 50));
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'info', title: 'Notify complete' })
      );
    });

    test('posts error notification on failed job', async () => {
      const addNotification = vi.fn().mockResolvedValue('notif-id');
      const mgr = await makeManager({ addNotification });
      mgr.registerJob({ id: 'fail.notify', displayName: 'Fail Notify', run: async () => ({ success: false, error: 'oops' }) });
      await mgr.enqueue('fail.notify', TEST_REQUESTER);

      await new Promise(r => setTimeout(r, 50));
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error' })
      );
    });

    test('tolerates missing NotificationManager gracefully', async () => {
      const mgr = await makeManager(); // no notification manager
      mgr.registerJob({ id: 'no.notif', displayName: 'No Notif', run: async () => ({ success: true }) });
      const runId = await mgr.enqueue('no.notif', TEST_REQUESTER);

      await new Promise(r => setTimeout(r, 50));
      expect(mgr.getStatus(runId)?.status).toBe('completed');
    });
  });
});
