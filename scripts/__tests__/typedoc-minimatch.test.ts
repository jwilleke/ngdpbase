/**
 * `npm run docs` must be able to run (#2375).
 *
 * typedoc 0.28 calls `Minimatch#matchOne` while discovering entry points.
 * minimatch 11 made that method private, so when the root `overrides` forced
 * minimatch 11 on typedoc, `npm run docs` died with "mini.matchOne is not a
 * function" before writing a file, and docs/api/generated went stale.
 *
 * This resolves minimatch the way typedoc does, from typedoc's own directory,
 * and makes the same call typedoc makes.
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('#2375 — typedoc gets a minimatch it can use', () => {
  test('the minimatch typedoc resolves still has the public matchOne', () => {
    const fromTypedoc = createRequire(path.join(REPO, 'node_modules', 'typedoc', 'package.json'));
    const { Minimatch } = fromTypedoc('minimatch') as typeof import('minimatch');
    const mini = new Minimatch('src');
    const matchOne = (mini as unknown as { matchOne?: unknown }).matchOne;
    expect(typeof matchOne).toBe('function');
    expect(mini.set.some((row) =>
      (mini as unknown as { matchOne(f: string[], p: unknown, partial: boolean): boolean })
        .matchOne(['src'], row, true))).toBe(true);
  });
});
