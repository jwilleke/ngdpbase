/**
 * backfill-page-author (#1354) — which pages get an author.
 */
import { needsAuthor } from '../backfill-page-author';

describe('needsAuthor (#1354)', () => {
  test('a shared page with no author needs one', () => {
    expect(needsAuthor({ title: 'Year 1925' }, 'abc.md')).toBe('yes');
  });

  test('an empty or blank author counts as none', () => {
    expect(needsAuthor({ title: 'X', author: '' }, 'abc.md')).toBe('yes');
    expect(needsAuthor({ title: 'X', author: '  ' }, 'abc.md')).toBe('yes');
  });

  test('a page that has an author keeps it', () => {
    expect(needsAuthor({ title: 'X', author: 'molly' }, 'abc.md')).toBe('no');
  });

  test('a private page is never given the named author', () => {
    expect(needsAuthor({ title: 'X' }, 'private/molly/abc.md')).toBe('private');
    expect(needsAuthor({ title: 'X', private: true }, 'abc.md')).toBe('private');
  });
});
