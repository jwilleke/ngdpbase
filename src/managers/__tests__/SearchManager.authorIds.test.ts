/**
 * #2097: a search by author or editor names a username; pages store the
 * identity @id. SearchManager hands the provider the values that name that
 * user (IdentityManager.referencesOf): the @id and, for pages not yet
 * converted, the username. An orphan and a deleted account's @id never match.
 *
 * Sabotage: passing `options.author` through unchanged turned this red.
 */
vi.unmock('../SearchManager');

import SearchManager from '../SearchManager';
import { fakeIdentityManager } from '../../test-support/identities';

describe('SearchManager: search by author matches the identity @id (#2097)', () => {
  test('author and editor become the user @id and username', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (_k: string, d: unknown) => d },
      IdentityManager: fakeIdentityManager({ jim: 'urn:uuid:jim-1', ann: 'urn:uuid:ann-1' }),
      PageManager: { filterPagesFor: async (_s: unknown, names: string[]) => names }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    const sm = new SearchManager(engine);
    (sm as unknown as { provider: unknown }).provider = {
      advancedSearch: async (options: Record<string, unknown>) => { asked.push(options); return []; }
    };
    await sm.advancedSearchWithContext({ userContext: { username: 'ann', roles: [], isAuthenticated: true } }, { author: 'jim', editor: 'ann' });
    expect(asked[0].author).toEqual(['urn:uuid:jim-1', 'jim']);
    expect(asked[0].editor).toEqual(['urn:uuid:ann-1', 'ann']);
  });
});
