/**
 * Unit tests for version.ts utilities
 *
 * Tests the pure exported functions (parseVersion, formatVersion,
 * incrementVersion) and the new --release / --tag-only flag logic
 * via the module's exported helpers.
 *
 * @jest-environment node
 */

import {
  parseVersion,
  formatVersion,
  incrementVersion,
  applyVersionToLock,
  type VersionIncrementType,
  type PackageLock
} from '../version';

describe('parseVersion()', () => {
  test('parses valid semver string', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  test('parses 2.0.0', () => {
    expect(parseVersion('2.0.0')).toEqual({ major: 2, minor: 0, patch: 0 });
  });

  test('throws on invalid format', () => {
    expect(() => parseVersion('1.2')).toThrow();
    expect(() => parseVersion('a.b.c')).toThrow();
    expect(() => parseVersion('')).toThrow();
  });
});

describe('formatVersion()', () => {
  test('formats components into semver string', () => {
    expect(formatVersion(1, 2, 3)).toBe('1.2.3');
    expect(formatVersion(0, 0, 0)).toBe('0.0.0');
  });
});

describe('incrementVersion()', () => {
  test('increments patch', () => {
    expect(incrementVersion('1.2.3', 'patch')).toBe('1.2.4');
  });

  test('increments minor and resets patch', () => {
    expect(incrementVersion('1.2.3', 'minor')).toBe('1.3.0');
  });

  test('increments major and resets minor+patch', () => {
    expect(incrementVersion('1.2.3', 'major')).toBe('2.0.0');
  });

  test('throws on unknown type', () => {
    expect(() => incrementVersion('1.0.0', 'hotfix' as VersionIncrementType)).toThrow();
  });
});

describe('applyVersionToLock()', () => {
  // The lockfile mirrors the project version in two places and npm rewrites both
  // on the next install. Leaving them stale is what produced the recurring
  // two-line package-lock.json diff on every satellite checkout after a release.

  function v3Lock(version: string): PackageLock {
    return {
      name: 'ngdpbase',
      version,
      lockfileVersion: 3,
      packages: {
        '': { name: 'ngdpbase', version, license: 'ISC' },
        'node_modules/lunr': { version: '2.3.9', resolved: 'https://example.invalid/lunr' }
      }
    };
  }

  test('updates the top-level version', () => {
    expect(applyVersionToLock(v3Lock('4.2.0'), '4.3.0').version).toBe('4.3.0');
  });

  test('updates the root package entry', () => {
    const lock = applyVersionToLock(v3Lock('4.2.0'), '4.3.0');
    expect(lock.packages?.['']?.version).toBe('4.3.0');
  });

  test('leaves dependency entries untouched', () => {
    // Only npm may change these — rewriting one here would corrupt resolution.
    const lock = applyVersionToLock(v3Lock('4.2.0'), '4.3.0');
    expect(lock.packages?.['node_modules/lunr']?.version).toBe('2.3.9');
  });

  test('preserves other fields on the root entry', () => {
    const lock = applyVersionToLock(v3Lock('4.2.0'), '4.3.0');
    expect(lock.packages?.['']?.license).toBe('ISC');
    expect(lock.lockfileVersion).toBe(3);
  });

  test('handles a lockfileVersion 1 file with no packages map', () => {
    const lock = applyVersionToLock(
      { name: 'ngdpbase', version: '4.2.0', lockfileVersion: 1 },
      '4.3.0'
    );
    expect(lock.version).toBe('4.3.0');
    expect(lock.packages).toBeUndefined();
  });

  test('a round-trip through JSON.stringify(…, 2) changes only the two version lines', () => {
    // This is what makes the whole-file rewrite safe: the on-disk lockfile is
    // already in npm's canonical 2-space form, so re-stringifying it produces a
    // two-line diff rather than reformatting 17k lines.
    const before = JSON.stringify(v3Lock('4.2.0'), null, 2);
    const after = JSON.stringify(applyVersionToLock(v3Lock('4.2.0'), '4.3.0'), null, 2);
    const changed = after
      .split('\n')
      .filter((line, i) => line !== before.split('\n')[i]);
    expect(changed).toHaveLength(2);
    expect(changed.every(l => l.includes('4.3.0'))).toBe(true);
  });
});
