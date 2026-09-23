/**
 * What a page title may contain (#1455) — the rule itself.
 *
 * It lived in three copies in WikiRoutes, so the paths that do not pass a
 * route (import, MCP, ingest) could write a title the editor refuses. The
 * door applies it now; this pins the rule it applies.
 */
import { FORBIDDEN_TITLE_CHARS, normaliseTitle, titleBreaksRule } from '../pageTitleRule';

describe('the page title rule (#1455)', () => {
  test.each(['/', '\\', '#', '?', '%', '"', '<', '>', '|', '*'])('refuses %s', (char) => {
    expect(titleBreaksRule(`Docs${char}Setup`)).toBe(true);
  });

  test('allows the characters titles actually use', () => {
    for (const title of ['Docs Setup', "Molly's diary", 'Captures — jim — 2026-09-14', 'C++ notes', 'Rate: 50%25', 'Ünïcode']) {
      expect(titleBreaksRule(title.replace('%25', ''))).toBe(false);
    }
  });

  test('the regex is stateless between calls — a /g flag would alternate', () => {
    expect(FORBIDDEN_TITLE_CHARS.test('a/b')).toBe(true);
    expect(FORBIDDEN_TITLE_CHARS.test('a/b')).toBe(true);
  });

  test.each([
    ['Docs/Setup', 'Docs-Setup'],
    ['a//b', 'a-b'],
    ['/leading', 'leading'],
    ['trailing/', 'trailing'],
    ['What? Why* How|', 'What- Why- How'],
    ['a/\\b', 'a-b']
  ])('normalises %s to %s', (given, expected) => {
    expect(normaliseTitle(given)).toBe(expected);
  });

  test('a title made only of forbidden characters normalises to nothing, so a caller must refuse it', () => {
    expect(normaliseTitle('///')).toBe('');
  });

  test('a title that keeps the rule is returned unchanged', () => {
    expect(normaliseTitle('Docs Setup')).toBe('Docs Setup');
  });
});
