import { assessPreviousRun, buildLifecycleAuditEvent } from '../auditLifecycle';

/**
 * #1149 — nothing recorded that a process started or stopped, so an unclean
 * exit was undetectable.
 *
 * That matters because of #1148: on an unclean exit the buffered audit records
 * are lost, the chain resumes cleanly from the last WRITTEN record at boot,
 * verification passes, and nothing shows anything is absent. The log does not
 * lie about what it holds — it simply cannot say that records are missing.
 *
 * A start with no matching shutdown before it says exactly that.
 */
describe('#1149 — assessPreviousRun', () => {
  const at = (iso: string) => ({ timestamp: iso });

  test('no history at all is not an unclean exit', () => {
    // A first boot must not accuse itself. "none" and "unclean" are different
    // facts and reporting the first as the second cries wolf on every new
    // instance.
    expect(assessPreviousRun(null, null)).toBe('none');
  });

  test('a start with no shutdown after it is unclean', () => {
    expect(assessPreviousRun(at('2026-09-01T10:00:00Z'), null)).toBe('unclean');
  });

  test('a shutdown after the last start is clean', () => {
    expect(assessPreviousRun(at('2026-09-01T10:00:00Z'), at('2026-09-01T11:00:00Z'))).toBe('clean');
  });

  test('a shutdown BEFORE the last start is unclean', () => {
    // The instance shut down cleanly once, started again, and died. The stale
    // shutdown record must not be read as covering the later run.
    expect(assessPreviousRun(at('2026-09-01T12:00:00Z'), at('2026-09-01T11:00:00Z'))).toBe('unclean');
  });

  test('a shutdown with no start is unknown rather than clean', () => {
    // Only reachable through a truncated or rotated log. Claiming "clean" from
    // half the evidence is the failure this issue exists to prevent.
    expect(assessPreviousRun(null, at('2026-09-01T11:00:00Z'))).toBe('unknown');
  });

  test('identical timestamps do not read as clean', () => {
    // Same-millisecond records cannot establish ordering, so the safe reading
    // is that the shutdown did not demonstrably follow the start.
    expect(assessPreviousRun(at('2026-09-01T10:00:00Z'), at('2026-09-01T10:00:00Z'))).toBe('unclean');
  });

  test('an unparseable timestamp is unknown, not clean', () => {
    expect(assessPreviousRun(at('not-a-date'), at('2026-09-01T11:00:00Z'))).toBe('unknown');
  });
});

describe('#1197 — lifecycle records name the principal and the origin', () => {
  test('the system principal from .env, not the literal, and origin boot', () => {
    const event = buildLifecycleAuditEvent({ phase: 'start', version: '4.16.0', pid: 1, principal: 'svc-ngdpbase' });
    expect(event.user).toBe('svc-ngdpbase');
    expect(event.metadata.origin).toBe('boot');
  });
});

describe('#1149 — buildLifecycleAuditEvent', () => {
  test('a shutdown event names itself and carries the run', () => {
    const event = buildLifecycleAuditEvent({ phase: 'shutdown', version: '4.12.2', pid: 4242 });
    expect(event.eventType).toBe('system-shutdown');
    expect(event.user).toBe('system');
    expect(event.result).toBe('success');
    expect(event.metadata.version).toBe('4.12.2');
    expect(event.metadata.pid).toBe(4242);
  });

  test('a start reports what it found of the previous run', () => {
    const event = buildLifecycleAuditEvent({
      phase: 'start', version: '4.12.2', pid: 1, previousRun: 'unclean'
    });
    expect(event.eventType).toBe('system-start');
    expect(event.metadata.previousRun).toBe('unclean');
  });

  test('an unclean predecessor raises the severity', () => {
    // A reader scanning by severity must find the boot that follows a crash.
    const clean = buildLifecycleAuditEvent({ phase: 'start', version: '1', pid: 1, previousRun: 'clean' });
    const unclean = buildLifecycleAuditEvent({ phase: 'start', version: '1', pid: 1, previousRun: 'unclean' });
    expect(clean.severity).toBe('low');
    expect(unclean.severity).toBe('high');
  });

  test('an unclean predecessor says records may be missing', () => {
    // The point of the event: it cannot recover the lost records, but it can
    // mark the window in which records may be absent (#1148).
    const event = buildLifecycleAuditEvent({
      phase: 'start', version: '1', pid: 1, previousRun: 'unclean'
    });
    expect(event.metadata.recordsMayBeMissing).toBe(true);
  });

  test('a clean predecessor does not claim records are missing', () => {
    const event = buildLifecycleAuditEvent({
      phase: 'start', version: '1', pid: 1, previousRun: 'clean'
    });
    expect(event.metadata.recordsMayBeMissing).toBe(false);
  });

  test('a shutdown carries no previousRun — it is not a claim about the past', () => {
    const event = buildLifecycleAuditEvent({ phase: 'shutdown', version: '1', pid: 1 });
    expect(event.metadata).not.toHaveProperty('previousRun');
  });
});
