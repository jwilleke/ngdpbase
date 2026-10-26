/**
 * #2097: how the routes show a page's or file's author, editor, uploader or
 * deleter (username followed by the identity @id; an orphan as "(no
 * account)"), decide whether a user is the author (the editor's author-lock
 * box, the save route), and name the author in crawler metadata (username
 * only). The routes call these helpers on every display surface: the page
 * information modal and statistics, history, diff, my lists, trash, the
 * required-pages report, the attachments admin and its health report, the
 * edit conflict and the editor's author-lock notice.
 *
 * Sabotage: describeUsersIn leaving fields unchanged, and isPageAuthorOf
 * comparing the stored value with the username, each turned a test red.
 */
import WikiRoutes from '../WikiRoutes';
import { fakeIdentityManager } from '../../test-support/identities';

interface Helpers {
  describeUser(stored: unknown): Promise<string>;
  describeUsersIn<T extends object>(items: T[], fields: string[]): Promise<T[]>;
  isPageAuthorOf(author: unknown, username: string | undefined): Promise<boolean>;
  usernameShown(stored: unknown): Promise<string | undefined>;
}

function routes(withIdentities = true): Helpers {
  const identities = fakeIdentityManager({ jim: 'urn:uuid:jim-1', bob: 'urn:uuid:bob-new' });
  const engine = { getManager: (name: string) => (name === 'IdentityManager' && withIdentities ? identities : null) };
  return new WikiRoutes(engine);
}

describe('#2097 WikiRoutes shows and decides authorship by identity @id', () => {
  test('describeUsersIn shows each named field as username and id', async () => {
    const shown = await routes().describeUsersIn(
      [{ title: 'A', editor: 'urn:uuid:jim-1', deletedBy: 'orphan:bob' }, { title: 'B', editor: 'jim' }],
      ['editor', 'deletedBy']
    );
    expect(shown).toEqual([
      { title: 'A', editor: 'jim (urn:uuid:jim-1)', deletedBy: 'bob (no account)' },
      { title: 'B', editor: 'jim' }
    ]);
  });

  test('isPageAuthorOf: the @id own account only; a reused name inherits nothing', async () => {
    const r = routes();
    expect(await r.isPageAuthorOf('urn:uuid:jim-1', 'jim')).toBe(true);
    expect(await r.isPageAuthorOf('urn:uuid:jim-1', 'bob')).toBe(false);
    expect(await r.isPageAuthorOf('urn:uuid:bob-old', 'bob')).toBe(false);
    expect(await r.isPageAuthorOf('orphan:bob', 'bob')).toBe(false);
    expect(await r.isPageAuthorOf('jim', 'jim')).toBe(true);
  });

  test('usernameShown names the user for crawler metadata, never the id', async () => {
    const r = routes();
    expect(await r.usernameShown('urn:uuid:jim-1')).toBe('jim');
    expect(await r.usernameShown('orphan:bob')).toBe('bob');
    expect(await r.usernameShown('urn:uuid:gone')).toBeUndefined();
  });

  test('without IdentityManager the stored value is shown as it is', async () => {
    expect(await routes(false).describeUser('urn:uuid:jim-1')).toBe('urn:uuid:jim-1');
  });
});
