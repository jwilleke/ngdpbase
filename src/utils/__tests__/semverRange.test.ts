/**
 * The npm range subset the add-on installer reads (#1830), against npm's own
 * desugaring rules.
 */
import { matchingReleases, parseRange, satisfies } from '../semverRange';

const ok = (version: string, range: string): boolean => satisfies(version, parseRange(range));

describe('semverRange (#1830)', () => {
  test.each([
    ['1.2.3', '1.2.3', true],
    ['1.2.4', '1.2.3', false],
    ['1.9.0', '^1.2.3', true],
    ['2.0.0', '^1.2.3', false],
    ['1.2.2', '^1.2.3', false],
    ['0.2.9', '^0.2.3', true],
    ['0.3.0', '^0.2.3', false],
    ['0.0.3', '^0.0.3', true],
    ['0.0.4', '^0.0.3', false],
    ['1.0.0', '^1', true],
    ['1.99.0', '^1', true],
    ['2.0.0', '^1', false],
    ['1.2.9', '~1.2.3', true],
    ['1.3.0', '~1.2.3', false],
    ['1.9.0', '~1', true],
    ['1.2.7', '1.2', true],
    ['1.3.0', '1.2.x', false],
    ['7.0.0', '*', true],
    ['3.0.0', '>=2.1 <4', true],
    ['4.0.0', '>=2.1 <4', false],
    ['1.3.0', '>1.2', true],
    ['1.2.9', '>1.2', false],
    ['1.2.9', '<=1.2', true],
    ['1.3.0', '<=1.2', false],
    ['2.9.9', '1.2.3 - 2', true],
    ['3.0.0', '1.2.3 - 2', false],
    ['3.1.0', '^1 || ^3', true],
    ['2.1.0', '^1 || ^3', false],
    ['1.2.3-beta.1', '*', false]
  ])('%s in %s → %s', (version, range, expected) => {
    expect(ok(version, range)).toBe(expected);
  });

  test('a range outside the subset is refused, not guessed', () => {
    expect(parseRange('latest')).toBeNull();
    expect(parseRange('github:owner/repo')).toBeNull();
    expect(parseRange('1.x.3')).toBeNull();
  });

  test('matching releases come highest first, prereleases left out', () => {
    expect(matchingReleases(['1.0.0', '1.10.0', '1.2.0', '2.0.0', '1.11.0-rc.1'], parseRange('^1'))).toEqual(['1.10.0', '1.2.0', '1.0.0']);
  });
});
