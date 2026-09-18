/**
 * @file seededShippedPages.test.ts
 * @description The per-site record of shipped pages: seeded once per site
 * (#1405) and declined per source (#1412).
 *
 * Temp directories only; teardown removes the mkdtemp directory it created.
 */
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import fse from 'fs-extra';
import { SEEDED_SHIPPED_PAGES_FILE, SeededShippedPages } from '../seededShippedPages';

const UUID_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const UUID_B = 'bbbbbbbb-0000-0000-0000-000000000002';

describe('SeededShippedPages', () => {
  let dir: string;
  const file = () => path.join(dir, SEEDED_SHIPPED_PAGES_FILE);

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'seeded-record-'));
  });

  afterEach(async () => {
    // Only this test's own mkdtemp directory.
    await fse.remove(dir);
  });

  test('a missing file is an empty record', async () => {
    const record = await SeededShippedPages.load(dir);

    expect(record.hasSource('required-pages')).toBe(false);
    expect(record.has('required-pages', UUID_A)).toBe(false);
  });

  test('seeded uuids survive a save and reload, case-insensitively', async () => {
    const record = await SeededShippedPages.load(dir);
    expect(record.add('required-pages', UUID_A.toUpperCase())).toBe(true);
    expect(record.add('required-pages', UUID_A)).toBe(false);
    await record.save();

    const reloaded = await SeededShippedPages.load(dir);
    expect(reloaded.has('required-pages', UUID_A)).toBe(true);
    expect(reloaded.has('required-pages', UUID_B)).toBe(false);
  });

  test('#1412 a decline is per source: the same uuid from another source is untouched', async () => {
    const record = await SeededShippedPages.load(dir);

    expect(record.decline('required-pages', UUID_A, { at: 'now', by: 'admin', reason: 'slug taken' })).toBe(true);

    expect(record.isDeclined('required-pages', UUID_A)).toBe(true);
    expect(record.isDeclined('addon:fairways', UUID_A)).toBe(false);
    expect(record.declinedEntry('required-pages', UUID_A)).toMatchObject({ by: 'admin', reason: 'slug taken' });
  });

  test('#1412 declines survive a reload and can be undone', async () => {
    const record = await SeededShippedPages.load(dir);
    record.decline('addon:fairways', UUID_B, { at: 'now', by: 'admin', reason: 'title taken' });
    await record.save();

    const reloaded = await SeededShippedPages.load(dir);
    expect(reloaded.isDeclined('addon:fairways', UUID_B)).toBe(true);
    expect(Object.keys(reloaded.declinedOf('addon:fairways'))).toEqual([UUID_B]);
    expect(reloaded.allDeclined()).toHaveProperty('addon:fairways');

    expect(reloaded.allow('addon:fairways', UUID_B)).toBe(true);
    expect(reloaded.allow('addon:fairways', UUID_B)).toBe(false);
    await reloaded.save();

    expect((await SeededShippedPages.load(dir)).isDeclined('addon:fairways', UUID_B)).toBe(false);
  });

  test('#1412 a version 1 file keeps every seeded uuid and has no declines', async () => {
    // Written by #1405: the source map WAS the seeded map.
    await fse.writeJson(file(), { version: 1, sources: { 'required-pages': { [UUID_A]: '2026-09-17T00:00:00.000Z' } } });

    const record = await SeededShippedPages.load(dir);

    expect(record.has('required-pages', UUID_A)).toBe(true);
    expect(record.isDeclined('required-pages', UUID_A)).toBe(false);
    expect(record.allDeclined()).toEqual({});
  });
});
