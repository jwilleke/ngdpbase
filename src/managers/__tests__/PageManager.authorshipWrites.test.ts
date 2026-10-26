/**
 * #2097: new page writes store the author's and editor's identity @id.
 *
 * - a new page: `author` and `editor` are the actor's @id, in the file, the
 *   page index and the version manifest;
 * - an edit keeps the author (converting one still held as a username) and
 *   stamps the editor's @id;
 * - a name with no account, and the system principal, are stored as they are;
 * - with the identity store down a save still works and stores the username;
 * - a vault page's author is its owner's @id, the vault still named by username;
 * - the Private box moves a page whose author is an @id into that user's vault;
 * - a tombstone names who deleted the page by @id.
 *
 * Sabotage checks (each turned a test red once): dropping the two
 * `referenceTo` lines in normalizeSaveMetadata; `ownerRef` replaced by the
 * owner's username in FileSystemProvider.savePage; the `authorUsername`
 * argument dropped from privatePlacement; `deletedBy` back to the username.
 */
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../../providers/FileSystemProvider');
vi.unmock('../../utils/PageNameMatcher');

import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import { actor } from '../../test-support/actors';
import { vaultCategories } from '../../test-support/vaults';
import { authorshipSite, type AuthorshipSite } from '../../test-support/authorshipSite';

const JIM = 'urn:uuid:11111111-1111-4111-8111-111111111111';
const ANN = 'urn:uuid:22222222-2222-4222-8222-222222222222';

async function frontmatter(site: AuthorshipSite, uuid: string): Promise<Record<string, unknown>> {
  return matter(await fs.readFile(path.join(site.pagesDir, `${uuid}.md`), 'utf8')).data;
}

async function manifestEditors(site: AuthorshipSite, uuid: string): Promise<string[]> {
  const manifest = await fs.readJson(path.join(site.pagesDir, 'versions', uuid, 'manifest.json'));
  return manifest.versions.map((v: { editor: string }) => v.editor);
}

describe('#2097 page writes store identity @ids', () => {
  let site: AuthorshipSite;
  beforeEach(async () => {
    site = await authorshipSite({
      accounts: { jim: JIM, ann: ANN },
      config: { 'ngdpbase.system-category': vaultCategories() }
    });
  });
  afterEach(async () => { await site.remove(); });

  test('a new page and an edit store @ids in the file, the index and the history', async () => {
    const pm = site.pageManager;
    const { uuid } = await pm.savePage('Authored', 'one', {}, actor('jim'));
    expect(await frontmatter(site, uuid)).toMatchObject({ author: JIM, editor: JIM });
    await pm.savePage('Authored', 'two', { uuid }, actor('ann'));
    expect(await frontmatter(site, uuid)).toMatchObject({ author: JIM, editor: ANN });
    expect(await manifestEditors(site, uuid)).toEqual([JIM, ANN]);
    await pm.flushWriteQueue();
    const index = await fs.readJson(site.indexFile);
    expect(index.pages[uuid]).toMatchObject({ author: JIM, editor: ANN });
  });

  test('an edit converts an author still held as a username', async () => {
    const pm = site.pageManager;
    const { uuid } = await pm.savePage('Old', 'one', {}, actor('jim'));
    const file = path.join(site.pagesDir, `${uuid}.md`);
    const parsed = matter(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, matter.stringify(parsed.content, { ...parsed.data, author: 'jim' }));
    const restarted = await site.restart();
    await restarted.savePage('Old', 'two', { uuid }, actor('ann'));
    expect(await frontmatter(site, uuid)).toMatchObject({ author: JIM, editor: ANN });
  });

  test('a name with no account and the system principal are stored as they are', async () => {
    const pm = site.pageManager;
    const { uuid } = await pm.savePage('Nobody', 'one', {}, actor('ghost'));
    expect(await frontmatter(site, uuid)).toMatchObject({ author: 'ghost', editor: 'ghost' });
    const sys = await pm.savePage('By System', 'one', {}, { username: 'system', origin: 'boot', requestedAt: new Date().toISOString(), reason: 'test' });
    expect((await frontmatter(site, sys.uuid)).author).toBe('system');
  });

  test('with the identity store down a save still works and stores the username', async () => {
    const down = await authorshipSite({ accounts: { jim: JIM }, identity: { failLookups: true } });
    try {
      const { uuid } = await down.pageManager.savePage('Down', 'one', {}, actor('jim'));
      expect(await frontmatter(down, uuid)).toMatchObject({ author: 'jim', editor: 'jim' });
    } finally {
      await down.remove();
    }
  });

  test('a vault page: the author is the owner @id, the vault is named by username', async () => {
    const pm = site.pageManager;
    const saved = await pm.savePage('vaults/jim/default/Secret', 'one', {}, actor('jim'));
    expect(saved.name).toBe('vaults/jim/default/Secret');
    const file = path.join(site.pagesDir, 'vaults', 'jim', 'default', `${saved.uuid}.md`);
    expect(matter(await fs.readFile(file, 'utf8')).data).toMatchObject({ author: JIM, editor: JIM, private: true });
    const index = await fs.readJson(path.join(site.pagesDir, 'vaults', 'jim', 'default', 'pages-index.json'));
    expect(Object.values(index.pages ?? index)[0]).toMatchObject({ author: JIM, creator: 'jim' });
  });

  test('the Private box moves a page whose author is an @id into that user vault', async () => {
    const pm = site.pageManager;
    const { uuid } = await pm.savePage('Going Private', 'one', {}, actor('jim'));
    const moved = await pm.savePage('Going Private', 'one', { uuid, private: true }, actor('jim'));
    expect(moved.name).toBe('vaults/jim/default/Going Private');
  });

  test('the Private box on the plain FileSystemProvider too', async () => {
    const plain = await authorshipSite({
      accounts: { jim: JIM },
      config: {
        'ngdpbase.system-category': vaultCategories(),
        'ngdpbase.page.provider': 'filesystemprovider',
        'ngdpbase.page.provider.default': 'filesystemprovider'
      }
    });
    try {
      const { uuid } = await plain.pageManager.savePage('Plain Private', 'one', {}, actor('jim'));
      const moved = await plain.pageManager.savePage('Plain Private', 'one', { uuid, private: true }, actor('jim'));
      expect(moved.name).toBe('vaults/jim/default/Plain Private');
      expect(await fs.pathExists(path.join(plain.pagesDir, 'vaults', 'jim', 'default', `${uuid}.md`))).toBe(true);
    } finally {
      await plain.remove();
    }
  });

  test('a tombstone names who deleted the page by @id', async () => {
    const pm = site.pageManager;
    const { uuid } = await pm.savePage('Doomed', 'one', {}, actor('jim'));
    await pm.deletePage('Doomed', actor('ann'));
    await pm.flushWriteQueue();
    const index = await fs.readJson(site.indexFile);
    expect(index.deletedPages[uuid]).toMatchObject({ deletedBy: ANN, author: JIM });
  });
});
