/**
 * #1503 (operator, 2026-10-29): a shipped page — a copy of an original from
 * required-pages/ or an add-on's pages, decided per page by the seeded-pages
 * record — is never private, even in a system-category that has a vault. A
 * page made on the site in the same system-category may be.
 */
vi.unmock('../PageManager');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../../providers/FileSystemProvider');
vi.unmock('../../utils/PageNameMatcher');

import fs from 'fs-extra';
import path from 'path';
import { actor } from '../../test-support/actors';
import { vaultCategories } from '../../test-support/vaults';
import { authorshipSite, type AuthorshipSite } from '../../test-support/authorshipSite';

describe('a shipped page is never private (#1503)', () => {
  let site: AuthorshipSite;

  beforeEach(async () => {
    site = await authorshipSite({ config: { 'ngdpbase.system-category': vaultCategories() } });
  });

  afterEach(async () => {
    await site.remove(); // this test's own temp dir only
  });

  const seedRecord = (uuid: string) => fs.writeJson(path.join(site.dir, 'seeded-shipped-pages.json'), {
    version: 2, sources: { 'addon:demo': { seeded: { [uuid.toLowerCase()]: '2026-01-01T00:00:00.000Z' }, declined: {} } }
  });

  test('a seeded add-on page in a system-category with a vault stays public when asked to be private', async () => {
    const uuid = 'aaaaaaaa-0000-4000-8000-000000000001';
    await site.pageManager.savePage('Demo Guide', 'from the add-on', { uuid, 'system-category': 'general', addon: 'demo' }, actor('jim'));
    await seedRecord(uuid);

    await site.pageManager.savePage('Demo Guide', 'edited', { uuid, 'system-category': 'general', private: true }, actor('jim'));
    await site.pageManager.flushWriteQueue();

    expect(await fs.pathExists(path.join(site.pagesDir, `${uuid}.md`))).toBe(true);
    expect(await fs.pathExists(path.join(site.pagesDir, 'vaults', 'jim', 'default', `${uuid}.md`))).toBe(false);
  });

  test('a page made on the site in the same system-category can be made private', async () => {
    const uuid = 'aaaaaaaa-0000-4000-8000-000000000002';
    await site.pageManager.savePage('My Notes', 'mine', { uuid, 'system-category': 'general' }, actor('jim'));
    await seedRecord('aaaaaaaa-0000-4000-8000-000000000009');

    await site.pageManager.savePage('My Notes', 'mine, private', { uuid, 'system-category': 'general', private: true }, actor('jim'));
    await site.pageManager.flushWriteQueue();

    expect(await fs.pathExists(path.join(site.pagesDir, `${uuid}.md`))).toBe(false);
    expect(await fs.pathExists(path.join(site.pagesDir, 'vaults', 'jim', 'default', `${uuid}.md`))).toBe(true);
  });
});
