/**
 * #1273 — the one place that says how markdown becomes HTML.
 *
 * Each case pins a decision from the #1271 decision log (R2–R15), measured on
 * the real corpus by the #1272 harness. The options test is the markdown-it
 * form of the #1064 invariant: if one of these changes, pages change.
 */
import { describe, it, expect } from 'vitest';
import { createMarkdownConverter, buildMarkdownIt } from '../markdownConverter.js';
import { headingSlug } from '../../utils/SectionUtils.js';

const page = createMarkdownConverter('page');
const html = (md: string): string => page.makeHtml(md);

describe('page profile', () => {
  it('pins the options pages were measured against', () => {
    const o = buildMarkdownIt('page').options;
    expect(o.html).toBe(true);
    expect(o.breaks).toBe(true);
    expect(o.linkify).toBe(false);
    expect(o.typographer).toBe(false);
  });

  it('R2 — heading ids come from SectionUtils.headingSlug', () => {
    expect(html('## Key Amendments')).toContain(`id="${headingSlug('Key Amendments')}"`);
  });

  it('R10 — a heading with an entity gets its id from the plain text', () => {
    expect(html('## Key Amendments &amp; Impact')).toContain(`id="${headingSlug('Key Amendments & Impact')}"`);
  });

  it('R11 — a repeated heading gets -1, and every render starts afresh', () => {
    const out = html('## Notes\n\n## Notes');
    expect(out).toContain('id="notes"');
    expect(out).toContain('id="notes-1"');
    expect(html('## Notes')).toContain('id="notes"');
  });

  it('R4 — a single newline is a line break', () => {
    expect(html('one\ntwo')).toContain('one<br>\ntwo');
  });

  it('R5 — a fenced block keeps both the bare and the prefixed language class', () => {
    expect(html('```js\nlet a;\n```')).toContain('<code class="js language-js">');
  });

  it('R6 — ... becomes … in text, never in code, and nothing else is typographic', () => {
    const out = html('Wait... "quoted" -- dash `a...b`');
    expect(out).toContain('Wait…');
    expect(out).toContain('&quot;quoted&quot; -- dash');
    expect(out).not.toMatch(/[“”–—]/);
    expect(out).toContain('<code>a...b</code>');
  });

  it('R7 — strikethrough renders <del>', () => {
    expect(html('~~gone~~')).toContain('<del>gone</del>');
  });

  it('R8 — H~2~O and X^2^ with no spaces; a spaced ~ is text', () => {
    expect(html('H~2~O and X^2^')).toContain('H<sub>2</sub>O and X<sup>2</sup>');
    expect(html('about (~5%) or so (~ maybe')).not.toContain('<sub>');
  });

  it('R9 — a trailing backslash is a hard break and is not shown', () => {
    const out = html('line one\\\nline two');
    expect(out).toContain('line one<br>');
    expect(out).not.toContain('\\');
  });

  it('R12 — foo_bar_baz stays plain text', () => {
    expect(html('call foo_bar_baz now')).toContain('foo_bar_baz');
    expect(html('call foo_bar_baz now')).not.toContain('<em>');
  });

  it('R13 — \\<div> shows the letters; a real <div> is HTML', () => {
    expect(html('\\<div> text')).toContain('&lt;div&gt; text');
    expect(html('<div class="x">\n\ntext\n\n</div>')).toContain('<div class="x">');
  });

  it('R14 — a third level nested at 2 spaces renders nested', () => {
    expect((html('- a\n  - b\n    - c').match(/<ul>/g) ?? []).length).toBe(3);
  });

  it('R15 — two quote groups split by a blank line are two quotes', () => {
    expect((html('> a\n\n> b').match(/<blockquote>/g) ?? []).length).toBe(2);
  });

  it('renders task lists and GFM tables', () => {
    expect(html('- [x] done')).toContain('type="checkbox"');
    expect(html('| a | b |\n|---|---|\n| 1 | 2 |')).toContain('<table>');
  });

  it('does not autolink a bare URL', () => {
    expect(html('see https://example.com')).not.toContain('<a');
  });
});

describe('untrusted profile (comments)', () => {
  const untrusted = createMarkdownConverter('untrusted');

  it('keeps breaks, tables, fences and <del>, as the showdown untrusted converter did', () => {
    expect(untrusted.makeHtml('a\nb')).toContain('a<br>');
    expect(untrusted.makeHtml('~~x~~')).toContain('<del>x</del>');
    expect(untrusted.makeHtml('| a |\n|---|\n| 1 |')).toContain('<table>');
  });

  it('adds no heading ids, task lists or sub/superscript', () => {
    expect(untrusted.makeHtml('## Title')).not.toContain('id=');
    expect(untrusted.makeHtml('- [x] done')).not.toContain('checkbox');
    expect(untrusted.makeHtml('H~2~O')).not.toContain('<sub>');
  });
});

describe('fallback profile (degraded paths)', () => {
  const fallback = createMarkdownConverter('fallback');

  it('is plain CommonMark: no single-newline breaks, no ids', () => {
    expect(fallback.makeHtml('a\nb')).not.toContain('<br>');
    expect(fallback.makeHtml('## Title')).not.toContain('id=');
  });
});

describe('factory', () => {
  it('returns one converter per profile', () => {
    expect(createMarkdownConverter('page')).toBe(page);
    expect(createMarkdownConverter('untrusted')).not.toBe(page);
  });
});
