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

  describe('line breaks conversion', () => {
    it('should convert \\\\ at end of line to backslash (trailing newline trimmed)', () => {
      const result = converter.convert('Line 1\\\\');
      // Final output is trimmed, so trailing newline is removed
      expect(result.content).toBe('Line 1\\');
    });

    it('should convert \\\\ mid-line to backslash line break', () => {
      const result = converter.convert('First\\\\Second');
      expect(result.content).toBe('First\\\nSecond');
    });

    it('should convert multiple mid-line \\\\ occurrences', () => {
      const result = converter.convert('A\\\\B\\\\C');
      expect(result.content).toBe('A\\\nB\\\nC');
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

    it('should convert \\\\ to backslash line break inside table cells', () => {
      const input = `|| Header ||
| Line1\\\\Line2 |`;
      const result = converter.convert(input);
      expect(result.content).toContain('| Line1\\\nLine2 |');
    });

    it('should convert emphasis inside table cells', () => {
      const input = `|| Header ||
| __bold__ and ''italic'' |`;
      const result = converter.convert(input);
      expect(result.content).toContain('| **bold** and *italic* |');
    });
  });

  describe('inline styles conversion', () => {
    it('should convert %%sup text /% to <sup>text</sup>', () => {
      const result = converter.convert('H%%sup 2 /%O');
      expect(result.content).toBe('H<sup>2</sup>O');
    });

    it('should convert %%sup text%% (alternate closing) to <sup>text</sup>', () => {
      const result = converter.convert('H%%sup 2%%O');
      expect(result.content).toBe('H<sup>2</sup>O');
    });

    it('should convert %%sub text /% to <sub>text</sub>', () => {
      const result = converter.convert('CO%%sub 2 /%');
      expect(result.content).toBe('CO<sub>2</sub>');
    });

    it('should convert %%sub text%% (alternate closing) to <sub>text</sub>', () => {
      const result = converter.convert('CO%%sub 2%%');
      expect(result.content).toBe('CO<sub>2</sub>');
    });

    it('should convert %%strike text /% to ~~text~~', () => {
      const result = converter.convert('This is %%strike removed /%.');
      expect(result.content).toBe('This is ~~removed~~.');
    });

    it('should convert %%strike text%% (alternate closing) to ~~text~~', () => {
      const result = converter.convert('This is %%strike removed%%.');
      expect(result.content).toBe('This is ~~removed~~.');
    });

    it('should handle multiple inline styles in one line', () => {
      const result = converter.convert('%%sup a /% and %%sub b /%');
      expect(result.content).toBe('<sup>a</sup> and <sub>b</sub>');
    });

    it('should be case insensitive for style names', () => {
      const result = converter.convert('%%SUP text%% and %%Sub text2/%');
      expect(result.content).toBe('<sup>text</sup> and <sub>text2</sub>');
    });
  });

  describe('status boxes conversion', () => {
    it('should convert %%information text /% to alert-info div', () => {
      const result = converter.convert('%%information Important note /%');
      expect(result.content).toBe('<div class="alert alert-info" role="alert">Important note</div>');
    });

    it('should convert %%information text%% (alternate closing) to alert-info div', () => {
      const result = converter.convert('%%information Important note%%');
      expect(result.content).toBe('<div class="alert alert-info" role="alert">Important note</div>');
    });

    it('should convert multi-line %%information block with %% closing', () => {
      const input = `%%information
This is an informational message!
%%`;
      const result = converter.convert(input);
      expect(result.content).toContain('alert-info');
      expect(result.content).toContain('This is an informational message!');
    });

    it('should convert %%warning text /% to alert-warning div', () => {
      const result = converter.convert('%%warning Be careful! /%');
      expect(result.content).toBe('<div class="alert alert-warning" role="alert">Be careful!</div>');
    });

    it('should convert multi-line %%warning block', () => {
      const input = `%%warning
This is a warning message.
Please read carefully.
%%`;
      const result = converter.convert(input);
      expect(result.content).toContain('alert-warning');
      expect(result.content).toContain('This is a warning message.');
    });

    it('should convert %%error text /% to alert-danger div', () => {
      const result = converter.convert('%%error Critical failure! /%');
      expect(result.content).toBe('<div class="alert alert-danger" role="alert">Critical failure!</div>');
    });

    it('should convert %%error text%% (alternate closing) to alert-danger div', () => {
      const result = converter.convert('%%error Critical failure%%');
      expect(result.content).toBe('<div class="alert alert-danger" role="alert">Critical failure</div>');
    });

    it('should be case insensitive for status box names', () => {
      const result = converter.convert('%%INFORMATION upper case%%');
      expect(result.content).toContain('alert-info');
    });

    it('should handle multiple status boxes in one document', () => {
      const input = `%%information Info here /%

%%warning Warning here /%

%%error Error here /%`;
      const result = converter.convert(input);
      expect(result.content).toContain('alert-info');
      expect(result.content).toContain('alert-warning');
      expect(result.content).toContain('alert-danger');
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
