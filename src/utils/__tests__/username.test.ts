/**
 * Usernames compare normalized (#1436).
 *
 * `jim`, `Jim` and `" jim "` are one account. Before this the user store keyed
 * its index on the raw string, so they were three, and `createUser`'s
 * duplicate check could not see the case variants — an account could be
 * registered whose name differed from an existing one only in case.
 *
 * The same split ran the other way: `getAnonymousUser()` emits `'Anonymous'`
 * while the guards compared `'anonymous'`, so they never fired for a real
 * visitor.
 */
import { normalizeUsername, sameUsername, isReservedUsername, RESERVED_USERNAMES } from '../username';

describe('#1436 username normalization', () => {
  describe('normalizeUsername', () => {
    test('case and surrounding space do not make a different account', () => {
      expect(normalizeUsername('Jim')).toBe('jim');
      expect(normalizeUsername('  jim  ')).toBe('jim');
      expect(normalizeUsername('JIM')).toBe('jim');
    });

    test('the anonymous principal normalizes to the name the guards compare', () => {
      // The whole point: the producer says 'Anonymous', the guards say
      // 'anonymous', and before this they never met.
      expect(normalizeUsername('Anonymous')).toBe('anonymous');
    });

    test('a non-string is the empty name, not a throw', () => {
      // Callers pass straight from a request body; empty is the "no username"
      // case every one of them already handles.
      expect(normalizeUsername(undefined)).toBe('');
      expect(normalizeUsername(null)).toBe('');
      expect(normalizeUsername(42)).toBe('');
      expect(normalizeUsername({})).toBe('');
    });

    test('inner space is preserved — it is part of the name', () => {
      expect(normalizeUsername(' Mary Jane ')).toBe('mary jane');
    });
  });

  describe('sameUsername', () => {
    test('the same account written differently', () => {
      expect(sameUsername('Jim', ' jim ')).toBe(true);
    });

    test('different accounts', () => {
      expect(sameUsername('jim', 'molly')).toBe(false);
    });

    test('nobody is not the same as nobody — an empty name matches nothing', () => {
      // Otherwise a missing username would compare equal to another missing
      // one and two unidentified callers would look like one account.
      expect(sameUsername('', '')).toBe(false);
      expect(sameUsername(undefined, undefined)).toBe(false);
      expect(sameUsername(null, '')).toBe(false);
    });
  });

  describe('reserved names', () => {
    test('anonymous cannot be registered, however it is spelled', () => {
      expect(isReservedUsername('anonymous')).toBe(true);
      expect(isReservedUsername('Anonymous')).toBe(true);
      expect(isReservedUsername(' ANONYMOUS ')).toBe(true);
    });

    test('asserted stays reserved although the subject was removed (#1435)', () => {
      expect(isReservedUsername('Asserted')).toBe(true);
    });

    test('an ordinary name is not reserved', () => {
      expect(isReservedUsername('jim')).toBe(false);
      expect(isReservedUsername('anonymous-coward')).toBe(false);
    });

    test('the system principal is NOT in this list — .env owns that name', () => {
      // It is checked separately by isSystemPrincipal, because an operator
      // chooses it and it is not a fixed string.
      expect(RESERVED_USERNAMES).not.toContain('system');
    });
  });
});
