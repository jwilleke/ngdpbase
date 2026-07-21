/**
 * getAllKeywordCounts (#895 — keyword drift report, observed-media side).
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

const minimalConfig = {
  folders: ['/store'],
  ignoreDirs: [],
  maxDepth: 5,
  indexFile: '/tmp/test-media-index.json',
  thumbnailDir: '/tmp/test-thumbs',
  thumbnailSizes: '300x300',
  metadataPriority: ['EXIF', 'IPTC', 'XMP'],
  readonly: true,
  extensions: new Set(['jpg'])
};

type Internals = { index: Record<string, unknown> };

describe('FileSystemMediaProvider.getAllKeywordCounts (#895)', () => {
  let provider: FileSystemMediaProvider;
  const internals = () => provider as unknown as Internals;

  function seed(id: string, keywords: unknown) {
    internals().index[id] = {
      id, filePath: `/store/${id}.jpg`, filename: `${id}.jpg`, mimeType: 'image/jpeg',
      year: 2026, dirPath: '/store', mtime: 1,
      metadata: keywords === undefined ? {} : { keywords }
    };
  }

  beforeEach(() => {
    provider = new FileSystemMediaProvider(minimalConfig as never);
  });

  it('counts keywords across items', async () => {
    seed('a', ['travel', 'ohio']);
    seed('b', ['travel']);
    seed('c', ['geology']);
    const counts = await provider.getAllKeywordCounts();
    expect(counts).toEqual({ travel: 2, ohio: 1, geology: 1 });
  });

  it('#545 shape tolerance: scalar keyword counts as one-element array', async () => {
    seed('a', 'capture');
    seed('b', ['capture']);
    const counts = await provider.getAllKeywordCounts();
    expect(counts).toEqual({ capture: 2 });
  });

  it('skips items without keywords and blank entries', async () => {
    seed('a', undefined);
    seed('b', ['', '  ', 'real']);
    const counts = await provider.getAllKeywordCounts();
    expect(counts).toEqual({ real: 1 });
  });

  it('empty index returns empty map', async () => {
    expect(await provider.getAllKeywordCounts()).toEqual({});
  });
});
