import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { migrateLegacyPrivatePages } from '../migrateLegacyPrivatePages';
import { DEFAULT_PRIVATE_STORE } from '../privateStorePath';

describe('migrateLegacyPrivatePages (#1383)', () => {
  let pagesDir: string;

  beforeEach(async () => {
    pagesDir = path.join(os.tmpdir(), `priv-store-mig-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.ensureDir(pagesDir);
  });

  afterEach(async () => {
    await fs.remove(pagesDir);
  });

  test('moves private/{user}/{uuid}.md into default/ and leaves catalogs and store dirs', async () => {
    const uuid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const legacy = path.join(pagesDir, 'private', 'jim', `${uuid}.md`);
    await fs.ensureDir(path.dirname(legacy));
    await fs.writeFile(legacy, '---\ntitle: Secret\n---\nbody\n');
    await fs.writeFile(path.join(pagesDir, 'private', 'jim', 'user-index.json'), '{}');
    await fs.writeFile(path.join(pagesDir, 'private', 'jim', 'user-keys.json'), '{}');
    await fs.ensureDir(path.join(pagesDir, 'private', 'jim', 'yourphr'));

    const result = await migrateLegacyPrivatePages(pagesDir);

    expect(result.moved).toBe(1);
    expect(await fs.pathExists(legacy)).toBe(false);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'jim', DEFAULT_PRIVATE_STORE, `${uuid}.md`))).toBe(true);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'jim', 'user-index.json'))).toBe(true);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'jim', 'user-keys.json'))).toBe(true);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'jim', 'yourphr'))).toBe(true);
  });

  test('is a no-op when the file is already in default/', async () => {
    const uuid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const dest = path.join(pagesDir, 'private', 'jim', 'default', `${uuid}.md`);
    await fs.ensureDir(path.dirname(dest));
    await fs.writeFile(dest, 'x');

    expect(await migrateLegacyPrivatePages(pagesDir)).toEqual({ moved: 0 });
    expect(await fs.pathExists(dest)).toBe(true);
  });

  test('does not overwrite default/ if both layouts exist', async () => {
    const uuid = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const legacy = path.join(pagesDir, 'private', 'jim', `${uuid}.md`);
    const dest = path.join(pagesDir, 'private', 'jim', 'default', `${uuid}.md`);
    await fs.ensureDir(path.dirname(legacy));
    await fs.ensureDir(path.dirname(dest));
    await fs.writeFile(legacy, 'old');
    await fs.writeFile(dest, 'new');

    expect(await migrateLegacyPrivatePages(pagesDir)).toEqual({ moved: 0 });
    expect(await fs.readFile(dest, 'utf8')).toBe('new');
    expect(await fs.pathExists(legacy)).toBe(true);
  });

  test('injected privateroot sealed looks under sealed/, not private/', async () => {
    const uuid = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const layout = { privateRoot: 'sealed' };
    const legacy = path.join(pagesDir, 'sealed', 'jim', `${uuid}.md`);
    await fs.ensureDir(path.dirname(legacy));
    await fs.writeFile(legacy, '---\ntitle: Secret\n---\nbody\n');
    await fs.ensureDir(path.join(pagesDir, 'private', 'jim'));
    await fs.writeFile(path.join(pagesDir, 'private', 'jim', `${uuid}.md`), 'leave-me');

    const result = await migrateLegacyPrivatePages(pagesDir, layout);

    expect(result.moved).toBe(1);
    expect(await fs.pathExists(path.join(pagesDir, 'sealed', 'jim', DEFAULT_PRIVATE_STORE, `${uuid}.md`))).toBe(true);
    expect(await fs.pathExists(legacy)).toBe(false);
    expect(await fs.readFile(path.join(pagesDir, 'private', 'jim', `${uuid}.md`), 'utf8')).toBe('leave-me');
  });
});
