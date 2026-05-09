/**
 * Test helpers for the CSRF middleware (#663).
 *
 * Most route tests mock `req.session` inline. These helpers keep the token
 * value, header name, and body-field name in one place so individual tests
 * don't drift if any of those change.
 *
 * Typical usage in a supertest call:
 *
 *   const token = TEST_CSRF_TOKEN;
 *   await request(app)
 *     .post('/save/HomePage')
 *     .set('X-CSRF-Token', token)
 *     .send({ _csrf: token, content: '...' })
 *     .expect(200);
 *
 * For tests that build their own request session manually (the common
 * pattern in src/routes/__tests__), drop the result of
 * `csrfTestSessionFields()` into the session object so the middleware
 * sees a matching token.
 */
export const TEST_CSRF_TOKEN = 'test-csrf-token-fixed-for-deterministic-tests';

export const CSRF_HEADER_NAME = 'X-CSRF-Token';
export const CSRF_BODY_FIELD = '_csrf';

/**
 * Fields to merge into a fake session object so the CSRF middleware accepts
 * requests that submit `TEST_CSRF_TOKEN` via header or body.
 */
export function csrfTestSessionFields(): { csrfToken: string } {
  return { csrfToken: TEST_CSRF_TOKEN };
}

/**
 * Header object suitable for spreading into supertest `.set(...)` or fetch
 * `headers: { ... }` calls.
 */
export function csrfTestHeaders(): Record<string, string> {
  return { [CSRF_HEADER_NAME]: TEST_CSRF_TOKEN };
}

/**
 * Body object suitable for merging into a `_csrf`-bearing form payload.
 */
export function csrfTestBodyField(): Record<string, string> {
  return { [CSRF_BODY_FIELD]: TEST_CSRF_TOKEN };
}
