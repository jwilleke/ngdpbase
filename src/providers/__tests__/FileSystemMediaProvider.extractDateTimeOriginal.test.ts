/**
 * Unit tests for FileSystemMediaProvider.extractDateTimeOriginal() — #750
 *
 * Mirrors the lightweight setup used by FileSystemMediaProvider.extractYear.test.ts:
 * vi.unmock the SUT, mock exiftool-vendored / sharp / fs-extra so no child
 * processes spawn during the test run.
 *
 * The function under test takes the ExifTool tags record and returns the
 * formatted "YYYY-MM-DD HH:MM:SS" timestamp from the first non-null of
 * DateTimeOriginal → CreateDate → MediaCreateDate → CreationDate. Images
 * generally populate the first; videos generally populate one of the later
 * three (the original bug — videos indexed null and silently dropped out of
 * capture-date sort/filter).
 */

vi.unmock('../FileSystemMediaProvider');

vi.mock('exiftool-vendored', () => ({
  ExifTool: class MockExifTool {
    async read() { return {}; }
    async end() {}
  },
  ExifDateTime: class ExifDateTime {
    constructor(year, month, day, hour, minute, second) {
      this.year = year;
      this.month = month;
      this.day = day;
      this.hour = hour;
      this.minute = minute;
      this.second = second;
    }
  }
}));

vi.mock('sharp', () => ({ default: () => ({}) }));

vi.mock('fs-extra', () => ({
  pathExists: vi.fn().mockResolvedValue(false),
  readJson: vi.fn(),
  writeJson: vi.fn(),
  ensureDir: vi.fn(),
  stat: vi.fn()
}));

import FileSystemMediaProvider from '../FileSystemMediaProvider';
import { ExifDateTime } from 'exiftool-vendored';

// Richer than the extractYear test's mock — captures the full timestamp.
const MockExifDateTime = ExifDateTime as unknown as new (
  year: number, month?: number, day?: number, hour?: number, minute?: number, second?: number
) => ExifDateTime;

const minimalConfig = {
  folders: [],
  ignoreDirs: [],
  maxDepth: 0,
  indexFile: '/tmp/test-media-index.json',
  thumbnailDir: '/tmp/test-thumbs',
  thumbnailSizes: '300x300',
  metadataPriority: ['EXIF', 'IPTC', 'XMP'],
  readonly: true,
  extensions: new Set(['jpg', 'mp4'])
};

describe('FileSystemMediaProvider.extractDateTimeOriginal() — #750 video fallback', () => {
  let provider;

  beforeEach(() => {
    provider = new FileSystemMediaProvider(minimalConfig);
  });

  // The string-only extractor is now the `.date` of extractCaptureDate (#808);
  // this helper keeps the original #750 assertions intact.
  const dto = (tags) => provider['extractCaptureDate'](tags)?.date ?? null;

  it('formats DateTimeOriginal when present (image EXIF path, unchanged)', () => {
    const tags = { DateTimeOriginal: new MockExifDateTime(2024, 6, 15, 14, 30, 45) };
    expect(dto(tags)).toBe('2024-06-15 14:30:45');
  });

  it('falls back to CreateDate when DateTimeOriginal is absent (video MP4)', () => {
    const tags = { CreateDate: new MockExifDateTime(2023, 11, 2, 8, 15, 0) };
    expect(dto(tags)).toBe('2023-11-02 08:15:00');
  });

  it('falls back to MediaCreateDate when DateTimeOriginal + CreateDate are absent', () => {
    const tags = { MediaCreateDate: new MockExifDateTime(2022, 1, 9, 23, 5, 30) };
    expect(dto(tags)).toBe('2022-01-09 23:05:30');
  });

  it('falls back to CreationDate (QuickTime/Apple variant) for video — #750 root case', () => {
    const tags = { CreationDate: new MockExifDateTime(2021, 7, 4, 12, 0, 0) };
    expect(dto(tags)).toBe('2021-07-04 12:00:00');
  });

  it('returns null when no capture-date field is populated', () => {
    expect(dto({})).toBeNull();
  });

  it('returns null when fields exist but year is missing', () => {
    const tags = { DateTimeOriginal: { month: 6 } };
    expect(dto(tags)).toBeNull();
  });

  it('pads single-digit month/day/hour/minute/second to two digits', () => {
    const tags = { DateTimeOriginal: new MockExifDateTime(2025, 3, 7, 5, 4, 9) };
    expect(dto(tags)).toBe('2025-03-07 05:04:09');
  });

  it('defaults missing month/day/hour/minute/second to 01/01/00/00/00 (year-only case)', () => {
    // Some ExifTool outputs for video provide just a year — keep the field
    // populated so consumers can at least sort by year, matching the prior
    // image behaviour.
    const tags = { DateTimeOriginal: { year: 2019 } };
    expect(dto(tags)).toBe('2019-01-01 00:00:00');
  });

  it('priority: DateTimeOriginal wins over CreateDate when both present', () => {
    const tags = {
      DateTimeOriginal: new MockExifDateTime(2024, 6, 15, 14, 30, 45),
      CreateDate:       new MockExifDateTime(2023, 1, 1, 0, 0, 0)
    };
    expect(dto(tags)).toBe('2024-06-15 14:30:45');
  });

  it('priority: CreateDate wins over MediaCreateDate when DateTimeOriginal absent', () => {
    const tags = {
      CreateDate:      new MockExifDateTime(2023, 11, 2, 8, 15, 0),
      MediaCreateDate: new MockExifDateTime(2022, 1, 9, 23, 5, 30)
    };
    expect(dto(tags)).toBe('2023-11-02 08:15:00');
  });

  it('ignores null fields and continues the chain', () => {
    const tags = {
      DateTimeOriginal: null,
      CreateDate:       null,
      MediaCreateDate:  null,
      CreationDate:     new MockExifDateTime(2020, 5, 5, 5, 5, 5)
    };
    expect(dto(tags)).toBe('2020-05-05 05:05:05');
  });

  it('accepts a duck-typed object (no instanceof) — guards cross-module class mismatch', () => {
    // Mirrors the extractYear duck-typing guard: when exiftool-vendored is
    // loaded twice (e.g. post-upgrade) instanceof silently fails. Source
    // does .year typeof check rather than instanceof — assert that path.
    const tags = { CreateDate: { year: 2022, month: 8, day: 19 } };
    expect(dto(tags)).toBe('2022-08-19 00:00:00');
  });
});

describe('FileSystemMediaProvider.extractCaptureDate() — partial-date detection (#808)', () => {
  let provider;

  beforeEach(() => {
    provider = new FileSystemMediaProvider(minimalConfig);
  });

  it('full Y-M-D date is NOT partial', () => {
    const tags = { DateTimeOriginal: new MockExifDateTime(2024, 6, 15, 14, 30, 45) };
    expect(provider['extractCaptureDate'](tags)).toEqual({ date: '2024-06-15 14:30:45', partial: false, field: 'DateTimeOriginal' });
  });

  it('year-only date IS partial (month + day defaulted to Jan 1)', () => {
    const tags = { DateTimeOriginal: { year: 1940 } };
    expect(provider['extractCaptureDate'](tags)).toEqual({ date: '1940-01-01 00:00:00', partial: true, field: 'DateTimeOriginal' });
  });

  it('year+month (no day) IS partial (day defaulted)', () => {
    const tags = { CreateDate: { year: 2026, month: 4 } };
    expect(provider['extractCaptureDate'](tags)).toEqual({ date: '2026-04-01 00:00:00', partial: true, field: 'CreateDate' });
  });

  it('full Y-M-D with only the TIME missing is NOT partial (00:00:00 default is harmless)', () => {
    const tags = { CreateDate: { year: 2022, month: 8, day: 19 } };
    expect(provider['extractCaptureDate'](tags)).toEqual({ date: '2022-08-19 00:00:00', partial: false, field: 'CreateDate' });
  });

  it('returns null when no field has a usable year', () => {
    expect(provider['extractCaptureDate']({})).toBeNull();
    expect(provider['extractCaptureDate']({ DateTimeOriginal: { month: 6 } })).toBeNull();
  });
});
