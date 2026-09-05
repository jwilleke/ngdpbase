/**
 * #1222 — what a share covers, as a pure question over the record.
 *
 * `shareCoversResource` is the one place the `keyword:<name>` pattern is
 * read. The evaluator asks it about a page's user-keywords; the share routes
 * ask it about a media item's EXIF/XMP keywords. Neither re-implements it.
 */
import { shareCoversResource, OWNER_ONLY_KEYWORD, resourcesForScope } from '../Share';

const resources = resourcesForScope({ kind: 'keyword', keyword: 'trip' });

describe('shareCoversResource (#1222)', () => {
  test('a page carrying the keyword is covered', () => {
    expect(shareCoversResource(resources, 'page', ['trip', 'other'])).toBe(true);
  });

  test('a page without the keyword is not', () => {
    expect(shareCoversResource(resources, 'page', ['other'])).toBe(false);
    expect(shareCoversResource(resources, 'page', [])).toBe(false);
  });

  test('the type must match — a page resource does not cover media', () => {
    const pageOnly = resources.filter((r) => r.type === 'page');
    expect(shareCoversResource(pageOnly, 'media', ['trip'])).toBe(false);
    expect(shareCoversResource(pageOnly, 'page', ['trip'])).toBe(true);
  });

  test('owner-only content is never covered, whatever else it carries', () => {
    expect(shareCoversResource(resources, 'page', ['trip', OWNER_ONLY_KEYWORD])).toBe(false);
    expect(shareCoversResource(resources, 'media', [OWNER_ONLY_KEYWORD, 'trip'])).toBe(false);
  });

  test('a pattern the evaluator does not know covers nothing', () => {
    // Refuse rather than guess: an unknown grammar is not a wildcard.
    expect(shareCoversResource([{ type: 'page', pattern: '*' }], 'page', ['trip'])).toBe(false);
    expect(shareCoversResource([{ type: 'page', pattern: 'trip' }], 'page', ['trip'])).toBe(false);
  });

  test('keyword match is exact', () => {
    expect(shareCoversResource(resources, 'page', ['trips'])).toBe(false);
    expect(shareCoversResource(resources, 'page', ['Trip'])).toBe(false);
  });
});
