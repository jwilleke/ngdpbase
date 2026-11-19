/**
 * #2389 slice 4: is this site running from a source checkout?
 *
 * Push to Source writes into the required-pages folder, which is a copy every
 * site starts from only when that folder is part of a git work tree. These use
 * temp folders; none touches the project's own tree.
 */
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { isSourceCheckout } from '../sourceCheckout';

describe('isSourceCheckout (#2389 slice 4)', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdpbase-checkout-'));
  });

  afterEach(async () => {
    // Scoped to the mkdtemp directory made above, never a project path.
    await fs.rm(root, { recursive: true, force: true });
  });

  test('true when the folder holding required-pages has a .git folder', async () => {
    await fs.mkdir(path.join(root, '.git'));
    await fs.mkdir(path.join(root, 'required-pages'));
    expect(isSourceCheckout(path.join(root, 'required-pages'))).toBe(true);
  });

  test('true when it has a .git file, as a git worktree does', async () => {
    await fs.writeFile(path.join(root, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n', 'utf8');
    await fs.mkdir(path.join(root, 'required-pages'));
    expect(isSourceCheckout(path.join(root, 'required-pages'))).toBe(true);
  });

  test('false for an installed folder with no .git beside it', async () => {
    await fs.mkdir(path.join(root, 'required-pages'));
    expect(isSourceCheckout(path.join(root, 'required-pages'))).toBe(false);
  });

  test('false for a copy under node_modules inside someone else\'s repo: only the parent counts', async () => {
    await fs.mkdir(path.join(root, '.git'));
    const installed = path.join(root, 'node_modules', 'ngdpbase', 'required-pages');
    await fs.mkdir(installed, { recursive: true });
    expect(isSourceCheckout(installed)).toBe(false);
  });

  test('false for a folder that does not exist', () => {
    expect(isSourceCheckout(path.join(root, 'nowhere', 'required-pages'))).toBe(false);
  });

  test('a trailing slash on the folder gives the same answer', async () => {
    await fs.mkdir(path.join(root, '.git'));
    await fs.mkdir(path.join(root, 'required-pages'));
    expect(isSourceCheckout(path.join(root, 'required-pages') + path.sep)).toBe(true);
  });
});
