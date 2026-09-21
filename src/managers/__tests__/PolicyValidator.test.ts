/**
 * PolicyValidator tests — utility methods
 *
 * Covers:
 * - resourcesMatch() for each resource type
 * - patternsOverlap() — all branch paths
 * - clearCache()
 * - getStatistics()
 *
 * @jest-environment node
 */

import PolicyValidator from '../PolicyValidator';
import type { WikiEngine } from '../../types/WikiEngine';

// #1431 step 10: the validator reads policies through ConfigurationManager.
// This used to mock a PolicyManager with `getPolicies` and `savePolicy` — two
// methods the real PolicyManager never had — which is how a save path that
// threw on every call went on passing its tests.
const mockConfigManager = {
  getProperty: vi.fn((_key: string, def: unknown) => def)
};

function makeEngine(): WikiEngine {
  return {
    getManager: vi.fn((name: string) => name === 'ConfigurationManager' ? mockConfigManager : null)
  };
}

async function makeValidator(): Promise<PolicyValidator> {
  const v = new PolicyValidator(makeEngine());
  await v.initialize();
  return v;
}

describe('PolicyValidator — resourcesMatch()', () => {
  test('returns false when resource types differ', async () => {
    const v = await makeValidator();
    expect(v.resourcesMatch(
      { type: 'page', value: 'Home' },
      { type: 'attachment', value: 'Home' }
    )).toBe(false);
  });

  test('matches category resources by value equality', async () => {
    const v = await makeValidator();
    expect(v.resourcesMatch(
      { type: 'category', value: 'General' },
      { type: 'category', value: 'General' }
    )).toBe(true);
  });

  test('non-matching category resources return false', async () => {
    const v = await makeValidator();
    expect(v.resourcesMatch(
      { type: 'category', value: 'General' },
      { type: 'category', value: 'System' }
    )).toBe(false);
  });

  test('matches tag resources by value', async () => {
    const v = await makeValidator();
    expect(v.resourcesMatch(
      { type: 'tag', value: 'important' },
      { type: 'tag', value: 'important' }
    )).toBe(true);
  });

  test('matches resource-type resources by value', async () => {
    const v = await makeValidator();
    expect(v.resourcesMatch(
      { type: 'resource-type', value: 'wiki-page' },
      { type: 'resource-type', value: 'wiki-page' }
    )).toBe(true);
  });

  test('matches page resources using patternsOverlap', async () => {
    const v = await makeValidator();
    expect(v.resourcesMatch(
      { type: 'page', value: 'Home', pattern: 'Home' },
      { type: 'page', value: 'Home', pattern: 'Home' }
    )).toBe(true);
  });

  test('matches attachment resources using patternsOverlap', async () => {
    const v = await makeValidator();
    expect(v.resourcesMatch(
      { type: 'attachment', pattern: '*.pdf' },
      { type: 'attachment', pattern: '*.pdf' }
    )).toBe(true);
  });

  test('matches path resources using patternsOverlap', async () => {
    const v = await makeValidator();
    expect(v.resourcesMatch(
      { type: 'path', value: '/admin/*' },
      { type: 'path', value: '/admin/settings' }
    )).toBe(true);
  });

  test('returns false for unknown resource type', async () => {
    const v = await makeValidator();
    expect(v.resourcesMatch(
      { type: 'unknown-type' as never, value: 'x' },
      { type: 'unknown-type' as never, value: 'x' }
    )).toBe(false);
  });
});

describe('PolicyValidator — patternsOverlap()', () => {
  test('same patterns overlap', async () => {
    const v = await makeValidator();
    expect(v.patternsOverlap('Home', 'Home')).toBe(true);
  });

  test('wildcard * overlaps with anything', async () => {
    const v = await makeValidator();
    expect(v.patternsOverlap('*', 'AnyPage')).toBe(true);
    expect(v.patternsOverlap('AnyPage', '*')).toBe(true);
  });

  test('pattern with * overlaps', async () => {
    const v = await makeValidator();
    expect(v.patternsOverlap('Admin*', 'UserPage')).toBe(true);
  });

  test('non-overlapping patterns without wildcards', async () => {
    const v = await makeValidator();
    expect(v.patternsOverlap('Home', 'About')).toBe(false);
  });

  test('prefix match overlaps', async () => {
    const v = await makeValidator();
    expect(v.patternsOverlap('/admin/settings', '/admin')).toBe(true);
  });
});

describe('PolicyValidator — clearCache()', () => {
  test('clears validation cache without throwing', async () => {
    const v = await makeValidator();
    expect(() => v.clearCache()).not.toThrow();
  });
});

describe('PolicyValidator — getStatistics()', () => {
  test('returns statistics object with expected keys', async () => {
    const v = await makeValidator();
    const stats = v.getStatistics();
    expect(typeof stats.cacheSize).toBe('number');
    expect(typeof stats.schemaLoaded).toBe('boolean');
    expect(typeof stats.validatorReady).toBe('boolean');
  });
});
