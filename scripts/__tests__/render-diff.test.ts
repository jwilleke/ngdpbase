/**
 * #1272 — the harness's two pieces of judgement, tested on fixtures.
 *
 * The harness itself is run by hand, but the normaliser and the classifier
 * decide what counts as a difference and what to call it. A number produced by
 * an untested normaliser is not evidence, and #1271 says the swap decision
 * rests on these numbers.
 */
import { describe, it, expect } from 'vitest';
import {
  normaliseHtml,
  classifyDifference,
  hasJspwikiSyntax,
  comparePage,
  buildShowdown,
  buildMarkdownIt,
  maskJspwiki
} from '../render-diff.js';
import { guardShowdownInput } from '../../src/utils/showdownGuard.js';

describe('normaliseHtml — removes what is not meaning', () => {
  it('treats attribute order as an artefact', () => {
    const a = normaliseHtml('<a href="/x" title="t" class="c">x</a>');
    const b = normaliseHtml('<a class="c" title="t" href="/x">x</a>');
    expect(a).toBe(b);
  });

  it('collapses whitespace between and inside tags', () => {
    const a = normaliseHtml('<p>one   two</p>\n\n<p>three</p>');
    const b = normaliseHtml('<p>one two</p><p>three</p>');
    expect(a).toBe(b);
  });

  it('keeps whitespace inside pre and code, where it is meaning', () => {
    const a = normaliseHtml('<pre><code>a\n    b</code></pre>');
    const b = normaliseHtml('<pre><code>a b</code></pre>');
    expect(a).not.toBe(b);
  });

  it('keeps indentation inside a code block nested in other markup', () => {
    const html = '<div><pre><code>if (x) {\n  y();\n}</code></pre></div>';
    expect(normaliseHtml(html)).toContain('\n  y();');
  });

  it('is stable — normalising twice changes nothing further', () => {
    const once = normaliseHtml('<p>a   b</p>\n<p>c</p>');
    expect(normaliseHtml(once)).toBe(once);
  });
});

describe('classifyDifference — names the construct that moved', () => {
  it('line breaks', () => {
    expect(classifyDifference('<p>a<br>b</p>', '<p>a b</p>')).toContain('line-breaks');
  });

  it('list nesting', () => {
    const shallow = '<ul><li>a</li><li>b</li></ul>';
    const nested = '<ul><li>a<ul><li>b</li></ul></li></ul>';
    expect(classifyDifference(shallow, nested)).toContain('list-nesting');
  });

  it('heading ids, including a changed slug at the same count', () => {
    const a = '<h2 id="one">One</h2>';
    const b = '<h2 id="one-1">One</h2>';
    expect(classifyDifference(a, b)).toContain('heading-ids');
  });

  it('escaped html', () => {
    expect(classifyDifference('<p>&lt;b&gt;</p>', '<p><b></b></p>')).toContain('escaped-html');
  });

  it('tables', () => {
    const a = '<table><tr><td>a</td></tr></table>';
    const b = '<p>| a |</p>';
    expect(classifyDifference(a, b)).toContain('tables');
  });

  it('emphasis', () => {
    expect(classifyDifference('<p><em>a_b</em></p>', '<p>a_b</p>')).toContain('emphasis');
  });

  it('code blocks', () => {
    const a = '<pre><code>x</code></pre>';
    const b = '<p>x</p>';
    expect(classifyDifference(a, b)).toContain('code-blocks');
  });

  it('reports every class that applies, not just the first', () => {
    // A reflowed sublist that also drops a <br>.
    const a = '<ul><li>a<br>x<ul><li>b</li></ul></li></ul>';
    const b = '<ul><li>a x</li><li>b</li></ul>';
    const classes = classifyDifference(a, b);
    expect(classes).toContain('line-breaks');
    expect(classes).toContain('list-nesting');
  });

  it('catches emphasis NESTING order, which a count comparison misses', () => {
    const a = '<p><strong><em>x</em></strong></p>';
    const b = '<p><em><strong>x</strong></em></p>';
    expect(classifyDifference(a, b)).toContain('emphasis');
  });

  it('catches a literal backslash showdown keeps and CommonMark consumes', () => {
    expect(classifyDifference('<p>a\\<br>b</p>', '<p>a<br>b</p>')).toContain('backslash');
  });

  it('falls back to other only when nothing specific fires', () => {
    expect(classifyDifference('<p>a</p>', '<div>a</div>')).toEqual(['other']);
  });
});

describe('hasJspwikiSyntax — only the unambiguous markers', () => {
  it.each([
    ['[{TableOfContents}]', 'plugin'],
    ['%%information\nhi\n/%', 'style block'],
    ['!!! Big heading', 'jspwiki heading'],
    ['[Display Text|Some Page]', 'piped link']
  ])('detects %s (%s)', (markdown) => {
    expect(hasJspwikiSyntax(markdown)).toBe(true);
  });

  it.each([
    ['# Heading\n\nSome *markdown*.'],
    ['- a\n- b'],
    ['[an ordinary link](https://example.com)'],
    ['`[{` inside code is still a marker, so avoid asserting otherwise']
  ])('leaves plain markdown alone: %s', (markdown) => {
    // The last case documents a known limitation rather than hiding it.
    const expected = markdown.includes('[{');
    expect(hasJspwikiSyntax(markdown)).toBe(expected);
  });
});

describe('maskJspwiki — stands constructs down the way extraction does', () => {
  it('masks a plugin call so neither converter sees brackets', () => {
    const out = maskJspwiki('Before [{TableOfContents}] after');
    expect(out).not.toContain('[{');
    expect(out).toMatch(/Before jspwikinode\d+x after/);
  });

  it('masks the variable that made the first run unmeasurable', () => {
    expect(maskJspwiki('[{$pagename}]')).not.toContain('[{');
  });

  it('masks a piped link but leaves an ordinary markdown link alone', () => {
    expect(maskJspwiki('[Text|Target]')).not.toContain('|');
    expect(maskJspwiki('[docs](https://example.com)')).toBe('[docs](https://example.com)');
  });

  // These three are LinkParserHandler's negative lookaheads, and getting any of
  // them wrong silently changes the corpus number.
  it('masks a bare page link, which the handler removes before markdown', () => {
    expect(maskJspwiki('See [Some Page] for more.')).toMatch(/See jspwikinode\d+x for more\./);
  });

  // LinkParserHandler leaves footnotes alone; the DOM pipeline owns them, and
  // the mask stands them down for the same reason it stands plugins down.
  it('masks a footnote reference rather than letting it reach the converters', () => {
    expect(maskJspwiki('Claim[^4] and more')).toMatch(/Claim jspwikinode\d+x and more|Claimjspwikinode\d+x and more/);
    expect(maskJspwiki('Claim[^4]')).not.toContain('[^4]');
  });

  it('masks a footnote definition line', () => {
    expect(maskJspwiki('[^4]: The source.')).not.toContain('[^4]:');
  });

  it('leaves a markdown link alone even next to a page link', () => {
    const out = maskJspwiki('[Page One] and [text](https://example.com)');
    expect(out).toContain('[text](https://example.com)');
    expect(out).not.toContain('[Page One]');
  });

  it('masks style-block markers but keeps the markdown inside them', () => {
    const out = maskJspwiki('%%information\nSome **bold** text.\n/%');
    expect(out).toContain('**bold**');
    expect(out).not.toContain('%%information');
  });

  it('produces a token both converters leave untouched', () => {
    const token = maskJspwiki('[{Anything}]');
    expect(comparePage(token).differs).toBe(false);
    expect(buildShowdown().makeHtml(token)).toContain(token.trim());
  });

  it('leaves plain markdown byte-identical', () => {
    const md = '# Title\n\n- a\n- b\n\nSome *text*.';
    expect(maskJspwiki(md)).toBe(md);
  });
});

describe('comparePage — the converters agree on ordinary markdown', () => {
  it.each([
    ['a heading', '# Hello World'],
    ['a paragraph', 'Just some text.'],
    ['bold and italic', 'Some **bold** and *italic* text.'],
    ['a link', 'See [the docs](https://example.com/docs).'],
    ['a fenced code block', '```js\nconst x = 1;\n```'],
    ['a flat list', '- one\n- two\n- three']
  ])('%s renders identically', (_label, markdown) => {
    const result = comparePage(markdown);
    expect(result.differs).toBe(false);
    expect(result.classes).toEqual([]);
  });

  it('reports a difference rather than throwing on empty input', () => {
    expect(() => comparePage('')).not.toThrow();
  });

  // The first real finding this harness produced. showdown emits both the bare
  // language and the prefixed form; markdown-it emits only the prefixed one, so
  // a stylesheet selecting `.js` would stop matching on the day of the swap.
  // buildMarkdownIt reproduces showdown's output, and this pins it — the class
  // list is a rendering contract, not an implementation detail.
  it('gives a fenced code block the same class list under both converters', () => {
    const guarded = guardShowdownInput('```js\nconst x = 1;\n```');
    const showdownOut = buildShowdown().makeHtml(guarded);
    const markdownItOut = buildMarkdownIt().render(guarded);
    expect(showdownOut).toContain('class="js language-js"');
    expect(markdownItOut).toContain('class="js language-js"');
    expect(comparePage('```js\nconst x = 1;\n```').differs).toBe(false);
  });

  // showdown's `ellipsis` option defaults to true, so production already
  // rewrites `...` to `…`. The candidate has to do the same or every page
  // containing an ellipsis reads as a difference.
  it('rewrites an ellipsis the way showdown already does', () => {
    expect(buildShowdown().makeHtml('Wait... really')).toContain('…');
    expect(buildMarkdownIt().render('Wait... really')).toContain('…');
    expect(comparePage('Wait... really').differs).toBe(false);
  });

  it('leaves an ellipsis inside a code span alone', () => {
    expect(buildMarkdownIt().render('`a...b`')).toContain('a...b');
  });

  it('ignores whitespace beside a line break, which is not rendered', () => {
    expect(normaliseHtml('<p>a <br>b</p>')).toBe(normaliseHtml('<p>a<br>b</p>'));
  });

  it('leaves a fence with no language unclassed, as showdown does', () => {
    const markdownItOut = buildMarkdownIt().render('```\nplain\n```');
    expect(markdownItOut).toContain('<pre><code>');
    expect(markdownItOut).not.toContain('class=');
  });

  it('flags a page carrying JSPWiki syntax', () => {
    expect(comparePage('[{TableOfContents}]').jspwiki).toBe(true);
  });
});
