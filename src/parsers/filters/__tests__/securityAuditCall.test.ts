/**
 * #1115 — the two callers of AuditManager.logSecurityEvent pass one argument
 * against a local interface that declares a one-argument signature.
 *
 * SecurityFilter.ts and SpamFilter.ts each declare their own `AuditManager`
 * interface shaped `(violation) => void`. The real method is
 * `logSecurityEvent(context, eventType, severity, description)`, so `tsc` is
 * satisfied and at runtime the last three arguments are `undefined`: every
 * security violation and every spam detection produced an audit event with no
 * severity, no description, and no security event type.
 *
 * Same shape as #1104, #1106 and #1113 — a local declaration lying about a
 * real class, with nothing checking.
 */
import SecurityFilter from '../SecurityFilter';
import SpamFilter from '../SpamFilter';

type Call = [unknown, string, string, string];

function engineWithAudit(calls: Call[]) {
  return {
    getManager: (name: string) => (name === 'AuditManager'
      ? { logSecurityEvent: (...args: Call) => { calls.push(args); } }
      : null)
  };
}

describe('#1115 security audit calls carry severity and a type', () => {
  test('SecurityFilter passes the violation type, severity and a description', () => {
    const calls: Call[] = [];
    const filter = new SecurityFilter({});
    (filter as unknown as { logSecurityViolation: (a: string, b: string, c: unknown) => void })
      .logSecurityViolation('<script>x</script>', 'x', {
        pageName: 'Test Page', userName: 'alice', engine: engineWithAudit(calls)
      });

    expect(calls).toHaveLength(1);
    const [context, eventType, severity, description] = calls[0];
    expect(eventType).toBe('SECURITY_FILTER_VIOLATION');
    expect(severity).toBe('medium');
    expect(typeof description).toBe('string');
    expect(description.length).toBeGreaterThan(0);
    expect(context).toMatchObject({ resource: 'Test Page' });
  });

  test('SpamFilter passes its computed severity, not undefined', () => {
    // severity is spamScore > 100 ? 'high' : 'medium' — the caller already
    // computes it and was throwing it away.
    const calls: Call[] = [];
    const filter = new SpamFilter({});
    (filter as unknown as { logSpamAttempt: (a: string, b: unknown, c: unknown) => void })
      .logSpamAttempt(
        'content',
        { spamScore: 150, reasons: ['too many links'], analysis: {} },
        { pageName: 'Spam Page', userName: 'bob', engine: engineWithAudit(calls) }
      );

    expect(calls).toHaveLength(1);
    const [, eventType, severity] = calls[0];
    expect(eventType).toBe('SPAM_ATTEMPT');
    expect(severity).toBe('high');
  });
});
