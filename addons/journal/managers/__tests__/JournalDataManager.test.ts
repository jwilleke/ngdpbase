'use strict';

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import JournalDataManager from '../JournalDataManager';
import type { JournalIndexEntry } from '../JournalDataManager';

// ── Mock engine wiring ────────────────────────────────────────────────────────
//
// #800 retired the on-disk sidecar; JournalDataManager now queries
// SearchManager.searchByCategory('journal') + PageManager.getPage(name, ctx)
// on demand, plus the requester's own private entries from
// PageManager.getPagesByCreator (#1456). Tests mock both managers and feed pre-canned page metadata.

interface MockPage {
  title?: string;
  content?: string;
  metadata: Record<string, unknown>;
}

type MockPageOverrides = Partial<Omit<JournalIndexEntry, 'tags'>> & { tags?: string[]; content?: string };

function makeMockPage(overrides: MockPageOverrides = {}): MockPage {
  const slug = overrides.slug ?? `journal-alice-${overrides.journalDate ?? '2026-01-01'}`;
  const md: Record<string, unknown> = {
    uuid:               overrides.uuid          ?? uuidv4(),
    slug,
    title:              overrides.title         ?? 'Test Entry',
    author:             overrides.author        ?? 'alice',
    'system-category':  'journal',
    'journal-date':     overrides.journalDate   ?? '2026-01-01',
    lastModified:       overrides.lastModified  ?? new Date().toISOString()
  };
  if (overrides.mood !== undefined) md['mood'] = overrides.mood;
  if (overrides.tags !== undefined) md['user-keywords'] = overrides.tags;
  if (overrides.isPrivate) md['private'] = true;
  return { title: md['title'] as string, content: overrides.content ?? '', metadata: md };
}

/** A requester, as the routes pass one (#1456: every read names who is asking). */
function ctxFor(username: string): never {
  return { username, isAuthenticated: true, roles: ['authenticated'] } as never;
}
const alice = ctxFor('alice');

/** A private page: named by its path, reachable only by its owner. */
interface MockPrivatePage {
  owner: string;
  name: string;
  page: MockPage;
}

function makeMockEngine(pages: MockPage[], privatePages: MockPrivatePage[] = []): {
  engine: never;
  searchByCategory: ReturnType<typeof vi.fn>;
  getPage: ReturnType<typeof vi.fn>;
  getPagesByCreator: ReturnType<typeof vi.fn>;
} {
  // SearchResults projection: searchByCategory returns { name } per hit;
  // the manager then calls getPage(name, ctx) for each. We match name → page.slug.
  // Private pages are in no shared index (#1456): they come only from the
  // requester's own getPagesByCreator, and getPage opens them only for their owner.
  const slugToPage = new Map<string, MockPage>(
    pages.map(p => [(p.metadata['slug'] as string), p])
  );
  const searchByCategory = vi.fn(async (category: string) => {
    if (category !== 'journal') return [];
    return pages.map(p => ({ name: p.metadata['slug'] as string }));
  });
  const getPage = vi.fn(async (name: string, ctx: { username?: string }) => {
    const priv = privatePages.find(p => p.name === name);
    if (priv) return priv.owner === ctx?.username ? priv.page : null;
    return slugToPage.get(name) ?? null;
  });
  const getPagesByCreator = vi.fn(async (username: string) =>
    privatePages
      .filter(p => p.owner === username)
      .map(p => ({ name: p.name, title: p.page.title, isPrivate: true })));

  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'SearchManager') return { searchByCategory };
      if (name === 'PageManager') return { getPage, getPagesByCreator };
      return undefined;
    })
  };
  return { engine: engine as never, searchByCategory, getPage, getPagesByCreator };
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jdm-test-'));
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('JournalDataManager', () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    // CRITICAL: only remove the per-test tmp dir created by os.tmpdir() + mkdtempSync.
    // NEVER target any production data path (see feedback_test_data_destruction).
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // ── No-op persistence (sidecar retired in #800) ────────────────────────────

  describe('load / save / indexEntry / removeEntry — sidecar retired no-ops', () => {
    it('load() does not throw when no sidecar file exists', async () => {
      const { engine } = makeMockEngine([]);
      const m = new JournalDataManager(engine, dir);
      await m.load();
      expect(await m.count(alice)).toBe(0);
    });

    it('load() does not throw and ignores stale sidecar file if present', async () => {
      // Pre-seed a stale legacy sidecar file — manager should ignore it.
      fs.writeFileSync(
        path.join(dir, 'journal-index.json'),
        JSON.stringify({ version: 1, entries: { 'x': { /* stale */ } } })
      );
      const { engine } = makeMockEngine([]);
      const m = new JournalDataManager(engine, dir);
      await m.load();
      // The mock engine has no pages; count must be 0 regardless of the stale file.
      expect(await m.count(alice)).toBe(0);
    });

    it('indexEntry is a no-op (does not throw; does not mutate state)', async () => {
      const { engine } = makeMockEngine([]);
      const m = new JournalDataManager(engine, dir);
      const entry: JournalIndexEntry = {
        uuid: 'x', name: 'x', slug: 'x', title: 'x', author: 'alice',
        journalDate: '2026-01-01', tags: [], isPrivate: false, lastModified: ''
      };
      await m.indexEntry(entry);
      expect(await m.count(alice)).toBe(0);
    });

    it('removeEntry is a no-op (does not throw)', async () => {
      const { engine } = makeMockEngine([]);
      const m = new JournalDataManager(engine, dir);
      await m.removeEntry('any-uuid');
      expect(await m.count(alice)).toBe(0);
    });

    it('save is a no-op (does not write a sidecar file)', async () => {
      const { engine } = makeMockEngine([]);
      const m = new JournalDataManager(engine, dir);
      await m.save();
      expect(fs.existsSync(path.join(dir, 'journal-index.json'))).toBe(false);
    });
  });

  // ── listByAuthor ─────────────────────────────────────────────────────────────

  describe('listByAuthor', () => {
    it('returns only entries for the specified author', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ author: 'alice', journalDate: '2026-01-01' }),
        makeMockPage({ author: 'bob',   journalDate: '2026-01-02' })
      ]);
      const m = new JournalDataManager(engine, dir);
      expect((await m.listByAuthor('alice', ctxFor('alice'))).map(e => e.author)).toEqual(['alice']);
      expect((await m.listByAuthor('bob', ctxFor('bob'))).map(e => e.author)).toEqual(['bob']);
    });

    it('returns entries sorted newest-first', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ journalDate: '2026-01-01' }),
        makeMockPage({ journalDate: '2026-01-03' }),
        makeMockPage({ journalDate: '2026-01-02' })
      ]);
      const m = new JournalDataManager(engine, dir);
      const dates = (await m.listByAuthor('alice', ctxFor('alice'))).map(e => e.journalDate);
      expect(dates).toEqual(['2026-01-03', '2026-01-02', '2026-01-01']);
    });

    it('filters by tag (sourced from user-keywords per #799)', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ slug: 'e1', tags: ['happy', 'work'] }),
        makeMockPage({ slug: 'e2', tags: ['sad'] }),
        makeMockPage({ slug: 'e3', tags: [] })
      ]);
      const m = new JournalDataManager(engine, dir);
      expect((await m.listByAuthor('alice', ctxFor('alice'), { tag: 'happy' })).map(e => e.slug)).toEqual(['e1']);
      expect((await m.listByAuthor('alice', ctxFor('alice'), { tag: 'missing' }))).toHaveLength(0);
    });

    it('filters by mood', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ slug: 'e1', mood: 'happy' }),
        makeMockPage({ slug: 'e2', mood: 'sad' })
      ]);
      const m = new JournalDataManager(engine, dir);
      expect((await m.listByAuthor('alice', ctxFor('alice'), { mood: 'happy' })).map(e => e.slug)).toEqual(['e1']);
    });

    it('applies limit and offset', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ slug: 'e1', journalDate: '2026-01-01' }),
        makeMockPage({ slug: 'e2', journalDate: '2026-01-02' }),
        makeMockPage({ slug: 'e3', journalDate: '2026-01-03' }),
        makeMockPage({ slug: 'e4', journalDate: '2026-01-04' })
      ]);
      const m = new JournalDataManager(engine, dir);
      const slice = await m.listByAuthor('alice', ctxFor('alice'), { limit: 2, offset: 1 });
      // Sorted newest-first: e4, e3, e2, e1. limit=2, offset=1 → e3, e2.
      expect(slice.map(e => e.slug)).toEqual(['e3', 'e2']);
    });
  });

  // ── computeStreak ────────────────────────────────────────────────────────────

  describe('computeStreak', () => {
    function today(): string { return new Date().toISOString().slice(0, 10); }
    function daysAgo(n: number): string {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d.toISOString().slice(0, 10);
    }

    it('returns 0 for author with no entries', async () => {
      const { engine } = makeMockEngine([]);
      const m = new JournalDataManager(engine, dir);
      expect(await m.computeStreak('alice', ctxFor('alice'))).toBe(0);
    });

    it('counts a streak starting today', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ slug: 'e1', journalDate: today() }),
        makeMockPage({ slug: 'e2', journalDate: daysAgo(1) }),
        makeMockPage({ slug: 'e3', journalDate: daysAgo(2) })
      ]);
      const m = new JournalDataManager(engine, dir);
      expect(await m.computeStreak('alice', ctxFor('alice'))).toBe(3);
    });

    it('breaks streak on a gap', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ slug: 'e1', journalDate: today() }),
        makeMockPage({ slug: 'e2', journalDate: daysAgo(1) }),
        // gap on daysAgo(2)
        makeMockPage({ slug: 'e3', journalDate: daysAgo(3) })
      ]);
      const m = new JournalDataManager(engine, dir);
      expect(await m.computeStreak('alice', ctxFor('alice'))).toBe(2);
    });

    it('counts 1 for today only', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ journalDate: today() })
      ]);
      const m = new JournalDataManager(engine, dir);
      expect(await m.computeStreak('alice', ctxFor('alice'))).toBe(1);
    });

    it('returns 0 when most recent entry is not today', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ journalDate: daysAgo(2) })
      ]);
      const m = new JournalDataManager(engine, dir);
      expect(await m.computeStreak('alice', ctxFor('alice'))).toBe(0);
    });

    it('deduplicates multiple entries on the same day', async () => {
      // Two entries dated today (different slugs) should count as 1 streak day.
      const { engine } = makeMockEngine([
        makeMockPage({ slug: 'e1', journalDate: today() }),
        makeMockPage({ slug: 'e2', journalDate: today() })
      ]);
      const m = new JournalDataManager(engine, dir);
      expect(await m.computeStreak('alice', ctxFor('alice'))).toBe(1);
    });

    it("does not count another author's entries in streak", async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ slug: 'a1', author: 'alice', journalDate: today() }),
        makeMockPage({ slug: 'b1', author: 'bob',   journalDate: daysAgo(1) })
      ]);
      const m = new JournalDataManager(engine, dir);
      expect(await m.computeStreak('alice', ctxFor('alice'))).toBe(1);
      expect(await m.computeStreak('bob', ctxFor('bob'))).toBe(0);
    });
  });

  // ── getOnThisDay ─────────────────────────────────────────────────────────────

  describe('getOnThisDay', () => {
    it('returns entries from the same MM-DD in prior years', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ slug: 'e1', journalDate: '2024-05-26' }),
        makeMockPage({ slug: 'e2', journalDate: '2025-05-26' }),
        makeMockPage({ slug: 'e3', journalDate: '2025-05-27' })
      ]);
      const m = new JournalDataManager(engine, dir);
      const onDay = await m.getOnThisDay('alice', ctxFor('alice'), '2026-05-26');
      expect(onDay.map(e => e.slug)).toEqual(['e2', 'e1']);
    });

    it('excludes other authors', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ slug: 'a1', author: 'alice', journalDate: '2025-05-26' }),
        makeMockPage({ slug: 'b1', author: 'bob',   journalDate: '2025-05-26' })
      ]);
      const m = new JournalDataManager(engine, dir);
      const onDay = await m.getOnThisDay('alice', ctxFor('alice'), '2026-05-26');
      expect(onDay.map(e => e.slug)).toEqual(['a1']);
    });
  });

  // ── getMoodFacets ────────────────────────────────────────────────────────────

  describe('getMoodFacets', () => {
    it('returns mood counts sorted by frequency', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ slug: 'e1', mood: 'happy' }),
        makeMockPage({ slug: 'e2', mood: 'happy' }),
        makeMockPage({ slug: 'e3', mood: 'sad' })
      ]);
      const m = new JournalDataManager(engine, dir);
      expect(await m.getMoodFacets('alice', ctxFor('alice'))).toEqual([
        { mood: 'happy', count: 2 },
        { mood: 'sad',   count: 1 }
      ]);
    });

    it('excludes entries with no mood', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ slug: 'e1', mood: 'happy' }),
        makeMockPage({ slug: 'e2' })
      ]);
      const m = new JournalDataManager(engine, dir);
      expect(await m.getMoodFacets('alice', ctxFor('alice'))).toEqual([{ mood: 'happy', count: 1 }]);
    });
  });

  // ── getTagFacets (sources from user-keywords per #799) ───────────────────────

  describe('getTagFacets', () => {
    it('returns tag counts sorted by frequency', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ slug: 'e1', tags: ['work', 'family'] }),
        makeMockPage({ slug: 'e2', tags: ['work'] })
      ]);
      const m = new JournalDataManager(engine, dir);
      expect(await m.getTagFacets('alice', ctxFor('alice'))).toEqual([
        { tag: 'work',   count: 2 },
        { tag: 'family', count: 1 }
      ]);
    });

    it('returns empty array when no tags exist', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ slug: 'e1' })
      ]);
      const m = new JournalDataManager(engine, dir);
      expect(await m.getTagFacets('alice', ctxFor('alice'))).toEqual([]);
    });
  });

  // ── toMarqueeText ────────────────────────────────────────────────────────────

  describe('toMarqueeText', () => {
    it('uses singular for 1 entry', async () => {
      const { engine } = makeMockEngine([
        makeMockPage({ slug: 'e1' })
      ]);
      const m = new JournalDataManager(engine, dir);
      expect(await m.toMarqueeText()).toBe('Journal: 1 public entry indexed');
    });

    it('uses plural for 0 or multiple entries', async () => {
      const { engine: emptyEngine } = makeMockEngine([]);
      const m0 = new JournalDataManager(emptyEngine, dir);
      expect(await m0.toMarqueeText()).toBe('Journal: 0 public entries indexed');

      const { engine: twoEngine } = makeMockEngine([
        makeMockPage({ slug: 'e1' }),
        makeMockPage({ slug: 'e2' })
      ]);
      const m2 = new JournalDataManager(twoEngine, dir);
      expect(await m2.toMarqueeText()).toBe('Journal: 2 public entries indexed');
    });
  });

  // ── #1456: private entries come from the requester's own stores ──────────────

  describe('private entries (#1456)', () => {
    const alicePrivateName = 'private/alice/default/2026-02-01-1-journal-alice';
    const bobPrivateName   = 'private/bob/default/2026-02-01-1-journal-bob';

    function privateFixture(): MockPrivatePage[] {
      return [
        {
          owner: 'alice',
          name: alicePrivateName,
          page: makeMockPage({ slug: '2026-02-01-1-journal-alice', author: 'alice', journalDate: '2026-02-01', isPrivate: true })
        },
        {
          owner: 'bob',
          name: bobPrivateName,
          page: makeMockPage({ slug: '2026-02-01-1-journal-bob', author: 'bob', journalDate: '2026-02-01', isPrivate: true })
        }
      ];
    }

    it("lists the requester's own private entry with its private name", async () => {
      const { engine, getPagesByCreator } = makeMockEngine(
        [makeMockPage({ slug: 'pub1', author: 'alice', journalDate: '2026-01-01' })],
        privateFixture()
      );
      const m = new JournalDataManager(engine, dir);
      const entries = await m.listByAuthor('alice', alice);
      expect(entries.map(e => e.name)).toEqual([alicePrivateName, 'pub1']);
      const priv = entries.find(e => e.name === alicePrivateName)!;
      expect(priv.isPrivate).toBe(true);
      expect(priv.slug).toBe('2026-02-01-1-journal-alice');
      expect(getPagesByCreator).toHaveBeenCalledWith('alice', alice);
    });

    it("does not list another user's private entry", async () => {
      const { engine } = makeMockEngine([], privateFixture());
      const m = new JournalDataManager(engine, dir);
      // Alice asking about bob sees none of bob's private entries…
      expect(await m.listByAuthor('bob', alice)).toEqual([]);
      expect((await m.listAll(alice)).map(e => e.name)).toEqual([alicePrivateName]);
      expect(await m.getBySlug(bobPrivateName, alice)).toBeUndefined();
      expect(await m.count(alice)).toBe(1);
      // …while bob sees his own.
      expect((await m.listByAuthor('bob', ctxFor('bob'))).map(e => e.name)).toEqual([bobPrivateName]);
    });

    it('getBySlug matches an entry by its slug or its name', async () => {
      const { engine } = makeMockEngine([], privateFixture());
      const m = new JournalDataManager(engine, dir);
      expect((await m.getBySlug(alicePrivateName, alice))?.name).toBe(alicePrivateName);
      expect((await m.getBySlug('2026-02-01-1-journal-alice', alice))?.name).toBe(alicePrivateName);
    });

    it('a requester with no username lists public entries only', async () => {
      const { engine, getPagesByCreator } = makeMockEngine(
        [makeMockPage({ slug: 'pub1', author: 'alice' })],
        privateFixture()
      );
      const m = new JournalDataManager(engine, dir);
      expect((await m.listAll({ username: undefined })).map(e => e.name)).toEqual(['pub1']);
      expect(getPagesByCreator).not.toHaveBeenCalled();
    });

    it('leaves out a private page that is not a journal entry', async () => {
      const notJournal = makeMockPage({ slug: 'notes', author: 'alice', journalDate: '2026-02-02', isPrivate: true });
      notJournal.metadata['system-category'] = 'general';
      const { engine } = makeMockEngine([], [{ owner: 'alice', name: 'private/alice/default/notes', page: notJournal }]);
      const m = new JournalDataManager(engine, dir);
      expect(await m.listAll(alice)).toEqual([]);
    });

    it('private entries count toward the owner\'s streak and facets', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { engine } = makeMockEngine([], [{
        owner: 'alice',
        name: `private/alice/default/${today}-1-journal-alice`,
        page: makeMockPage({ slug: `${today}-1-journal-alice`, author: 'alice', journalDate: today, mood: 'calm', tags: ['walk'], isPrivate: true })
      }]);
      const m = new JournalDataManager(engine, dir);
      expect(await m.computeStreak('alice', alice)).toBe(1);
      expect(await m.countByAuthor('alice', alice)).toBe(1);
      expect(await m.getMoodFacets('alice', alice)).toEqual([{ mood: 'calm', count: 1 }]);
      expect(await m.getTagFacets('alice', alice)).toEqual([{ tag: 'walk', count: 1 }]);
      expect(await m.computeStreak('alice', ctxFor('bob'))).toBe(0);
    });

    it('publicCount counts the shared index only, never a private entry', async () => {
      const { engine, getPagesByCreator } = makeMockEngine(
        [makeMockPage({ slug: 'pub1' })],
        privateFixture()
      );
      const m = new JournalDataManager(engine, dir);
      expect(await m.publicCount()).toBe(1);
      expect(await m.toMarqueeText()).toBe('Journal: 1 public entry indexed');
      expect(getPagesByCreator).not.toHaveBeenCalled();
    });
  });

  // ── Defensive: gracefully handles missing managers ────────────────────────────

  describe('graceful degradation', () => {
    it('returns empty results when SearchManager / PageManager are unavailable', async () => {
      const engine = {
        getManager: vi.fn(() => undefined)
      } as never;
      const m = new JournalDataManager(engine, dir);
      expect(await m.count(alice)).toBe(0);
      expect(await m.listByAuthor('alice', ctxFor('alice'))).toEqual([]);
      expect(await m.computeStreak('alice', ctxFor('alice'))).toBe(0);
      expect(await m.publicCount()).toBe(0);
    });
  });
});
