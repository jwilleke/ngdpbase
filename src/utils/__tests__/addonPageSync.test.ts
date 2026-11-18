/**
 * Tests for the body hash behind the shared state function (#931, #2389). The
 * decision table itself is in addonPageSync.state.test.ts.
 */
import { describe, expect, test } from 'vitest';
import matter from 'gray-matter';
import { pageSourceHash, shippedPageState } from '../addonPageSync';

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

  test('such a page is Same as shipped, so Sync is untouched', () => {
    expect(shippedPageState({
      shippedBody: matter(after).content,
      liveBody: matter(before).content,
      stamp: pageSourceHash(matter(before).content),
      userModified: false
    }).state).toBe('same-as-shipped');
  });

  test('the guard is real — hashing the RAW file instead would break this', () => {
    // Demonstrates the failure mode the callers avoid: raw-file hashing makes a
    // frontmatter-only edit look like a body change.
    expect(pageSourceHash(after)).not.toBe(pageSourceHash(before));
    expect(shippedPageState({
      shippedBody: after,
      liveBody: before,
      stamp: pageSourceHash(before),
      userModified: false
    }).state).toBe('update-ready');
  });

  test('a real body edit is still detected', () => {
    const edited = after.replace('USGS.', 'USGS and the Smithsonian.');
    expect(pageSourceHash(matter(edited).content)).not.toBe(pageSourceHash(matter(before).content));
  });
});
