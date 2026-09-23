/**
 * No private text in the shared Lunr index — #1458 (epic #1454).
 *
 * Before #1456 a private page was indexed like any other, so its full text
 * sits in plaintext in the persisted `documents.json` of every instance that
 * ran an older build, and in every backup taken from one. Nothing else would
 * ever remove it: the page door no longer names a private page to the shared
 * index, so those documents are neither replaced nor deleted by ordinary work.
 *
 * These are the four doors a document can come in or go out by — the load, the
 * incremental update, the cold scan and the backup — and none of them may
 * carry private text.
 */

vi.unmock('../LunrSearchProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import LunrSearchProvider from '../LunrSearchProvider';

const PRIVATE_NAME = 'private/molly/default/Diary';
const SECRET = 'The apricot merger closes on Friday.';

/** A persisted document as an older build wrote one for a private page. */
const leakedDocument = (name: string, isPrivate: boolean) => ({
  id: name,
  title: name,
  content: isPrivate ? SECRET : 'a public body',
  body: isPrivate ? SECRET : 'a public body',
  systemCategory: 'general',
  knowledgeRole: '',
  userKeywords: '',
  tags: '',
  keywords: '',
  urlTokens: '',
  lastModified: '2026-09-22T00:00:00.000Z',
  uuid: `uuid-${name}`,
  ...(isPrivate ? { isPrivate: true, creator: 'molly' } : {})
});

describe('no private text in the shared Lunr index (#1458)', () => {
  let indexDir: string;
  let documentsPath: string;
  let pageManager: { getAllPages: ReturnType<typeof vi.fn>; getPage: ReturnType<typeof vi.fn>; isSharedIndexable: ReturnType<typeof vi.fn> } | null;

  const newProvider = async (): Promise<LunrSearchProvider> => {
    const engine = {
      getManager: (name: string) => {
        if (name === 'ConfigurationManager') {
          return {
            getProperty: (key: string, def: unknown) => (
              key === 'ngdpbase.search.provider.lunr.flushinterval' ? 3600000 : def
            ),
            getResolvedDataPath: (key: string, def: string) =>
              (key === 'ngdpbase.search.provider.lunr.indexdir' ? indexDir : def)
          };
        }
        if (name === 'PageManager') return pageManager;
        return null;
      }
    };
    const provider = new LunrSearchProvider(engine);
    await provider.initialize();
    return provider;
  };

  const persisted = async (): Promise<Record<string, { content: string }>> =>
    ((await fs.readJson(documentsPath)) as { documents: Record<string, { content: string }> }).documents;

  beforeEach(async () => {
    indexDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lunr-private-'));
    documentsPath = path.join(indexDir, 'documents.json');
    pageManager = null;
  });

  afterEach(async () => {
    await fs.remove(indexDir);
  });

  test('a documents.json carrying private text is purged as it loads, and rewritten without it', async () => {
    await fs.writeJson(documentsPath, {
      savedAt: '2026-09-22T00:00:00.000Z',
      documents: {
        Welcome: leakedDocument('Welcome', false),
        // Both shapes an old build could have written: the private path, and
        // a bare title with the flag (a page indexed before #1456 renamed it).
        [PRIVATE_NAME]: leakedDocument(PRIVATE_NAME, true),
        Diary: leakedDocument('Diary', true)
      }
    });

    const provider = await newProvider();
    await provider.buildIndex();

    expect(Object.keys(await persisted())).toEqual(['Welcome']);
    expect(JSON.stringify(await persisted())).not.toContain('apricot');

    // And the owner's own text is not searchable from here by anyone.
    const found = await provider.search('apricot', {});
    expect(found).toEqual([]);
  });

  test('updatePageInIndex refuses a private page — nothing of it reaches documents.json', async () => {
    const provider = await newProvider();
    await provider.updatePageInIndex('Welcome', { content: 'a public body', metadata: { uuid: 'u-1' } });
    await provider.updatePageInIndex(PRIVATE_NAME, { content: SECRET, metadata: { uuid: 'u-2', private: true } });
    // The same page addressed by a bare title, with the private flag.
    await provider.updatePageInIndex('Diary', { content: SECRET, metadata: { uuid: 'u-2', private: true } });

    expect(Object.keys(await persisted())).toEqual(['Welcome']);
    expect(JSON.stringify(await persisted())).not.toContain('apricot');
  });

  test('the cold scan skips a private page', async () => {
    pageManager = {
      getAllPages: vi.fn().mockResolvedValue(['Welcome', PRIVATE_NAME]),
      getPage: vi.fn(async (name: string) => (name === 'Welcome'
        ? { content: 'a public body', metadata: { uuid: 'u-1', title: 'Welcome' } }
        : { content: SECRET, metadata: { uuid: 'u-2', title: 'Diary', private: true } })),
      isSharedIndexable: vi.fn().mockReturnValue(true)
    };

    const provider = await newProvider();
    await provider.buildIndex();

    expect(Object.keys(await persisted())).toEqual(['Welcome']);
    expect(JSON.stringify(await persisted())).not.toContain('apricot');
  });

  test('a backup carries no private document, and restoring an old one does not put it back', async () => {
    await fs.writeJson(documentsPath, {
      savedAt: '2026-09-22T00:00:00.000Z',
      documents: { Welcome: leakedDocument('Welcome', false), Diary: leakedDocument('Diary', true) }
    });
    const provider = await newProvider();

    const backup = await provider.backup();
    expect(Object.keys(backup.documents as Record<string, unknown>)).toEqual(['Welcome']);
    expect(backup.documentCount).toBe(1);
    expect(JSON.stringify(backup.documents)).not.toContain('apricot');

    // An older backup, taken before private text left the shared index.
    await provider.restore({
      documents: { Welcome: leakedDocument('Welcome', false), Diary: leakedDocument('Diary', true) }
    });
    expect(Object.keys(await persisted())).toEqual(['Welcome']);
    expect(JSON.stringify(await persisted())).not.toContain('apricot');
  });
});
