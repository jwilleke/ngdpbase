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

  // Gate fix (#2097): orphans are the intended final state. Sabotage: marking
  // them needs-attention again turned this red.
  test('orphans are logged, never needs-attention', async () => {
    const attention = vi.spyOn(site.pageManager as unknown as { markNeedsAttention(r: string): void }, 'markNeedsAttention');
    const result = await site.pageManager.convertAuthorship(SYS);
    expect(result?.orphans).toBeGreaterThan(0);
    expect(attention).not.toHaveBeenCalled();
  });

  // Gate fix: a legacy private tombstone (a private page deleted before vaults:
  // an owner, no store) failed with "needs its owner and store" on every start.
  // Sabotage: dropping the legacyPrivate guard turned this red (one skip, class Error).
  test('a legacy private tombstone converts its fields and is never skipped', async () => {
    await site.pageManager.flushWriteQueue();
    const index = await fs.readJson(site.indexFile);
    index.deletedPages['legacy-private-1'] = {
      title: 'Old Private', uuid: 'legacy-private-1', location: 'private', creator: 'jim', currentVersion: 1,
      lastModified: '2026-01-01T00:00:00.000Z', editor: 'jim', author: 'jim', hasVersions: true,
      deletedAt: '2026-01-02T00:00:00.000Z', deletedBy: 'jim', deletedFrom: '/nowhere/vaults/jim/old.md'
    };
    await fs.writeJson(site.indexFile, index);
    const restarted = await site.restart();
    const result = await restarted.convertAuthorship(SYS);
    expect(result).toMatchObject({ pagesSkipped: 0, skipErrors: [] });
    await restarted.flushWriteQueue();
    expect((await fs.readJson(site.indexFile)).deletedPages['legacy-private-1']).toMatchObject({ author: JIM, editor: JIM, deletedBy: JIM });
  });

  // Gate fix: a page whose file has no `editor` kept the history's username in
  // its index entry, so every later start opened it again. Sabotage: dropping the
  // index-only conversion turned this red.
  test('an index entry whose file has no editor of its own is converted too', async () => {
    const file = pageFile(site, uuids.a);
    const parsed = matter(await fs.readFile(file, 'utf8'));
    const { editor: _gone, ...rest } = parsed.data;
    await fs.writeFile(file, matter.stringify(parsed.content, rest));
    await site.pageManager.flushWriteQueue();
    const index = await fs.readJson(site.indexFile);
    index.pages[uuids.a].editor = 'ann';
    await fs.writeJson(site.indexFile, index);
    const restarted = await site.restart();
    await restarted.convertAuthorship(SYS);
    await restarted.flushWriteQueue();
    expect((await fs.readJson(site.indexFile)).pages[uuids.a].editor).toBe(ANN);
    // Nothing left: the next start opens no page.
    expect((await restarted.convertAuthorship(SYS))?.pagesVisited).toBe(0);
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
    // The pass is not recorded as done (a search-rebuild mark may be).
    const recordFile = path.join(site.dir, 'site-migrations.json');
    const record = await fs.pathExists(recordFile) ? await fs.readJson(recordFile) : {};
    expect(record.migrations?.['authorship-identity-ids']).toBeUndefined();

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
  // #1503: a shipped copy is decided per page, by the seeded-pages record.
  const upstreamDocumentationPage = async (seeded: boolean) => {
    site.config['ngdpbase.system-category'] = {
      ...vaultCategories(),
      documentation: { label: 'documentation', storageLocation: { defaultstore: 'pages/' } }
    };
    const file = pageFile(site, uuids.b);
    const parsed = matter(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, matter.stringify(parsed.content, { ...parsed.data, author: 'upstream', editor: 'upstream', 'system-category': 'documentation' }));
    if (seeded) {
      await fs.writeJson(path.join(site.dir, 'seeded-shipped-pages.json'), {
        version: 2, sources: { 'required-pages': { seeded: { [uuids.b.toLowerCase()]: '2026-01-01T00:00:00.000Z' }, declined: {} } }
      });
    }
    const restarted = await site.restart();
    const attention = vi.spyOn(restarted as unknown as { markNeedsAttention(r: string): void }, 'markNeedsAttention');
    const result = await restarted.convertAuthorship(SYS);
    expect(matter(await fs.readFile(file, 'utf8')).data.author).toBe('orphan:upstream');
    return { result, attention };
  };

  test('a shipped page whose author has no account here is orphaned but counted apart, not needing attention', async () => {
    const { result, attention } = await upstreamDocumentationPage(true);
    expect(result).toMatchObject({ orphans: 0 });
    expect(result?.shippedOrphans).toBeGreaterThan(0);
    expect(attention).not.toHaveBeenCalled();
  });

  test('a page made on this site in a shipped system-category is not taken for a shipped one (#1503)', async () => {
    const { result } = await upstreamDocumentationPage(false);
    expect(result?.shippedOrphans).toBe(0);
    expect(result?.orphans).toBeGreaterThan(0);
  });

  // Review fix 1. Sabotage: running the tombstone conversion outside withPageWrite
  // (or without the "still there" check) turned this red: the purged trash
  // file came back.
  test('a purge during the pass leaves nothing on disk', async () => {
    const identities = site.managers.get('IdentityManager') as { getByUserIdentifier(ctx: unknown, u: string): Promise<unknown> };
    const lookup = identities.getByUserIdentifier.bind(identities);
    identities.getByUserIdentifier = async (ctx: unknown, u: string) => {
      if ((ctx as { reason?: string }).reason === 'test') await new Promise((resolve) => setTimeout(resolve, 10));
      return lookup(ctx, u);
    };
    type Provider = {
      purgeDeletedPage(uuid: string): Promise<boolean>;
      finishAuthorshipConversion(...args: unknown[]): Promise<unknown>;
    };
    const provider = (site.pageManager as unknown as { provider: Provider }).provider;
    // The purge lands while the tombstone is being converted: after its
    // fields (three slow lookups) and its file have been read, before the
    // file's two lookups end and it is written.
    let purging: Promise<boolean> | null = null;
    const finish = provider.finishAuthorshipConversion.bind(provider);
    provider.finishAuthorshipConversion = (...args: unknown[]) => {
      setTimeout(() => { purging = provider.purgeDeletedPage(uuids.c); }, 40);
      return finish(...args);
    };
    await site.pageManager.convertAuthorship(SYS);
    await purging;
    expect(purging).not.toBeNull();
    expect(await fs.pathExists(path.join(site.pagesDir, 'deleted', `${uuids.c}.md`))).toBe(false);
    expect(await fs.pathExists(path.join(site.pagesDir, 'versions', uuids.c))).toBe(false);
    expect((await fs.readJson(site.indexFile)).deletedPages?.[uuids.c]).toBeUndefined();
  });

  // Review fix 3. Sabotage: letting a page's own error end the pass turned the
  // first red; not rebuilding when an earlier run left the search stale turned the second.
  test('a page that fails for its own reason is skipped and named by its error class; the rest convert', async () => {
    const provider = (site.pageManager as unknown as { provider: { convertPageReferences(...args: unknown[]): Promise<unknown> } }).provider;
    const real = provider.convertPageReferences.bind(provider);
    provider.convertPageReferences = async (...args: unknown[]) => {
      if (args[1] === uuids.a) throw Object.assign(new Error(`EACCES: permission denied, open '${site.pagesDir}/x.md'`), { code: 'EACCES' });
      return real(...args);
    };
    const attention = vi.spyOn(site.pageManager as unknown as { markNeedsAttention(r: string): void }, 'markNeedsAttention');
    const result = await site.pageManager.convertAuthorship(SYS);
    expect(result).toMatchObject({ status: 'done', pagesSkipped: 1, skipErrors: ['EACCES'] });
    expect(matter(await fs.readFile(pageFile(site, uuids.b), 'utf8')).data.author).toBe('orphan:bob');
    const reasons = attention.mock.calls.map((c) => c[0]).join('\n');
    expect(reasons).toContain('EACCES');
    expect(reasons).not.toContain(site.pagesDir);
    // Not recorded as complete: the next start visits every page again.
    const record = await fs.readJson(path.join(site.dir, 'site-migrations.json'));
    expect(record.migrations?.['authorship-identity-ids']).toBeUndefined();
  });

  test('the search index is rebuilt after an earlier run converted pages and never rebuilt it', async () => {
    site.managers.set('SearchManager', { rebuildFromDisk: vi.fn(async () => undefined) });
    await site.pageManager.convertAuthorship(SYS); // the full pass, recorded
    // A page written meanwhile with no identity store to answer, converted by a
    // quick pass whose search rebuild fails.
    const identities = site.managers.get('IdentityManager');
    site.managers.delete('IdentityManager');
    await site.pageManager.savePage('Late', 'late', {}, actor('jim'));
    site.managers.set('IdentityManager', identities);
    const failing = vi.fn(async () => { throw new Error('search down'); });
    site.managers.set('SearchManager', { rebuildFromDisk: failing });
    expect(await site.pageManager.convertAuthorship(SYS)).toMatchObject({ full: false, pagesChanged: 1 });
    expect(failing).toHaveBeenCalledTimes(1);
    // Nothing left to convert, but the search index is still stale: rebuilt now, once.
    const ok = vi.fn(async () => undefined);
    site.managers.set('SearchManager', { rebuildFromDisk: ok });
    expect(await site.pageManager.convertAuthorship(SYS)).toMatchObject({ full: false, pagesChanged: 0 });
    expect(ok).toHaveBeenCalledTimes(1);
    await site.pageManager.convertAuthorship(SYS);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  // Review fix 5. Sabotage: not passing convertPrincipal to the provider turned this red.
  test('access lists: user entries convert, roles and add-on entries are kept, a deleted user is orphaned', async () => {
    const file = pageFile(site, uuids.a);
    const parsed = matter(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, matter.stringify(parsed.content, { ...parsed.data, audience: ['jim', 'editor', 'bob', 'addon:phr'], access: { edit: ['bob', 'admin'] } }));
    const restarted = await site.restart();
    await restarted.convertAuthorship(SYS);
    const data = matter(await fs.readFile(file, 'utf8')).data;
    expect(data.audience).toEqual([JIM, 'editor', 'orphan:bob', 'addon:phr']);
    expect(data.access).toEqual({ edit: ['orphan:bob', 'admin'] });
  });

  // Sabotage: removing the catalogue guard in accessListConverter turned this red (every role orphaned).
  test('without the role catalogue no access-list entry is converted', async () => {
    delete site.config['ngdpbase.roles.definitions'];
    const file = pageFile(site, uuids.a);
    const parsed = matter(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, matter.stringify(parsed.content, { ...parsed.data, audience: ['editor', 'bob'] }));
    const restarted = await site.restart();
    await restarted.convertAuthorship(SYS);
    expect(matter(await fs.readFile(file, 'utf8')).data.audience).toEqual(['editor', 'bob']);
  });

  // The window before the pass reaches a page (documented in the PR and the storage guide):
  // an author still held as a username matches whoever holds that username now, and
  // the pass then maps it to that account's @id.
  test('a page not yet reached by the pass: an unconverted username matches a new account with that name', async () => {
    site.accounts.bob = BOB_NEW; // the old bob had no account; a new bob registers before the pass
    expect((await site.pageManager.getPagesByCreator('bob', actor('bob'))).map((e) => e.title)).toEqual(['Bobs']);
    await site.pageManager.convertAuthorship(SYS);
    expect(matter(await fs.readFile(pageFile(site, uuids.b), 'utf8')).data.author).toBe(BOB_NEW);
  });

  test('batches of the configured size reach every page', async () => {
    site.config['ngdpbase.page.authorship-conversion.batch-size'] = 1;
    const result = await site.pageManager.convertAuthorship(SYS);
    expect(result).toMatchObject({ status: 'done', pagesVisited: 2, pagesChanged: 2 });
  });
});
