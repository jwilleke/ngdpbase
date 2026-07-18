/**
 * Incremental-scan pruning of stale index entries (#867).
 *
 * Item ids are a hash of the file path, so a file moved on disk is re-indexed
 * under a new id — before #867 the old entry lingered forever because scan()
 * only ever added/updated. These tests prove:
 *
 *   - an entry whose file vanished from a fully-scanned folder is pruned
 *   - entries under a missing (unmounted) folder are NOT pruned
 *   - entries under a folder with unreadable subdirectories are NOT pruned
 *   - entries outside every configured folder are NOT pruned
 *   - `removed` is reported on the ScanResult
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
  extensions: new Set(['jpg'])
};

type ProviderInternals = {
  index: Record<string, { filePath: string }>;
  generateId: (p: string) => string;
  collectFilePaths: (dir: string, depth: number) => Promise<{ files: string[]; excluded: number; dirErrors: number }>;
  exiftoolInstance: { read: (p: string) => Promise<Record<string, unknown>>; end: () => Promise<void> };
};

describe('FileSystemMediaProvider.scan() prunes stale index entries (#867)', () => {
  let provider: FileSystemMediaProvider;

  const internals = () => provider as unknown as ProviderInternals;

  function seedEntry(filePath: string): string {
    const id = internals().generateId(filePath);
    internals().index[id] = {
      id, filePath, filename: filePath.split('/').pop(), mimeType: 'image/jpeg',
      year: '2026', dirPath: filePath.slice(0, filePath.lastIndexOf('/')),
      mtime: 1717000000000, metadata: {}
    } as never;
    return id;
  }

  function stubCollect(result: { files: string[]; excluded?: number; dirErrors?: number }) {
    internals().collectFilePaths =
      async () => ({ files: result.files, excluded: result.excluded ?? 0, dirErrors: result.dirErrors ?? 0 });
  }

  beforeEach(() => {
    provider = new FileSystemMediaProvider(minimalConfig as never);
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.stat).mockResolvedValue({ mtimeMs: 1717000000000, mtime: new Date('2024-05-29') } as never);
  });

  it('prunes the old entry when a file was moved (re-indexed under a new id)', async () => {
    const oldId = seedEntry('/store/2026-00/photo.jpg');
    stubCollect({ files: ['/store/2026-04/photo.jpg'] });

    const result = await provider.scan();

    const newId = internals().generateId('/store/2026-04/photo.jpg');
    expect(internals().index[oldId]).toBeUndefined();
    expect(internals().index[newId]).toBeDefined();
    expect(result.removed).toBe(1);
    expect(result.added).toBe(1);
  });

  it('keeps an entry whose file is still present', async () => {
    const id = seedEntry('/store/keep.jpg');
    stubCollect({ files: ['/store/keep.jpg'] });

    const result = await provider.scan();

    expect(internals().index[id]).toBeDefined();
    expect(result.removed).toBe(0);
  });

  it('does NOT prune entries under a missing (unmounted) folder', async () => {
    const id = seedEntry('/store/photo.jpg');
    vi.mocked(fs.pathExists).mockImplementation(async (p: string) => p !== '/store');
    stubCollect({ files: [] });

    const result = await provider.scan();

    expect(internals().index[id]).toBeDefined();
    expect(result.removed).toBe(0);
    expect(result.missingFolders).toEqual(['/store']);
  });

  it('does NOT prune entries when the folder walk hit unreadable subdirectories', async () => {
    const id = seedEntry('/store/broken-subdir/photo.jpg');
    stubCollect({ files: [], dirErrors: 1 });

    const result = await provider.scan();

    expect(internals().index[id]).toBeDefined();
    expect(result.removed).toBe(0);
  });

  it('does NOT prune entries outside every configured folder', async () => {
    const id = seedEntry('/elsewhere/photo.jpg');
    stubCollect({ files: [] });

    const result = await provider.scan();

    expect(internals().index[id]).toBeDefined();
    expect(result.removed).toBe(0);
  });

  it('prunes an entry whose file became .ngdpbaseignore-excluded (no longer collected)', async () => {
    const id = seedEntry('/store/now-ignored.jpg');
    stubCollect({ files: [], excluded: 1 });

    const result = await provider.scan();

    expect(internals().index[id]).toBeUndefined();
    expect(result.removed).toBe(1);
  });
});
