/**
 * #1179 — `actorOf` reads attribution from a context and never guesses.
 *
 * Identity and provenance travel; authority does not: a subject's roles never
 * reach the record, and a job's context names its origin and reason.
 */
import { actorOf, isJobContext } from '../ActorContext';
import { jobContextFromSchedule, jobContextFromSystem } from '../JobContext';

describe('#1179 actorOf', () => {
  test('a request subject: name, address, origin request, no roles', () => {
    const who = actorOf({ username: 'jim', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' });
    expect(who).toEqual({ user: 'jim', ipAddress: '203.0.113.7', metadata: { origin: 'request' } });
  });

  test('a delegation is named by kind, not by id', () => {
    const token = actorOf({ username: 'jim', roles: [], isAuthenticated: true, viaToken: { id: 't1', name: 'ci', scopes: [] } });
    expect(token.metadata).toEqual({ origin: 'request', delegated: 'token' });
    expect(JSON.stringify(token)).not.toContain('t1');
    const share = actorOf({ username: 'guest', roles: [], isAuthenticated: false, viaShare: { id: 's1', issuer: 'jim', actions: [], resources: [], expiresAt: null } });
    expect(share.metadata).toEqual({ origin: 'request', delegated: 'share' });
  });

  test('a job context: principal, origin and reason', () => {
    const boot = actorOf(jobContextFromSystem('System', 'seed at boot'));
    expect(boot.user).toBe('System');
    expect(boot.ipAddress).toBeUndefined();
    expect(boot.metadata).toMatchObject({ origin: 'boot', reason: 'seed at boot' });
    expect(actorOf(jobContextFromSchedule('System', 'tick')).metadata).toMatchObject({ origin: 'schedule', reason: 'tick' });
  });

  test('isJobContext tells the two apart', () => {
    expect(isJobContext(jobContextFromSystem('System', 'x'))).toBe(true);
    expect(isJobContext({ username: 'jim', roles: [], isAuthenticated: true })).toBe(false);
  });
});
