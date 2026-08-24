import { describe, it, expect } from 'vitest';
import {
  UserCreateError,
  safeRegistrationMessage,
  GENERIC_REGISTRATION_FAILURE
} from '../userCreateError.js';

/**
 * #1086 — `POST /register` disclosed every username on the instance to an
 * unauthenticated visitor. `UserManager.createUser` built its duplicate-username
 * error by joining `getAllUsernames()` into the message, and `processRegister`
 * forwarded `getErrorMessage(err)` straight into a redirect that the register
 * page rendered.
 *
 * Reproduced on jimstest before the fix:
 *
 *   Location: /register?error=Username already exists: "admin".
 *             Existing users: admin, jim, molly
 *
 * Two defects, and the second is the one that matters: fixing only the message
 * would leave the route one internal `throw` away from the same exposure,
 * because it treats arbitrary exception text as user-facing copy.
 *
 * These pin the mapping layer that replaces that.
 */
describe('UserCreateError', () => {
  it('carries a machine-readable reason so callers need not parse the message', () => {
    const err = new UserCreateError('username-taken', 'anything');
    expect(err.reason).toBe('username-taken');
  });

  it('is an Error, so existing catch blocks keep working', () => {
    expect(new UserCreateError('username-taken', 'x')).toBeInstanceOf(Error);
  });

  it('is identifiable by instanceof after being thrown', () => {
    try {
      throw new UserCreateError('display-name-conflict', 'x');
    } catch (e) {
      expect(e).toBeInstanceOf(UserCreateError);
    }
  });
});

describe('safeRegistrationMessage', () => {
  describe('the cases registration must answer', () => {
    it('says the username is unavailable — the one fact registration cannot hide', () => {
      // Telling the visitor THIS username is taken is unavoidable: they have to
      // pick another. Telling them which OTHER usernames exist is not.
      const msg = safeRegistrationMessage(new UserCreateError('username-taken', 'internal detail'));
      expect(msg).toBe('That username is not available. Please choose another.');
    });

    it('says the display name is unavailable without revealing why', () => {
      // The internal cause is "conflicts with an existing page", which would
      // tell an anonymous visitor whether a given page exists — including a
      // private one.
      const msg = safeRegistrationMessage(new UserCreateError('display-name-conflict', 'internal detail'));
      expect(msg).toBe('That display name is not available. Please choose another.');
    });
  });

  describe('never leaking internal detail', () => {
    it('does not echo the internal message for a known reason', () => {
      const msg = safeRegistrationMessage(
        new UserCreateError('username-taken', 'Existing users: admin, jim, molly')
      );
      expect(msg).not.toContain('admin');
      expect(msg).not.toContain('molly');
      expect(msg).not.toContain('Existing users');
    });

    it('returns the generic failure for an unrecognised error', () => {
      // The structural half of #1086: an arbitrary throw from any layer must
      // not reach the visitor. This is the default, not a special case.
      expect(safeRegistrationMessage(new Error('ENOSPC: no space left on device')))
        .toBe(GENERIC_REGISTRATION_FAILURE);
    });

    it('returns the generic failure for a UserCreateError with an unknown reason', () => {
      const err = new UserCreateError('username-taken', 'x');
      (err as { reason: string }).reason = 'something-new';
      expect(safeRegistrationMessage(err)).toBe(GENERIC_REGISTRATION_FAILURE);
    });

    it('returns the generic failure for a thrown string', () => {
      expect(safeRegistrationMessage('Existing users: admin, jim')).toBe(GENERIC_REGISTRATION_FAILURE);
    });

    it('returns the generic failure for null or undefined', () => {
      expect(safeRegistrationMessage(null)).toBe(GENERIC_REGISTRATION_FAILURE);
      expect(safeRegistrationMessage(undefined)).toBe(GENERIC_REGISTRATION_FAILURE);
    });

    it('returns the generic failure for an object shaped like an error', () => {
      // A plain object with a `reason` must not be trusted — only a real
      // UserCreateError has been through the code that sets it.
      expect(safeRegistrationMessage({ reason: 'username-taken', message: 'leak' }))
        .toBe(GENERIC_REGISTRATION_FAILURE);
    });
  });

  it('the generic message says nothing about why', () => {
    expect(GENERIC_REGISTRATION_FAILURE).toBe('Registration failed. Please try again.');
  });
});
