/**
 * #2195 — a media folder that equals, contains or sits inside private storage.
 *
 * A real temporary directory, so symlinks and real paths are the filesystem's
 * own. Removed in `afterEach` by its absolute path.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import {
  describeMediaFolderOverlap,
  findMediaFolderOverlap,
  findMediaFolderOverlaps,
  overlapRelation,
  privateStorageRoots
} from '../mediaFolderOverlap';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'media-overlap-')));
  await fs.ensureDir(path.join(tmp, 'data', 'vault', 'jim', 'journal'));
  await fs.ensureDir(path.join(tmp, 'data', 'vaults'));
  await fs.ensureDir(path.join(tmp, 'photos'));
});

afterEach(async () => {
  await fs.remove(tmp);
});

describe('overlapRelation', () => {
  it('finds a folder equal to the root, trailing slash or not', () => {
    const vault = path.join(tmp, 'data', 'vault');
    expect(overlapRelation(vault, vault)).toBe('equals');
    expect(overlapRelation(`${vault}/`, vault)).toBe('equals');
    expect(overlapRelation(path.join(tmp, 'data', 'x', '..', 'vault'), vault)).toBe('equals');
  });

  it('finds a folder that contains the root', () => {
    expect(overlapRelation(path.join(tmp, 'data'), path.join(tmp, 'data', 'vault'))).toBe('contains');
  });

  it('finds a folder inside the root', () => {
    expect(overlapRelation(path.join(tmp, 'data', 'vault', 'jim', 'journal'), path.join(tmp, 'data', 'vault'))).toBe('is inside');
  });

  it('does not confuse a sibling that shares a prefix', () => {
    expect(overlapRelation(path.join(tmp, 'data', 'vaults'), path.join(tmp, 'data', 'vault'))).toBeNull();
    expect(overlapRelation(path.join(tmp, 'photos'), path.join(tmp, 'data', 'vault'))).toBeNull();
  });

  it('follows a symlink to the root', async () => {
    const link = path.join(tmp, 'link-to-vault');
    await fs.symlink(path.join(tmp, 'data', 'vault'), link);
    expect(overlapRelation(link, path.join(tmp, 'data', 'vault'))).toBe('equals');
    expect(overlapRelation(path.join(link, 'jim'), path.join(tmp, 'data', 'vault'))).toBe('is inside');
  });

  it('treats a name starting with two dots as inside the root, not above it', () => {
    const vault = path.join(tmp, 'data', 'vault');
    expect(overlapRelation(path.join(vault, '..notes'), vault)).toBe('is inside');
    expect(overlapRelation(path.join(vault, '..'), vault)).toBe('contains');
  });

  it('resolves `..` after the symlink before it, as the kernel does', async () => {
    const link = path.join(tmp, 'photos', 'vlink');
    await fs.symlink(path.join(tmp, 'data', 'vault', 'jim', 'journal'), link);
    // Not path.join: that would fold `vlink/..` into `photos` by text.
    expect(overlapRelation(`${link}${path.sep}..`, path.join(tmp, 'data', 'vault'))).toBe('is inside');
    expect(overlapRelation(`${link}${path.sep}..${path.sep}not-yet`, path.join(tmp, 'data', 'vault'))).toBe('is inside');
  });

  it('compares a folder that does not exist yet by its nearest existing parent', async () => {
    const link = path.join(tmp, 'link-to-data');
    await fs.symlink(path.join(tmp, 'data'), link);
    expect(overlapRelation(path.join(link, 'vault', 'not-yet'), path.join(tmp, 'data', 'vault'))).toBe('is inside');
  });
});

describe('privateStorageRoots and the message', () => {
  const config = (props: Record<string, unknown>) => ({
    getProperty: (k: string, d: unknown) => (k in props ? props[k] : d),
    getResolvedDataPath: (k: string, d: string) => (typeof props[k] === 'string' ? props[k] : d)
  });

  it('lists the vaults, the legacy private root, shared-folder storage and the private parts of attachment storage', () => {
    const roots = privateStorageRoots(config({
      'ngdpbase.page.provider.filesystem.storagedir': path.join(tmp, 'pages'),
      'ngdpbase.shared-folders.storagedir': path.join(tmp, 'shared-folders'),
      'ngdpbase.attachment.provider.basic.storagedir': path.join(tmp, 'attachments')
    }));
    expect(roots.map(r => r.path)).toEqual([
      path.join(tmp, 'pages', 'vaults'),
      path.join(tmp, 'pages', 'private'),
      path.join(tmp, 'shared-folders'),
      path.join(tmp, 'attachments', 'private'),
      path.join(tmp, 'attachments', '.thumbs')
    ]);
  });

  it('follows the configured legacy private attachment root', () => {
    const roots = privateStorageRoots(config({
      'ngdpbase.attachment.provider.basic.storagedir': path.join(tmp, 'attachments'),
      'ngdpbase.attachment.provider.basic.legacyprivateroot': 'old-private'
    }));
    expect(roots.map(r => r.path)).toContain(path.join(tmp, 'attachments', 'old-private'));
  });

  it('refuses the attachments directory as a media folder: it holds private attachments and vault thumbnails', () => {
    const roots = privateStorageRoots(config({
      'ngdpbase.page.provider.filesystem.storagedir': path.join(tmp, 'data', 'pages'),
      'ngdpbase.attachment.provider.basic.storagedir': path.join(tmp, 'data', 'attachments')
    }));
    const o = findMediaFolderOverlap(path.join(tmp, 'data', 'attachments'), roots);
    expect(o?.relation).toBe('contains');
    expect(o?.root.label).toBe('private attachment storage');
    expect(findMediaFolderOverlap(path.join(tmp, 'data', 'attachments', '.thumbs', 'x'), roots)?.root.label)
      .toBe('attachment thumbnail cache');
  });

  it('names the folder by position and the kind of storage, never the folder inside it', () => {
    const roots = privateStorageRoots(config({ 'ngdpbase.page.provider.filesystem.storagedir': path.join(tmp, 'data') }));
    const [o, ...rest] = findMediaFolderOverlaps([path.join(tmp, 'photos'), path.join(tmp, 'data', 'vaults', 'jim', 'journal')], roots);
    expect(rest).toEqual([]);
    expect(o.position).toBe(2);
    const message = describeMediaFolderOverlap(o);
    expect(message).toContain('Media folder 2 in ngdpbase.media.folders is inside the vault storage');
    expect(message).not.toContain('jim');
    expect(message).not.toContain('journal');
    expect(message).not.toContain(tmp);
  });
});
