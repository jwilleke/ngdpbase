/**
 * #631 — the job manager records who asked, and it reaches the audit log.
 *
 * `enqueue` took a job id alone, so all three jobs landed in the audit log with
 * nobody attached. These assert the end of that: the context reaches the run
 * record, and the audit event carries the origin and the delegating token.
 */
vi.unmock('../BackgroundJobManager');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BackgroundJobManager, { type JobRunContext } from '../BackgroundJobManager';
import FileJobStateProvider from '../../providers/FileJobStateProvider';
import { jobContextFromRequest, jobContextFromSystem, type JobContext } from '../../context/JobContext';

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

    const started = events.find((e) => e.eventType === 'job-started');
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
    await m.enqueue('test.job', jobContextFromSystem('svc-ngdpbase', 'scheduled sweep'));
    await settle();
    const done = events.find((e) => e.eventType === 'job-completed');
    expect(done).toBeDefined();
    expect((done?.metadata as Record<string, unknown>).reason).toBe('scheduled sweep');
  });

  test('a missing AuditManager does not break the job', async () => {
    // Early boot has no AuditManager. recordAuditEvent treats an absent sink as
    // a configuration state, not a failure — the job must still run.
    const m = new BackgroundJobManager({ getManager: () => null });
    m.registerJob({ id: 'j', displayName: 'J', run: () => Promise.resolve({ success: true }) });
    const runId = await m.enqueue('j', jobContextFromSystem('svc-ngdpbase', 'boot'));
    await settle();
    expect(m.getStatus(runId)?.status).toBe('completed');
  });
});

describe('#1667 — the requester\'s address reaches the job records', () => {
  test('every job record carries the address the request came from', async () => {
    const { m, events } = makeManager();
    await m.enqueue('test.job', jobContextFromRequest({ username: 'jim', ipAddress: '203.0.113.7' }));
    await settle();
    for (const type of ['job-started', 'job-completed']) {
      expect(events.find((e) => e.eventType === type)?.ipAddress, type).toBe('203.0.113.7');
    }
  });

  test('a job with no request behind it records no address', async () => {
    const { m, events } = makeManager();
    await m.enqueue('test.job', jobContextFromSystem('svc-ngdpbase', 'scheduled sweep'));
    await settle();
    expect(events.find((e) => e.eventType === 'job-started')?.ipAddress).toBeUndefined();
  });
});

/**
 * #2047 — a job carries no key handle, and none is written to its run record.
 * The proxy claim's `keyHandle` names where the actor's session holds the key
 * copy for the user represented; a job must not reach it, nor save it.
 *
 * A real FileJobStateProvider over this test's own temp directory, so the
 * record is read back from disk. Sabotaged once (then restored): the
 * `withoutKeyHandle` in `startHandRun` removed — the context below is built by
 * hand, so the handle reached the job and the file, and both went red.
 */
describe('#2047 — no key handle reaches a job or its run record', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-2047-jobs-')); });
  // Only this test's own temp directory.
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('a proxy-enqueued run: the job, the record on disk and the audit rows', async () => {
    const events: Record<string, unknown>[] = [];
    const engine = {
      getManager: (name: string) =>
        (name === 'AuditManager' ? { logAuditEvent: (e: Record<string, unknown>) => { events.push(e); return Promise.resolve('id'); } } : null)
    } as never;
    const state = new FileJobStateProvider(path.join(dir, 'jobs'));
    const m = new BackgroundJobManager(engine, { stateProvider: state });
    const seen: JobRunContext[] = [];
    m.registerJob({ id: 'test.job', displayName: 'Test Job', run: (_p, ctx) => { seen.push(ctx); return Promise.resolve({ success: true }); } });

    // Built by hand, as a caller that skipped jobContextFromRequest would: the handle is still in it.
    const asked: JobContext = {
      username: 'mom', origin: 'request', requestedAt: new Date().toISOString(),
      viaProxy: { kind: 'proxy', grantId: 'grant-1', actor: 'jim', scopes: ['page-read', 'vault-proxy'], keyHandle: 'h-jim' }
    };
    const runId = await m.enqueue('test.job', asked);
    // The file state is written before the work starts: wait for the run to finish.
    for (let i = 0; i < 100 && m.getStatus(runId)?.status !== 'completed'; i++) await settle();

    expect(seen).toHaveLength(1);
    expect(seen[0].viaProxy).toEqual({ kind: 'proxy', grantId: 'grant-1', actor: 'jim', scopes: ['page-read', 'vault-proxy'] });
    expect(m.getStatus(runId)?.requestedBy.viaProxy).not.toHaveProperty('keyHandle');

    const runs = await state.listRuns('test.job');
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0].requestedBy?.viaProxy?.actor).toBe('jim');
    const onDisk = fs.readdirSync(path.join(dir, 'jobs'), { recursive: true }).map(String)
      .filter(f => fs.statSync(path.join(dir, 'jobs', f)).isFile())
      .map(f => fs.readFileSync(path.join(dir, 'jobs', f), 'utf8')).join('\n');
    expect(onDisk).toContain('grant-1');
    expect(onDisk).not.toContain('h-jim');
    expect(onDisk).not.toContain('keyHandle');

    // The audit rows still name both users: the one represented and who acted.
    const started = events.find(e => e.eventType === 'job-started');
    expect(started?.user).toBe('mom');
    expect(started?.actor).toBe('jim');
    expect(JSON.stringify(events)).not.toContain('h-jim');
  });
});
