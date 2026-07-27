/**
 * Tests for stub/minimal plugins:
 * - TabPlugin → always returns ''
 * - TablePlugin → always returns '', has initialize()
 * - MediaGalleryPlugin → returns stub HTML
 * - MediaItemPlugin → returns stub HTML
 * - MediaSearchPlugin → returns stub HTML
 *
 * @jest-environment node
 */

import TabPlugin from '../TabPlugin';
import TablePlugin from '../TablePlugin';
import MediaGalleryPlugin from '../MediaGallery';
import MediaItemPlugin from '../MediaItem';
import MediaSearchPlugin from '../MediaSearch';

const ctx = { pageName: 'TestPage', engine: { getManager: vi.fn(() => null) } };

describe('TabPlugin', () => {
  test('has correct name', () => {
    expect(TabPlugin.name).toBe('TabPlugin');
  });

  test('execute() returns empty string', async () => {
    const result = await TabPlugin.execute(ctx, {});
    expect(result).toBe('');
  });
});

describe('TablePlugin', () => {
  test('has correct name', () => {
    expect(TablePlugin.name).toBe('TablePlugin');
  });

  test('execute() returns empty string', () => {
    const result = TablePlugin.execute(ctx, {});
    expect(result).toBe('');
  });

  test('initialize() does not throw', () => {
    expect(() => TablePlugin.initialize?.({})).not.toThrow();
  });
});

describe('MediaGalleryPlugin', () => {
  test('has correct name', () => {
    expect(MediaGalleryPlugin.name).toBe('MediaGallery');
  });

  test('execute() returns stub HTML string', () => {
    const result = MediaGalleryPlugin.execute(ctx, {});
    expect(typeof result).toBe('string');
    expect(result).toContain('media-stub');
  });
});

describe('MediaItemPlugin', () => {
  test('has correct name', () => {
    expect(MediaItemPlugin.name).toBe('MediaItem');
  });

  test('execute() returns stub HTML string', () => {
    const result = MediaItemPlugin.execute(ctx, {});
    expect(typeof result).toBe('string');
    expect(result).toContain('media-stub');
  });
});

describe('MediaSearchPlugin', () => {
  test('has correct name', () => {
    expect(MediaSearchPlugin.name).toBe('MediaSearch');
  });

  test('execute() returns stub HTML string', () => {
    const result = MediaSearchPlugin.execute(ctx, {});
    expect(typeof result).toBe('string');
    expect(result).toContain('media-stub');
  });
});
