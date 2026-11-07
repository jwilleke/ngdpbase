/**
 * #2294 — a refused page write is logged with the page name the caller sent.
 * Escaping a CR or LF in it is the logger's job (FileLoggingProvider), for every
 * line; see FileLoggingProvider.test.ts.
 */
import PolicyInformationPoint from '../PolicyInformationPoint';

describe('PolicyInformationPoint.recordPageRefusal log line (#2294)', () => {
  test('an ordinary page name is logged unchanged', async () => {
    const warn = vi.fn();
    const pip = new PolicyInformationPoint({ getManager: vi.fn(() => null), logger: { warn } });
    await pip.recordPageRefusal(null, 'Main Page', 'page-edit', 'capability_deny');
    expect(String(warn.mock.calls[0][0])).toBe('ACL decision: user=anonymous page=Main Page action=page-edit allowed=false reason=capability_deny');
  });
});
