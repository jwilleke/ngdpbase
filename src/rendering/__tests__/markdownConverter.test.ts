/**
 * #1273 — the one place that says how markdown becomes HTML.
 *
 * Each case pins a decision from the #1271 decision log (R2–R15), measured on
 * the real corpus by the #1272 harness. The options test is the markdown-it
 * form of the #1064 invariant: if one of these changes, pages change.
 */
import { describe, it, expect } from 'vitest';
import { createMarkdownConverter, buildMarkdownIt, renderInlineMarkdown } from '../markdownConverter.js';
import { headingSlug } from '../../utils/SectionUtils.js';
import { shippedHtmlPolicy } from './__fixtures__/shippedHtmlPolicy.js';

// The shipped HTML policy (#1623): without one, no author HTML renders.
const page = createMarkdownConverter('page', () => shippedHtmlPolicy);
const html = (md: string): string => page.makeHtml(md);

describe('page profile', () => {
  it('pins the options pages were measured against', () => {
    const o = buildMarkdownIt('page').options;
    expect(o.html).toBe(true);
    expect(o.breaks).toBe(true);
    expect(o.linkify).toBe(true);
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
});

// #1492: CommonMark is the house form for an external link, so it renders as
// the `[text|url|target="_blank"]` form does: the same class, target and rel.
describe('external links (#1492)', () => {
  const external = 'class="wiki-link external-link" target="_blank" rel="noopener noreferrer"';

  it('a CommonMark http(s) link opens in a new tab, with rel and the external-link classes', () => {
    expect(html('[Ext](https://example.com/a)')).toBe(
      `<p><a href="https://example.com/a" ${external}>Ext</a></p>\n`
    );
    expect(html('[Old](http://example.com)')).toContain(`<a href="http://example.com" ${external}>Old</a>`);
  });

  it('a link with a title keeps the title and gains the attributes', () => {
    expect(html('[Ext](https://example.com "A title")')).toContain(
      `<a href="https://example.com" title="A title" ${external}>Ext</a>`
    );
  });

  it('an autolink and a reference link are external too', () => {
    expect(html('<https://example.com>')).toContain(`<a href="https://example.com" ${external}>https://example.com</a>`);
    expect(html('[Ext][r]\n\n[r]: https://example.com/r')).toContain(`<a href="https://example.com/r" ${external}>Ext</a>`);
  });

  it('inline in a table cell, where the page profile renders it without a paragraph', () => {
    expect(renderInlineMarkdown('[Ext](https://example.com)')).toBe(`<a href="https://example.com" ${external}>Ext</a>`);
  });

  it('internal, relative, mailto and anchor links are unchanged', () => {
    expect(html('[a](/view/Home)')).toBe('<p><a href="/view/Home">a</a></p>\n');
    expect(html('[a](Page)')).toBe('<p><a href="Page">a</a></p>\n');
    expect(html('[a](mailto:a@b.co)')).toBe('<p><a href="mailto:a@b.co">a</a></p>\n');
    expect(html('[a](#top)')).toBe('<p><a href="#top">a</a></p>\n');
    expect(html('[a](//example.com/x)')).toBe('<p><a href="//example.com/x">a</a></p>\n');
  });

  it('href escaping is as strict as before: entities escaped, quotes encoded, javascript: not a link', () => {
    expect(html('[a](https://example.com/?a=1&b=2)')).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(html('[a](https://example.com/x"y)')).toContain('href="https://example.com/x%22y"');
    expect(html('[a](javascript:alert(1))')).not.toContain('<a');
  });

  it('the fallback profile gives the same attributes', () => {
    expect(createMarkdownConverter('fallback').makeHtml('[Ext](https://example.com)')).toContain(
      `<a href="https://example.com" ${external}>Ext</a>`
    );
  });

  it('the untrusted profile (comments) is not changed', () => {
    expect(createMarkdownConverter('untrusted').makeHtml('[Ext](https://example.com)')).toBe(
      '<p><a href="https://example.com">Ext</a></p>\n'
    );
  });
});

// #2443: a bare web address becomes a link when the page is shown. The stored
// text is not rewritten; code and an escaped address stay text.
describe('bare web addresses (#2443)', () => {
  const external = 'class="wiki-link external-link" target="_blank" rel="noopener noreferrer"';
  const link = (u: string): string => `<a href="${u}" ${external}>${u}</a>`;

  it('a bare address becomes an external link, with the same attributes as a written one', () => {
    expect(html('See https://example.com/a?b=1 today')).toBe(`<p>See ${link('https://example.com/a?b=1')} today</p>\n`);
    expect(html('Old http://example.com')).toContain(link('http://example.com'));
  });

  it('trailing punctuation stays outside the link', () => {
    expect(html('Go to https://example.com.')).toBe(`<p>Go to ${link('https://example.com')}.</p>\n`);
  });

  it('an address inside quotation marks becomes a link', () => {
    expect(html('He said "https://example.com" twice')).toContain(`&quot;${link('https://example.com')}&quot;`);
  });

  it('an address in an inline code span stays text', () => {
    expect(html('Use `https://example.com` here')).toBe('<p>Use <code>https://example.com</code> here</p>\n');
  });

  it('an address in a fenced or an indented code block stays text', () => {
    expect(html('```\nhttps://example.com\n```')).not.toContain('<a');
    expect(html('    https://example.com')).not.toContain('<a');
  });

  it('a backslash-escaped address stays text', () => {
    const out = html('See \\https://example.com now');
    expect(out).not.toContain('<a');
    expect(out).toContain('https://example.com');
  });

  it('a bare address in a table cell is a link', () => {
    expect(renderInlineMarkdown('https://example.com')).toBe(link('https://example.com'));
  });

  it('written links render exactly as before and are not linked twice', () => {
    expect(html('[Ext](https://example.com/a)')).toBe(`<p><a href="https://example.com/a" ${external}>Ext</a></p>\n`);
    expect(html('[https://example.com](https://example.com)')).toBe(`<p>${link('https://example.com')}</p>\n`);
    expect(html('<https://example.com>')).toBe(`<p>${link('https://example.com')}</p>\n`);
    expect(html('<a href="https://example.com">x</a>')).toContain('<a href="https://example.com">x</a>');
  });

  it('only http and https addresses link: no bare domains, mail addresses, ftp or protocol-relative', () => {
    for (const text of ['example.com', 'www.example.com', 'a@example.com', 'mailto:a@example.com', 'ftp://example.com', '//example.com/x']) {
      expect(html(`See ${text} now`)).not.toContain('<a');
    }
  });

  it('a struck-through address keeps the strikethrough and the address as written', () => {
    expect(html('~~https://a.com~~')).toBe(`<p><del>${link('https://a.com')}</del></p>\n`);
  });

  it('an address keeps `_` and `*` as written, whole, and a closing ~~ stays outside it', () => {
    expect(html('https://example.com/_foo_')).toBe(`<p>${link('https://example.com/_foo_')}</p>\n`);
    expect(html('see https://example.com/a_b_c now')).toBe(`<p>see ${link('https://example.com/a_b_c')} now</p>\n`);
    const star = html('https://example.com/*x*');
    expect(star).not.toContain('<em>');
    expect(star).toContain('href="https://example.com/*x');
    expect(html('~~https://example.com/_foo_~~')).toBe(`<p><del>${link('https://example.com/_foo_')}</del></p>\n`);
    expect(html('~~https://a.com~~ and ~~https://b.com~~')).toBe(
      `<p><del>${link('https://a.com')}</del> and <del>${link('https://b.com')}</del></p>\n`
    );
  });

  it('a full stop after an address inside ~~ stays outside the link, as it does without ~~', () => {
    expect(html('~~see https://a.com/x.~~')).toBe(`<p><del>see ${link('https://a.com/x')}.</del></p>\n`);
    expect(html('~~https://a.com/x,~~')).toBe(`<p><del>${link('https://a.com/x')},</del></p>\n`);
  });

  it('each match ends at the next strikethrough marker', () => {
    for (const converter of [createMarkdownConverter('page'), createMarkdownConverter('untrusted')]) {
      const short = converter.makeHtml('http://a/~~http://b/~~');
      expect(short).toContain('<a href="http://a/"');
      expect(short).toContain('<del><a href="http://b/"');
    }
  });

  it('the visible text of a link has no bidi control characters or line breaks, and the href stays percent-encoded', () => {
    const out = html('https://a.com/%E2%80%AEevil%E2%81%A6x%0D%0Ay');
    const text = />([^<]*)<\/a>/.exec(out)?.[1] ?? '';
    expect(text).toBe('https://a.com/evilxy');
    expect(out).toContain('href="https://a.com/%E2%80%AEevil%E2%81%A6x%0D%0Ay"');
  });

  it('the left-to-right and right-to-left marks and the Arabic letter mark are not shown either', () => {
    const out = html('https://a.com/%E2%80%8Ea%E2%80%8Fb%D8%9Cc');
    expect(/>([^<]*)<\/a>/.exec(out)?.[1]).toBe('https://a.com/abc');
    expect(out).toContain('href="https://a.com/%E2%80%8Ea%E2%80%8Fb%D8%9Cc"');
  });

  describe.each(['page', 'untrusted'] as const)('length limits (%s)', (profile) => {
    const converter = createMarkdownConverter(profile);

    test.each(['a://', 'x://http://', '[http://a](', 'http://a*b*', 'http://a/~~', 'https://[', 'http://a.b/((', 'ab://x.com/', 'http://a.b/x', 'http://a.b/%E2%80%8E', 'ftp://a ', '\\http://a '])(
      'about 256 KB of %j renders within a length limit',
      (shape) => {
        const started = performance.now();
        converter.makeHtml(shape.repeat(Math.ceil(256_000 / shape.length)));
        expect(performance.now() - started).toBeLessThan(2000);
      }
    );

    const LONG_HOST = `${'xn--a.'.repeat(8)}${'abcdefgh.'.repeat(440)}-`;

    test.each([
      ['xn--a.', '-'],
      ['xn--a.b.', '-'],
      ['XN--1.', '-']
    ])('long host names stay text: %s repeated', (unit, tail) => {
      const started = performance.now();
      const out = converter.makeHtml(`http://${unit.repeat(40)}${tail}`);
      expect(performance.now() - started).toBeLessThan(200);
      expect(out).not.toContain('<a');
    });

    test('a host of more than 253 characters or 32 labels stays text', () => {
      expect(converter.makeHtml(`http://${'a'.repeat(254)}.com/`)).not.toContain('<a');
      expect(converter.makeHtml(`http://${'a.'.repeat(33)}com/`)).not.toContain('<a');
    });

    test.each([
      ['a long text before the @', `http://${'xn--a.'.repeat(8)}${'abcdefgh.'.repeat(440)}-@x.com`],
      ['33 labels before the @', `http://${'a.'.repeat(33)}@x.com/`],
      ['more than 253 characters before the @', `http://${`${'a'.repeat(60)}.`.repeat(5)}@x.com/`],
      ['a ? before the @, 8 punycode labels after it', `http://a?b@${LONG_HOST}@x.com`],
      ['a # before the @, 8 punycode labels after it', `http://a#b@${LONG_HOST}@x.com`],
      ['24 ? before the @, 8 punycode labels after it', `http://${'a?'.repeat(24)}@${LONG_HOST}@x.com`],
      ['4 punycode labels', `http://${'xn--a.'.repeat(4)}a.com`],
      ['4 punycode labels among 20 labels', 'http://u@é.xn--a.b.xn--a.c.xn--a.d.xn--a.e.f.g.h.i.j.k.l.m.n.zz:80-'],
      ['a ? before the @, 33 labels after it', `http://a?b@${'a.'.repeat(33)}x.com/`],
      ['a # before the @, a host of more than 253 characters after it', `http://a#b@${`${'a'.repeat(60)}.`.repeat(5)}x.com/`]
    ])('long host names stay text: %s', (_name, address) => {
      expect(converter.makeHtml(address)).not.toContain('<a');
    });

    test.each([
      ['a user name and password with a port', 'https://user:pass@example.com:8080/x'],
      ['a query with an @ in it', 'https://example.com/?q=a@b.com'],
      ['a query with an @ in it and no path', 'https://example.com?q=a@b.com'],
      ['3 punycode labels', 'https://xn--a.xn--b.xn--c.org/'],
      ['a punycode host and a path', 'https://xn--bcher-kva.example/path'],
      ['a punycode host', 'https://xn--bcher-kva.example/'],
      ['a host of several labels, a query and a fragment', 'https://a.b.c.example.com/x?y=1#z'],
      ['a long query and no path', `https://example.com?q=${'a'.repeat(300)}`],
      ['many dotted labels after a # and no path', `https://example.com#${'a.'.repeat(40)}b`],
      ['a user part of exactly 50 characters', `https://${'u'.repeat(50)}@example.com/`]
    ])('%s still links', (_name, address) => {
      expect(converter.makeHtml(address)).toContain(`<a href="${address}"`);
    });
  });

  test.each(['page', 'untrusted', 'fallback'] as const)('a user part of 51 characters is not read as one (%s)', (profile) => {
    const user = 'u'.repeat(51);
    const out = createMarkdownConverter(profile).makeHtml(`https://${user}@example.com/`);
    expect(out).not.toContain('<a href="https://' + user + '@example.com/"');
    expect(out).toContain(`<a href="https://${user}"`);
  });

  test.each(['page', 'untrusted', 'fallback'] as const)('a backslash that is itself escaped does not escape the address (%s)', (profile) => {
    expect(createMarkdownConverter(profile).makeHtml('\\\\https://example.com')).toContain(
      '<p>\\<a href="https://example.com"'
    );
  });

  test.each([
    ['exactly 4,096 characters and nothing after it', 4096, '', true],
    ['4,097 characters and nothing after it', 4097, '', false],
    ['4,095 characters then a space', 4095, ' x', true],
    ['4,096 characters then a space', 4096, ' x', false]
  ])('the 4,096-character limit: %s', (_name, length, after, links) => {
    const address = `https://a.com/${'b'.repeat(length - 14)}`;
    for (const converter of [createMarkdownConverter('page'), createMarkdownConverter('untrusted')]) {
      const out = converter.makeHtml(address + after);
      expect(out.includes(`<a href="${address}"`)).toBe(links);
    }
  });

  it('an address of more than 4,096 characters with no break in it is left as text', () => {
    for (const converter of [createMarkdownConverter('page'), createMarkdownConverter('untrusted')]) {
      expect(converter.makeHtml(`http://a.b/${'x'.repeat(5000)}*y*z`)).not.toContain('<a');
    }
  });

  it('an address of more than 4,096 characters with no break in it is never linked as a cut-off prefix', () => {
    const long = `https://a.com/${'b'.repeat(5000)}`;
    for (const href of [...html(long).matchAll(/href="([^"]*)"/g)].map((m) => m[1])) expect(href).toBe(long);
    const near = `https://a.com/${'b'.repeat(4000)}`;
    expect(html(near)).toContain(`<a href="${near}"`);
    expect(html(`${near} next`)).toContain(`<a href="${near}"`);
  });

  it('a backslash-escaped address with `_` stays text', () => {
    const out = html('\\https://a.com/_foo_');
    expect(out).not.toContain('<a');
    expect(out).toContain('\\https://a.com/');
  });

  it('a backslash before the address keeps it as text and the backslash shows', () => {
    expect(html('\\https://a.com')).toBe('<p>\\https://a.com</p>\n');
  });

  it('three dots inside an address stay as written, in the text and the href', () => {
    expect(html('https://a.com/a...b')).toBe(`<p>${link('https://a.com/a...b')}</p>\n`);
    expect(html('Wait... https://a.com/a...b')).toContain('Wait…');
  });

  it('in a table cell the link ends where a placeholder begins', () => {
    expect(renderInlineMarkdown('https://a.com\uE0000\uE001')).toBe(`${link('https://a.com')}\uE0000\uE001`);
    expect(renderInlineMarkdown('x \uE0001\uE001 https://a.com')).toBe(`x \uE0001\uE001 ${link('https://a.com')}`);
  });
});

// #2443: comments link a bare address too, and nothing else about them changes.
describe('bare web addresses in comments (#2443)', () => {
  const untrusted = createMarkdownConverter('untrusted');
  const external = 'class="wiki-link external-link" target="_blank" rel="noopener noreferrer"';

  it('a bare http(s) address becomes an external link', () => {
    expect(untrusted.makeHtml('see https://example.com/a')).toBe(
      `<p>see <a href="https://example.com/a" ${external}>https://example.com/a</a></p>\n`
    );
    expect(untrusted.makeHtml('"https://example.com"')).toContain(`<a href="https://example.com" ${external}>`);
  });

  it('an address with `_` or a closing ~~ in a comment is linked whole', () => {
    expect(untrusted.makeHtml('https://example.com/_foo_')).toBe(
      `<p><a href="https://example.com/_foo_" ${external}>https://example.com/_foo_</a></p>\n`
    );
    expect(untrusted.makeHtml('~~https://a.com~~')).toBe(
      `<p><del><a href="https://a.com" ${external}>https://a.com</a></del></p>\n`
    );
  });

  it('code and a backslash-escaped address stay text', () => {
    expect(untrusted.makeHtml('`https://example.com`')).not.toContain('<a');
    expect(untrusted.makeHtml('\\https://example.com')).toBe('<p>\\https://example.com</p>\n');
  });

  it('other schemes, domains and mail addresses stay text', () => {
    for (const text of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', 'example.com', 'a@example.com', 'vbscript://x']) {
      expect(untrusted.makeHtml(`see ${text} now`)).not.toContain('<a');
    }
  });

  it('written links in comments are as before: no new tab, no classes', () => {
    expect(untrusted.makeHtml('[Ext](https://example.com)')).toBe('<p><a href="https://example.com">Ext</a></p>\n');
    expect(untrusted.makeHtml('<https://example.com>')).toBe('<p><a href="https://example.com">https://example.com</a></p>\n');
  });

  it('headings get no ids and nothing else in the profile loosens', () => {
    expect(untrusted.makeHtml('## Title')).not.toContain('id=');
    expect(untrusted.makeHtml('- [x] done')).not.toContain('checkbox');
    expect(untrusted.makeHtml('H~2~O')).not.toContain('<sub>');
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

  it('links a bare web address, and only that', () => {
    expect(fallback.makeHtml('see https://example.com/a now')).toContain(
      '<a href="https://example.com/a" class="wiki-link external-link" target="_blank" rel="noopener noreferrer">'
    );
    expect(fallback.makeHtml('see example.com or a@b.com')).not.toContain('<a');
  });

  it('is plain CommonMark: no single-newline breaks, no ids', () => {
    expect(fallback.makeHtml('a\nb')).not.toContain('<br>');
    expect(fallback.makeHtml('## Title')).not.toContain('id=');
  });
});

describe('factory', () => {
  it('reads the HTML policy on every render, so a configuration change applies at once (#1623)', () => {
    let policy: unknown = null;
    const converter = createMarkdownConverter('page', () => policy);
    expect(converter.makeHtml('<kbd>K</kbd>')).not.toContain('<kbd>');
    policy = { tags: { kbd: true }, attributes: {}, schemes: {} };
    expect(converter.makeHtml('<kbd>K</kbd>')).toContain('<kbd>K</kbd>');
  });
});
