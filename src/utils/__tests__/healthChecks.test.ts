import { describe, it, expect, vi } from 'vitest';
import { buildReadinessReport, runReadinessChecks, type ReadinessCheck } from '../healthChecks.js';

/**
 * #1079 — the container and k8s probes pointed at `/`, a full page render
 * through session lookup, AuthManager, ACLManager, the rendering pipeline and
 * the template layer, accepting 200 *or* 302.
 *
 * That is wrong in both directions: an instance that redirects everything
 * (including a misconfigured one) reads as healthy because 302 passes, while
 * a slow render under load fails the 10s probe timeout and gets a healthy pod
 * pulled from rotation. It also cannot express "process is up, page index is
 * still loading, do not send traffic yet".
 *
 * These pin the readiness contract. Liveness needs no test beyond "returns
 * 200 unconditionally" — it deliberately checks nothing, because if the route
 * cannot answer, the process is wedged, which is exactly what liveness
 * detects.
 */
describe('buildReadinessReport', () => {
  it('is ready with HTTP 200 when every check passes', () => {
    const report = buildReadinessReport({ pageProvider: true, dataDirWritable: true });
    expect(report.status).toBe('ok');
    expect(report.httpStatus).toBe(200);
    expect(report.checks).toEqual({ pageProvider: true, dataDirWritable: true });
  });

  it('is not ready with HTTP 503 when any check fails', () => {
    // 503 is the point: it removes the pod from rotation as a circuit breaker
    // WITHOUT terminating it, which is what distinguishes readiness from
    // liveness. A failing dependency should stop traffic, not restart the app.
    const report = buildReadinessReport({ pageProvider: false, dataDirWritable: true });
    expect(report.status).toBe('not-ready');
    expect(report.httpStatus).toBe(503);
  });

  it('names which check failed rather than reporting a bare status', () => {
    const report = buildReadinessReport({ pageProvider: false, dataDirWritable: true });
    expect(report.failed).toEqual(['pageProvider']);
  });

  it('lists every failing check, not just the first', () => {
    const report = buildReadinessReport({ pageProvider: false, dataDirWritable: false });
    expect(report.failed).toEqual(['pageProvider', 'dataDirWritable']);
  });

  it('reports no failures when ready', () => {
    expect(buildReadinessReport({ a: true }).failed).toEqual([]);
  });

  it('treats an empty check set as ready rather than throwing', () => {
    // Degenerate but reachable if every check is somehow skipped. Answering
    // "ready" matches the liveness philosophy: absence of a known problem is
    // not itself a problem.
    const report = buildReadinessReport({});
    expect(report.status).toBe('ok');
    expect(report.httpStatus).toBe(200);
  });
});

describe('runReadinessChecks', () => {
  it('runs each check and collects its boolean result', async () => {
    const checks: ReadinessCheck[] = [
      { name: 'alpha', run: () => true },
      { name: 'beta', run: () => false }
    ];
    expect(await runReadinessChecks(checks)).toEqual({ alpha: true, beta: false });
  });

  it('awaits async checks', async () => {
    const checks: ReadinessCheck[] = [{ name: 'slow', run: async () => true }];
    expect(await runReadinessChecks(checks)).toEqual({ slow: true });
  });

  it('treats a throwing check as failed rather than propagating', async () => {
    // A readiness probe that 500s tells the orchestrator nothing useful. A
    // check that blew up has not demonstrated readiness, so it is false.
    const checks: ReadinessCheck[] = [
      { name: 'boom', run: () => { throw new Error('nope'); } },
      { name: 'fine', run: () => true }
    ];
    expect(await runReadinessChecks(checks)).toEqual({ boom: false, fine: true });
  });

  it('treats a rejecting async check as failed', async () => {
    const checks: ReadinessCheck[] = [
      { name: 'rejects', run: () => Promise.reject(new Error('nope')) }
    ];
    expect(await runReadinessChecks(checks)).toEqual({ rejects: false });
  });

  it('coerces a truthy non-boolean result to a boolean', async () => {
    const checks: ReadinessCheck[] = [
      { name: 'obj', run: () => ({ some: 'provider' }) as unknown as boolean }
    ];
    expect(await runReadinessChecks(checks)).toEqual({ obj: true });
  });

  it('runs every check even when an earlier one throws', async () => {
    const later = vi.fn().mockReturnValue(true);
    const checks: ReadinessCheck[] = [
      { name: 'boom', run: () => { throw new Error('nope'); } },
      { name: 'later', run: later }
    ];
    await runReadinessChecks(checks);
    expect(later).toHaveBeenCalled();
  });
});
