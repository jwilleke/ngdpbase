/**
 * #2097: the start-up conversion of page authorship to identity @ids.
 *
 * Pages written before (usernames in frontmatter, index, history and
 * tombstones) are converted once, through PageManager's own write path:
 *
 * - frontmatter `author`/`editor` only: the body, every other byte and
 *   `lastModified` are unchanged, and no version is added;
 * - the version history's editors, the page index and the tombstones;
 * - a username with no account becomes `orphan:<name>` (counted), a
 *   "no user recorded" value `orphan:<value>` (counted apart), principals
 *   are kept; a second run writes nothing;
 * - the identity store down: postponed, nothing written, retried later;
 * - batches of the configured size; after the first full pass only index
 *   entries still naming a username are opened;
 * - a vault's pages convert when the vault is opened, once per vault;
 * - the search index is rebuilt once when anything changed.
 *
 * Sabotage checks (each turned a test red once): the frontmatter rewrite
 * replaced by a full re-serialise (lastModified/bytes changed); the
 * manifest loop removed; the catch that postpones rethrowing; the
 * placeholder rule in convertRecordedUser skipped; the site marker never
 * written (the second pass re-reads every page); the vault marker check
 * removed; the search rebuild removed.
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
import { fakeIdentityManager } from '../../test-support/identities';
import { systemContext } from '../../context/bootActions';

const JIM = 'urn:uuid:11111111-1111-4111-8111-111111111111';
const ANN = 'urn:uuid:22222222-2222-4222-8222-222222222222';
const BOB_NEW = 'urn:uuid:33333333-3333-4333-8333-333333333333';
const SYS = systemContext(null, 'test');

/** Pages as written before #2097: saved with no identity store to answer, so usernames are stored. */
async function legacySite(extraConfig: Record<string, unknown> = {}): Promise<{ site: AuthorshipSite; uuids: Record<string, string> }> {
  const site = await authorshipSite({
    accounts: { jim: JIM, ann: ANN },
    config: { 'ngdpbase.system-category': vaultCategories(), ...extraConfig }
  });
  const identities = site.managers.get('IdentityManager');
  site.managers.delete('IdentityManager');
  const pm = site.pageManager;
  const uuids: Record<string, string> = {};
  uuids.a = (await pm.savePage('Alpha', 'alpha one', {}, actor('jim'))).uuid;
  await pm.savePage('Alpha', 'alpha two', { uuid: uuids.a }, actor('ann'));
  uuids.b = (await pm.savePage('Bobs', 'bob wrote this', {}, actor('bob'))).uuid;
  uuids.c = (await pm.savePage('Doomed', 'gone soon', {}, actor('jim'))).uuid;
  await pm.deletePage('Doomed', actor('ann'));
  uuids.v = (await pm.savePage('vaults/jim/default/Diary', 'dear diary', {}, actor('jim'))).uuid;
  await pm.flushWriteQueue();
  site.managers.set('IdentityManager', identities);
  return { site, uuids };
}

const pageFile = (site: AuthorshipSite, uuid: string) => path.join(site.pagesDir, `${uuid}.md`);
const manifest = async (site: AuthorshipSite, uuid: string) => fs.readJson(path.join(site.pagesDir, 'versions', uuid, 'manifest.json'));

/** A page file written by hand with a legacy placeholder author. */
async function placeholderPage(site: AuthorshipSite, uuid: string, author: string): Promise<void> {
  const file = pageFile(site, uuid);
  const parsed = matter(await fs.readFile(file, 'utf8'));
  await fs.writeFile(file, matter.stringify(parsed.content, { ...parsed.data, author }));
}

describe('#2097 page authorship conversion', () => {
  let site: AuthorshipSite;
  let uuids: Record<string, string>;
  beforeEach(async () => { ({ site, uuids } = await legacySite()); });
  afterEach(async () => { await site.remove(); });

  test('the legacy pages really hold usernames', async () => {
    expect(matter(await fs.readFile(pageFile(site, uuids.a), 'utf8')).data).toMatchObject({ author: 'jim', editor: 'ann' });
  });

  test('frontmatter, history, index and tombstones convert; nothing else changes', async () => {
    const before = await fs.readFile(pageFile(site, uuids.a), 'utf8');
    const manifestBefore = await manifest(site, uuids.a);
    const result = await site.pageManager.convertAuthorship(SYS);
    expect(result).toMatchObject({ status: 'done', full: true, pagesChanged: 2, versionsChanged: 3 });

    const after = await fs.readFile(pageFile(site, uuids.a), 'utf8');
    expect(after).toBe(before.replace('author: jim', `author: ${JIM}`).replace('editor: ann', `editor: ${ANN}`));
    expect(matter(after).data.lastModified).toEqual(matter(before).data.lastModified);

    const manifestAfter = await manifest(site, uuids.a);
    expect(manifestAfter.versions).toHaveLength(manifestBefore.versions.length);
    expect(manifestAfter.versions.map((v: { editor: string }) => v.editor)).toEqual([JIM, ANN]);
    expect(manifestAfter.versions.map((v: { contentHash: string }) => v.contentHash))
      .toEqual(manifestBefore.versions.map((v: { contentHash: string }) => v.contentHash));

    // bob has no account: his page is orphaned, and never his namesake's.
    expect(matter(await fs.readFile(pageFile(site, uuids.b), 'utf8')).data).toMatchObject({ author: 'orphan:bob', editor: 'orphan:bob' });
    expect(result?.orphans).toBeGreaterThan(0);

    const index = await fs.readJson(site.indexFile);
    expect(index.pages[uuids.a]).toMatchObject({ author: JIM, editor: ANN });
    expect(index.deletedPages[uuids.c]).toMatchObject({ author: JIM, deletedBy: ANN });
  });

  test('a deleted page converts too: its file in the trash and its history, so a restore brings it back converted', async () => {
    await site.pageManager.convertAuthorship(SYS);
    const trashFile = path.join(site.pagesDir, 'deleted', `${uuids.c}.md`);
    expect(matter(await fs.readFile(trashFile, 'utf8')).data).toMatchObject({ author: JIM, editor: JIM });
    expect((await manifest(site, uuids.c)).versions.map((v: { editor: string }) => v.editor)).toEqual([JIM]);
  });

  test('a second run writes nothing', async () => {
    await site.pageManager.convertAuthorship(SYS);
    const bytes = await fs.readFile(pageFile(site, uuids.a), 'utf8');
    const result = await site.pageManager.convertAuthorship(SYS);
    expect(result).toMatchObject({ status: 'done', full: false, pagesVisited: 0, pagesChanged: 0, versionsChanged: 0, tombstonesChanged: 0 });
    expect(await fs.readFile(pageFile(site, uuids.a), 'utf8')).toBe(bytes);
  });

  test('a reused username inherits nothing after the conversion', async () => {
    await site.pageManager.convertAuthorship(SYS);
    site.accounts.bob = BOB_NEW;
    expect(await site.pageManager.getPagesByCreator('bob', actor('bob'))).toEqual([]);
  });

  test('a "no user recorded" placeholder is orphaned without a lookup and counted apart', async () => {
    await placeholderPage(site, uuids.a, 'migrated');
    site.accounts.migrated = 'urn:uuid:44444444-4444-4444-8444-444444444444';
    const restarted = await site.restart();
    const result = await restarted.convertAuthorship(SYS);
    expect(matter(await fs.readFile(pageFile(site, uuids.a), 'utf8')).data.author).toBe('orphan:migrated');
    expect(result?.noUser).toBeGreaterThan(0);
  });

  test('the identity store down: postponed, nothing written, done at the next start', async () => {
    const before = await fs.readFile(pageFile(site, uuids.a), 'utf8');
    site.managers.set('IdentityManager', fakeIdentityManager(site.accounts, { down: true }));
    expect(await site.pageManager.convertAuthorship(SYS)).toMatchObject({ status: 'postponed' });
    expect(await fs.readFile(pageFile(site, uuids.a), 'utf8')).toBe(before);

    site.managers.set('IdentityManager', fakeIdentityManager(site.accounts, { failLookups: true }));
    expect(await site.pageManager.convertAuthorship(SYS)).toMatchObject({ status: 'postponed' });
    expect(await fs.readFile(pageFile(site, uuids.a), 'utf8')).toBe(before);
    expect(await fs.pathExists(path.join(site.dir, 'site-migrations.json'))).toBe(false);

    site.managers.set('IdentityManager', fakeIdentityManager(site.accounts));
    expect(await site.pageManager.convertAuthorship(SYS)).toMatchObject({ status: 'done', full: true });
    expect(matter(await fs.readFile(pageFile(site, uuids.a), 'utf8')).data.author).toBe(JIM);
  });

  test('after the full pass, only index entries still naming a username are opened', async () => {
    await site.pageManager.convertAuthorship(SYS);
    // A page written meanwhile with no identity store to answer.
    const identities = site.managers.get('IdentityManager');
    site.managers.delete('IdentityManager');
    const late = (await site.pageManager.savePage('Late', 'late', {}, actor('jim'))).uuid;
    site.managers.set('IdentityManager', identities);
    const result = await site.pageManager.convertAuthorship(SYS);
    expect(result).toMatchObject({ full: false, pagesVisited: 1, pagesChanged: 1 });
    expect(matter(await fs.readFile(pageFile(site, late), 'utf8')).data.author).toBe(JIM);
  });

  test('the search index is rebuilt once when pages changed', async () => {
    const rebuildFromDisk = vi.fn(async () => undefined);
    site.managers.set('SearchManager', { rebuildFromDisk });
    await site.pageManager.convertAuthorship(SYS);
    expect(rebuildFromDisk).toHaveBeenCalledTimes(1);
    await site.pageManager.convertAuthorship(SYS);
    expect(rebuildFromDisk).toHaveBeenCalledTimes(1);
  });

  test('a vault converts when it is opened, once', async () => {
    const vaultFile = path.join(site.pagesDir, 'vaults', 'jim', 'default', `${uuids.v}.md`);
    expect(matter(await fs.readFile(vaultFile, 'utf8')).data.author).toBe('jim');
    // The start-up pass does not open vaults.
    await site.pageManager.convertAuthorship(SYS);
    expect(matter(await fs.readFile(vaultFile, 'utf8')).data.author).toBe('jim');

    const opened = await site.pageManager.convertVaultAuthorship(actor('jim'), 'jim');
    expect(opened).toMatchObject({ status: 'done', pagesChanged: 1 });
    expect(matter(await fs.readFile(vaultFile, 'utf8')).data).toMatchObject({ author: JIM, editor: JIM });
    const vaultIndex = await fs.readJson(path.join(site.pagesDir, 'vaults', 'jim', 'default', 'pages-index.json'));
    expect(Object.values(vaultIndex.pages ?? vaultIndex)[0]).toMatchObject({ author: JIM, creator: 'jim' });
    expect((await site.pageManager.convertVaultAuthorship(actor('jim'), 'jim'))?.pagesVisited).toBe(0);
  });

  // Sabotage: taking the conversion's page write out of `pageWrites` turned this red
  // (the conversion wrote the old body back over the save).
  test('a save during the conversion is never written over', async () => {
    const identities = site.managers.get('IdentityManager') as { getByUserIdentifier(ctx: unknown, u: string): Promise<unknown> };
    const lookup = identities.getByUserIdentifier.bind(identities);
    // Only the conversion's lookups are slow: its read and its write of the page are far apart.
    identities.getByUserIdentifier = async (ctx: unknown, u: string) => {
      if ((ctx as { reason?: string }).reason === 'test') await new Promise((resolve) => setTimeout(resolve, 15));
      return lookup(ctx, u);
    };
    const converting = site.pageManager.convertAuthorship(SYS);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await site.pageManager.savePage('Alpha', 'saved meanwhile', { uuid: uuids.a }, actor('jim'));
    await converting;
    const page = matter(await fs.readFile(pageFile(site, uuids.a), 'utf8'));
    expect(page.content.trim()).toBe('saved meanwhile');
    expect(page.data).toMatchObject({ author: JIM, editor: JIM });
  });

  // Sabotage: dropping the shipped/add-on branch turned this red (the orphan counted as needing attention).
  test('a shipped page whose author has no account here is orphaned but counted apart, not needing attention', async () => {
    site.config['ngdpbase.system-category'] = {
      ...vaultCategories(),
      documentation: { label: 'documentation', source: 'shipped', storageLocation: { defaultstore: 'pages/' } }
    };
    const file = pageFile(site, uuids.b);
    const parsed = matter(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, matter.stringify(parsed.content, { ...parsed.data, author: 'upstream', editor: 'upstream', 'system-category': 'documentation' }));
    const restarted = await site.restart();
    const attention = vi.spyOn(restarted as unknown as { markNeedsAttention(r: string): void }, 'markNeedsAttention');
    const result = await restarted.convertAuthorship(SYS);
    expect(matter(await fs.readFile(file, 'utf8')).data.author).toBe('orphan:upstream');
    expect(result).toMatchObject({ orphans: 0 });
    expect(result?.shippedOrphans).toBeGreaterThan(0);
    expect(attention).not.toHaveBeenCalled();
  });

  test('batches of the configured size reach every page', async () => {
    site.config['ngdpbase.page.authorship-conversion.batch-size'] = 1;
    const result = await site.pageManager.convertAuthorship(SYS);
    expect(result).toMatchObject({ status: 'done', pagesVisited: 2, pagesChanged: 2 });
  });
});
