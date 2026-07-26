/**
 * @file WikiRoutes-ChromeDenial.test.ts
 * @description #950 — a permission decision that blanks site chrome must be
 * visible in the logs.
 *
 * LeftMenu and Footer are fragments rendered into every page. When one is
 * denied the user loses it site-wide, and before this the only trace was an
 * `info` line indistinguishable from ordinary traffic.
 */
import logger from '../../utils/logger';

// The method under test is private and has no manager dependencies, so it is
// exercised directly rather than by standing up the whole render path.
type ChromeWarner = {
  warnOnChromeDenial(
    label: 'LeftMenu' | 'Footer',
    allowed: boolean,
    pageExists: boolean,
    userContext: { username?: string; roles?: string[] } | null | undefined
  ): void;
};

describe('#950 chrome denial logging', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let routes: ChromeWarner;

  beforeEach(async () => {
    warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    // spyOn reuses an existing spy, so recorded calls survive restoreAllMocks
    // and leak between cases.
    warn.mockClear();
    const mod = await import('../WikiRoutes');
    const WikiRoutes = (mod.default ?? mod) as unknown as { prototype: ChromeWarner };
    routes = Object.create(WikiRoutes.prototype) as ChromeWarner;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('warns when a resolved chrome page is denied', () => {
    routes.warnOnChromeDenial('LeftMenu', false, true, { username: 'bob', roles: ['reader'] });

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('LeftMenu suppressed by a permission decision');
    expect(message).toContain('bob');
    // The message must say the blast radius is the whole site, not one page.
    expect(message).toContain('every page of the site');
  });

  test('says nothing when the chrome page renders normally', () => {
    routes.warnOnChromeDenial('LeftMenu', true, true, { username: 'bob' });
    expect(warn).not.toHaveBeenCalled();
  });

  test('says nothing when no chrome page is configured', () => {
    // The common, entirely healthy case — an instance with no LeftMenu at all.
    // Warning here would train operators to ignore the message.
    routes.warnOnChromeDenial('Footer', false, false, { username: 'bob' });
    expect(warn).not.toHaveBeenCalled();
  });

  test('handles an anonymous user without throwing', () => {
    routes.warnOnChromeDenial('Footer', false, true, null);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('anonymous');
  });
});
