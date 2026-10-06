/**
 * #1670: every way a signed-in session ends goes through one door, which drops
 * its private-store keys (#1626) and records `authentication-logout` with why.
 */
import { endSession, type SessionEndReason } from '../sessionEnd';
import { unlockPrivateStores, getUnlockedKek, clearUnlockedPrivateStores } from '../privateStoreUnlock';

afterEach(() => clearUnlockedPrivateStores());

function engineWith(logAuthentication: ReturnType<typeof vi.fn>) {
  return { getManager: (name: string) => (name === 'AuditManager' ? { logAuthentication } : null) };
}

describe('#1670 endSession', () => {
  const reasons: SessionEndReason[] = ['logout', 'idle-timeout', 'password-changed', 'superseded'];

  test.each(reasons)('records %s as authentication-logout and drops the keys', (reason) => {
    const log = vi.fn().mockResolvedValue('id');
    unlockPrivateStores('h1', 'alice', Buffer.alloc(32, 7));
    endSession(engineWith(log), { username: 'alice', privateStoreHandle: 'h1' }, reason, { ipAddress: '203.0.113.5', userAgent: 'ua' });
    expect(getUnlockedKek('h1')).toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      { username: 'alice', ipAddress: '203.0.113.5', userAgent: 'ua', loginMethod: 'session' },
      'logout',
      reason
    );
  });

  test('records nothing when nobody was signed in', () => {
    const log = vi.fn().mockResolvedValue('id');
    endSession(engineWith(log), { username: undefined }, 'superseded', {});
    endSession(engineWith(log), null, 'logout', {});
    expect(log).not.toHaveBeenCalled();
  });

  test('a failed audit write does not throw out of the sign-out', async () => {
    const log = vi.fn().mockRejectedValue(new Error('disk full'));
    expect(() => endSession(engineWith(log), { username: 'alice' }, 'logout', {})).not.toThrow();
    await new Promise(r => setImmediate(r));
  });

  test('works with no audit manager', () => {
    expect(() => endSession({ getManager: () => null }, { username: 'alice' }, 'logout', {})).not.toThrow();
  });
});
