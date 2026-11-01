/**
 * #2195 — the scanner never walks private storage, even when a media folder
 * that overlaps it reaches the provider. A real temporary tree, removed in
 * `afterEach` by its absolute path.
 */

vi.unmock('../FileSystemMediaProvider');

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';

vi.mock('exiftool-vendored', () => ({
  ExifTool: class MockExifTool {
    async read(_path: string) { return {}; }
    async end() {}
  },
  ExifDateTime: class ExifDateTime {}
}));

vi.mock('sharp', () => ({ default: () => ({}) }));

import FileSystemMediaProvider from '../FileSystemMediaProvider';
import type { SkippedEntry } from '../../utils/explainMediaPath';

type ProviderInternals = {
  collectFilePaths: (dir: string, depth: number) => Promise<{ files: string[]; skipped: SkippedEntry[]; dirErrors: number }>;
};

let root: string;

function makeProvider(folder: string, excludedRoots: string[]): FileSystemMediaProvider {
  return new FileSystemMediaProvider({
    folders: [folder],
    ignoreDirs: [],
    maxDepth: 0,
    indexFile: path.join(root, 'index', 'media-index.json'),
    thumbnailDir: path.join(root, 'thumbs'),
    thumbnailSizes: '300x300',
    metadataPriority: ['EXIF'],
    readonly: true,
    extensions: new Set(['jpg']),
    excludedRoots
  });
}

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'media-private-')));
  await fs.outputFile(path.join(root, 'data', 'pages', 'vaults', 'jim', 'journal', 'attachments', 'secret.jpg'), 'x');
  await fs.outputFile(path.join(root, 'data', 'pages', 'vaultsx', 'public.jpg'), 'x');
  await fs.outputFile(path.join(root, 'data', 'photo.jpg'), 'x');
});

afterEach(async () => {
  await fs.remove(root);
});

describe('FileSystemMediaProvider private storage (#2195)', () => {
  const vaults = () => path.join(root, 'data', 'pages', 'vaults');

  it('skips private storage under a folder that contains it, and lists none of it', async () => {
    const provider = makeProvider(path.join(root, 'data'), [vaults()]);
    const { files, skipped } = await (provider as unknown as ProviderInternals).collectFilePaths(path.join(root, 'data'), 0);
    expect(files.sort()).toEqual([
      path.join(root, 'data', 'pages', 'vaultsx', 'public.jpg'),
      path.join(root, 'data', 'photo.jpg')
    ]);
    expect(JSON.stringify(skipped)).not.toContain('secret');
    await provider.shutdown();
  });

  it('indexes nothing from a folder inside private storage, even through a symlink', async () => {
    const link = path.join(root, 'innocent');
    await fs.symlink(path.join(vaults(), 'jim'), link);
    const provider = makeProvider(link, [vaults()]);
    const result = await provider.scan(true);
    expect(result.scanned).toBe(0);
    expect(await provider.getItemCount()).toBe(0);
    await provider.shutdown();
  });

  it('drops index entries under private storage when it loads the index', async () => {
    const secret = path.join(vaults(), 'jim', 'journal', 'attachments', 'secret.jpg');
    const photo = path.join(root, 'data', 'photo.jpg');
    await fs.outputJson(path.join(root, 'index', 'media-index.json'), {
      version: 1,
      items: {
        a: { id: 'a', filePath: secret, filename: 'secret.jpg', mtime: 1 },
        b: { id: 'b', filePath: photo, filename: 'photo.jpg', mtime: 1 }
      }
    });
    const provider = makeProvider(path.join(root, 'data'), [vaults()]);
    await provider.initialize();
    expect(await provider.getItem('a')).toBeNull();
    const saved = JSON.stringify(await fs.readJson(path.join(root, 'index', 'media-index.json')));
    expect(saved).not.toContain('secret');
    await provider.shutdown();
  });

  it('deletes the cached thumbnails of the entries it drops, and only those', async () => {
    const secret = path.join(vaults(), 'jim', 'journal', 'attachments', 'secret.jpg');
    const photo = path.join(root, 'data', 'photo.jpg');
    const secretId = 'a'.repeat(32);
    const photoId = 'b'.repeat(32);
    await fs.outputJson(path.join(root, 'index', 'media-index.json'), {
      version: 1,
      items: {
        [secretId]: { id: secretId, filePath: secret, filename: 'secret.jpg', mtime: 1 },
        [photoId]: { id: photoId, filePath: photo, filename: 'photo.jpg', mtime: 1 }
      }
    });
    const thumbs = path.join(root, 'thumbs');
    await fs.outputFile(path.join(thumbs, `${secretId}-300x300-inside-o1-webp.webp`), 'x');
    await fs.outputFile(path.join(thumbs, `${secretId}-150x150-inside-o1-webp.webp`), 'x');
    await fs.outputFile(path.join(thumbs, `${photoId}-300x300-inside-o1-webp.webp`), 'x');
    const provider = makeProvider(path.join(root, 'data'), [vaults()]);
    await provider.initialize();
    expect(await fs.readdir(thumbs)).toEqual([`${photoId}-300x300-inside-o1-webp.webp`]);
    await provider.shutdown();
  });

  it('skips the private parts of attachment storage under a folder that contains them', async () => {
    const attachments = path.join(root, 'data', 'attachments');
    await fs.outputFile(path.join(attachments, 'public.jpg'), 'x');
    await fs.outputFile(path.join(attachments, 'private', 'jim', 'old-secret.jpg'), 'x');
    await fs.outputFile(path.join(attachments, '.thumbs', 'vault-thumb.jpg'), 'x');
    const provider = makeProvider(attachments, [path.join(attachments, 'private'), path.join(attachments, '.thumbs')]);
    const { files, skipped } = await (provider as unknown as ProviderInternals).collectFilePaths(attachments, 0);
    expect(files).toEqual([path.join(attachments, 'public.jpg')]);
    expect(JSON.stringify(skipped)).not.toMatch(/secret|vault-thumb/);
    await provider.shutdown();
  });
});
