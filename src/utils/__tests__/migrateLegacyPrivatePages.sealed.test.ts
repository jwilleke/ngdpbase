/**
 * The legacy private-page migrations never move plaintext into a sealed vault — #1836.
 *
 * A pre-store page (`vaults/{user}/{uuid}.md`) and pre-store history
 * (`versions/vaults/{uuid}/`) are plaintext. They were moved with `fs.move`
 * into the default store or the page's store whatever its seal; a sealed one
 * is now left alone, with a warning.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { migrateLegacyPrivatePages, migrateLegacyPrivateVersionBlobs } from '../migrateLegacyPrivatePages';
import { resolvePrivateStoreLayout, storeMetaPath } from '../privateStorePath';

const UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('legacy private migrations and sealed vaults (#1836)', () => {
  let tmp: string;
  let pagesDir: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-sealed-'));
    pagesDir = path.join(tmp, 'pages');
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  const legacyPage = async (): Promise<string> => {
    const file = path.join(pagesDir, 'vaults', 'molly', `${UUID}.md`);
    await fs.ensureDir(path.dirname(file));
    await fs.writeFile(file, `---\nuuid: ${UUID}\n---\nsecret\n`);
    return file;
  };

  test('a legacy page is not moved into a default store that is sealed (store.json)', async () => {
    const file = await legacyPage();
    await fs.ensureDir(path.join(pagesDir, 'vaults', 'molly', 'default'));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'default'), { encrypt: true });

    expect((await migrateLegacyPrivatePages(pagesDir)).moved).toBe(0);
    expect(await fs.pathExists(file)).toBe(true);
    expect(await fs.pathExists(path.join(pagesDir, 'vaults', 'molly', 'default', `${UUID}.md`))).toBe(false);
  });

  test('a legacy page is not moved into a default store whose kind is sealed', async () => {
    const file = await legacyPage();
    expect((await migrateLegacyPrivatePages(pagesDir, resolvePrivateStoreLayout({ sealedVaults: ['default'] }))).moved).toBe(0);
    expect(await fs.pathExists(file)).toBe(true);
  });

  test('into a default store that is not sealed it moves, as before', async () => {
    await legacyPage();
    expect((await migrateLegacyPrivatePages(pagesDir)).moved).toBe(1);
    expect(await fs.pathExists(path.join(pagesDir, 'vaults', 'molly', 'default', `${UUID}.md`))).toBe(true);
  });

  test('legacy history is not moved into the sealed store its page is in', async () => {
    const store = path.join(pagesDir, 'vaults', 'molly', 'phr');
    await fs.ensureDir(store);
    await fs.writeFile(path.join(store, `${UUID}.md`), 'sealed page');
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'phr'), { encrypt: true });
    const legacy = path.join(pagesDir, 'versions', 'vaults', UUID);
    await fs.ensureDir(path.join(legacy, 'v1'));
    await fs.writeFile(path.join(legacy, 'v1', 'content.md'), 'secret');

    expect((await migrateLegacyPrivateVersionBlobs(pagesDir)).moved).toBe(0);
    expect(await fs.pathExists(legacy)).toBe(true);
    expect(await fs.pathExists(path.join(store, 'versions', UUID))).toBe(false);
  });
});
