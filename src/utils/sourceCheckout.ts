/**
 * Does this site run from a source checkout? (#2389 slice 4)
 *
 * Push to Source writes a page's text into the required-pages folder, the copy
 * every site starts from. That only means something when the folder is part of
 * a git work tree, where a person can commit it. On an installed site nobody
 * does, so the write would be lost at the next upgrade.
 *
 * True when the folder that holds `required-pages/` has a `.git` entry: a
 * folder, or a file, as a git worktree has. Only the parent counts, not any
 * ancestor, so an installed copy under some project's `node_modules` is not
 * mistaken for a checkout. No `git` binary is run. A folder that cannot be
 * read gives false: hiding is the safe error.
 */
import { statSync } from 'node:fs';
import path from 'node:path';

export function isSourceCheckout(requiredPagesDir: string): boolean {
  try {
    statSync(path.join(path.dirname(path.resolve(requiredPagesDir)), '.git'));
    return true;
  } catch {
    return false;
  }
}
