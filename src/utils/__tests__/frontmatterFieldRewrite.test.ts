/**
 * #2097: rewriteFrontmatterFields changes only the named lines.
 *
 * Sabotage checks (each turned a test red once): skipping the `current !==
 * change.from` check; writing every value unquoted (an `orphan:` value with
 * a space no longer reads back).
 */
import { rewriteFrontmatterFields } from '../frontmatterFieldRewrite';

const PAGE = [
  '---',
  'title: Weekly Notes',
  "lastModified: '2026-01-02T03:04:05.000Z'",
  'author: jim',
  "editor: 'ann'",
  'user-keywords:',
  '  - notes',
  '---',
  '# Body',
  '',
  'author: jim (in the body, untouched)',
  ''
].join('\n');

describe('#2097 rewriteFrontmatterFields', () => {
  test('changes only the author and editor lines', () => {
    const out = rewriteFrontmatterFields(PAGE, {
      author: { from: 'jim', to: 'urn:uuid:11111111-1111-4111-8111-111111111111' },
      editor: { from: 'ann', to: 'urn:uuid:22222222-2222-4222-8222-222222222222' }
    });
    expect(out).toBe(PAGE
      .replace('author: jim\n', 'author: urn:uuid:11111111-1111-4111-8111-111111111111\n')
      .replace("editor: 'ann'", 'editor: urn:uuid:22222222-2222-4222-8222-222222222222'));
    expect(out).toContain('author: jim (in the body, untouched)');
    expect(out).toContain("lastModified: '2026-01-02T03:04:05.000Z'");
  });

  test('an orphan with a space is quoted and reads back', () => {
    const page = '---\nauthor: Jim Smith\n---\nbody\n';
    const out = rewriteFrontmatterFields(page, { author: { from: 'Jim Smith', to: 'orphan:Jim Smith' } });
    expect(out).toBe('---\nauthor: "orphan:Jim Smith"\n---\nbody\n');
  });

  test('refuses when a field is missing, multi-line or holds another value', () => {
    expect(rewriteFrontmatterFields(PAGE, { creator: { from: 'jim', to: 'x' } })).toBeNull();
    expect(rewriteFrontmatterFields(PAGE, { author: { from: 'bob', to: 'x' } })).toBeNull();
    expect(rewriteFrontmatterFields('---\nauthor: >\n  jim\n---\nb\n', { author: { from: 'jim', to: 'x' } })).toBeNull();
    expect(rewriteFrontmatterFields('no frontmatter', { author: { from: 'jim', to: 'x' } })).toBeNull();
  });

  test('keeps CRLF line endings', () => {
    const page = '---\r\nauthor: jim\r\ntitle: T\r\n---\r\nbody\r\n';
    expect(rewriteFrontmatterFields(page, { author: { from: 'jim', to: 'urn:uuid:1' } }))
      .toBe('---\r\nauthor: urn:uuid:1\r\ntitle: T\r\n---\r\nbody\r\n');
  });
});
