/**
 * #631 — the job manager records who asked, and it reaches the audit log.
 *
 * `enqueue` took a job id alone, so all three jobs landed in the audit log with
 * nobody attached. These assert the end of that: the context reaches the run
 * record, and the audit event carries the origin and the delegating token.
 */
vi.unmock('../BackgroundJobManager');

import BackgroundJobManager from '../BackgroundJobManager';
import { jobContextFromRequest, jobContextFromSystem } from '../../context/JobContext';

const token = { id: 'tok-1', name: 'reader', scopes: ['page-read'] };

function makeManager() {
  const events: Record<string, unknown>[] = [];
  const engine = {
    getManager: (name: string) =>
      (name === 'AuditManager'
        ? { logAuditEvent: (e: Record<string, unknown>) => { events.push(e); return Promise.resolve('id'); } }
        : null)
  } as never;
  const m = new BackgroundJobManager(engine);
  m.registerJob({
    id: 'test.job',
    displayName: 'Test Job',
    run: () => Promise.resolve({ success: true, summary: 'done' })
  });
  return { m, events };
}

/** Wait for the fire-and-forget execution to settle. */
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('#631 — provenance reaches the run record and the audit log', () => {
  test('the run record names who asked', async () => {
    const { m } = makeManager();
    const runId = await m.enqueue('test.job', jobContextFromRequest({ username: 'jim' }));
    expect(m.getStatus(runId)?.requestedBy.username).toBe('jim');
    expect(m.getStatus(runId)?.requestedBy.origin).toBe('request');
  });

  test('the audit event carries origin and the delegating token', async () => {
    const { m, events } = makeManager();
    await m.enqueue('test.job', jobContextFromRequest({ username: 'jim', viaToken: token }));
    await settle();

    const started = events.find((e) => e.eventType === 'job.started');
    expect(started).toBeDefined();
    expect(started?.user).toBe('jim');
    const meta = started?.metadata as Record<string, unknown>;
    expect(meta.origin).toBe('request');
    expect(meta.jobId).toBe('test.job');
    // The token must survive into the record, or a token-triggered job is
    // indistinguishable from its owner acting directly.
    expect(meta.viaTokenId).toBe('tok-1');
    expect(meta.viaTokenName).toBe('reader');
  });

  test('a completed job records its outcome', async () => {
    const { m, events } = makeManager();
    await m.enqueue('test.job', jobContextFromSystem('scheduled sweep'));
    await settle();
    const done = events.find((e) => e.eventType === 'job.completed');
    expect(done).toBeDefined();
    expect((done?.metadata as Record<string, unknown>).reason).toBe('scheduled sweep');
  });

  test('a missing AuditManager does not break the job', async () => {
    // Early boot has no AuditManager. recordAuditEvent treats an absent sink as
    // a configuration state, not a failure — the job must still run.
    const m = new BackgroundJobManager({ getManager: () => null });
    m.registerJob({ id: 'j', displayName: 'J', run: () => Promise.resolve({ success: true }) });
    const runId = await m.enqueue('j', jobContextFromSystem('boot'));
    await settle();
    expect(m.getStatus(runId)?.status).toBe('completed');
  });
});
