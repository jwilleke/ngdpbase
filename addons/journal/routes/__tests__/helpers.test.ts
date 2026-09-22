/**
 * #1329 — journal entry naming, and finding an entry started under the old name.
 * #1456 — a private entry is named by its path in the user's default store,
 * `private/{user}/{store}/{title}`; a public one by its title.
 */
import { describe, it, expect, vi } from 'vitest';
import { journalPageName, legacyJournalSlug, findJournalEntryName, createJournalEntry } from '../helpers.js';

const jim = { username: 'jim', isAuthenticated: true, roles: ['authenticated'] } as never;

interface EngineOpts {
  /** Page names getPage finds. */
  names?: string[];
  /** Slugs getPageBySlug finds, with the title each resolves to. */
  slugs?: Record<string, string>;
  /** Entries JournalDataManager lists for the author. */
  listed?: Array<{ name: string; journalDate: string }>;
  /** The user's journal.defaultPrivate preference. */
  userPref?: boolean;
  /** Private-store config overrides. */
  config?: Record<string, unknown>;
}

function makeEngine(opts: EngineOpts = {}) {
  const names = new Set(opts.names ?? []);
  const getPage = vi.fn(async (name: string) => (names.has(name) ? { name, content: '', metadata: {} } : null));
  const getPageBySlug = vi.fn(async (slug: string) => (opts.slugs && slug in opts.slugs ? { title: opts.slugs[slug] } : null));
  const savePage = vi.fn(async (name: string) => {
    names.add(name);
  });
  const listByAuthor = vi.fn(async () => opts.listed ?? []);
  const getUser = vi.fn(async () => (opts.userPref === undefined
    ? { preferences: {} }
    : { preferences: { 'journal.defaultPrivate': opts.userPref } }));
  const getProperty = vi.fn((key: string, def: unknown) => (opts.config && key in opts.config ? opts.config[key] : def));
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'PageManager') return { getPage, getPageBySlug, savePage };
      if (name === 'JournalDataManager') return { listByAuthor };
      if (name === 'UserManager') return { getUser };
      if (name === 'ConfigurationManager') return { getProperty };
      return undefined;
    })
  } as never;
  return { engine, getPage, getPageBySlug, savePage, listByAuthor };
}

describe('journalPageName', () => {
  it('matches the imported JSPWiki entries: date, entry 1, journal, user', () => {
    expect(journalPageName('2026-09-10', 'jim')).toBe('2026-09-10-1-journal-jim');
  });

  it('keeps two users on the same day apart (#789)', () => {
    expect(journalPageName('2026-09-10', 'jim')).not.toBe(journalPageName('2026-09-10', 'molly'));
  });
});

describe('findJournalEntryName', () => {
  it('returns the listed entry\'s name for that date', async () => {
    const { engine, getPage } = makeEngine({
      listed: [
        { name: 'private/jim/default/2026-09-09-1-journal-jim', journalDate: '2026-09-09' },
        { name: 'private/jim/default/2026-09-10-1-journal-jim', journalDate: '2026-09-10' }
      ]
    });
    expect(await findJournalEntryName(engine, '2026-09-10', 'jim', jim)).toBe('private/jim/default/2026-09-10-1-journal-jim');
    expect(getPage).not.toHaveBeenCalled();
  });

  it('finds a private entry in the user\'s default store by direct probe', async () => {
    const { engine } = makeEngine({ names: ['private/jim/default/2026-09-10-1-journal-jim'] });
    expect(await findJournalEntryName(engine, '2026-09-10', 'jim', jim)).toBe('private/jim/default/2026-09-10-1-journal-jim');
  });

  it('probes the configured default store, not a hardcoded one', async () => {
    const { engine } = makeEngine({
      names: ['private/jim/notes/2026-09-10-1-journal-jim'],
      config: { 'ngdpbase.page.provider.filesystem.defaultstoreid': 'notes' }
    });
    expect(await findJournalEntryName(engine, '2026-09-10', 'jim', jim)).toBe('private/jim/notes/2026-09-10-1-journal-jim');
  });

  it('finds a public entry under the new name', async () => {
    const { engine } = makeEngine({ names: ['2026-09-10-1-journal-jim'] });
    expect(await findJournalEntryName(engine, '2026-09-10', 'jim', jim)).toBe('2026-09-10-1-journal-jim');
  });

  it('prefers the private entry when both a private and a public one exist', async () => {
    const { engine } = makeEngine({
      names: ['2026-09-10-1-journal-jim', 'private/jim/default/2026-09-10-1-journal-jim']
    });
    expect(await findJournalEntryName(engine, '2026-09-10', 'jim', jim)).toBe('private/jim/default/2026-09-10-1-journal-jim');
  });

  it('finds an entry started under the old name, so it is reopened rather than duplicated', async () => {
    const { engine, getPageBySlug } = makeEngine({
      slugs: { [legacyJournalSlug('2026-09-10', 'jim')]: 'Journal Entry 2026-09-10' }
    });
    expect(await findJournalEntryName(engine, '2026-09-10', 'jim', jim)).toBe('Journal Entry 2026-09-10');
    expect(getPageBySlug).toHaveBeenCalledWith('journal-jim-2026-09-10', jim);
  });

  it('returns null when the user has no entry that day', async () => {
    const { engine } = makeEngine({
      names: ['2026-09-10-1-journal-molly', 'private/molly/default/2026-09-10-1-journal-molly'],
      listed: [{ name: 'private/jim/default/2026-09-09-1-journal-jim', journalDate: '2026-09-09' }]
    });
    expect(await findJournalEntryName(engine, '2026-09-10', 'jim', jim)).toBeNull();
  });
});

describe('createJournalEntry', () => {
  it('saves a private entry under the user\'s default store and returns that name', async () => {
    const { engine, savePage } = makeEngine();
    const name = await createJournalEntry(engine, {}, jim, '2026-09-10');
    expect(name).toBe('private/jim/default/2026-09-10-1-journal-jim');
    expect(savePage).toHaveBeenCalledTimes(1);
    const [pageName, content, metadata, ctx] = savePage.mock.calls[0] as unknown as
      [string, string, Record<string, unknown>, unknown];
    expect(pageName).toBe('private/jim/default/2026-09-10-1-journal-jim');
    // #1328: empty, not ' '.
    expect(content).toBe('');
    // #1462 slice 2: the door is handed the entry's author, never a rebuilt actor.
    expect(ctx).toBe(jim);
    expect(metadata).toMatchObject({
      title: '2026-09-10-1-journal-jim',
      slug: '2026-09-10-1-journal-jim',
      'system-category': 'journal',
      'journal-date': '2026-09-10',
      author: 'jim',
      private: true,
      'author-lock': true
    });
  });

  it('saves a public entry under its plain title when the deployment defaults to public', async () => {
    const { engine, savePage } = makeEngine();
    const name = await createJournalEntry(engine, { defaultPrivate: false }, jim, '2026-09-10');
    expect(name).toBe('2026-09-10-1-journal-jim');
    const [pageName, , metadata] = savePage.mock.calls[0] as unknown as [string, string, Record<string, unknown>];
    expect(pageName).toBe('2026-09-10-1-journal-jim');
    expect(metadata.private).toBeUndefined();
    expect(metadata.title).toBe('2026-09-10-1-journal-jim');
  });

  it('the user\'s preference overrides the deployment default', async () => {
    const pub = makeEngine({ userPref: false });
    expect(await createJournalEntry(pub.engine, { defaultPrivate: true }, jim, '2026-09-10')).toBe('2026-09-10-1-journal-jim');

    const priv = makeEngine({ userPref: true });
    expect(await createJournalEntry(priv.engine, { defaultPrivate: false }, jim, '2026-09-10'))
      .toBe('private/jim/default/2026-09-10-1-journal-jim');
  });

  it('leaves out the author lock when the deployment turns it off', async () => {
    const { engine, savePage } = makeEngine();
    await createJournalEntry(engine, { defaultAuthorLock: false }, jim, '2026-09-10');
    const metadata = savePage.mock.calls[0][2] as unknown as Record<string, unknown>;
    expect(metadata['author-lock']).toBeUndefined();
  });

  it('a just-created private entry is found by direct probe, before it is listed', async () => {
    const { engine, listByAuthor } = makeEngine();
    const name = await createJournalEntry(engine, {}, jim, '2026-09-10');
    expect(await findJournalEntryName(engine, '2026-09-10', 'jim', jim)).toBe(name);
    expect(listByAuthor).toHaveBeenCalledWith('jim', jim);
  });

  it('refuses an entry with no author', async () => {
    const { engine, savePage } = makeEngine();
    await expect(createJournalEntry(engine, {}, { username: '' } as never, '2026-09-10')).rejects.toThrow(/author/);
    expect(savePage).not.toHaveBeenCalled();
  });
});
