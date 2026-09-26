/**
 * The recovery-words password reset door (#1452).
 *
 * Its security properties: one answer for every failure (it cannot tell you
 * whether an account exists), the sign-in throttle counts each failure and
 * refuses a throttled caller even with the right words, the words never reach
 * a record, and the form's own checks run before any secret is tried.
 */

import WikiRoutes from '../WikiRoutes';

type Res = { render: ReturnType<typeof vi.fn>; redirect: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> };

const newRes = (): Res => {
  const res = { render: vi.fn(), redirect: vi.fn(), set: vi.fn() } as unknown as Res;
  res.status = vi.fn(() => res);
  return res;
};

const WORDS = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima';

describe('POST /recover-password (#1452)', () => {
  let routes: WikiRoutes;
  let reset: ReturnType<typeof vi.fn>;
  let auditAuthentication: ReturnType<typeof vi.fn>;
  let throttle: { check: ReturnType<typeof vi.fn>; recordFailure: ReturnType<typeof vi.fn> } | null;

  const req = (body: Record<string, unknown>) =>
    ({ body: { _csrf: 't', ...body }, ip: '203.0.113.9', get: () => 'test-agent' }) as never;

  const good = { username: 'molly', words: WORDS, password: 'brand-new', confirmPassword: 'brand-new' };

  beforeEach(() => {
    reset = vi.fn(async (_u: string, words: string) => words === WORDS);
    throttle = null;
    routes = new WikiRoutes({
      getManager: (name: string) => (name === 'UserManager' ? { resetPasswordWithRecoveryWords: reset } : null)
    });
    vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({ csrfToken: 't' });
    const internals = routes as unknown as { getLoginThrottle: () => unknown; auditAuthentication: () => Promise<void> };
    vi.spyOn(internals, 'getLoginThrottle').mockImplementation(() => throttle);
    auditAuthentication = vi.fn(async () => undefined);
    vi.spyOn(internals, 'auditAuthentication').mockImplementation(auditAuthentication);
  });

  const renderedError = (res: Res) => (res.render.mock.calls.at(-1)?.[1] as { error?: string }).error;

  test('the right words set the new password and send the person to sign in', async () => {
    const res = newRes();
    await routes.recoverPassword(req(good), res);

    expect(reset).toHaveBeenCalledWith('molly', WORDS, 'brand-new', expect.objectContaining({ username: 'molly', reason: expect.stringMatching(/recovery words/) }));
    expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/login\?success=/));
    expect(auditAuthentication).toHaveBeenCalledWith(expect.anything(), 'molly', 'success', 'password reset with recovery words');
  });

  test('every failure gets the same answer, counts against the throttle, and never records the words', async () => {
    throttle = { check: vi.fn(() => ({ blocked: false })), recordFailure: vi.fn() };
    const wrong = newRes();
    const nobody = newRes();
    reset.mockImplementation(async (u: string, w: string) => u === 'molly' && w === WORDS);

    await routes.recoverPassword(req({ ...good, words: 'wrong words entirely' }), wrong);
    await routes.recoverPassword(req({ ...good, username: 'nobody' }), nobody);

    expect(renderedError(wrong)).toBe(renderedError(nobody));
    expect(throttle.recordFailure).toHaveBeenCalled();
    const recorded = JSON.stringify(auditAuthentication.mock.calls.map(call => call.slice(1)));
    expect(recorded).not.toContain('alpha');
    expect(recorded).not.toContain('wrong words entirely');
  });

  test('a throttled caller is refused even with the right words, and nothing is tried', async () => {
    throttle = { check: vi.fn(() => ({ blocked: true })), recordFailure: vi.fn() };
    const res = newRes();

    await routes.recoverPassword(req(good), res);

    expect(reset).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test.each([
    ['passwords that do not match', { confirmPassword: 'different' }, /do not match/],
    ['a password that is too short', { password: 'abc', confirmPassword: 'abc' }, /at least 6/],
    ['missing words', { words: '' }, /username and your 12 recovery words/]
  ])('%s: the form says so before any secret is tried', async (_label, change, message) => {
    const res = newRes();
    await routes.recoverPassword(req({ ...good, ...change }), res);

    expect(renderedError(res)).toMatch(message);
    expect(reset).not.toHaveBeenCalled();
  });
});
