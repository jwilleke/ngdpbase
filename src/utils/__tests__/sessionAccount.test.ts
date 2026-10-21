/**
 * #1937: a signed-in session belongs to the account it signed in to, as that
 * account is now — gone, turned off, or another account of the same name ends
 * it; so does a password change (#1482).
 */
import { accountBindingOf, checkSessionAccount } from '../sessionAccount';

const CREATED = '2026-10-01T10:00:00.000Z';
const account = (over: Record<string, unknown> = {}) => ({ createdAt: CREATED, isActive: true, sessionGeneration: 0, ...over });
const bound = (over: Record<string, unknown> = {}) => ({ accountCreatedAt: CREATED, sessionGeneration: 0, signedInAt: Date.parse(CREATED) + 1000, ...over });

describe('#1937 checkSessionAccount', () => {
  test('a session of a live account it signed in to carries on', () => {
    expect(checkSessionAccount(bound(), account())).toEqual({ end: null });
  });

  test('no account by that name: account-deleted', () => {
    expect(checkSessionAccount(bound(), null)).toEqual({ end: 'account-deleted' });
    expect(checkSessionAccount(bound(), undefined)).toEqual({ end: 'account-deleted' });
  });

  test('a turned-off account: account-disabled', () => {
    expect(checkSessionAccount(bound(), account({ isActive: false }))).toEqual({ end: 'account-disabled' });
  });

  test('another account of the same name (bound to another createdAt): account-deleted', () => {
    expect(checkSessionAccount(bound(), account({ createdAt: '2026-10-21T09:00:00.000Z' }))).toEqual({ end: 'account-deleted' });
  });

  test('an unbound session signed in before the account existed: account-deleted', () => {
    const session = { sessionGeneration: 0, signedInAt: Date.parse(CREATED) - 60_000 };
    expect(checkSessionAccount(session, account())).toEqual({ end: 'account-deleted' });
  });

  test('an unbound session of its own account is bound now, once', () => {
    const session = { sessionGeneration: 0, signedInAt: Date.parse(CREATED) + 60_000 };
    expect(checkSessionAccount(session, account())).toEqual({ end: null, bind: CREATED });
    expect(checkSessionAccount({}, account())).toEqual({ end: null, bind: CREATED });
  });

  test('#1482: a password change since sign-in still ends it', () => {
    expect(checkSessionAccount(bound(), account({ sessionGeneration: 2 }))).toEqual({ end: 'password-changed' });
  });

  test('an account record without createdAt binds to "" and a later one of the name is not it', () => {
    expect(accountBindingOf({})).toBe('');
    expect(checkSessionAccount(bound({ accountCreatedAt: '' }), { isActive: true })).toEqual({ end: null });
    expect(checkSessionAccount(bound({ accountCreatedAt: '' }), account())).toEqual({ end: 'account-deleted' });
  });
});
