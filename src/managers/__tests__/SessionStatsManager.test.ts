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
