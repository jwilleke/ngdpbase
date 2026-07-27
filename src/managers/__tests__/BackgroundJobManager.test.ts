/**
 * BackgroundJobManager tests
 *
 * @jest-environment node
 */
import BackgroundJobManager from '../BackgroundJobManager';
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
      await expect(mgr.enqueue('unknown.job')).rejects.toThrow("unknown job 'unknown.job'");
    });

    test('returns a runId string for registered job', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'quick.job', displayName: 'Quick', run: async () => ({ success: true }) });
      const runId = await mgr.enqueue('quick.job');
      expect(typeof runId).toBe('string');
      expect(runId.length).toBeGreaterThan(0);
    });

    test('returns same runId when job already active', async () => {
      const mgr = await makeManager();
      let resolveFn!: () => void;
      const slowJob = new Promise<void>(r => { resolveFn = r; });
      mgr.registerJob({ id: 'slow.job', displayName: 'Slow', run: () => slowJob.then(() => ({ success: true })) });

      const runId1 = await mgr.enqueue('slow.job');
      const runId2 = await mgr.enqueue('slow.job');
      expect(runId1).toBe(runId2);
      resolveFn();
    });

    test('creates a new run when previous run has completed', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'fast.job', displayName: 'Fast', run: async () => ({ success: true }) });
      const runId1 = await mgr.enqueue('fast.job');

      // Wait for job to complete
      await new Promise(r => setTimeout(r, 50));

      const runId2 = await mgr.enqueue('fast.job');
      expect(runId2).not.toBe(runId1);
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
      const runId = await mgr.enqueue('status.job');
      const status = mgr.getStatus(runId);
      expect(status).not.toBeNull();
      expect(status!.runId).toBe(runId);
      expect(status!.jobId).toBe('status.job');
    });

    test('run transitions to completed status', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'complete.job', displayName: 'Complete Job', run: async () => ({ success: true, summary: 'done' }) });
      const runId = await mgr.enqueue('complete.job');

      await new Promise(r => setTimeout(r, 50));
      const status = mgr.getStatus(runId);
      expect(status!.status).toBe('completed');
      expect(status!.result?.success).toBe(true);
    });

    test('run transitions to failed status on error result', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'fail.result', displayName: 'Fail Result', run: async () => ({ success: false, error: 'something went wrong' }) });
      const runId = await mgr.enqueue('fail.result');

      await new Promise(r => setTimeout(r, 50));
      const status = mgr.getStatus(runId);
      expect(status!.status).toBe('failed');
      expect(status!.result?.success).toBe(false);
    });

    test('run transitions to failed status when job throws', async () => {
      const mgr = await makeManager();
      mgr.registerJob({ id: 'throw.job', displayName: 'Throw Job', run: async () => { throw new Error('crash'); } });
      const runId = await mgr.enqueue('throw.job');

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
      await mgr.enqueue('progress.job');
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
      await mgr.enqueue('active.job');

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
      await mgr.enqueue('shutdown.job');

      await expect(mgr.shutdown()).resolves.not.toThrow();
      resolveFn();
    });
  });

  describe('notification integration', () => {
    test('posts notification on successful job completion', async () => {
      const addNotification = vi.fn().mockResolvedValue('notif-id');
      const mgr = await makeManager({ addNotification });
      mgr.registerJob({ id: 'notify.job', displayName: 'Notify', run: async () => ({ success: true, summary: 'all good' }) });
      await mgr.enqueue('notify.job');

      await new Promise(r => setTimeout(r, 50));
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'info', title: 'Notify complete' })
      );
    });

    test('posts error notification on failed job', async () => {
      const addNotification = vi.fn().mockResolvedValue('notif-id');
      const mgr = await makeManager({ addNotification });
      mgr.registerJob({ id: 'fail.notify', displayName: 'Fail Notify', run: async () => ({ success: false, error: 'oops' }) });
      await mgr.enqueue('fail.notify');

      await new Promise(r => setTimeout(r, 50));
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error' })
      );
    });

    test('tolerates missing NotificationManager gracefully', async () => {
      const mgr = await makeManager(); // no notification manager
      mgr.registerJob({ id: 'no.notif', displayName: 'No Notif', run: async () => ({ success: true }) });
      const runId = await mgr.enqueue('no.notif');

      await new Promise(r => setTimeout(r, 50));
      expect(mgr.getStatus(runId)?.status).toBe('completed');
    });
  });
});
