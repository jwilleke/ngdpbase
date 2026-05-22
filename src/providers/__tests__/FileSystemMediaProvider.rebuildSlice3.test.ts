/**
 * End-to-end verification that `FileSystemMediaProvider.rebuild()` re-extracts
 * the Slice-3 fields (duration / bitrate / video+audio codec / dateTimeOriginal /
 * imageWidth / imageHeight) onto every MediaIndexEntry — including ones that
 * pre-date Slice 3.
 *
 * Issue #771 (Slice 5c-media of EPIC #760). Mirrors the verification pattern
 * #763 added for the attachment side. Architecturally the wiring is:
 *
 *   rebuild()                                             [FileSystemMediaProvider:202]
 *     ↓ clears index + deletes index file
 *   scan(force=true)                                      [FileSystemMediaProvider:227]
 *     ↓ collectFilePaths → deduplicateFormats
 *     ↓ for each primary file: processFile(force=true)
 *   processFile(force=true)                               [FileSystemMediaProvider:591]
 *     ↓ exiftool.read(filePath) → rawTags
 *     ↓ extractDuration / extractBitrate / extractDateTimeOriginal +
 *       direct reads of VideoCodec / AudioFormat / ImageWidth / ImageHeight
 *     ↓ writes the Slice-3 fields onto MediaIndexEntry.metadata
 *
 * These tests prove that path end-to-end so a future refactor cannot silently
 * drop the Slice-3 wiring without a test failure to catch it.
 */

vi.unmock('../FileSystemMediaProvider');

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Stub exiftool-vendored — each test installs its own per-path read map below.
vi.mock('exiftool-vendored', () => ({
  ExifTool: class MockExifTool {
    async read(_path: string) { return {}; }
    async end() {}
  },
  ExifDateTime: class ExifDateTime {}
}));

vi.mock('sharp', () => ({ default: () => ({}) }));

// fs-extra needs targeted stubs so scan() walks an "in-memory" single-file
// folder. `import fs from 'fs-extra'` is a default import — provide both
// the named exports AND a `default` object that holds them.
vi.mock('fs-extra', () => {
  const stubs = {
    pathExists: vi.fn().mockResolvedValue(true),
    readJson: vi.fn().mockResolvedValue({}),
    writeJson: vi.fn().mockResolvedValue(undefined),
    ensureDir: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn()
  };
  return { ...stubs, default: stubs };
});

import FileSystemMediaProvider from '../FileSystemMediaProvider';
import fs from 'fs-extra';

const minimalConfig = {
  folders: ['/store'],
  ignoreDirs: [],
  maxDepth: 5,
  indexFile: '/tmp/test-media-index.json',
  thumbnailDir: '/tmp/test-thumbs',
  thumbnailSizes: '300x300',
  metadataPriority: ['EXIF', 'IPTC', 'XMP'],
  readonly: true,
  extensions: new Set(['mp4', 'mov', 'mp3', 'jpg'])
};

describe('FileSystemMediaProvider.rebuild() re-extracts Slice-3 fields (#771)', () => {
  let provider: FileSystemMediaProvider;

  beforeEach(() => {
    provider = new FileSystemMediaProvider(minimalConfig as never);
    vi.mocked(fs.stat).mockResolvedValue({ mtimeMs: 1717000000000, mtime: new Date('2024-05-29') } as never);
  });

  /**
   * Drive only the parts of scan() we care about: pre-stub the collected
   * file list + exiftool result, then call rebuild() to exercise the full
   * `rebuild → scan → processFile` chain. Stubs the private
   * `collectFilePaths` so the test doesn't need a real filesystem.
   */
  function stubFileList(paths: string[]) {
    (provider as unknown as { collectFilePaths: (dir: string, depth: number) => Promise<{ files: string[]; excluded: number; dirErrors: number }> }).collectFilePaths =
      async () => ({ files: paths, excluded: 0, dirErrors: 0 });
  }

  function stubExiftoolByPath(byPath: Record<string, Record<string, unknown>>) {
    const stub = {
      async read(p: string) { return byPath[p] ?? {}; },
      async end() {}
    };
    (provider as unknown as { exiftoolInstance: typeof stub }).exiftoolInstance = stub;
  }

  it('populates Slice-3 fields on a pre-Slice-3 video record after rebuild', async () => {
    stubFileList(['/store/clip.mp4']);
    stubExiftoolByPath({
      '/store/clip.mp4': {
        Duration: 30,
        AvgBitrate: 5_000_000,
        VideoCodec: 'avc1',
        AudioFormat: 'mp4a',
        ImageWidth: 1920,
        ImageHeight: 1080,
        MediaCreateDate: { year: 2024, month: 6, day: 15, hour: 14, minute: 30, second: 0 }
      }
    });

    // Pre-seed a pre-Slice-3 entry (lacks duration / bitrate / codecs / etc.)
    const id = (provider as unknown as { generateId: (p: string) => string }).generateId('/store/clip.mp4');
    (provider as unknown as { index: Record<string, unknown> }).index = {
      [id]: {
        id, filePath: '/store/clip.mp4', filename: 'clip.mp4', mimeType: 'video/mp4',
        year: '2024', dirPath: '/store', mtime: 1717000000000,
        metadata: { /* no Slice-3 fields */ }
      }
    };

    await provider.rebuild();

    const refreshed = (provider as unknown as { index: Record<string, { metadata: Record<string, unknown> }> }).index[id];
    expect(refreshed).toBeDefined();
    expect(refreshed.metadata.duration).toBe('PT30S');
    expect(refreshed.metadata.bitrate).toBe(5_000_000);
    expect(refreshed.metadata.videoCodec).toBe('avc1');
    expect(refreshed.metadata.audioCodec).toBe('mp4a');
    expect(refreshed.metadata.imageWidth).toBe(1920);
    expect(refreshed.metadata.imageHeight).toBe(1080);
    // dateTimeOriginal uses a space separator, not 'T' (extractDateTimeOriginal:756).
    expect(refreshed.metadata.dateTimeOriginal).toBe('2024-06-15 14:30:00');
  });

  it('overwrites stale Slice-3 fields when exiftool returns different values', async () => {
    stubFileList(['/store/edited.mp4']);
    stubExiftoolByPath({
      '/store/edited.mp4': {
        Duration: 60,
        AvgBitrate: 8_000_000,
        VideoCodec: 'hev1'
      }
    });

    const id = (provider as unknown as { generateId: (p: string) => string }).generateId('/store/edited.mp4');
    (provider as unknown as { index: Record<string, unknown> }).index = {
      [id]: {
        id, filePath: '/store/edited.mp4', filename: 'edited.mp4', mimeType: 'video/mp4',
        year: '2024', dirPath: '/store', mtime: 1717000000000,
        metadata: {
          // STALE values — should be replaced
          duration: 'PT99M99S',
          bitrate: 999,
          videoCodec: 'old-codec'
        }
      }
    };

    await provider.rebuild();

    const refreshed = (provider as unknown as { index: Record<string, { metadata: Record<string, unknown> }> }).index[id];
    expect(refreshed.metadata.duration).toBe('PT1M');     // 60s normalised
    expect(refreshed.metadata.bitrate).toBe(8_000_000);
    expect(refreshed.metadata.videoCodec).toBe('hev1');
  });

  it('leaves Slice-3 fields undefined when exiftool returns no Slice-3 tags (clears stale data)', async () => {
    stubFileList(['/store/stripped.mp4']);
    stubExiftoolByPath({
      '/store/stripped.mp4': {
        // No Duration / AvgBitrate / VideoCodec / etc.
        ImageWidth: 640,
        ImageHeight: 480
      }
    });

    const id = (provider as unknown as { generateId: (p: string) => string }).generateId('/store/stripped.mp4');
    (provider as unknown as { index: Record<string, unknown> }).index = {
      [id]: {
        id, filePath: '/store/stripped.mp4', filename: 'stripped.mp4', mimeType: 'video/mp4',
        year: '2024', dirPath: '/store', mtime: 1717000000000,
        metadata: {
          // Stale Slice-3 data from a previous run
          duration: 'PT2M30S',
          bitrate: 4_000_000,
          videoCodec: 'avc1'
        }
      }
    };

    await provider.rebuild();

    const refreshed = (provider as unknown as { index: Record<string, { metadata: Record<string, unknown> }> }).index[id];
    // duration / bitrate / videoCodec absent in the new tags → undefined on
    // the rebuilt entry (a fresh MediaIndexEntry is constructed, not merged
    // into the old one — proving rebuild actually replaces vs. patches).
    expect(refreshed.metadata.duration).toBeNull();
    expect(refreshed.metadata.bitrate).toBeNull();
    expect(refreshed.metadata.videoCodec).toBeUndefined();
    // ImageWidth / Height present → populated.
    expect(refreshed.metadata.imageWidth).toBe(640);
    expect(refreshed.metadata.imageHeight).toBe(480);
  });

  it('falls back to CompressorID when VideoCodec is absent (Slice 3 codec fallback chain)', async () => {
    stubFileList(['/store/old-codec.mp4']);
    stubExiftoolByPath({
      '/store/old-codec.mp4': {
        Duration: 10,
        CompressorID: 'mp4v'   // legacy codec field — should be picked up when VideoCodec missing
      }
    });

    const id = (provider as unknown as { generateId: (p: string) => string }).generateId('/store/old-codec.mp4');
    (provider as unknown as { index: Record<string, unknown> }).index = {
      [id]: {
        id, filePath: '/store/old-codec.mp4', filename: 'old-codec.mp4', mimeType: 'video/mp4',
        year: '2024', dirPath: '/store', mtime: 1717000000000,
        metadata: {}
      }
    };

    await provider.rebuild();

    const refreshed = (provider as unknown as { index: Record<string, { metadata: Record<string, unknown> }> }).index[id];
    expect(refreshed.metadata.videoCodec).toBe('mp4v');
  });

  it('uses MediaCreateDate when DateTimeOriginal is absent (CAPTURE_DATE_FIELDS chain)', async () => {
    stubFileList(['/store/video.mov']);
    stubExiftoolByPath({
      '/store/video.mov': {
        Duration: 5,
        // No DateTimeOriginal (image-typical field) — use MediaCreateDate (video-typical).
        MediaCreateDate: { year: 2025, month: 3, day: 1, hour: 9, minute: 0, second: 0 }
      }
    });

    const id = (provider as unknown as { generateId: (p: string) => string }).generateId('/store/video.mov');
    (provider as unknown as { index: Record<string, unknown> }).index = {
      [id]: { id, filePath: '/store/video.mov', filename: 'video.mov', mimeType: 'video/quicktime', year: '2025', dirPath: '/store', mtime: 1717000000000, metadata: {} }
    };

    await provider.rebuild();

    const refreshed = (provider as unknown as { index: Record<string, { metadata: Record<string, unknown> }> }).index[id];
    expect(refreshed.metadata.dateTimeOriginal).toBe('2025-03-01 09:00:00');
  });
});
