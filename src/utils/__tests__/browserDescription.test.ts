/**
 * #1532 — the browser and device a sign-in approval request names.
 * Sabotage check: swapping the Edge and Chrome tests in `describeBrowser`
 * turns the Edge case red (Edge's header also says "Chrome/").
 */
import { describeBrowser } from '../browserDescription';

describe('describeBrowser (#1532)', () => {
  test.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', 'Chrome on Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 'Safari on Mac'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0', 'Edge on Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'Safari on iPhone'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox on Linux'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', 'Chrome on Android phone']
  ])('%s → %s', (ua, expected) => {
    expect(describeBrowser(ua)).toBe(expected);
  });

  test('a header it cannot read names nothing, rather than guessing', () => {
    expect(describeBrowser('curl/8.4.0')).toBeNull();
    expect(describeBrowser('')).toBeNull();
    expect(describeBrowser(undefined)).toBeNull();
  });
});
