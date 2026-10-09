/**
 * SessionStatsManager (#1246): the one implementation of "count sessions" and
 * "list session users", shared by the routes and SessionsPlugin.
 */
import SessionStatsManager, { countSessions, listSessionUsers, SessionStoreUnsupportedError } from '../SessionStatsManager';

const sessions = { a: { username: 'alice' }, b: { username: 'alice' }, c: {}, d: { username: 'bob' } };

const allStore = { all: (cb: (e: unknown, s?: unknown) => void) => cb(null, sessions) };
const lengthStore = { length: (cb: (e: unknown, n?: number) => void) => cb(null, 4) };
const bothStore = { ...allStore, ...lengthStore };
const failingStore = { all: (cb: (e: unknown) => void) => cb(new Error('disk')) };

describe('countSessions', () => {
  test('prefers length when present, distinctUsers equals the count on that path', async () => {
    expect(await countSessions(bothStore)).toEqual({ sessionCount: 4, distinctUsers: 4 });
  });
  test('falls back to all and counts distinct usernames plus one anonymous bucket', async () => {
    expect(await countSessions(allStore)).toEqual({ sessionCount: 4, distinctUsers: 3 });
  });
  test('accepts an array from all()', async () => {
    const arr = { all: (cb: (e: unknown, s?: unknown) => void) => cb(null, Object.values(sessions)) };
    expect(await countSessions(arr)).toEqual({ sessionCount: 4, distinctUsers: 3 });
  });
  test('refuses a store with neither method', async () => {
    await expect(countSessions({})).rejects.toBeInstanceOf(SessionStoreUnsupportedError);
  });
  test('propagates a store error', async () => {
    await expect(countSessions(failingStore)).rejects.toThrow('disk');
  });
});

describe('listSessionUsers', () => {
  test('sorted distinct usernames and the anonymous count', async () => {
    expect(await listSessionUsers(allStore)).toEqual({ users: ['alice', 'bob'], anonymous: 1, total: 4 });
  });
  test('length-only store: no names, every session anonymous', async () => {
    expect(await listSessionUsers(lengthStore)).toEqual({ users: [], anonymous: 4, total: 4 });
  });
  test('refuses a store with neither method', async () => {
    await expect(listSessionUsers({})).rejects.toBeInstanceOf(SessionStoreUnsupportedError);
  });
});

describe('SessionStatsManager', () => {
  const engine = {} as never;
  test('has no store until app.ts attaches one, and refuses to read without it', async () => {
    const m = new SessionStatsManager(engine);
    expect(m.hasStore()).toBe(false);
    await expect(m.count()).rejects.toThrow('not attached');
    await expect(m.users()).rejects.toThrow('not attached');
  });
  test('reads the attached store', async () => {
    const m = new SessionStatsManager(engine);
    m.attachStore(bothStore);
    expect(m.hasStore()).toBe(true);
    expect(await m.count()).toEqual({ sessionCount: 4, distinctUsers: 4 });
    expect(await m.users()).toEqual({ users: ['alice', 'bob'], anonymous: 1, total: 4 });
  });
});

describe('liveSessionHandles (#1626)', () => {
  test('reads handles through all() where the store has it', async () => {
    const { liveSessionHandles } = await import('../SessionStatsManager');
    const store = { all: (cb: (e: unknown, s?: unknown) => void) => cb(null, { a: { privateStoreHandle: 'h1' }, b: {}, c: { privateStoreHandle: 'h2' } }) };
    expect([...(await liveSessionHandles(store))].sort()).toEqual(['h1', 'h2']);
  });

  test('a store with list() and get() but no all() is read session by session; an unreadable one is left out', async () => {
    const { liveSessionHandles } = await import('../SessionStatsManager');
    const sessions: Record<string, unknown> = { s1: { privateStoreHandle: 'h1' }, s2: { privateStoreHandle: 'h2' }, s3: {} };
    const store = {
      list: (cb: (e: unknown, f?: string[]) => void) => cb(null, ['s1.json', 's2.json', 's3.json', 'bad.json']),
      get: (sid: string, cb: (e: unknown, s?: unknown) => void) => (sid === 'bad' ? cb(new Error('corrupt')) : cb(null, sessions[sid]))
    };
    expect([...(await liveSessionHandles(store))].sort()).toEqual(['h1', 'h2']);
  });

  test('works against the real session-file-store, the default store', async () => {
    const { liveSessionHandles } = await import('../SessionStatsManager');
    const os = await import('os');
    const fsMod = await import('fs');
    const pathMod = await import('path');
    const session = (await import('express-session')).default;
    const FileStore = (await import('session-file-store')).default(session);
    const dir = fsMod.mkdtempSync(pathMod.join(os.tmpdir(), 'ngdpbase-1626-'));
    try {
      const store = new FileStore({ path: dir, logFn: () => undefined, retries: 0 });
      const put = (sid: string, data: Record<string, unknown>) => new Promise<void>((resolve, reject) =>
        store.set(sid, { cookie: { maxAge: 60000, expires: new Date(Date.now() + 60000) }, ...data } as never, (e: unknown) => (e ? reject(e instanceof Error ? e : new Error(String(e))) : resolve())));
      await put('one', { privateStoreHandle: 'live-1' });
      await put('two', { privateStoreHandle: 'live-2' });
      await put('three', { username: 'nobody' });
      expect([...(await liveSessionHandles(store as never))].sort()).toEqual(['live-1', 'live-2']);
    } finally {
      // Only this test's temporary folder.
      fsMod.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a store that can neither list nor read is unsupported', async () => {
    const { liveSessionHandles } = await import('../SessionStatsManager');
    await expect(liveSessionHandles({ length: (cb: (e: unknown, n?: number) => void) => cb(null, 1) })).rejects.toBeInstanceOf(SessionStoreUnsupportedError);
  });
});
