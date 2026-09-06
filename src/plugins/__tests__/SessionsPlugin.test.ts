/**
 * Unit tests for SessionsPlugin (#330, #1246)
 *
 * The plugin reads SessionStatsManager in-process. There is no fetch, and the
 * first test proves it: a global fetch is installed as a tripwire and must
 * never be called.
 */

import SessionsPluginModule from '../SessionsPlugin';
import type { SimplePlugin } from '../types';
const SessionsPlugin = SessionsPluginModule as unknown as SimplePlugin;

type Stats = { hasStore: () => boolean; count: ReturnType<typeof vi.fn>; users: ReturnType<typeof vi.fn> };

function makeContext(stats: Partial<Stats> | null) {
  const full = stats && { hasStore: () => true, count: vi.fn(), users: vi.fn(), ...stats };
  return {
    engine: {
      getManager: vi.fn((name: string) => (name === 'SessionStatsManager' ? full : null)),
      logger: { error: vi.fn() }
    }
  };
}

describe('SessionsPlugin', () => {
  let fetchTripwire: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchTripwire = vi.fn(() => { throw new Error('SessionsPlugin must not make HTTP requests (#1246)'); });
    vi.stubGlobal('fetch', fetchTripwire);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // --- property=count (default) ---

  test('returns session count as string (default property), without any HTTP', async () => {
    const ctx = makeContext({ count: vi.fn().mockResolvedValue({ sessionCount: 5, distinctUsers: 5 }) });
    expect(await SessionsPlugin.execute(ctx, {})).toBe('5');
    expect(fetchTripwire).not.toHaveBeenCalled();
  });

  test('property=count returns sessionCount', async () => {
    const ctx = makeContext({ count: vi.fn().mockResolvedValue({ sessionCount: 3, distinctUsers: 2 }) });
    expect(await SessionsPlugin.execute(ctx, { property: 'count' })).toBe('3');
  });

  test('returns "0" when the store read fails', async () => {
    const ctx = makeContext({ count: vi.fn().mockRejectedValue(new Error('store down')) });
    expect(await SessionsPlugin.execute(ctx, {})).toBe('0');
    expect(ctx.engine.logger.error).toHaveBeenCalledWith(expect.stringContaining('store down'));
  });

  test('returns "0" when no store is attached', async () => {
    const ctx = makeContext({ hasStore: () => false });
    expect(await SessionsPlugin.execute(ctx, {})).toBe('0');
  });

  test('returns "0" when SessionStatsManager is absent', async () => {
    expect(await SessionsPlugin.execute(makeContext(null), {})).toBe('0');
  });

  // --- property=distinctusers ---

  test('property=distinctusers returns distinctUsers count', async () => {
    const ctx = makeContext({ count: vi.fn().mockResolvedValue({ sessionCount: 5, distinctUsers: 3 }) });
    expect(await SessionsPlugin.execute(ctx, { property: 'distinctUsers' })).toBe('3');
  });

  // --- property=users ---

  test('property=users reads the manager, not an endpoint', async () => {
    const users = vi.fn().mockResolvedValue({ users: ['alice'], anonymous: 0, total: 1 });
    const ctx = makeContext({ users });
    await SessionsPlugin.execute(ctx, { property: 'users' });
    expect(users).toHaveBeenCalledTimes(1);
    expect(fetchTripwire).not.toHaveBeenCalled();
  });

  test('property=users renders authenticated user links', async () => {
    const ctx = makeContext({ users: vi.fn().mockResolvedValue({ users: ['alice', 'bob'], anonymous: 0, total: 2 }) });
    const out = await SessionsPlugin.execute(ctx, { property: 'users' });
    expect(out).toContain('alice');
    expect(out).toContain('bob');
    expect(out).toContain('href');
  });

  test('property=users shows anonymous count when present', async () => {
    const ctx = makeContext({ users: vi.fn().mockResolvedValue({ users: [], anonymous: 3, total: 3 }) });
    const out = await SessionsPlugin.execute(ctx, { property: 'users' });
    expect(out).toContain('Anonymous');
    expect(out).toContain('3');
  });

  test('property=users shows both authenticated users and anonymous count', async () => {
    const ctx = makeContext({ users: vi.fn().mockResolvedValue({ users: ['alice'], anonymous: 2, total: 3 }) });
    const out = await SessionsPlugin.execute(ctx, { property: 'users' });
    expect(out).toContain('alice');
    expect(out).toContain('Anonymous');
    expect(out).toContain('2');
  });

  test('property=users with no sessions shows "No active sessions"', async () => {
    const ctx = makeContext({ users: vi.fn().mockResolvedValue({ users: [], anonymous: 0, total: 0 }) });
    expect(await SessionsPlugin.execute(ctx, { property: 'users' })).toContain('No active sessions');
  });

  test('property=users returns "0" when the store read fails', async () => {
    const ctx = makeContext({ users: vi.fn().mockRejectedValue(new Error('nope')) });
    expect(await SessionsPlugin.execute(ctx, { property: 'users' })).toContain('0');
  });

  test('property=users XSS: user names are escaped', async () => {
    const ctx = makeContext({ users: vi.fn().mockResolvedValue({ users: ['<script>alert(1)</script>'], anonymous: 0, total: 1 }) });
    const out = await SessionsPlugin.execute(ctx, { property: 'users' });
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  // --- metadata ---

  test('plugin metadata', () => {
    expect(SessionsPlugin.name).toBe('SessionsPlugin');
    expect(typeof SessionsPlugin.execute).toBe('function');
  });
});
