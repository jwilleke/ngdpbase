/**
 * #2071 — the session cookie is secure and a request came over plain http:
 * express-session sent no cookie, nobody can sign in, and nothing said why.
 * UserManager (sessions are its) reports it once per process: an error in the
 * log, "needs your attention" on the dashboard, and one admin notification.
 */
import UserManager from '../UserManager';
import logger from '../../utils/logger';
import { SESSION_COOKIE_WITHHELD_MESSAGE } from '../../utils/sessionSecurity';

function makeManager() {
  const notes: Array<{ level: string; title: string; message: string }> = [];
  const managers: Record<string, unknown> = {
    NotificationManager: {
      notifyAdmins: (n: { level: string; title: string; message: string }) => { notes.push(n); return Promise.resolve('n'); }
    }
  };
  const manager = new UserManager({ getManager: (n: string) => managers[n] ?? null });
  return { manager, notes };
}

describe('UserManager.reportSessionCookieWithheld (#2071)', () => {
  beforeEach(() => vi.mocked(logger.error).mockClear());

  test('the first report logs an error naming the fix, needs attention, and notifies admins', async () => {
    const { manager, notes } = makeManager();
    manager.reportSessionCookieWithheld();
    await Promise.resolve();

    const errors = vi.mocked(logger.error).mock.calls.map((c) => String(c[0]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('set ngdpbase.session.secure to false');

    expect(manager.getManagerStatus()).toMatchObject({
      state: 'degraded',
      kind: 'attention',
      reason: SESSION_COOKIE_WITHHELD_MESSAGE,
      configKey: 'ngdpbase.session.secure'
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ level: 'error', message: SESSION_COOKIE_WITHHELD_MESSAGE });
  });

  test('every later request is silent: one log line and one notification per process', async () => {
    const { manager, notes } = makeManager();
    for (let i = 0; i < 5; i++) manager.reportSessionCookieWithheld();
    await Promise.resolve();
    expect(vi.mocked(logger.error)).toHaveBeenCalledTimes(1);
    expect(notes).toHaveLength(1);
  });

  test('never reported: the manager stays ready and nothing is logged', () => {
    const { manager, notes } = makeManager();
    expect(manager.getManagerStatus().state).toBe('ready');
    expect(vi.mocked(logger.error)).not.toHaveBeenCalled();
    expect(notes).toHaveLength(0);
  });
});
