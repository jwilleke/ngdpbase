/**
 * A handler's own permission check refuses with ngdpbase's ApiError. The forms
 * add-on lets it through, and the submit route sends it with sendApiError, the
 * one way any route sends a refusal (#1749) — status, message and, for a
 * step-up, the way to re-authenticate (#1745).
 */
import { ApiError } from '../../../dist/src/context/ApiContext.js';
import { buildAddonHost } from '../../../dist/src/utils/addonHost.js';
import formsAddon from '../index';

describe('formsAddon.callHandler', () => {
  // The host core handed the add-on at register (#1813): its ApiError is the one let through.
  beforeEach(() => { formsAddon._host = buildAddonHost('forms', {}); });
  afterEach(() => { formsAddon._handlers.clear(); formsAddon._host = null; });

  test('an ApiError from the handler is passed through unchanged', async () => {
    const refusal = new ApiError(403, 'A fresh sign-in is needed', '/auth/reauth?next=%2Fview%2FBooks');
    formsAddon.registerHandler('x', async () => { throw refusal; });
    await expect(formsAddon.callHandler('x', {}, { engine: {} as never, req: {} })).rejects.toBe(refusal);
  });

  test('any other error stays an unexpected one', async () => {
    formsAddon.registerHandler('x', async () => { throw new Error('boom'); });
    expect(await formsAddon.callHandler('x', {}, { engine: {} as never, req: {} })).toEqual({ ok: false, error: 'Handler threw an unexpected error' });
  });
});
