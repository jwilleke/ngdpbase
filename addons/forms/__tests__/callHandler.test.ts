/**
 * A handler's own permission check refuses with ngdpbase's ApiError; the forms
 * add-on answers with that status and, for a step-up, the way to
 * re-authenticate (#1745) — so no handler repackages it.
 */
import { ApiError } from '../../../dist/src/context/ApiContext.js';
import formsAddon from '../index';

describe('formsAddon.callHandler', () => {
  afterEach(() => formsAddon._handlers.clear());

  test('an ApiError from the handler becomes its status, message and reauth', async () => {
    formsAddon.registerHandler('x', async () => { throw new ApiError(403, 'A fresh sign-in is needed', '/auth/reauth?next=%2Fview%2FBooks'); });
    expect(await formsAddon.callHandler('x', {}, { engine: {} as never, req: {} })).toEqual({
      ok: false, status: 403, error: 'A fresh sign-in is needed', reauth: '/auth/reauth?next=%2Fview%2FBooks'
    });
  });

  test('a plain refusal has no reauth', async () => {
    formsAddon.registerHandler('x', async () => { throw new ApiError(401, 'Authentication required'); });
    expect(await formsAddon.callHandler('x', {}, { engine: {} as never, req: {} })).toEqual({ ok: false, status: 401, error: 'Authentication required' });
  });

  test('any other error stays an unexpected one', async () => {
    formsAddon.registerHandler('x', async () => { throw new Error('boom'); });
    expect(await formsAddon.callHandler('x', {}, { engine: {} as never, req: {} })).toEqual({ ok: false, error: 'Handler threw an unexpected error' });
  });
});
