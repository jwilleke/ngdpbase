/**
 * Unit tests for the shared addons-path parsing/npm-discovery helpers (#924).
 */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { describe, expect, test, afterEach, beforeEach } from 'vitest';
import {
  NPM_ADDON_PREFIX,
  splitAddonsPath,
  findNodeModulesDir,
  matchNpmPackageDirs,
  deriveAddonSlugFromPackageDirName,
  resolveAddonSlug
} from '../addonsPathResolver';

describe('splitAddonsPath', () => {
  test('coerces a bare string into a single-entry directories list', () => {
    expect(splitAddonsPath('./addons')).toEqual({ directories: ['./addons'], npmPatterns: [] });
  });

  test('splits mixed directory and node_modules: entries', () => {
    const result = splitAddonsPath(['/app/addons', 'node_modules:@jwilleke/*-addon']);
    expect(result.directories).toEqual(['/app/addons']);
    expect(result.npmPatterns).toEqual(['@jwilleke/*-addon']);
  });

  test('trims whitespace around the pattern and drops empty patterns', () => {
    const result = splitAddonsPath(['node_modules:  @t/*-addon  ', 'node_modules:', 'node_modules:   ']);
    expect(result.npmPatterns).toEqual(['@t/*-addon']);
  });

  test('NPM_ADDON_PREFIX matches the documented syntax', () => {
    expect(NPM_ADDON_PREFIX).toBe('node_modules:');
  });
});

describe('findNodeModulesDir / matchNpmPackageDirs', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'addons-path-resolver-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  test('findNodeModulesDir returns null when no node_modules exists', () => {
    expect(findNodeModulesDir(tmpDir)).toBeNull();
  });

  test('findNodeModulesDir resolves an existing node_modules relative to cwd', async () => {
    await fs.ensureDir(path.join(tmpDir, 'node_modules'));
    expect(findNodeModulesDir(tmpDir)).toBe(path.join(tmpDir, 'node_modules'));
  });

  test('matchNpmPackageDirs expands a scoped glob against matching package directories', async () => {
    const nm = path.join(tmpDir, 'node_modules');
    await fs.ensureDir(path.join(nm, '@t', 'sample-addon'));
    await fs.ensureDir(path.join(nm, '@t', 'other-addon'));
    await fs.ensureDir(path.join(nm, '@t', 'not-matching'));

    const dirs = matchNpmPackageDirs(nm, '@t/*-addon');
    expect(dirs.sort()).toEqual(
      [path.join(nm, '@t', 'other-addon'), path.join(nm, '@t', 'sample-addon')].sort()
    );
  });

  test('matchNpmPackageDirs returns empty when the scope directory does not exist', () => {
    expect(matchNpmPackageDirs(path.join(tmpDir, 'node_modules'), '@none/*-addon')).toEqual([]);
  });

  test('matchNpmPackageDirs skips dotfiles', async () => {
    const nm = path.join(tmpDir, 'node_modules');
    await fs.ensureDir(path.join(nm, '@t', '.hidden-addon'));
    expect(matchNpmPackageDirs(nm, '@t/*-addon')).toEqual([]);
  });

  test('matchNpmPackageDirs supports a bare (unscoped) glob', async () => {
    const nm = path.join(tmpDir, 'node_modules');
    await fs.ensureDir(path.join(nm, 'sample-addon'));
    expect(matchNpmPackageDirs(nm, '*-addon')).toEqual([path.join(nm, 'sample-addon')]);
  });
});

describe('deriveAddonSlugFromPackageDirName', () => {
  test('strips a trailing -addon suffix', () => {
    expect(deriveAddonSlugFromPackageDirName('geohazardwatch-addon')).toBe('geohazardwatch');
  });

  test('returns the name as-is when there is no -addon suffix', () => {
    expect(deriveAddonSlugFromPackageDirName('oddball')).toBe('oddball');
  });

  test('only strips a trailing suffix, not an embedded one', () => {
    expect(deriveAddonSlugFromPackageDirName('addon-tools')).toBe('addon-tools');
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

  test('declared ngdpbase.slug wins over the folder name (directory)', async () => {
    const dir = await seed('geohazardwatch-addon', { slug: 'geohazardwatch' });
    expect(resolveAddonSlug(dir, 'directory')).toBe('geohazardwatch');
  });

  test('declared ngdpbase.slug wins over the folder name (npm)', async () => {
    const dir = await seed('weird-pkg-name', { slug: 'geohazardwatch' });
    expect(resolveAddonSlug(dir, 'npm')).toBe('geohazardwatch');
  });

  test('directory fallback is the folder name VERBATIM (never strips -addon)', async () => {
    const dir = await seed('test-addon'); // no package.json
    expect(resolveAddonSlug(dir, 'directory')).toBe('test-addon');
  });

  test('npm fallback strips the conventional trailing -addon', async () => {
    const dir = await seed('geohazardwatch-addon'); // no package.json
    expect(resolveAddonSlug(dir, 'npm')).toBe('geohazardwatch');
  });

  test('blank/whitespace slug is ignored, falls back per source', async () => {
    const dir = await seed('sample-addon', { slug: '   ' });
    expect(resolveAddonSlug(dir, 'directory')).toBe('sample-addon');
    expect(resolveAddonSlug(dir, 'npm')).toBe('sample');
  });

  test('invalid/unreadable package.json falls back per source', async () => {
    const dir = path.join(tmpDir, 'broken-addon');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'package.json'), '{ not json', 'utf8');
    expect(resolveAddonSlug(dir, 'directory')).toBe('broken-addon');
    expect(resolveAddonSlug(dir, 'npm')).toBe('broken');
  });
});
