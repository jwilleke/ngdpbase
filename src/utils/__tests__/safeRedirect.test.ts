/**
 * safeRedirect — open redirect on login (#1041).
 *
 * `POST /login` passed `req.body.redirect` straight to `res.redirect`, so the
 * login endpoint sent the browser wherever the request asked. Confirmed live
 * against a running instance before the fix:
 *
 *   redirect=//example.com/   →   HTTP/1.1 302   Location: //example.com/
 *
 * The rejection cases below are the point of the file. Each is a real way to
 * express "somewhere else" that a naive `startsWith('/')` check waves through.
 */

import { safeRedirect } from '../safeRedirect';

describe('safeRedirect accepts same-site paths (#1041)', () => {
  test.each([
    ['root', '/'],
    ['a page', '/view/Welcome'],
    ['a query string', '/search?q=test'],
    ['a fragment', '/view/Welcome#section'],
    ['an encoded space', '/view/Filtered%20Tables'],
    ['a query that merely mentions a url', '/search?q=https%3A%2F%2Fexample.com']
  ])('%s', (_label, value) => {
    expect(safeRedirect(value)).toBe(value);
  });
});

describe('safeRedirect refuses anything off-site (#1041)', () => {
  test.each([
    ['protocol-relative — the reported case', '//example.com/'],
    ['protocol-relative, no trailing slash', '//example.com'],
    ['absolute http', 'http://example.com/'],
    ['absolute https', 'https://example.com/'],
    ['backslash form — browsers normalise it to //', '/\\example.com'],
    ['double backslash', '\\\\example.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['a relative path, which is not a site-absolute one', 'view/Welcome'],
    ['a bare host', 'example.com']
  ])('%s', (_label, value) => {
    expect(safeRedirect(value)).toBe('/');
  });

  test('a scheme buried mid-string is still refused', () => {
    // A path-only target can never legitimately contain `://`.
    expect(safeRedirect('/redirect?to=https://example.com')).toBe('/');
  });

  test('CR/LF is refused — it would inject a second response header', () => {
    expect(safeRedirect('/ok\r\nSet-Cookie: a=b')).toBe('/');
    expect(safeRedirect('/ok\nLocation: //example.com')).toBe('/');
  });
});

describe('safeRedirect on absent or odd input (#1041)', () => {
  test.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['a number', 42],
    ['an array — express gives one for a repeated query key', ['/a', '//evil']],
    ['an object', { toString: () => '//evil.example' }]
  ])('%s falls back to /', (_label, value) => {
    // The array case is not hypothetical: `?redirect=/a&redirect=//evil` makes
    // Express hand the handler an array, and `String(...)` on it would produce
    // something that passes a naive prefix check.
    expect(safeRedirect(value)).toBe('/');
  });
});
