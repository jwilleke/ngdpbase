/**
 * Tests for the shared addon-page reseed evaluator (#931) — the single source
 * of truth used by both AddonsManager.seedAddonPages (boot) and the Required
 * Pages Sync admin surface, so their status/behavior can't diverge.
 */
import { describe, expect, test } from 'vitest';
import matter from 'gray-matter';
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

/**
 * #972 — frontmatter-only edits must be reseed-neutral.
 *
 * The geohazardwatch compliance pass (geohazardwatch#177) rewrites
 * `system-category` and `slug` on 13 of 14 seeded pages and renames 10 files,
 * without touching a single body. That is only safe because `pageSourceHash`
 * hashes the BODY — every caller feeds it `matter(raw).content`, never the raw
 * file.
 *
 * If a future caller passes the raw file instead, this stays silently correct
 * until someone edits frontmatter: then live and source hashes diverge, every
 * touched page evaluates as `locally-modified`, and reseed stops permanently
 * for those pages. The issue called that "a bad way to find out" — so it is
 * pinned here rather than left as a property of how the callers happen to
 * slice their input.
 */
describe('pageSourceHash — frontmatter independence (#972)', () => {
  const body = '# Attribution\n\nData courtesy of the USGS.\n';
  const before = `---\ntitle: Attribution\nsystem-category: addon\nslug: attribution-page\nuuid: 8f14e45f-ea0b-4d3f-9c2a-1b7d5e6a0c31\n---\n\n${body}`;
  const after = `---\ntitle: Attribution\nsystem-category: documentation\nslug: attribution\nuuid: 8f14e45f-ea0b-4d3f-9c2a-1b7d5e6a0c31\n---\n\n${body}`;

  test('re-categorizing and re-slugging a page does not change its body hash', () => {
    expect(pageSourceHash(matter(after).content)).toBe(pageSourceHash(matter(before).content));
  });

  test('such a page evaluates as `current`, so reseed is untouched', () => {
    expect(evaluateSeededAddonPage({
      sourceContent: matter(after).content,
      liveContent: matter(before).content,
      storedHash: pageSourceHash(matter(before).content)
    })).toBe('current');
  });

  test('the guard is real — hashing the RAW file instead would break this', () => {
    // Demonstrates the failure mode the callers avoid: raw-file hashing makes a
    // frontmatter-only edit look like a body change.
    expect(pageSourceHash(after)).not.toBe(pageSourceHash(before));
    expect(evaluateSeededAddonPage({
      sourceContent: after,
      liveContent: before,
      storedHash: pageSourceHash(before)
    })).toBe('outdated');
  });

  test('a real body edit is still detected', () => {
    const edited = after.replace('USGS.', 'USGS and the Smithsonian.');
    expect(pageSourceHash(matter(edited).content)).not.toBe(pageSourceHash(matter(before).content));
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
