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

  test('an undeclared resource type never matches (#1504)', async () => {
    const v = await makeValidator();
    expect(v.resourcesMatch(
      { type: 'category', value: 'General' },
      { type: 'category', value: 'General' }
    )).toBe(false);
  });

  test('matches system-category resources by pattern (#1504)', async () => {
    const v = await makeValidator();
    expect(v.resourcesMatch(
      { type: 'system-category', pattern: 'journal' },
      { type: 'system-category', pattern: 'j*' }
    )).toBe(true);
  });

  test('matches page resources using patternsOverlap', async () => {
    const v = await makeValidator();
    expect(v.resourcesMatch(
      { type: 'page', value: 'Home', pattern: 'Home' },
      { type: 'page', value: 'Home', pattern: 'Home' }
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

describe('PolicyValidator — subject types are the ones the evaluator matches (#1999)', () => {
  const policy = (subjects: unknown[]) => ({
    id: 'p1', name: 'P1', priority: 50, effect: 'allow',
    subjects, resources: [{ type: 'page', pattern: '*' }], actions: ['view'], conditions: []
  }) as never;

  test('it accepts a role subject and a job subject', async () => {
    const v = await makeValidator();
    expect(v.validatePolicy(policy([{ type: 'role', value: 'editor' }])).isValid).toBe(true);
    expect(v.validatePolicy(policy([{ type: 'job', value: 'accounting-dues.issue-invoices' }])).isValid).toBe(true);
  });

  // Results are cached by policy id, so each case gets its own validator.
  const validate = async (subjects: unknown[]) => (await makeValidator()).validatePolicy(policy(subjects));

  test('it refuses a type the evaluator ignores, which would grant nothing', async () => {
    for (const type of ['user', 'group', 'anonymous', 'admin']) {
      expect((await validate([{ type, value: 'x' }])).isValid).toBe(false);
      expect((await validate([{ type }])).isValid).toBe(false);
    }
  });

  test('authenticated and anyone take no value (#2261)', async () => {
    for (const type of ['authenticated', 'anyone']) {
      expect((await validate([{ type }])).isValid).toBe(true);
    }
  });

  test('a value on authenticated or anyone is refused with "takes no value" (#2261)', async () => {
    for (const type of ['authenticated', 'anyone']) {
      const result = await validate([{ type, value: 'x' }]);
      expect(result.isValid).toBe(false);
      expect(JSON.stringify(result.errors)).toContain('takes no value');
    }
  });

  test('a key on authenticated or anyone is refused with "takes no key" (#2284)', async () => {
    for (const type of ['authenticated', 'anyone']) {
      const result = await validate([{ type, key: 'x' }]);
      expect(result.isValid).toBe(false);
      expect(JSON.stringify(result.errors)).toContain('takes no key');
    }
  });

  test('role and job still need a value (#2261)', async () => {
    expect((await validate([{ type: 'role' }])).isValid).toBe(false);
    expect((await validate([{ type: 'job' }])).isValid).toBe(false);
  });

  test('two valueless subjects of the same type are a duplicate; different types are not (#2261)', async () => {
    expect((await validate([{ type: 'anyone' }, { type: 'anyone' }])).isValid).toBe(false);
    expect((await validate([{ type: 'anyone' }, { type: 'authenticated' }])).isValid).toBe(true);
  });

  test('valueless subjects are keyed by type alone, so a stray key does not hide a duplicate (#2284)', async () => {
    expect((await validate([{ type: 'anyone' }, { type: 'anyone', key: 'x' }])).isValid).toBe(false);
  });

  test('anyone overlaps every subject; authenticated every subject but anonymous (#2284)', async () => {
    const v = await makeValidator();
    for (const type of ['role', 'job', 'user', 'anonymous', 'authenticated', 'anyone']) {
      expect(v.subjectsMatch({ type: 'anyone' }, { type, value: 'x' })).toBe(true);
      expect(v.subjectsMatch({ type, value: 'x' }, { type: 'anyone' })).toBe(true);
    }
    for (const type of ['role', 'job', 'user', 'authenticated']) {
      expect(v.subjectsMatch({ type: 'authenticated' }, { type, value: 'x' })).toBe(true);
      expect(v.subjectsMatch({ type, value: 'x' }, { type: 'authenticated' })).toBe(true);
    }
    expect(v.subjectsMatch({ type: 'authenticated' }, { type: 'anonymous' })).toBe(false);
    expect(v.subjectsMatch({ type: 'anonymous' }, { type: 'authenticated' })).toBe(false);
    expect(v.subjectsMatch({ type: 'role', value: 'a' }, { type: 'role', value: 'b' })).toBe(false);
  });

  test('two job subjects match when they name the same job', async () => {
    const v = await makeValidator();
    expect(v.subjectsMatch({ type: 'job', value: 'a.b' }, { type: 'job', value: 'a.b' })).toBe(true);
    expect(v.subjectsMatch({ type: 'job', value: 'a.b' }, { type: 'job', value: 'a.c' })).toBe(false);
  });
});
