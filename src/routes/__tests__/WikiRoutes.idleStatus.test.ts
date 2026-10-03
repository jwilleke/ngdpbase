/**
 * #1546 — the idle-timeout endpoints: status reports what is left without
 * counting as activity; keepalive counts as activity and needs a signed-in
 * caller (profile-manage).
 */
import WikiRoutes from '../WikiRoutes';

const res = (idleTimeoutMs: number) => ({
  locals: { idleTimeoutMs },
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis()
});

const routes = (granted: string[]) => {
  const r = new WikiRoutes({ getManager: vi.fn(() => null) });
  vi.spyOn(r as never, 'createWikiContext').mockReturnValue({
    hasPermission: (p: string) => Promise.resolve(granted.includes(p))
  });
  vi.spyOn(r as never, 'renderError').mockImplementation((async () => undefined) as never);
  return r as unknown as { idleStatus(q: unknown, s: unknown): void; keepAlive(q: unknown, s: unknown): Promise<void> };
};

describe('idle-timeout endpoints (#1546)', () => {
  test('status: signed in with a limit reports what is left and when to warn', () => {
    const s = res(15 * 60_000);
    routes([]).idleStatus({ session: { username: 'molly', isAuthenticated: true, lastActivity: Date.now() - 5 * 60_000 } }, s);
    const body = s.json.mock.calls[0][0] as { signedIn: boolean; limited: boolean; remainingMs: number; warnBeforeMs: number };
    expect(body.signedIn).toBe(true);
    expect(body.limited).toBe(true);
    expect(body.remainingMs).toBeGreaterThan(9 * 60_000);
    expect(body.remainingMs).toBeLessThanOrEqual(10 * 60_000);
    expect(body.warnBeforeMs).toBe(2 * 60_000);
  });

  test('status: no limit is reported as unlimited', () => {
    const s = res(0);
    routes([]).idleStatus({ session: { username: 'molly', isAuthenticated: true } }, s);
    expect(s.json).toHaveBeenCalledWith(expect.objectContaining({ signedIn: true, limited: false, remainingMs: null }));
  });

  test('status: a signed-out caller is told so', () => {
    const s = res(15 * 60_000);
    routes([]).idleStatus({ session: {} }, s);
    expect(s.json).toHaveBeenCalledWith(expect.objectContaining({ signedIn: false }));
  });

  test('keepalive: records activity now', async () => {
    const session = { username: 'molly', isAuthenticated: true, lastActivity: 1 };
    const s = res(15 * 60_000);
    await routes(['profile-manage']).keepAlive({ session }, s);
    expect(Date.now() - session.lastActivity).toBeLessThan(5000);
    expect(s.json).toHaveBeenCalledWith(expect.objectContaining({ signedIn: true }));
  });

  test('keepalive: refused without profile-manage, and nothing is touched', async () => {
    const session = { username: 'anonymous', isAuthenticated: false, lastActivity: 1 };
    await routes([]).keepAlive({ session, headers: {}, accepts: () => 'json' }, res(15 * 60_000));
    expect(session.lastActivity).toBe(1);
  });
});
