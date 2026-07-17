/**
 * LunrSearchProvider — user-keyword splitting (#862).
 *
 * `buildDocumentFromPageData` joins user-keywords with COMMAS (keywords may
 * contain spaces). Before #862 the consumers split on whitespace, so a page
 * with more than one keyword never matched searchByUserKeywords, and
 * multi-word keywords shattered into individual words.
 *
 * Same harness as LunrSearchProvider.test.ts: compiled provider from dist/,
 * documents injected directly.
 */

import LunrSearchProvider from '../../../dist/src/providers/LunrSearchProvider';

function makeEngine() {
  return {
    getManager: (name) => {
      if (name === 'ConfigurationManager') {
        return {
          getProperty: (key, def) => {
            if (key === 'ngdpbase.search.provider.lunr.stemming') return false;
            if (key.startsWith('ngdpbase.search.provider.lunr.boost')) return 1;
            if (key === 'ngdpbase.search.provider.lunr.maxresults') return 100;
            return def;
          },
          getResolvedDataPath: (_key, def) => def
        };
      }
      return null;
    }
  };
}

function makeDoc(id, userKeywords: string) {
  return {
    id,
    title: id,
    content: `Content for ${id}`,
    body: `Content for ${id}`,
    systemCategory: 'general',
    knowledgeRole: '',
    userKeywords,
    tags: '',
    keywords: userKeywords,
    lastModified: '2026-01-01T00:00:00.000Z',
    uuid: `uuid-${id}`,
    author: undefined,
    editor: undefined,
    isPrivate: undefined,
    creator: undefined
  };
}

let provider;

beforeEach(() => {
  provider = new LunrSearchProvider(makeEngine());
  provider['documents'] = {
    // The #862 repro: comma-joined multi-keyword doc must match each keyword.
    'Falcon 9': makeDoc('Falcon 9', 'rocketry,spacecraft'),
    'First stage': makeDoc('First stage', 'rocketry'),
    'Artemis II': makeDoc('Artemis II', 'spaceflight'),
    // Multi-word keyword must stay ONE keyword.
    'Greenhouse': makeDoc('Greenhouse', 'grow system,garden'),
    'Untagged': makeDoc('Untagged', '')
  };
});

describe('searchByUserKeywords (#862)', () => {
  test('matches pages with MULTIPLE user-keywords (comma-joined)', async () => {
    const results = await provider.searchByUserKeywords('rocketry');
    expect(results.map(r => r.name).sort()).toEqual(['Falcon 9', 'First stage']);
  });

  test('matches the non-first keyword of a multi-keyword page', async () => {
    const results = await provider.searchByUserKeywords('spacecraft');
    expect(results.map(r => r.name)).toEqual(['Falcon 9']);
  });

  test('matches a multi-word keyword exactly', async () => {
    const results = await provider.searchByUserKeywords('grow system');
    expect(results.map(r => r.name)).toEqual(['Greenhouse']);
  });

  test('does not match a word fragment of a multi-word keyword', async () => {
    const results = await provider.searchByUserKeywords('grow');
    expect(results).toHaveLength(0);
  });

  test('result metadata carries keywords split on commas', async () => {
    const results = await provider.searchByUserKeywords('rocketry');
    const falcon = results.find(r => r.name === 'Falcon 9');
    expect(falcon.metadata.userKeywords).toEqual(['rocketry', 'spacecraft']);
  });
});

describe('getAllUserKeywords (#862)', () => {
  test('returns distinct keywords with multi-word keywords intact', async () => {
    const keywords = await provider.getAllUserKeywords();
    expect(keywords).toEqual(['garden', 'grow system', 'rocketry', 'spacecraft', 'spaceflight']);
  });
});

describe('getAllDocuments metadata (#862)', () => {
  test('userKeywords arrays are comma-split', async () => {
    const docs = await provider.getAllDocuments();
    const falcon = docs.find(d => d.name === 'Falcon 9');
    expect(falcon.metadata.userKeywords).toEqual(['rocketry', 'spacecraft']);
  });
});
