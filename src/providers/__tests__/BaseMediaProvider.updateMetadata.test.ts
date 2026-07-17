/**
 * Unit tests for BaseMediaProvider metadata-edit helpers (#866).
 *
 * Covers the pure patch → ExifTool tag mapping (buildMetadataWriteTags) and
 * timestamp normalization (normalizeExifDate), plus the default
 * updateItemMetadata rejection for providers without the 'edit' capability.
 */

import { describe, it, expect } from 'vitest';
import BaseMediaProvider from '../BaseMediaProvider';
import type { MediaItem, ScanResult } from '../BaseMediaProvider';
import type { ProviderCapability, AssetMetadataPatch } from '../../types/Asset';

/* eslint-disable @typescript-eslint/no-redundant-type-constituents --
 * MediaItem resolves as `any` under the test tsconfig's eslint program;
 * see BaseMediaProvider.toCreativeWork.test.ts for the same workaround. */

class TestProvider extends BaseMediaProvider {
  readonly id = 'test';
  readonly displayName = 'Test Provider';
  readonly capabilities: ProviderCapability[] = ['search'];

  scan(): Promise<ScanResult> { return Promise.resolve({ scanned: 0, added: 0, updated: 0, errors: 0 }); }
  getYears(): Promise<number[]> { return Promise.resolve([]); }
  getItem(_id: string): Promise<MediaItem | null> { void _id; return Promise.resolve(null); }
  getItemsByYear(_year: number): Promise<MediaItem[]> { void _year; return Promise.resolve([]); }
  getThumbnailBuffer(_id: string, _size: string): Promise<Buffer | null> { void _id; void _size; return Promise.resolve(null); }
  searchItems(_query: string): Promise<MediaItem[]> { void _query; return Promise.resolve([]); }
  shutdown(): Promise<void> { return Promise.resolve(); }

  static buildTags(patch: AssetMetadataPatch, mimeType: string): Record<string, unknown> {
    return BaseMediaProvider['buildMetadataWriteTags'](patch, mimeType);
  }

  static normalizeDate(input: string): string {
    return BaseMediaProvider['normalizeExifDate'](input);
  }
}

/* eslint-enable @typescript-eslint/no-redundant-type-constituents */

describe('buildMetadataWriteTags', () => {
  it('returns an empty object for an empty patch', () => {
    expect(TestProvider.buildTags({}, 'image/jpeg')).toEqual({});
  });

  it('maps title to Title', () => {
    expect(TestProvider.buildTags({ title: 'Lava flow' }, 'image/jpeg')).toEqual({ Title: 'Lava flow' });
  });

  it('maps description to Description AND ImageDescription (mirrors index read fallback)', () => {
    expect(TestProvider.buildTags({ description: 'A caption' }, 'image/jpeg')).toEqual({
      Description: 'A caption',
      ImageDescription: 'A caption'
    });
  });

  it('maps keywords to Keywords ONLY (MWG mirrors to Subject; writing both doubles the list), trimmed and de-blanked', () => {
    expect(TestProvider.buildTags({ keywords: [' Hiking ', '', 'Iceland'] }, 'image/jpeg')).toEqual({
      Keywords: ['Hiking', 'Iceland']
    });
  });

  it('null clears: passes null through so ExifTool deletes the tags', () => {
    expect(TestProvider.buildTags({ title: null, keywords: null }, 'image/jpeg')).toEqual({
      Title: null,
      Keywords: null
    });
  });

  it('writes DateTimeOriginal for images', () => {
    expect(TestProvider.buildTags({ dateTimeOriginal: '2024-06-01 10:30:00' }, 'image/jpeg')).toEqual({
      DateTimeOriginal: '2024:06:01 10:30:00'
    });
  });

  it('writes CreateDate (not DateTimeOriginal) for video containers', () => {
    expect(TestProvider.buildTags({ dateTimeOriginal: '2024-06-01 10:30:00' }, 'video/mp4')).toEqual({
      CreateDate: '2024:06:01 10:30:00'
    });
  });

  it('writes CreateDate for audio', () => {
    expect(TestProvider.buildTags({ dateTimeOriginal: '2024-06-01 10:30:00' }, 'audio/mpeg')).toEqual({
      CreateDate: '2024:06:01 10:30:00'
    });
  });

  it('null date clears the mime-appropriate tag', () => {
    expect(TestProvider.buildTags({ dateTimeOriginal: null }, 'video/quicktime')).toEqual({ CreateDate: null });
  });

  it('absent fields stay absent (undefined ≠ null)', () => {
    const tags = TestProvider.buildTags({ title: 'x' }, 'image/jpeg');
    expect('Description' in tags).toBe(false);
    expect('Keywords' in tags).toBe(false);
    expect('DateTimeOriginal' in tags).toBe(false);
  });
});

describe('normalizeExifDate', () => {
  it('accepts "YYYY-MM-DD HH:MM:SS"', () => {
    expect(TestProvider.normalizeDate('2024-06-01 10:30:05')).toBe('2024:06:01 10:30:05');
  });

  it('accepts ISO-8601 "YYYY-MM-DDTHH:MM:SS"', () => {
    expect(TestProvider.normalizeDate('2024-06-01T10:30:05')).toBe('2024:06:01 10:30:05');
  });

  it('defaults missing seconds to :00', () => {
    expect(TestProvider.normalizeDate('2024-06-01T10:30')).toBe('2024:06:01 10:30:00');
  });

  it('defaults a date-only input to midnight', () => {
    expect(TestProvider.normalizeDate('2024-06-01')).toBe('2024:06:01 00:00:00');
  });

  it('trims surrounding whitespace', () => {
    expect(TestProvider.normalizeDate('  2024-06-01 10:30:05  ')).toBe('2024:06:01 10:30:05');
  });

  it('rejects garbage', () => {
    expect(() => TestProvider.normalizeDate('yesterday')).toThrow(/Invalid dateTimeOriginal/);
  });

  it('rejects out-of-range date parts (month 13, day 32, hour 25)', () => {
    expect(() => TestProvider.normalizeDate('2024-13-01 10:00:00')).toThrow(/out of range/);
    expect(() => TestProvider.normalizeDate('2024-01-32 10:00:00')).toThrow(/out of range/);
    expect(() => TestProvider.normalizeDate('2024-01-01 25:00:00')).toThrow(/out of range/);
  });

  it('rejects Feb 30', () => {
    expect(() => TestProvider.normalizeDate('2024-02-30 10:00:00')).toThrow(/out of range/);
  });
});

describe('updateItemMetadata default implementation', () => {
  it('rejects for providers that do not override it', async () => {
    const provider = new TestProvider();
    await expect(provider.updateItemMetadata('some-id', { title: 'x' }))
      .rejects.toThrow(/does not support metadata editing/);
  });
});
