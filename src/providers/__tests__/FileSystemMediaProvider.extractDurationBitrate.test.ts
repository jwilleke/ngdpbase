/**
 * Unit tests for FileSystemMediaProvider.extractDuration() +
 * .extractBitrate() — Slice 3 of #755 (issue #758).
 *
 * Mirrors the lightweight setup used by the existing extractYear /
 * extractDateTimeOriginal tests: vi.unmock the SUT, mock
 * exiftool-vendored / sharp / fs-extra so no child processes spawn.
 *
 * extractDuration normalises the raw `MediaDuration` / `Duration` tag
 * to ISO 8601 (PT1M30S). extractBitrate normalises `AvgBitrate` to a
 * raw bits/second number.
 */

vi.unmock('../FileSystemMediaProvider');

vi.mock('exiftool-vendored', () => ({
  ExifTool: class MockExifTool {
    async read() { return {}; }
    async end() {}
  },
  ExifDateTime: class ExifDateTime {}
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

const minimalConfig = {
  folders: [],
  ignoreDirs: [],
  maxDepth: 0,
  indexFile: '/tmp/test-media-index.json',
  thumbnailDir: '/tmp/test-thumbs',
  thumbnailSizes: '300x300',
  metadataPriority: ['EXIF', 'IPTC', 'XMP'],
  readonly: true,
  extensions: new Set(['mp4', 'mov', 'mp3'])
};

describe('FileSystemMediaProvider.extractDuration() — Slice 3 of #755 (#758)', () => {
  let provider;

  beforeEach(() => {
    provider = new FileSystemMediaProvider(minimalConfig);
  });

  describe('null / missing / zero input', () => {
    it('returns null when no duration tag is present', () => {
      expect(provider['extractDuration']({})).toBeNull();
    });

    it('returns null when the tag is explicitly null', () => {
      expect(provider['extractDuration']({ MediaDuration: null })).toBeNull();
    });

    it('returns null when seconds is negative', () => {
      expect(provider['extractDuration']({ MediaDuration: -5 })).toBeNull();
    });

    it('returns null when ALL candidate fields are zero', () => {
      expect(provider['extractDuration']({ Duration: 0, MediaDuration: 0, TrackDuration: 0 })).toBeNull();
    });
  });

  describe('multi-field fallback (#758 follow-up — Pixel .TS.mp4 bug)', () => {
    it('picks Duration over MediaDuration when MediaDuration is zero', () => {
      // The actual exiftool output for a 15.87s Pixel video:
      //   Duration: 15.87 s   MediaDuration: 0 s   TrackDuration: 15.87 s
      // Pre-fix this returned "PT0S" because `??` short-circuited on MediaDuration=0.
      expect(provider['extractDuration']({ Duration: 15.87, MediaDuration: 0, TrackDuration: 15.87 })).toBe('PT16S');
    });

    it('falls back to TrackDuration when both Duration and MediaDuration are zero', () => {
      expect(provider['extractDuration']({ Duration: 0, MediaDuration: 0, TrackDuration: 45 })).toBe('PT45S');
    });

    it('skips literal "PT0S" string and tries the next field', () => {
      expect(provider['extractDuration']({ Duration: 'PT0S', MediaDuration: 90 })).toBe('PT1M30S');
    });

    it('falls back to AudioDuration when container-level + per-track all missing/zero', () => {
      expect(provider['extractDuration']({ Duration: 0, AudioDuration: 174 })).toBe('PT2M54S');
    });

    it('falls back to GoogleTrackDuration (Pixel-specific) when others fail', () => {
      expect(provider['extractDuration']({ GoogleTrackDuration: 27.5 })).toBe('PT28S');
    });

    it('falls back to StreamDuration (streaming containers)', () => {
      expect(provider['extractDuration']({ StreamDuration: 10 })).toBe('PT10S');
    });

    it('falls back to TotalDuration (MPEG-1/2 alternate top-level tag)', () => {
      expect(provider['extractDuration']({ TotalDuration: '00:00:42' })).toBe('PT42S');
    });

    it('ignores irrelevant duration-named tags (PreviewDuration, BulbDuration, etc.)', () => {
      expect(provider['extractDuration']({ PreviewDuration: 99, BulbDuration: 99, SampleDuration: 99 })).toBeNull();
    });
  });

  describe('number-of-seconds input (the QuickTime / MP4 path)', () => {
    it('formats 90 seconds as PT1M30S', () => {
      expect(provider['extractDuration']({ MediaDuration: 90 })).toBe('PT1M30S');
    });

    it('formats 3725 seconds (1h 2m 5s) as PT1H2M5S', () => {
      expect(provider['extractDuration']({ MediaDuration: 3725 })).toBe('PT1H2M5S');
    });

    it('formats sub-minute (45s) as PT45S', () => {
      expect(provider['extractDuration']({ Duration: 45 })).toBe('PT45S');
    });

    it('formats exactly 60 seconds as PT1M (no seconds suffix)', () => {
      expect(provider['extractDuration']({ MediaDuration: 60 })).toBe('PT1M');
    });

    it('rejects 0 seconds (no positive duration → null)', () => {
      expect(provider['extractDuration']({ MediaDuration: 0 })).toBeNull();
    });

    it('rounds fractional seconds (1.7 → 2s)', () => {
      expect(provider['extractDuration']({ MediaDuration: 1.7 })).toBe('PT2S');
    });
  });

  describe('string input (legacy / older exiftool outputs)', () => {
    it('passes through already-ISO PT1M30S unchanged', () => {
      expect(provider['extractDuration']({ Duration: 'PT1M30S' })).toBe('PT1M30S');
    });

    it('parses HH:MM:SS string ("01:02:30") to PT1H2M30S', () => {
      expect(provider['extractDuration']({ Duration: '01:02:30' })).toBe('PT1H2M30S');
    });

    it('parses MM:SS string ("1:30") to PT1M30S', () => {
      expect(provider['extractDuration']({ Duration: '1:30' })).toBe('PT1M30S');
    });

    it('parses bare seconds string ("45") to PT45S', () => {
      expect(provider['extractDuration']({ Duration: '45' })).toBe('PT45S');
    });
  });

  describe('object input (exiftool-vendored Duration object)', () => {
    it('reads the .seconds property when present', () => {
      expect(provider['extractDuration']({ MediaDuration: { seconds: 75 } })).toBe('PT1M15S');
    });

    it('returns null when seconds is not a finite number', () => {
      expect(provider['extractDuration']({ MediaDuration: { seconds: 'oops' } })).toBeNull();
    });
  });

  describe('priority and routing', () => {
    it('Duration wins when both Duration and MediaDuration are positive', () => {
      // Reversed from the original (#758-Phase-A) priority: Duration is the
      // container-level value and is more reliable than the track-level
      // MediaDuration which can be zero or report a non-media track.
      expect(provider['extractDuration']({ Duration: 60, MediaDuration: 90 })).toBe('PT1M');
    });
  });
});

describe('FileSystemMediaProvider.extractBitrate() — Slice 3 of #755 (#758)', () => {
  let provider;

  beforeEach(() => {
    provider = new FileSystemMediaProvider(minimalConfig);
  });

  it('returns null when AvgBitrate is missing', () => {
    expect(provider['extractBitrate']({})).toBeNull();
  });

  it('returns null when AvgBitrate is null', () => {
    expect(provider['extractBitrate']({ AvgBitrate: null })).toBeNull();
  });

  it('returns null for zero or negative numeric input', () => {
    expect(provider['extractBitrate']({ AvgBitrate: 0 })).toBeNull();
    expect(provider['extractBitrate']({ AvgBitrate: -1000 })).toBeNull();
  });

  it('passes a finite positive number through (rounded)', () => {
    expect(provider['extractBitrate']({ AvgBitrate: 5_000_000 })).toBe(5_000_000);
    expect(provider['extractBitrate']({ AvgBitrate: 192_500.4 })).toBe(192_500);
  });

  it('parses "5.00 Mbps" to 5_000_000', () => {
    expect(provider['extractBitrate']({ AvgBitrate: '5.00 Mbps' })).toBe(5_000_000);
  });

  it('parses "192 kbps" to 192_000', () => {
    expect(provider['extractBitrate']({ AvgBitrate: '192 kbps' })).toBe(192_000);
  });

  it('parses bare "bps" (no unit prefix)', () => {
    expect(provider['extractBitrate']({ AvgBitrate: '12345 bps' })).toBe(12_345);
  });

  it('returns null for unparseable strings', () => {
    expect(provider['extractBitrate']({ AvgBitrate: 'lots of bits' })).toBeNull();
  });

  it('is case-insensitive on the unit ("5 MBPS")', () => {
    expect(provider['extractBitrate']({ AvgBitrate: '5 MBPS' })).toBe(5_000_000);
  });
});
