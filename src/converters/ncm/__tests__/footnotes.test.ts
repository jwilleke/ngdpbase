/**
 * #1125 — GFM footnote definitions are captured for the sidecar list.
 *
 * The render pipeline already links `[^1]` refs inline; what was missing is
 * the transfer the issue asks for: a converted page's `[^id]: text`
 * definitions become FootnoteManager sidecar records (the "ngdpbase footnote
 * list", with its CRUD UI), the body keeps only the refs, and the page gains
 * a [{FootnotesPlugin}] section so the refs resolve to the rendered list.
 *
 * This module is the PURE half — extraction and body rewrite — so it can
 * honour §3.1 determinism; the sidecar write lives with the caller.
 */
import { extractFootnoteDefs, ensureFootnotesPlugin } from '../footnotes';

describe('extractFootnoteDefs', () => {
  test('a simple definition becomes a note record and leaves the body', () => {
    const src = 'Here is a footnote[^1]. More text.\n\n[^1]: My reference.\n\nAfter.';
    const out = extractFootnoteDefs(src);
    expect(out.defs).toEqual([{ id: '1', display: '', url: '', note: 'My reference.' }]);
    expect(out.content).not.toContain('[^1]:');
    expect(out.content).toContain('footnote[^1]');
    expect(out.content).toContain('After.');
  });

  test('a bare-URL definition maps to the url field', () => {
    const out = extractFootnoteDefs('x[^src]\n\n[^src]: https://example.org/paper\n');
    expect(out.defs).toEqual([{ id: 'src', display: '', url: 'https://example.org/paper', note: '' }]);
  });

  test('a markdown-link definition maps to display + url', () => {
    const out = extractFootnoteDefs('x[^1]\n\n[^1]: [The Paper](https://example.org/paper)\n');
    expect(out.defs).toEqual([{ id: '1', display: 'The Paper', url: 'https://example.org/paper', note: '' }]);
  });

  test('multi-paragraph definitions (GFM indented continuation) join into the note', () => {
    const src = 'x[^big]\n\n[^big]: First paragraph.\n\n    Continued indented line.\n    And another.\n\nBody resumes.';
    const out = extractFootnoteDefs(src);
    expect(out.defs).toHaveLength(1);
    expect(out.defs[0].note).toBe('First paragraph.\nContinued indented line.\nAnd another.');
    expect(out.content).toContain('Body resumes.');
    expect(out.content).not.toContain('Continued indented');
  });

  test('no definitions: content is returned byte-identical (idempotence)', () => {
    const src = 'Plain page with a ref[^1] but no defs.\n';
    const out = extractFootnoteDefs(src);
    expect(out.defs).toEqual([]);
    expect(out.content).toBe(src);
  });

  test('non-numeric ids survive verbatim', () => {
    const out = extractFootnoteDefs('a[^note-1]\n\n[^note-1]: text here\n');
    expect(out.defs[0].id).toBe('note-1');
  });
});

describe('ensureFootnotesPlugin', () => {
  test('appends a [{FootnotesPlugin}] section when absent', () => {
    const out = ensureFootnotesPlugin('Body with a ref[^1].');
    expect(out).toMatch(/\[\{FootnotesPlugin\}\]\s*$/);
  });

  test('leaves a page that already has the plugin untouched (idempotence)', () => {
    const src = 'Body[^1].\n\n[{FootnotesPlugin}]\n';
    expect(ensureFootnotesPlugin(src)).toBe(src);
  });

  test('parameterised plugin invocations count — no duplicate section', () => {
    const src = "Body[^1].\n\n[{FootnotesPlugin noheader='true'}]\n";
    expect(ensureFootnotesPlugin(src)).toBe(src);
  });
});
