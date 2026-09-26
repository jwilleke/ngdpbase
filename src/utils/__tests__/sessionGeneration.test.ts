/**
 * #1482 — the password-change session generation.
 */
import { bumpSessionGeneration, sessionGenerationOf, sessionIsCurrent } from '../sessionGeneration';

describe('session generation (#1482)', () => {
  test('an account that never changed its password is at 0, and an unstamped session matches it', () => {
    expect(sessionGenerationOf({})).toBe(0);
    expect(sessionGenerationOf(null)).toBe(0);
    expect(sessionIsCurrent(undefined, {})).toBe(true);
  });

  test('a password change leaves every session stamped before it behind', () => {
    const user: { sessionGeneration?: number } = {};
    expect(bumpSessionGeneration(user)).toBe(1);
    expect(sessionIsCurrent(undefined, user)).toBe(false);
    expect(sessionIsCurrent(0, user)).toBe(false);
    expect(sessionIsCurrent(1, user)).toBe(true);
  });

  test('a malformed value on either side reads as 0, never as a match it is not', () => {
    expect(sessionGenerationOf({ sessionGeneration: -3 })).toBe(0);
    expect(sessionIsCurrent('1', { sessionGeneration: 1 })).toBe(false);
    expect(sessionIsCurrent(1.5, { sessionGeneration: 0 })).toBe(true);
  });
});
