/**
 * Tests for JSPWikiConverter
 */

import JSPWikiConverter from '../JSPWikiConverter';

describe('JSPWikiConverter', () => {
  let converter;

  beforeEach(() => {
    converter = new JSPWikiConverter();
  });

  describe('interface properties', () => {
    it('should have correct formatId', () => {
      expect(converter.formatId).toBe('jspwiki');
    });

    it('should have correct formatName', () => {
      expect(converter.formatName).toBe('JSPWiki');
    });

    it('should have correct fileExtensions', () => {
      expect(converter.fileExtensions).toEqual(['.txt']);
    });
  });

  describe('canHandle', () => {
    it('should detect .txt files', () => {
      expect(converter.canHandle('any content', 'page.txt')).toBe(true);
      expect(converter.canHandle('any content', 'PAGE.TXT')).toBe(true);
    });

    it('should detect JSPWiki heading syntax', () => {
      expect(converter.canHandle('!!! Large Heading', 'page.wiki')).toBe(true);
      expect(converter.canHandle('!! Medium Heading', 'page.wiki')).toBe(true);
      expect(converter.canHandle('! Small Heading', 'page.wiki')).toBe(true);
    });

    it('should detect JSPWiki SET directive', () => {
      expect(converter.canHandle("[{SET title='My Page'}]", 'page.wiki')).toBe(true);
    });

    it('should detect JSPWiki bold syntax', () => {
      expect(converter.canHandle('This is __bold__ text', 'page.wiki')).toBe(true);
    });

    it('should detect JSPWiki table headers', () => {
      expect(converter.canHandle('|| Header 1 || Header 2 ||', 'page.wiki')).toBe(true);
    });

    it('should not detect plain markdown', () => {
      expect(converter.canHandle('# Markdown Heading', 'page.wiki')).toBe(false);
      expect(converter.canHandle('**bold** text', 'page.wiki')).toBe(false);
    });

    // #879 — YAML frontmatter means markdown/NCM even when the body contains
    // JSPWiki-shared forms (||table||, %%style, __bold__).
    it('should not content-detect NCM with YAML frontmatter', () => {
      const ncm = '---\ntitle: X\nncmVersion: 2\n---\n\n||H1||H2||\n%%table-striped\n__b__\n';
      expect(converter.canHandle(ncm, 'page.wiki')).toBe(false);
      expect(converter.canHandle(ncm, 'exported-page')).toBe(false);
    });

    it('frontmatter guard does not override an explicit .txt extension', () => {
      expect(converter.canHandle('---\ntitle: X\n---\n\nbody', 'page.txt')).toBe(true);
    });
  });

  describe('headings conversion', () => {
    it('should convert !!! to # (h1)', () => {
      const result = converter.convert('!!! Large Heading');
      expect(result.content).toBe('# Large Heading');
    });

    it('should convert !! to ## (h2)', () => {
      const result = converter.convert('!! Medium Heading');
      expect(result.content).toBe('## Medium Heading');
    });

    it('should convert ! to ### (h3)', () => {
      const result = converter.convert('! Small Heading');
      expect(result.content).toBe('### Small Heading');
    });

    it('should handle multiple headings', () => {
      const input = `!!! Title
!! Section
! Subsection`;
      const result = converter.convert(input);
      expect(result.content).toBe(`# Title
## Section
### Subsection`);
    });
  });

  describe('emphasis conversion', () => {
    it('should convert __text__ to **text** (bold)', () => {
      const result = converter.convert('This is __bold__ text');
      expect(result.content).toBe('This is **bold** text');
    });

    it("should convert ''text'' to *text* (italic)", () => {
      const result = converter.convert("This is ''italic'' text");
      expect(result.content).toBe('This is *italic* text');
    });

    it('should handle combined bold and italic', () => {
      const result = converter.convert("__bold__ and ''italic''");
      expect(result.content).toBe('**bold** and *italic*');
    });
  });

  describe('monospace conversion', () => {
    it('should convert {{text}} to `text`', () => {
      const result = converter.convert('Use {{code}} here');
      expect(result.content).toBe('Use `code` here');
    });

    // #1342 decision 2026-09-26: balanced braces, JSPWiki escapes read as shown.
    it('keeps braces inside the span, and a backtick inside gets a longer fence', () => {
      expect(converter.convert('A {{.mark {background:yellow;}}} B').content).toBe('A `.mark {background:yellow;}` B');
      expect(converter.convert('One of {{ a`b }}').content).toBe('One of ``a`b``');
    });

    it('reads the [[ and entity escapes inside as the reader saw them', () => {
      expect(converter.convert('{{ [[\\p{Lower}] }}').content).toBe('`[\\p{Lower}]`');
      expect(converter.convert('x {{a&#91;b&#124;c}}').content).toBe('x `a[b|c`');
    });

    it('leaves a span that would hold a bar in a table row as written', () => {
      expect(converter.convert('| {{a&#124;b}} | x').content).toContain('{{a&#124;b}}');
    });
  });

  describe('code blocks conversion', () => {
    it('should convert {{{ }}} to ``` ```', () => {
      const input = `{{{
function hello() {
  return "world";
}
}}}`;
      const result = converter.convert(input);
      expect(result.content).toBe(`\`\`\`
function hello() {
  return "world";
}
\`\`\``);
    });
  });

  describe('lists conversion', () => {
    it('should convert * to - (unordered list)', () => {
      const input = `* Item 1
* Item 2
* Item 3`;
      const result = converter.convert(input);
      expect(result.content).toBe(`- Item 1
- Item 2
- Item 3`);
    });

    it('should handle nested unordered lists', () => {
      const input = `* Item 1
** Nested 1
** Nested 2
* Item 2`;
      const result = converter.convert(input);
      expect(result.content).toBe(`- Item 1
  - Nested 1
  - Nested 2
- Item 2`);
    });

    it('should convert # to 1. (ordered list)', () => {
      const input = `# First
# Second
# Third`;
      const result = converter.convert(input);
      expect(result.content).toBe(`1. First
1. Second
1. Third`);
    });

    it('should handle nested ordered lists', () => {
      const input = `# First
## Nested 1
## Nested 2
# Second`;
      const result = converter.convert(input);
      expect(result.content).toBe(`1. First
  1. Nested 1
  1. Nested 2
1. Second`);
    });
  });

  describe('horizontal rules conversion', () => {
    it('should convert ---- to --- with blank line when preceded by content', () => {
      const result = converter.convert('Before\n----\nAfter');
      expect(result.content).toBe('Before\n\n---\nAfter');
    });

    it('should handle longer dash sequences', () => {
      const result = converter.convert('--------');
      expect(result.content).toBe('---');
    });

    it('should not double-add blank line when one already exists', () => {
      const result = converter.convert('Before\n\n----\nAfter');
      expect(result.content).toBe('Before\n\n---\nAfter');
    });

    it('should insert blank line after heading to prevent setext interpretation', () => {
      const input = '!! More Information\nSome text\n----\n* Reference';
      const result = converter.convert(input);
      expect(result.content).toContain('Some text\n\n---\n');
      // Verify --- is not attached to the preceding text
      expect(result.content).not.toMatch(/Some text\n---/);
    });
  });

  // #1370: `\\` and `\\\` are NCM — the renderer turns them into <br>. The import
  // used to rewrite them to a backslash + newline, which split one-line `%%`
  // runs and table rows in two and changed code.
  describe('line breaks pass through unchanged (#1370)', () => {
    it.each([
      ['at the end of a line', 'Line 1\\\\\nLine 2'],
      ['mid-line', 'First\\\\Second'],
      ['several mid-line', 'A\\\\B\\\\C'],
      ['break and clear floats', 'Line one \\\\\\ after flush'],
      ['inside a one-line %% run', 'use %%tip-x Use the markup. \\\\These are classes /% :']
    ])('%s', (_label, input) => {
      expect(converter.convert(input).content).toBe(input);
    });

    it('leaves a \\\\ inside {{{ }}} code as code', () => {
      expect(converter.convert('Use {{{a\\\\b}}} here').content).toBe('Use `a\\\\b` here');
    });
  });

  describe('links conversion', () => {
    it('should preserve [PageName] wiki links (ngdpbase native syntax)', () => {
      const result = converter.convert('See [MyPage] for details');
      expect(result.content).toBe('See [MyPage] for details');
    });

    it('should preserve [text|PageName] wiki links (ngdpbase native syntax)', () => {
      const result = converter.convert('[click here|MyPage]');
      expect(result.content).toBe('[click here|MyPage]');
    });

    it('should convert external links to markdown format', () => {
      const result = converter.convert('[Google|https://google.com]');
      expect(result.content).toBe('[Google](https://google.com)');
    });

    it('should handle bare external URLs', () => {
      const result = converter.convert('[https://example.com]');
      expect(result.content).toBe('https://example.com');
    });
  });

  describe('definition lists conversion', () => {
    it('should convert ;term:definition to **term**: definition', () => {
      const result = converter.convert(';Wiki:A collaborative website');
      expect(result.content).toBe('**Wiki**: A collaborative website');
    });
  });

  describe('footnotes conversion', () => {
    it('should convert [1] to [^1]', () => {
      const result = converter.convert('See note[1]');
      expect(result.content).toBe('See note[^1]');
    });

    it('should convert [#1] to [^1]:', () => {
      const result = converter.convert('[#1] This is a footnote');
      expect(result.content).toBe('[^1]: This is a footnote');
    });
  });

  describe('SET attributes extraction', () => {
    it('should extract title attribute', () => {
      const result = converter.convert("[{SET title='My Page Title'}]\nContent here");
      expect(result.metadata['title']).toBe('My Page Title');
      expect(result.content).toBe('Content here');
    });

    it('should extract author attribute', () => {
      const result = converter.convert('[{SET author=JohnDoe}]');
      expect(result.metadata['author']).toBe('JohnDoe');
    });

    it('should store custom attributes in jspwiki namespace', () => {
      const result = converter.convert("[{SET customField='value123'}]");
      expect(result.metadata['jspwiki']['customField']).toBe('value123');
    });
  });

  describe('tables preservation', () => {
    it('should preserve JSPWiki table syntax (rendered by JSPWikiPreprocessor at runtime)', () => {
      const input = '|| Header 1 || Header 2 ||';
      const result = converter.convert(input);
      expect(result.content).toContain('|| Header 1 || Header 2 ||');
    });

    it('should preserve full JSPWiki table', () => {
      const input = `|| Name || Age ||
| Alice | 30 |
| Bob | 25 |`;
      const result = converter.convert(input);
      expect(result.content).toContain('|| Name || Age ||');
      expect(result.content).toContain('| Alice | 30 |');
      expect(result.content).toContain('| Bob | 25 |');
    });

    it('should preserve wiki links inside table cells', () => {
      const input = `|| Month || Days ||
| [June] | 30 |`;
      const result = converter.convert(input);
      expect(result.content).toContain('| [June] | 30 |');
    });

    it('keeps a \\\\ line break inside a table cell on its row (#1370)', () => {
      const input = `|| Header ||
| Line1\\\\Line2 |`;
      const result = converter.convert(input);
      expect(result.content).toContain('| Line1\\\\Line2 |');
    });

    it('should convert emphasis inside table cells', () => {
      const input = `|| Header ||
| __bold__ and ''italic'' |`;
      const result = converter.convert(input);
      expect(result.content).toContain('| **bold** and *italic* |');
    });
  });

  // #1367: `%%` style runs and blocks are NCM — the renderer owns them. The
  // import used to rewrite six of them into HTML with a regex that ran over code
  // and took a `%%` inside code as the closer, which is how Haddock Styles got
  // `<div class="alert alert-info" role="alert">`</div>information`.
  describe('%% style runs and blocks pass through unchanged (#1367)', () => {
    it.each([
      ['inline %%sup', 'H%%sup 2 /%O'],
      ['inline %%sub', 'CO%%sub 2 /%'],
      ['inline %%strike', 'This is %%strike removed /%.'],
      ['bare %% closer', 'H%%sup 2%%O'],
      ['inline status box', 'Don’t bother %%warning reading/% it.'],
      ['block status box', '%%information\nImportant note\n/%'],
      ['block status box, bare %% closer', '%%warning\nThis is a warning message.\nPlease read carefully.\n%%'],
      ['several status boxes', '%%information Info here /%\n\n%%warning Warning here /%\n\n%%error Error here /%'],
      ['class run', '%%btn.btn-info.btn-xs Button/%']
    ])('%s', (_label, input) => {
      const result = converter.convert(input);
      expect(result.content).toBe(input);
      expect(result.content).not.toMatch(/<div class="alert|<sup>|<sub>|~~/);
    });

    it('leaves a %% run shown inside {{{ }}} code as code', () => {
      const result = converter.convert('Use {{{%%sup x/%}}} for superscript.');
      expect(result.content).toBe('Use `%%sup x/%` for superscript.');
    });

    it('keeps a status box whose content shows its own markup in code (Haddock Styles)', () => {
      const result = converter.convert('%%information\n  {{{%%information}}}\n/%');
      expect(result.content).toBe('%%information\n  `%%information`\n/%');
    });
  });

  describe('complex document conversion', () => {
    it('should handle a complete JSPWiki document', () => {
      const input = `[{SET title='Sample Page'}]

!!! Welcome to JSPWiki

This is a __sample__ page with ''various'' formatting.

!! Features

* Easy to use
* Collaborative
** Multiple users
** Real-time

See [Documentation] for more.

----

[#1] This is a footnote reference[1].`;

      const result = converter.convert(input);

      // Check metadata
      expect(result.metadata['title']).toBe('Sample Page');

      // Check content conversions
      expect(result.content).toContain('# Welcome to JSPWiki');
      expect(result.content).toContain('**sample**');
      expect(result.content).toContain('*various*');
      expect(result.content).toContain('## Features');
      expect(result.content).toContain('- Easy to use');
      expect(result.content).toContain('  - Multiple users');
      expect(result.content).toContain('[Documentation]');
      expect(result.content).toContain('---');
      expect(result.content).toContain('[^1]:');
    });
  });

  describe('warnings', () => {
    it('should warn about unhandled JSPWiki plugins', () => {
      const result = converter.convert('[{INSERT SomePlugin page=Main}]');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].detail).toMatch(/unhandled JSPWiki plugin/i);
      expect(result.warnings[0].detail).toContain('INSERT');
    });

    it('should warn about multiple different plugins', () => {
      const result = converter.convert(
        '[{INSERT PageIndex}]\n[{Counter name=visits}]\n[{CurrentTimePlugin format=yyyy}]'
      );
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].detail).toMatch(/3 unhandled/);
      expect(result.warnings[0].detail).toContain('INSERT');
      expect(result.warnings[0].detail).toContain('Counter');
      expect(result.warnings[0].detail).toContain('CurrentTimePlugin');
    });

    it('should not warn about known-safe plugins (Image, ATTACH, TableOfContents)', () => {
      const result = converter.convert(
        "[{Image src='photo.jpg' width=200}]\n[{ATTACH file.pdf|Download}]\n[{TableOfContents}]"
      );
      const pluginWarnings = result.warnings.filter(w => w.detail.includes('unhandled'));
      expect(pluginWarnings.length).toBe(0);
    });

    it('should not warn about SET directives', () => {
      const result = converter.convert("[{SET title='Page'}]");
      const pluginWarnings = result.warnings.filter(w => w.detail.includes('unhandled'));
      expect(pluginWarnings.length).toBe(0);
    });

    it('should not warn about variable references', () => {
      const result = converter.convert('[{$title}]');
      const pluginWarnings = result.warnings.filter(w => w.detail.includes('unhandled'));
      expect(pluginWarnings.length).toBe(0);
    });
  });

  describe('category extraction', () => {
    it('should extract %%category [Name]%% syntax to user-keywords', () => {
      const result = converter.convert('Some text\n%%category [Science]%%\nMore text');
      expect(result.metadata['user-keywords']).toEqual(['science']);
      expect(result.content).toBe('Some text\n\nMore text');
    });

    it('should extract %%category [Name] /% alternate syntax', () => {
      const result = converter.convert('Text %%category [History] /% more');
      expect(result.metadata['user-keywords']).toEqual(['history']);
      expect(result.content).toBe('Text  more');
    });

    it('should handle multiple categories on one page', () => {
      const input = `%%category [Science]%%
Some content
%%category [Biology]%%
More content
%%category [Research]%%`;
      const result = converter.convert(input);
      expect(result.metadata['user-keywords']).toEqual(['science', 'biology', 'research']);
    });

    it('should normalize category names to lowercase', () => {
      const result = converter.convert('%%category [UPPERCASE]%% and %%category [MixedCase]%%');
      expect(result.metadata['user-keywords']).toEqual(['uppercase', 'mixedcase']);
    });

    it('should handle spaces in category names', () => {
      const result = converter.convert('%%category [Earth Science]%%');
      expect(result.metadata['user-keywords']).toEqual(['earth science']);
    });

    it('should deduplicate repeated categories', () => {
      const input = '%%category [Science]%%\n%%category [science]%%\n%%category [SCIENCE]%%';
      const result = converter.convert(input);
      expect(result.metadata['user-keywords']).toEqual(['science']);
    });

    it('should be case insensitive for "category" keyword', () => {
      const input = '%%CATEGORY [Test1]%% %%Category [Test2]%% %%category [Test3]%%';
      const result = converter.convert(input);
      expect(result.metadata['user-keywords']).toEqual(['test1', 'test2', 'test3']);
    });

    it('should warn when exceeding 5 user-keywords', () => {
      const input = `%%category [Cat1]%%
%%category [Cat2]%%
%%category [Cat3]%%
%%category [Cat4]%%
%%category [Cat5]%%
%%category [Cat6]%%`;
      const result = converter.convert(input);
      expect(result.metadata['user-keywords']).toHaveLength(6);
      expect(result.warnings.some(w => w.detail.includes('exceeds limit of 5'))).toBe(true);
    });

    it('should handle empty brackets gracefully', () => {
      const result = converter.convert('%%category []%% valid %%category [Valid]%%');
      expect(result.metadata['user-keywords']).toEqual(['valid']);
    });

    it('should strip category blocks but preserve surrounding content', () => {
      const input = 'Before %%category [Test]%% After';
      const result = converter.convert(input);
      expect(result.content).toBe('Before  After');
      expect(result.metadata['user-keywords']).toEqual(['test']);
    });

    it('should merge with existing user-keywords from SET directive', () => {
      // Simulate a scenario where user-keywords might already exist
      const input = '%%category [NewCategory]%%';
      const result = converter.convert(input);
      expect(result.metadata['user-keywords']).toContain('newcategory');
    });
  });

  describe('image path conversion', () => {
    it('should strip page path from Image src attribute with single quotes', () => {
      const input = "[{Image src='Geological Timeline/Geolog_path_text.svg.png' caption='Twitter Files' align='left'}]";
      const result = converter.convert(input);
      expect(result.content).toBe("[{Image src='Geolog_path_text.svg.png' caption='Twitter Files' align='left'}]");
    });

    it('should strip page path from Image src attribute with double quotes', () => {
      const input = '[{Image src="Some Page/image.jpg" width=200}]';
      const result = converter.convert(input);
      expect(result.content).toBe('[{Image src="image.jpg" width=200}]');
    });

    it('should handle deeply nested paths', () => {
      const input = "[{Image src='Category/Subcategory/Page Name/file.png'}]";
      const result = converter.convert(input);
      expect(result.content).toBe("[{Image src='file.png'}]");
    });

    it('should leave src unchanged when no path present', () => {
      const input = "[{Image src='simple.jpg' width=100}]";
      const result = converter.convert(input);
      expect(result.content).toBe("[{Image src='simple.jpg' width=100}]");
    });

    it('should handle multiple Image plugins in content', () => {
      const input = `Some text
[{Image src='Page1/image1.png'}]
More text
[{Image src='Page2/image2.jpg' caption='Second'}]`;
      const result = converter.convert(input);
      expect(result.content).toContain("[{Image src='image1.png'}]");
      expect(result.content).toContain("[{Image src='image2.jpg' caption='Second'}]");
    });

    it('should preserve other Image attributes', () => {
      const input = "[{Image src='My Page/photo.png' caption='A caption' align='left' style='font-size: 120%;background-color: white;'}]";
      const result = converter.convert(input);
      expect(result.content).toBe("[{Image src='photo.png' caption='A caption' align='left' style='font-size: 120%;background-color: white;'}]");
    });

    it('should be case insensitive for Image plugin name', () => {
      const input = "[{image src='PageName/file.gif'}]";
      const result = converter.convert(input);
      expect(result.content).toBe("[{Image src='file.gif'}]");
    });
  });
});
