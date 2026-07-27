/**
 * @file assetMetadataTags.test.ts
 * @description Shared ExifTool tag mapping (#866, #999).
 *
 * Extracted from BaseMediaProvider so attachments and media use one
 * implementation. These pin the #866 decisions that are subtly wrong if
 * reimplemented from memory.
 */
import { buildMetadataWriteTags, normalizeExifDate, supportsEmbeddedMetadata } from '../assetMetadataTags';

describe('buildMetadataWriteTags', () => {
  test('writes Keywords only, never Subject', () => {
    // ExifTool's MWG logic mirrors Keywords to XMP-dc Subject; writing both
    // doubles every entry.
    const tags = buildMetadataWriteTags({ keywords: ['a', 'b'] }, 'image/jpeg');
    expect(tags.Keywords).toEqual(['a', 'b']);
    expect(tags.Subject).toBeUndefined();
  });

  test('writes description to BOTH Description and ImageDescription', () => {
    // The read path resolves `Description ?? ImageDescription`, so both are
    // written to keep a round-trip stable whichever the file already carries.
    const tags = buildMetadataWriteTags({ description: 'caption' }, 'image/jpeg');
    expect(tags.Description).toBe('caption');
    expect(tags.ImageDescription).toBe('caption');
  });

  test('uses DateTimeOriginal for images and CreateDate for video/audio', () => {
    // Writing the wrong one silently fails to change the displayed date.
    expect(buildMetadataWriteTags({ dateTimeOriginal: '2026-01-02' }, 'image/jpeg'))
      .toHaveProperty('DateTimeOriginal');
    expect(buildMetadataWriteTags({ dateTimeOriginal: '2026-01-02' }, 'video/mp4'))
      .toHaveProperty('CreateDate');
    expect(buildMetadataWriteTags({ dateTimeOriginal: '2026-01-02' }, 'audio/mpeg'))
      .toHaveProperty('CreateDate');
  });

  test('trims and drops blank keywords', () => {
    expect(buildMetadataWriteTags({ keywords: [' a ', '', '  ', 'b'] }, 'image/jpeg').Keywords)
      .toEqual(['a', 'b']);
  });

  test('null clears a field, omission leaves it alone', () => {
    // The distinction a partial edit depends on.
    const cleared = buildMetadataWriteTags({ keywords: null, description: null }, 'image/jpeg');
    expect(cleared.Keywords).toBeNull();
    expect(cleared.Description).toBeNull();

    const untouched = buildMetadataWriteTags({ title: 'x' }, 'image/jpeg');
    expect(untouched).not.toHaveProperty('Keywords');
    expect(untouched).not.toHaveProperty('Description');
  });

  test('an empty patch produces no tags', () => {
    expect(buildMetadataWriteTags({}, 'image/jpeg')).toEqual({});
  });
});

describe('normalizeExifDate', () => {
  test('accepts the documented shapes', () => {
    expect(normalizeExifDate('2026-01-02')).toBe('2026:01:02 00:00:00');
    expect(normalizeExifDate('2026-01-02 13:45')).toBe('2026:01:02 13:45:00');
    expect(normalizeExifDate('2026-01-02T13:45:30')).toBe('2026:01:02 13:45:30');
  });

  test('rejects out-of-range parts rather than rolling them over', () => {
    // Date() would silently turn 2026-02-31 into 3 March — worse than an error,
    // because the user believes the date they typed was stored.
    expect(() => normalizeExifDate('2026-02-31')).toThrow(/out of range/);
    expect(() => normalizeExifDate('2026-13-01')).toThrow(/out of range/);
    expect(() => normalizeExifDate('2026-01-02 25:00')).toThrow(/out of range/);
  });

  test('rejects unparseable shapes', () => {
    expect(() => normalizeExifDate('Jan 2 2026')).toThrow(/expected/);
    expect(() => normalizeExifDate('')).toThrow(/expected/);
  });
});

describe('supportsEmbeddedMetadata', () => {
  test('allows the types ExifTool can safely write', () => {
    expect(supportsEmbeddedMetadata('image/jpeg')).toBe(true);
    expect(supportsEmbeddedMetadata('video/mp4')).toBe(true);
    expect(supportsEmbeddedMetadata('audio/mpeg')).toBe(true);
    expect(supportsEmbeddedMetadata('application/pdf')).toBe(true);
  });

  test('refuses everything else — an allowlist, not a denylist', () => {
    // Getting this wrong the safe way costs a sidecar-only edit; getting it
    // wrong the other way damages a user's file.
    expect(supportsEmbeddedMetadata('application/zip')).toBe(false);
    expect(supportsEmbeddedMetadata('text/csv')).toBe(false);
    expect(supportsEmbeddedMetadata('application/json')).toBe(false);
    expect(supportsEmbeddedMetadata('')).toBe(false);
  });
});
