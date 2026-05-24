/**
 * Tests for pinnedItems normalisation helpers (#785).
 */

import { describe, test, expect } from 'vitest';
import { normalizePinnedItem, normalizePinnedItems, deriveCanonicalUrl } from '../pinnedItems';

describe('normalizePinnedItem', () => {
  test('legacy {pageName, title} → derives /view/<pageName> url', () => {
    expect(normalizePinnedItem({ pageName: 'Rocket Engines', title: 'Rocket Engines' })).toEqual({
      url: '/view/Rocket%20Engines',
      title: 'Rocket Engines',
      pageName: 'Rocket Engines'
    });
  });

  test('legacy {pageName} without title → title falls back to pageName', () => {
    expect(normalizePinnedItem({ pageName: 'Foo' })).toEqual({
      url: '/view/Foo',
      title: 'Foo',
      pageName: 'Foo'
    });
  });

  test('URL entry {url, title} → passes through, keeps no pageName', () => {
    expect(normalizePinnedItem({ url: '/my/journal', title: 'My Journal' })).toEqual({
      url: '/my/journal',
      title: 'My Journal'
    });
  });

  test('URL entry without title → falls back to url', () => {
    expect(normalizePinnedItem({ url: '/profile' })).toEqual({
      url: '/profile',
      title: '/profile'
    });
  });

  test('mixed entry with both url and pageName → keeps both', () => {
    const result = normalizePinnedItem({
      url: '/view/Foo',
      title: 'Foo',
      pageName: 'Foo',
      pinnedAt: '2026-05-24T12:00:00Z'
    });
    expect(result).toEqual({
      url: '/view/Foo',
      title: 'Foo',
      pageName: 'Foo',
      pinnedAt: '2026-05-24T12:00:00Z'
    });
  });

  test('malformed entries return null', () => {
    expect(normalizePinnedItem(null)).toBeNull();
    expect(normalizePinnedItem(undefined)).toBeNull();
    expect(normalizePinnedItem({})).toBeNull();
    expect(normalizePinnedItem({ title: 'No URL or page' })).toBeNull();
    expect(normalizePinnedItem('a string')).toBeNull();
    expect(normalizePinnedItem(42)).toBeNull();
  });

  test('empty string fields are treated as absent', () => {
    expect(normalizePinnedItem({ url: '', pageName: 'X' })).toEqual({
      url: '/view/X',
      title: 'X',
      pageName: 'X'
    });
  });

  test('pinnedAt is preserved when present, omitted when absent', () => {
    expect(normalizePinnedItem({ url: '/x', title: 'X' }).pinnedAt).toBeUndefined();
    expect(normalizePinnedItem({ url: '/x', title: 'X', pinnedAt: '2026-05-24' }).pinnedAt).toBe('2026-05-24');
  });
});

describe('normalizePinnedItems', () => {
  test('mixed array with legacy + URL + malformed entries', () => {
    const result = normalizePinnedItems([
      { pageName: 'Foo', title: 'Foo' },
      { url: '/my/journal', title: 'My Journal' },
      null,
      {},
      { pageName: 'Bar' }
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].url).toBe('/view/Foo');
    expect(result[1].url).toBe('/my/journal');
    expect(result[2].url).toBe('/view/Bar');
  });

  test('non-array input returns empty', () => {
    expect(normalizePinnedItems(null)).toEqual([]);
    expect(normalizePinnedItems(undefined)).toEqual([]);
    expect(normalizePinnedItems('x')).toEqual([]);
    expect(normalizePinnedItems({})).toEqual([]);
  });

  test('empty array returns empty', () => {
    expect(normalizePinnedItems([])).toEqual([]);
  });
});

describe('deriveCanonicalUrl', () => {
  test('explicit url wins', () => {
    expect(deriveCanonicalUrl({ url: '/foo', pageName: 'Bar' })).toBe('/foo');
  });

  test('pageName fallback when no url', () => {
    expect(deriveCanonicalUrl({ pageName: 'Foo Bar' })).toBe('/view/Foo%20Bar');
  });

  test('returns null when neither is present', () => {
    expect(deriveCanonicalUrl({})).toBeNull();
    expect(deriveCanonicalUrl({ url: '' })).toBeNull();
    expect(deriveCanonicalUrl({ pageName: '' })).toBeNull();
  });
});
