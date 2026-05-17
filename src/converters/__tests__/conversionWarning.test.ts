/**
 * Tests for classifyWarnings (#728 S3) — legacy prose → structured kinds.
 */

import { classifyWarnings } from '../conversionWarning';

describe('classifyWarnings', () => {
  test('empty in → empty out', () => {
    expect(classifyWarnings([])).toEqual([]);
  });

  test('preserves detail verbatim (lossless)', () => {
    const msg = 'Removed 3 boilerplate element(s) (nav, header, footer, etc.)';
    expect(classifyWarnings([msg])).toEqual([{ kind: 'content-dropped', detail: msg }]);
  });

  test('classifies removal/strip/boilerplate/no-content as content-dropped', () => {
    const kinds = classifyWarnings([
      'Removed 2 elements',
      'stripped script tags',
      'No meaningful content extracted from HTML',
      'No body element found — used entire document'
    ]).map(w => w.kind);
    expect(kinds).toEqual(['content-dropped', 'content-dropped', 'content-dropped', 'content-dropped']);
  });

  test('classifies unhandled/unbalanced/unknown/could-not as converter-warning', () => {
    const kinds = classifyWarnings([
      'Found 3 unhandled JSPWiki plugin(s): INSERT',
      'Unbalanced code blocks detected - manual review may be needed',
      'Unknown frontmatter field preserved: foo',
      'Could not parse frontmatter: bad yaml'
    ]).map(w => w.kind);
    expect(kinds).toEqual(['converter-warning', 'converter-warning', 'converter-warning', 'converter-warning']);
  });

  test('everything else is converter-note', () => {
    expect(classifyWarnings(['No frontmatter found — title, uuid, and slug will be generated from filename'])[0].kind)
      .toBe('converter-note');
  });
});
