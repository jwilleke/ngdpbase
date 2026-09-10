/**
 * #1329 — journal entry naming, and finding an entry started under the old name.
 */
import { describe, it, expect } from 'vitest';
import { journalPageName, legacyJournalSlug, findJournalEntrySlug } from '../helpers.js';

const pmWith = (slugs: string[]) => ({
  getPageBySlug: async (slug: string) => (slugs.includes(slug) ? ({ name: slug } as never) : null)
});

describe('journalPageName', () => {
  it('matches the imported JSPWiki entries: date, entry 1, journal, user', () => {
    expect(journalPageName('2026-09-10', 'jim')).toBe('2026-09-10-1-journal-jim');
  });

  it('keeps two users on the same day apart (#789)', () => {
    expect(journalPageName('2026-09-10', 'jim')).not.toBe(journalPageName('2026-09-10', 'molly'));
  });
});

describe('findJournalEntrySlug', () => {
  it('finds an entry under the new name', async () => {
    const pm = pmWith(['2026-09-10-1-journal-jim']);
    expect(await findJournalEntrySlug(pm, '2026-09-10', 'jim')).toBe('2026-09-10-1-journal-jim');
  });

  it('finds an entry started under the old name, so it is reopened rather than duplicated', async () => {
    const pm = pmWith([legacyJournalSlug('2026-09-10', 'jim')]);
    expect(await findJournalEntrySlug(pm, '2026-09-10', 'jim')).toBe('journal-jim-2026-09-10');
  });

  it('returns null when the user has no entry that day', async () => {
    const pm = pmWith(['2026-09-10-1-journal-molly']);
    expect(await findJournalEntrySlug(pm, '2026-09-10', 'jim')).toBeNull();
  });
});
