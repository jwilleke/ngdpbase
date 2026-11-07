/**
 * #2294 — a refused page write is logged with the page name the caller sent.
 * The logger writes a message as one raw line, so a CR or LF in the name would
 * start a line of its own. The log line carries them escaped; the audit row is
 * JSON and keeps the name as sent.
 */
import PolicyInformationPoint from '../PolicyInformationPoint';

describe('PolicyInformationPoint.recordPageRefusal log line (#2294)', () => {
  test('a CR or LF in the page name cannot start a log line of its own', async () => {
    const warn = vi.fn();
    const engine = { getManager: vi.fn(() => null), logger: { warn } };
    const pip = new PolicyInformationPoint(engine);
    await pip.recordPageRefusal({ username: 'anonymous', isAuthenticated: false }, 'P\r\n2026-01-01 [info]: forged line\nX', 'page-delete', 'capability_deny');
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).not.toMatch(/[\r\n]/);
    expect(line).toContain('page=P\\r\\n2026-01-01 [info]: forged line\\nX action=page-delete');
  });

  test('an ordinary page name is logged unchanged', async () => {
    const warn = vi.fn();
    const pip = new PolicyInformationPoint({ getManager: vi.fn(() => null), logger: { warn } });
    await pip.recordPageRefusal(null, 'Main Page', 'page-edit', 'capability_deny');
    expect(String(warn.mock.calls[0][0])).toBe('ACL decision: user=anonymous page=Main Page action=page-edit allowed=false reason=capability_deny');
  });
});
