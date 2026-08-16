/**
 * getItemsByDateRange + captureDateField provenance (#864).
 */

vi.unmock('../FileSystemMediaProvider');

import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('exiftool-vendored', () => ({
  ExifTool: class MockExifTool {
    async read(_path: string) { return {}; }
    async end() {}
  },
  ExifDateTime: class ExifDateTime {}
}));
vi.mock('sharp', () => ({ default: () => ({}) }));
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
  extensions: new Set(['jpg', 'mp4'])
};

type Internals = {
  index: Record<string, unknown>;
  generateId: (p: string) => string;
  collectFilePaths: (d: string, n: number) => Promise<{ files: string[]; excluded: number; dirErrors: number }>;
  exiftoolInstance: { read: (p: string) => Promise<Record<string, unknown>>; end: () => Promise<void> };
};

describe('FileSystemMediaProvider date-range + captureDateField (#864)', () => {
  let provider: FileSystemMediaProvider;
  const internals = () => provider as unknown as Internals;

  function seed(filePath: string, dto: string | null) {
    const id = internals().generateId(filePath);
    internals().index[id] = {
      id, filePath, filename: filePath.split('/').pop(), mimeType: 'image/jpeg',
      year: 2026, dirPath: '/store', mtime: 1, metadata: { dateTimeOriginal: dto }
    };
    return id;
  }

  beforeEach(() => {
    provider = new FileSystemMediaProvider(minimalConfig);
    vi.mocked(fs.stat).mockResolvedValue({ mtimeMs: 1717000000000, mtime: new Date('2024-05-29') } as never);
  });

  it('filters by both bounds inclusive and sorts ascending', async () => {
    seed('/store/a.jpg', '2026-06-24 12:00:00');
    seed('/store/b.jpg', '2026-06-22 08:00:00');
    seed('/store/c.jpg', '2026-07-20 10:00:00');
    seed('/store/d.jpg', null);
    const r = await provider.getItemsByDateRange('2026-06-22T00:00:00Z', '2026-07-15T23:59:59Z');
    expect(r.map(i => i.filename)).toEqual(['b.jpg', 'a.jpg']);
  });

  it('open-ended bounds work; dateless items never returned', async () => {
    seed('/store/a.jpg', '2026-06-24 12:00:00');
    seed('/store/d.jpg', null);
    expect((await provider.getItemsByDateRange('2026-06-24T00:00:00Z')).length).toBe(1);
    expect((await provider.getItemsByDateRange(undefined, '2026-06-23T00:00:00Z')).length).toBe(0);
    expect((await provider.getItemsByDateRange()).length).toBe(1);
  });

  it('records captureDateField for the literal matching tag on scan', async () => {
    (provider as unknown as Internals).collectFilePaths =
      async () => ({ files: ['/store/p.jpg', '/store/v.mp4'], skipped: [], dirErrors: 0 });
    (provider as unknown as Internals).exiftoolInstance = {
      async read(p: string) {
        if (p.endsWith('p.jpg')) return { DateTimeOriginal: { year: 2026, month: 6, day: 24, hour: 12 } };
        return { MediaCreateDate: { year: 2026, month: 6, day: 25, hour: 9 } };
      },
      async end() {}
    };
    await provider.scan(true);
    const items = Object.values(internals().index) as Array<{ filename: string; metadata: Record<string, unknown> }>;
    const photo = items.find(i => i.filename === 'p.jpg');
    const video = items.find(i => i.filename === 'v.mp4');
    expect(photo?.metadata.captureDateField).toBe('DateTimeOriginal');
    expect(video?.metadata.captureDateField).toBe('MediaCreateDate');
  });
});
