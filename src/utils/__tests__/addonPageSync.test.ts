/**
 * Tests for the shared addon-page reseed evaluator (#931) — the single source
 * of truth used by both AddonsManager.seedAddonPages (boot) and the Required
 * Pages Sync admin surface, so their status/behavior can't diverge.
 */
import { describe, expect, test } from 'vitest';
import { pageSourceHash, evaluateSeededAddonPage } from '../addonPageSync';

describe('pageSourceHash', () => {
  test('is stable and trims — trailing-newline difference does not change the hash', () => {
    expect(pageSourceHash('Hello world')).toBe(pageSourceHash('Hello world\n'));
    expect(pageSourceHash('  Hello world  ')).toBe(pageSourceHash('Hello world'));
  });

  test('different bodies hash differently', () => {
    expect(pageSourceHash('v1')).not.toBe(pageSourceHash('v2'));
  });
});

describe('evaluateSeededAddonPage (#931)', () => {
  test('current — live body already matches source', () => {
    expect(evaluateSeededAddonPage({
      sourceContent: 'Same body',
      liveContent: 'Same body',
      storedHash: pageSourceHash('anything')
    })).toBe('current');
  });

  test('current wins even if the stored hash is stale, as long as live == source', () => {
    // A page synced to source but with an old/absent stamp is still "current".
    expect(evaluateSeededAddonPage({
      sourceContent: 'Body',
      liveContent: 'Body',
      storedHash: undefined
    })).toBe('current');
  });

  test('outdated — source changed and live is unmodified since seed (stored == live)', () => {
    const seeded = 'Seeded body';
    expect(evaluateSeededAddonPage({
      sourceContent: 'New source body',
      liveContent: seeded,
      storedHash: pageSourceHash(seeded)
    })).toBe('outdated');
  });

  test('outdated — legacy page (no stored hash) is reseedable', () => {
    expect(evaluateSeededAddonPage({
      sourceContent: 'New source body',
      liveContent: 'Old seeded body',
      storedHash: undefined
    })).toBe('outdated');
  });

  test('outdated — empty-string stored hash counts as legacy', () => {
    expect(evaluateSeededAddonPage({
      sourceContent: 'New source body',
      liveContent: 'Old seeded body',
      storedHash: ''
    })).toBe('outdated');
  });

  test('locally-modified — source changed AND live differs from the seed stamp (operator-edited)', () => {
    expect(evaluateSeededAddonPage({
      sourceContent: 'New source body',
      liveContent: 'Operator hand-edited body',
      storedHash: pageSourceHash('Originally seeded body') // != live hash
    })).toBe('locally-modified');
  });

  test('trailing-newline-only divergence is treated as current, not modified', () => {
    expect(evaluateSeededAddonPage({
      sourceContent: 'Body text\n',
      liveContent: 'Body text',
      storedHash: undefined
    })).toBe('current');
  });
});
