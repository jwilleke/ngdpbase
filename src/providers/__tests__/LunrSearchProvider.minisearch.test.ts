/**
 * #1736: the search index is MiniSearch. A save changes one document and
 * never rebuilds the index (a Lunr rebuild froze the site for seconds on every
 * save of a large instance). Lunr's query language and its English stemming
 * still apply.
 */

// The source path is mocked for every test (vitest.setup.ts); the real provider is the build.
import LunrSearchProvider from '../../../dist/src/providers/LunrSearchProvider';
import { lunrQueryToMiniSearch } from '../lunrQueryToMiniSearch';

const FIELDS = ['title', 'content', 'systemCategory', 'knowledgeRole', 'userKeywords', 'tags', 'keywords', 'urlTokens'];

function engine() {
  return { getManager: () => null };
}

function doc(id: string, title: string, content: string) {
  return {
    id, title, content, body: content, systemCategory: 'general', knowledgeRole: '', userKeywords: '', tags: '',
    keywords: '', urlTokens: '', lastModified: '2026-10-09T00:00:00.000Z', uuid: `uuid-${id}`
  };
}

function provider(stemming = true) {
  const p = new LunrSearchProvider(engine());
  p['config'] = {
    indexDir: '/tmp', stemming,
    boost: { title: 10, systemCategory: 8, knowledgeRole: 8, userKeywords: 6, tags: 5, keywords: 4, urlTokens: 3 },
    maxResults: 50, snippetLength: 200
  };
  p['documents'] = {
    Backup: doc('Backup', 'Backup', 'How to back up the site'),
    Restore: doc('Restore', 'Restore', 'Restoring from backups after a failure'),
    Garden: doc('Garden', 'Garden', 'Tomatoes and basil')
  };
  p['rebuildSearchIndexFromDocuments']();
  return p;
}

const names = async (p: LunrSearchProvider, q: string) => (await p.search(q)).map((r) => r.name).sort();

describe('a save changes one document, never the whole index (#1736)', () => {
  test('updatePageInIndex adds and replaces without a rebuild, and is searchable at once', async () => {
    const p = provider();
    p['schedulePersist'] = () => undefined;
    const rebuild = vi.spyOn(p as never, 'rebuildSearchIndexFromDocuments');

    await p.updatePageInIndex('Recipes', { content: 'quokka stew', metadata: { title: 'Recipes', uuid: 'u-r' } });
    expect(await names(p, 'quokka')).toEqual(['Recipes']);

    await p.updatePageInIndex('Recipes', { content: 'lentil soup', metadata: { title: 'Recipes', uuid: 'u-r' } });
    expect(await names(p, 'quokka')).toEqual([]);
    expect(await names(p, 'lentil')).toEqual(['Recipes']);

    expect(rebuild).not.toHaveBeenCalled();
  });

  test('removePageFromIndex drops the page from results without a rebuild', async () => {
    const p = provider();
    p['schedulePersist'] = () => undefined;
    const rebuild = vi.spyOn(p as never, 'rebuildSearchIndexFromDocuments');
    await p.removePageFromIndex('Garden');
    expect(await names(p, 'tomatoes')).toEqual([]);
    expect(rebuild).not.toHaveBeenCalled();
  });
});

describe('the words still match as they did under Lunr', () => {
  test('stemming: "backups" finds "backup", and the reverse', async () => {
    const p = provider();
    expect(await names(p, 'backups')).toEqual(['Backup', 'Restore']);
    expect(await names(p, 'backup')).toEqual(['Backup', 'Restore']);
  });

  test('with stemming off, only the exact word matches', async () => {
    const p = provider(false);
    expect(await names(p, 'backups')).toEqual(['Restore']);
  });

  test('stop words alone find nothing, and a typed URL is a search, not an error', async () => {
    const p = provider();
    expect(await names(p, 'the')).toEqual([]);
    await expect(p.search('https://example.com/backup')).resolves.toBeDefined();
  });

  test('a title match ranks above a body match (field boosts)', async () => {
    const p = provider();
    expect((await p.search('backup'))[0].name).toBe('Backup');
  });
});

describe('Lunr query syntax is read with its meaning (#1736)', () => {
  test.each([
    ['+backup +restore', ['Restore']],
    ['backup -restore', ['Backup']],
    ['title:backup', ['Backup']],
    ['tomat*', ['Garden']],
    ['tomatos~1', ['Garden']],
    ['-garden', ['Backup', 'Restore']]
  ])('%s', async (query, expected) => {
    expect(await names(provider(), query)).toEqual(expected);
  });

  test('the translator: nothing searchable is null, an unknown field is plain text', () => {
    expect(lunrQueryToMiniSearch('   ', FIELDS)).toBeNull();
    expect(lunrQueryToMiniSearch('+* -', FIELDS)).toBeNull();
    expect(JSON.stringify(lunrQueryToMiniSearch('https://example.com', FIELDS))).not.toContain('"fields"');
    expect(JSON.stringify(lunrQueryToMiniSearch('title:foo', FIELDS))).toContain('"fields":["title"]');
  });
});
