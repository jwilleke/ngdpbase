/**
 * #1506 — the vault parent folder moves from pages/private/ to pages/vaults/
 * once, at start-up, and never merges two folders.
 */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { moveVaultRoot, relocateLegacyVaultPath } from '../moveVaultRoot';

describe('moveVaultRoot (#1506)', () => {
  let pages: string;

  beforeEach(async () => {
    pages = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-root-'));
  });
  afterEach(async () => {
    await fs.remove(pages);
  });

  test('only private/: renames it to vaults/, contents and all', async () => {
    await fs.outputFile(path.join(pages, 'private', 'jim', 'default', 'a.md'), 'x');
    expect(await moveVaultRoot(pages)).toBe('moved');
    expect(await fs.pathExists(path.join(pages, 'private'))).toBe(false);
    expect(await fs.readFile(path.join(pages, 'vaults', 'jim', 'default', 'a.md'), 'utf8')).toBe('x');
  });

  test('the legacy history folder versions/private/ is renamed the same way', async () => {
    await fs.outputFile(path.join(pages, 'versions', 'private', 'u', 'manifest.json'), '{}');
    await moveVaultRoot(pages);
    expect(await fs.pathExists(path.join(pages, 'versions', 'private'))).toBe(false);
    expect(await fs.pathExists(path.join(pages, 'versions', 'vaults', 'u', 'manifest.json'))).toBe(true);
  });

  test('only vaults/: nothing to do, so it is safe on every start', async () => {
    await fs.ensureDir(path.join(pages, 'vaults', 'jim'));
    expect(await moveVaultRoot(pages)).toBe('already');
  });

  test('both: moves nothing and leaves both folders as they were', async () => {
    await fs.outputFile(path.join(pages, 'private', 'molly', 'default', 'a.md'), 'old');
    await fs.outputFile(path.join(pages, 'vaults', 'jim', 'default', 'b.md'), 'new');
    expect(await moveVaultRoot(pages)).toBe('conflict');
    expect(await fs.readFile(path.join(pages, 'private', 'molly', 'default', 'a.md'), 'utf8')).toBe('old');
    expect(await fs.pathExists(path.join(pages, 'vaults', 'molly'))).toBe(false);
  });

  test('neither: nothing to do', async () => {
    expect(await moveVaultRoot(pages)).toBe('none');
  });

  test('a site whose own config keeps privateroot "private" is left alone', async () => {
    await fs.ensureDir(path.join(pages, 'private', 'jim'));
    expect(await moveVaultRoot(pages, { privateRoot: 'private' })).toBe('not-configured');
    expect(await fs.pathExists(path.join(pages, 'private', 'jim'))).toBe(true);
  });
});

describe('relocateLegacyVaultPath (#1506)', () => {
  const pages = path.join(path.sep, 'data', 'pages');

  test('a path recorded under private/ now lives under vaults/', () => {
    expect(relocateLegacyVaultPath(pages, path.join(pages, 'private', 'jim', 'a.md')))
      .toBe(path.join(pages, 'vaults', 'jim', 'a.md'));
  });

  test('any other path is unchanged, including a host path that contains /private/', () => {
    const publicPage = path.join(pages, 'a.md');
    expect(relocateLegacyVaultPath(pages, publicPage)).toBe(publicPage);
    const host = path.join(path.sep, 'private', 'var', 'pages');
    expect(relocateLegacyVaultPath(host, path.join(host, 'a.md'))).toBe(path.join(host, 'a.md'));
  });
});
