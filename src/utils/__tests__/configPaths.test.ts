/**
 * Paths inside a configuration value (#1889): the one walk that resolving
 * `$NAME` and hiding a declared path share.
 */
import { envRefName, keyOfEntry, mapConfigValue, parsePathEntry, pathMatches, patternBelow, valueAt } from '../configPaths';

describe('configPaths (#1889)', () => {
  test('a bare whole-string $NAME is a reference; a partial string, a lowercase name and $$ are not', () => {
    expect(envRefName('$CHECKING_ACCOUNT_NUMBER')).toBe('CHECKING_ACCOUNT_NUMBER');
    expect(envRefName('x$CHECKING')).toBeNull();
    expect(envRefName('$CHECKING-x')).toBeNull();
    expect(envRefName('$lower')).toBeNull();
    expect(envRefName('$$CHECKING')).toBeNull();
    expect(envRefName(42)).toBeNull();
  });

  test('an entry is well formed: no empty segment, * only whole and after ngdpbase.<category>', () => {
    expect(parsePathEntry('ngdpbase.addons.accounting.accounts.*.account-number')).toEqual(['ngdpbase', 'addons', 'accounting', 'accounts', '*', 'account-number']);
    expect(parsePathEntry('ngdpbase.session.secret')).not.toBeNull();
    expect(parsePathEntry('s')).toEqual(['s']);
    expect(parsePathEntry('ngdpbase..secret')).toBeNull();
    expect(parsePathEntry('ngdpbase.addons.acc*.x')).toBeNull();
    expect(parsePathEntry('*.addons.x')).toBeNull();
    expect(parsePathEntry('ngdpbase.*.x')).toBeNull();
    expect(parsePathEntry('')).toBeNull();
  });

  test('a pattern is matched below its key only, * standing for exactly one segment', () => {
    const entry = 'ngdpbase.addons.accounting.accounts.*.account-number';
    const pattern = patternBelow(entry, 'ngdpbase.addons.accounting.accounts');
    expect(pattern).toEqual(['*', 'account-number']);
    expect(pathMatches(pattern, ['checking', 'account-number'])).toBe(true);
    expect(pathMatches(pattern, ['checking', 'routing-number'])).toBe(false);
    expect(pathMatches(pattern, ['checking', 'account-number', 'x'])).toBe(false);
    expect(pathMatches(pattern, ['account-number'])).toBe(false);
    expect(patternBelow(entry, 'ngdpbase.addons.accounting')).toEqual(['accounts', '*', 'account-number']);
    expect(patternBelow(entry, 'ngdpbase.addons.other.accounts')).toBeNull();
  });

  test('the walk copies on write: an untouched value is returned as itself', () => {
    const value = { a: { b: ['x', 'y'] }, c: 1 };
    expect(mapConfigValue(value, () => undefined)).toBe(value);
    const changed = mapConfigValue(value, (node, below) => (below.join('.') === 'a.b.1' ? 'Y' : undefined)) as typeof value;
    expect(changed).toEqual({ a: { b: ['x', 'Y'] }, c: 1 });
    expect(value.a.b[1]).toBe('y');
    expect(changed.c).toBe(1);
  });

  test('the key an entry lies inside is the longest set prefix before the first *', () => {
    const keys = new Set(['ngdpbase.addons.accounting.accounts', 'ngdpbase.addons.accounting']);
    expect(keyOfEntry('ngdpbase.addons.accounting.accounts.*.account-number', (k) => keys.has(k))).toBe('ngdpbase.addons.accounting.accounts');
    expect(keyOfEntry('ngdpbase.addons.accounting.accounts.checking.account-number', (k) => keys.has(k))).toBe('ngdpbase.addons.accounting.accounts');
    expect(keyOfEntry('ngdpbase.other.x.*.y', (k) => keys.has(k))).toBeNull();
    expect(valueAt({ a: [{ b: 1 }] }, ['a', '0', 'b'])).toBe(1);
    expect(valueAt({ a: 1 }, ['a', 'b'])).toBeUndefined();
  });
});
