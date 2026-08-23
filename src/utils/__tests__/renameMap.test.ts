import { describe, it, expect } from 'vitest';
import { RenameMap } from '../renameMap.js';

/**
 * #1082 — a rename broke every inbound link, silently. `apiRenamePage` says so
 * in its own comment: "Unlike delete, a rename has no safety net: #947 does
 * not cover it, and the old title is simply gone."
 *
 * Page history survives a rename for free, because files are `pages/{uuid}.md`
 * and versions are keyed by UUID. What did not survive is other pages pointing
 * at the old title: `[Old Title]` just turns into a red link with nothing
 * recording that the target moved.
 *
 * This map is consulted ONLY when live resolution has already failed, so it
 * can never override a real page. Its central rule is refusing on ambiguity:
 * a confidently wrong link to an unrelated page that merely once shared a name
 * is worse than the red link it replaces.
 */
describe('RenameMap', () => {
  const exists = (...titles: string[]) => (t: string) => titles.includes(t);
  const nothingExists = () => false;

  describe('single rename', () => {
    it('resolves a former title to its current page', () => {
      const map = new RenameMap();
      map.record('Old Title', 'New Title');
      expect(map.resolve('Old Title', exists('New Title'))).toBe('New Title');
    });

    it('returns null for a title it has never seen', () => {
      const map = new RenameMap();
      map.record('Old Title', 'New Title');
      expect(map.resolve('Unrelated', exists('New Title'))).toBeNull();
    });

    it('returns null when the renamed page has since been deleted', () => {
      // Pointing at a page that no longer exists is no better than a red link,
      // and pretending otherwise produces a link that 404s.
      const map = new RenameMap();
      map.record('Old Title', 'New Title');
      expect(map.resolve('Old Title', nothingExists)).toBeNull();
    });

    it('is empty by default', () => {
      expect(new RenameMap().size).toBe(0);
      expect(new RenameMap().resolve('Anything', exists('Anything'))).toBeNull();
    });
  });

  describe('rename chains', () => {
    it('follows A → B → C to the page that exists now', () => {
      const map = new RenameMap();
      map.record('A', 'B');
      map.record('B', 'C');
      expect(map.resolve('A', exists('C'))).toBe('C');
    });

    it('follows a chain from any point along it', () => {
      const map = new RenameMap();
      map.record('A', 'B');
      map.record('B', 'C');
      expect(map.resolve('B', exists('C'))).toBe('C');
    });

    it('stops at the first hop whose target exists', () => {
      // If B is a live page again, A should land on B rather than walking past
      // it to C — the nearest live answer is the least surprising one.
      const map = new RenameMap();
      map.record('A', 'B');
      map.record('B', 'C');
      expect(map.resolve('A', exists('B', 'C'))).toBe('B');
    });

    it('refuses a cycle rather than looping forever', () => {
      const map = new RenameMap();
      map.record('A', 'B');
      map.record('B', 'A');
      expect(map.resolve('A', nothingExists)).toBeNull();
    });

    it('gives up past the hop limit instead of walking an unbounded chain', () => {
      const map = new RenameMap();
      for (let i = 0; i < 30; i++) map.record(`T${i}`, `T${i + 1}`);
      expect(map.resolve('T0', exists('T30'))).toBeNull();
    });

    it('resolves a chain that fits inside the hop limit', () => {
      const map = new RenameMap();
      for (let i = 0; i < 5; i++) map.record(`T${i}`, `T${i + 1}`);
      expect(map.resolve('T0', exists('T5'))).toBe('T5');
    });
  });

  describe('ambiguity is refused, never guessed', () => {
    it('returns null when one former title was renamed to two different pages', () => {
      // "Notes" → "Meeting Notes", then a new "Notes" is created and renamed
      // to "Personal Notes". Both are legitimate former-title records, and
      // nothing in the data says which one an old link meant.
      const map = new RenameMap();
      map.record('Notes', 'Meeting Notes');
      map.record('Notes', 'Personal Notes');
      expect(map.resolve('Notes', exists('Meeting Notes', 'Personal Notes'))).toBeNull();
    });

    it('still refuses when only one of the ambiguous targets exists', () => {
      // Tempting to resolve to the surviving one, but the ambiguity is about
      // which page the LINK meant, and deleting the other does not answer it.
      const map = new RenameMap();
      map.record('Notes', 'Meeting Notes');
      map.record('Notes', 'Personal Notes');
      expect(map.resolve('Notes', exists('Meeting Notes'))).toBeNull();
    });

    it('does not treat re-recording the same rename as ambiguity', () => {
      // Replaying the audit log, or a rename recorded by both the form path
      // and the API path, must not poison the entry.
      const map = new RenameMap();
      map.record('Old Title', 'New Title');
      map.record('Old Title', 'New Title');
      expect(map.resolve('Old Title', exists('New Title'))).toBe('New Title');
    });

    it('marks an entry ambiguous permanently, even if a later record repeats one target', () => {
      const map = new RenameMap();
      map.record('Notes', 'Meeting Notes');
      map.record('Notes', 'Personal Notes');
      map.record('Notes', 'Meeting Notes');
      expect(map.resolve('Notes', exists('Meeting Notes'))).toBeNull();
    });
  });

  describe('input hygiene', () => {
    it('ignores a rename with no source or target', () => {
      const map = new RenameMap();
      map.record('', 'New');
      map.record('Old', '');
      expect(map.size).toBe(0);
    });

    it('ignores a self-rename', () => {
      const map = new RenameMap();
      map.record('Same', 'Same');
      expect(map.size).toBe(0);
    });

    it('trims surrounding whitespace so a stray space does not create a second entry', () => {
      const map = new RenameMap();
      map.record('  Old Title  ', 'New Title');
      expect(map.resolve('Old Title', exists('New Title'))).toBe('New Title');
    });
  });

  describe('bulk load', () => {
    it('builds from a list of recorded renames, oldest first', () => {
      const map = RenameMap.from([
        { fromPageName: 'A', pageName: 'B' },
        { fromPageName: 'B', pageName: 'C' }
      ]);
      expect(map.resolve('A', exists('C'))).toBe('C');
    });

    it('skips entries missing either title rather than throwing', () => {
      const map = RenameMap.from([
        { fromPageName: 'A', pageName: 'B' },
        { pageName: 'C' },
        { fromPageName: 'D' },
        {}
      ]);
      expect(map.size).toBe(1);
      expect(map.resolve('A', exists('B'))).toBe('B');
    });
  });
});
