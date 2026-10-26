/**
 * #2097: PageManager's own lookups by author and editor work whether a page
 * stores the identity @id or (not yet converted) the username:
 * getPagesByCreator ("my pages"), getPagesByEditor, getPagesSharedWith and
 * deleteTestArtifacts. A deleted account's @id matches the new account with
 * the same name never.
 *
 * Sabotage: PageManager not passing `references` to the provider turned the
 * first test red (the provider then compares with the username only).
 */
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../../providers/FileSystemProvider');
vi.unmock('../../utils/PageNameMatcher');

import { actor } from '../../test-support/actors';
import { authorshipSite, type AuthorshipSite } from '../../test-support/authorshipSite';

const JIM = 'urn:uuid:11111111-1111-4111-8111-111111111111';
const BOB_OLD = 'urn:uuid:22222222-2222-4222-8222-222222222222';
const BOB_NEW = 'urn:uuid:33333333-3333-4333-8333-333333333333';

describe('#2097 PageManager lookups by identity @id', () => {
  let site: AuthorshipSite;
  beforeEach(async () => { site = await authorshipSite({ accounts: { jim: JIM, bob: BOB_OLD } }); });
  afterEach(async () => { await site.remove(); });

  test('my pages and my edits list pages stored by @id', async () => {
    const pm = site.pageManager;
    await pm.savePage('Jims', 'one', {}, actor('jim'));
    const titles = (await pm.getPagesByCreator('jim', actor('jim'))).map((e) => e.title);
    expect(titles).toEqual(['Jims']);
    expect((await pm.getPagesByEditor('jim', actor('jim'))).map((e) => e.title)).toEqual(['Jims']);
  });

  test('a reused username inherits nothing', async () => {
    const pm = site.pageManager;
    await pm.savePage('Old Bobs', 'one', {}, actor('bob'));
    // The old bob is deleted; a new account takes the name.
    site.accounts.bob = BOB_NEW;
    expect(await pm.getPagesByCreator('bob', actor('bob'))).toEqual([]);
    expect(await pm.getPagesByEditor('bob', actor('bob'))).toEqual([]);
  });

  test('shared with me leaves out my own pages stored by @id', async () => {
    const pm = site.pageManager;
    await pm.savePage('Mine', 'one', { audience: ['jim'] }, actor('jim'));
    expect(await pm.getPagesSharedWith(['jim'], { username: 'jim' })).toEqual([]);
  });

  test('deleteTestArtifacts by author finds a page stored by @id', async () => {
    const pm = site.pageManager;
    await pm.savePage('Profile', 'one', { 'system-keywords': ['test-artifact'], 'system-category': 'user-profile' }, actor('jim'));
    const { deleted } = await pm.deleteTestArtifacts(actor('admin'), { author: 'jim', systemCategory: 'user-profile' });
    expect(deleted.map((d) => d.title)).toEqual(['Profile']);
  });

  // Review fix 5. Sabotage: not adding the @id to the listing's principals turned this red.
  test('shared with me lists a page whose audience names me by @id', async () => {
    const pm = site.pageManager;
    await pm.savePage('For Bob', 'one', { audience: ['bob'] }, actor('jim'));
    const shared = await pm.getPagesSharedWith(['bob'], { username: 'bob' });
    expect(shared.map((e) => e.title)).toEqual(['For Bob']);
  });
});
