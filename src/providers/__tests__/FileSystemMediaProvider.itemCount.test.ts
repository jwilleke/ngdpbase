/**
 * getItemCount (#1741) — the media total without listing every item.
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
import BaseMediaProvider from '../BaseMediaProvider';

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

describe('FileSystemMediaProvider.getItemCount (#1741)', () => {
  let provider: FileSystemMediaProvider;
  const internals = () => provider as unknown as Internals;

  function seed(id: string, year: number | null | undefined) {
    internals().index[id] = {
      id, filePath: `/store/${id}.jpg`, filename: `${id}.jpg`, mimeType: 'image/jpeg',
      year, dirPath: '/store', mtime: 1, metadata: {}
    };
  }

  beforeEach(() => {
    provider = new FileSystemMediaProvider(minimalConfig);
  });

  it('is 0 for an empty index', async () => {
    expect(await provider.getItemCount()).toBe(0);
  });

  it('counts every item with a year, across years', async () => {
    seed('a', 2001); seed('b', 2001); seed('c', 1998); seed('d', 2026);
    expect(await provider.getItemCount()).toBe(4);
  });

  it('leaves out items with no year, as the year listing does', async () => {
    seed('a', 2001); seed('b', null); seed('c', undefined);
    expect(await provider.getItemCount()).toBe(1);
  });

  it('agrees with the year-by-year default on the same index', async () => {
    seed('a', 2001); seed('b', 2001); seed('c', 1998); seed('d', null); seed('e', 1970);
    const yearByYear = await BaseMediaProvider.prototype.getItemCount.call(provider);
    expect(yearByYear).toBe(4);
    expect(await provider.getItemCount()).toBe(yearByYear);
  });
});
