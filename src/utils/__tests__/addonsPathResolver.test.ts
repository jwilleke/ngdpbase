/**
 * Unit tests for the shared addons-path parsing helpers (#924, #2102).
 */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { describe, expect, test, afterEach, beforeEach } from 'vitest';
import {
  splitAddonsPath,
  retiredAddonsPathWarning,
  resolveAddonSlug
} from '../addonsPathResolver';

describe('splitAddonsPath', () => {
  test('coerces a bare string into a single-entry directories list', () => {
    expect(splitAddonsPath('./addons')).toEqual({ directories: ['./addons'], retired: [] });
  });

  test('a node_modules: entry is set aside as retired, never kept as a directory', () => {
    const result = splitAddonsPath(['/app/addons', 'node_modules:@jwilleke/*-addon', ' node_modules:x', 'node_modules:']);
    expect(result.directories).toEqual(['/app/addons']);
    expect(result.retired).toEqual(['node_modules:@jwilleke/*-addon', ' node_modules:x', 'node_modules:']);
  });

  test('the warning names the entry and the replacement', () => {
    expect(retiredAddonsPathWarning('node_modules:@t/*-addon')).toBe(
      "addons-path entry 'node_modules:@t/*-addon' is no longer supported and is ignored; install add-ons with ngdpbase.addons.install"
    );
  });
});

describe('resolveAddonSlug (#927 canonical identity)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resolve-addon-slug-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  const seed = async (dirName: string, ngdpbase?: Record<string, unknown>) => {
    const dir = path.join(tmpDir, dirName);
    await fs.ensureDir(dir);
    if (ngdpbase !== undefined) {
      await fs.writeJson(path.join(dir, 'package.json'), { name: dirName, ngdpbase });
    }
    return dir;
  };

  test('declared ngdpbase.slug wins over the folder name', async () => {
    const dir = await seed('geohazardwatch-addon', { slug: 'geohazardwatch' });
    expect(resolveAddonSlug(dir)).toBe('geohazardwatch');
  });

  test('declared ngdpbase.slug wins over an unrelated folder name', async () => {
    const dir = await seed('weird-pkg-name', { slug: 'geohazardwatch' });
    expect(resolveAddonSlug(dir)).toBe('geohazardwatch');
  });

  test('fallback is the folder name VERBATIM (never strips -addon)', async () => {
    const dir = await seed('test-addon'); // no package.json
    expect(resolveAddonSlug(dir)).toBe('test-addon');
  });


  test('blank/whitespace slug is ignored, falls back to the folder name', async () => {
    const dir = await seed('sample-addon', { slug: '   ' });
    expect(resolveAddonSlug(dir)).toBe('sample-addon');
  });

  test('invalid/unreadable package.json falls back to the folder name', async () => {
    const dir = path.join(tmpDir, 'broken-addon');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'package.json'), '{ not json', 'utf8');
    expect(resolveAddonSlug(dir)).toBe('broken-addon');
  });
});
