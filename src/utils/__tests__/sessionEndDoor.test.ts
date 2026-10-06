/**
 * #1626: one door for a session ending, and a sweep for sessions that end
 * without passing it.
 */
import { endSessionKeys, sweepOrphanedKeys, unlockPrivateStores, getUnlockedKek, clearUnlockedPrivateStores } from '../privateStoreUnlock';
import { liveSessionHandles } from '../../managers/SessionStatsManager';

afterEach(() => clearUnlockedPrivateStores());

describe('#1626 endSessionKeys', () => {
  test('drops the session\'s keys (lockPrivateStores zeroes them)', () => {
    unlockPrivateStores('h1', 'alice', Buffer.alloc(32, 7));
    expect(getUnlockedKek('h1')).toBeDefined();
    endSessionKeys('h1');
    expect(getUnlockedKek('h1')).toBeUndefined();
  });

  test('ignores a session with no handle', () => {
    expect(() => { endSessionKeys(undefined); endSessionKeys(''); endSessionKeys(42); }).not.toThrow();
  });
});

describe('#1626 sweepOrphanedKeys', () => {
  test('drops bags no live session holds and keeps the rest', () => {
    unlockPrivateStores('live', 'alice', Buffer.alloc(32, 1));
    unlockPrivateStores('expired', 'bob', Buffer.alloc(32, 2));
    expect(sweepOrphanedKeys(new Set(['live']))).toBe(1);
    expect(getUnlockedKek('live')).toBeDefined();
    expect(getUnlockedKek('expired')).toBeUndefined();
  });
});

describe('#1626 liveSessionHandles', () => {
  test('reads the handles of sessions still in the store', async () => {
    const store = {
      all: (cb: (err: unknown, sessions?: unknown) => void) => cb(null, {
        a: { username: 'alice', privateStoreHandle: 'h-a' },
        b: { username: 'bob' },
        c: { privateStoreHandle: '' }
      })
    };
    expect([...await liveSessionHandles(store)]).toEqual(['h-a']);
  });

  test('a store that cannot list refuses rather than reporting none live', async () => {
    await expect(liveSessionHandles({})).rejects.toThrow(/does not support/);
  });
});
