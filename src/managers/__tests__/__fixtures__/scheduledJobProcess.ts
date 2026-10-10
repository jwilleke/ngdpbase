/**
 * A server process, cut down to its scheduler, for the shutdown handoff tests
 * (#1717). It starts the 10:00 slot of an hourly job, saves a checkpoint, says
 * RUNNING on stdout, and waits — for its abort signal (`cooperative`), or for
 * ever (`stubborn`). SIGTERM and SIGINT shut it down the way app.ts does:
 * `shutdown()`, then exit.
 *
 * Usage: tsx scheduledJobProcess.ts <state dir> <cooperative|stubborn> [hand]
 *
 * With `hand` (#1746) the job has no schedule: it is started by hand, by
 * `enqueue`, as jim, and declares itself safe to run again (`persist: true`).
 *
 * The clock is fixed, and shared with the test through the state's times, so
 * the parent can carry on the same timeline after this process is gone.
 */
import BackgroundJobManager from '../../BackgroundJobManager.js';
import FileJobStateProvider from '../../../providers/FileJobStateProvider.js';

const [stateDir, mode, started] = process.argv.slice(2);
const byHand = started === 'hand';
let clock = Date.parse('2026-10-09T09:30:00Z');
const now = (): number => clock;

const settings: Record<string, unknown> = { 'ngdpbase.default.timezone': 'UTC', 'ngdpbase.jobs.shutdown-grace-ms': 300 };
const engine = {
  getManager: (name: string) => (name === 'ConfigurationManager'
    ? { getProperty: (key: string, fallback: unknown) => (key in settings ? settings[key] : fallback) }
    : null)
} as never;

const manager = new BackgroundJobManager(engine, {
  stateProvider: new FileJobStateProvider(stateDir, { now }),
  now: () => new Date(clock),
  checkpointThrottleMs: 0
});

manager.registerJob({
  id: 'test.close',
  displayName: 'Close',
  ...(byHand ? { persist: true, permission: 'admin-system' } : { schedule: 'hourly' }),
  run: (_progress, ctx) => new Promise((resolve) => {
    ctx.checkpoint({ doneThrough: 311 });
    process.stdout.write('RUNNING\n');
    if (mode === 'cooperative') {
      ctx.signal.addEventListener('abort', () => resolve({ success: false, error: 'stopped' }));
    }
    // stubborn: never settles, as a job that ignores its signal.
  })
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void manager.shutdown().then(() => process.exit(0));
  });
}

if (byHand) {
  clock = Date.parse('2026-10-09T10:00:05Z');
  await manager.enqueue('test.close', { username: 'jim', origin: 'request', requestedAt: '2026-10-09T10:00:05.000Z' });
} else {
  await manager.tick();
  clock = Date.parse('2026-10-09T10:00:05Z');
  await manager.tick();
}
// Keep the process alive until a signal ends it.
setInterval(() => undefined, 60_000);
