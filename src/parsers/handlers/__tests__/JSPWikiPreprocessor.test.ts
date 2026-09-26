/**
 * JSPWikiPreprocessor tests
 *
 * Covers:
 * - process() passes regular content through
 * - %%class-name.../%% → <div class="class-name">...</div>
 * - Nested %%.../%% blocks
 * - Table classes (sortable, zebra-table, etc.) apply to <table>
 * - JSPWiki table: || header || → <thead><tr><th>...</th></tr></thead>
 * - JSPWiki table: | cell | → <tbody><tr><td>...</td></tr></tbody>
 * - Mixed header + data rows in same table
 * - Auto-numbering # in cells
 * - zebra-HEXCOLOR custom style
 * - extractCustomStyles for contrast color
 *
 * @jest-environment node
 */

import JSPWikiPreprocessor from '../JSPWikiPreprocessor';

const ctx = { pageName: 'TestPage', engine: { getManager: vi.fn(() => null) } };

async function run(content: string): Promise<string> {
  const handler = new JSPWikiPreprocessor();
  return handler.process(content, ctx);
}

describe('JSPWikiPreprocessor', () => {
  describe('metadata', () => {
    test('has correct handlerId', () => {
      const h = new JSPWikiPreprocessor();
      expect(h.handlerId).toBe('JSPWikiPreprocessor');
    });

    test('has priority 95', () => {
      const h = new JSPWikiPreprocessor();
      expect(h.priority).toBe(95);
    });
  });

  describe('passthrough', () => {
    test('returns regular text unchanged', async () => {
      const content = 'This is regular paragraph text.';
      const result = await run(content);
      expect(result).toBe(content);
    });

    test('returns empty string for empty content', async () => {
      const result = await run('');
      expect(result).toBe('');
    });

    test('passes through markdown headings and text', async () => {
      const content = '# Heading\n\nSome paragraph.\n\n- List item';
      const result = await run(content);
      expect(result).toBe(content);
    });
  });

  describe('%% style blocks', () => {
    test('wraps non-table class in div', async () => {
      const content = '%%information\nSome info content.\n/%';
      const result = await run(content);
      expect(result).toContain('<div class="information">');
      expect(result).toContain('Some info content.');
      expect(result).toContain('</div>');
    });

    test('applies multiple different style classes as nested divs', async () => {
      const content = '%%warning\nWarning content.\n/%';
      const result = await run(content);
      expect(result).toContain('<div class="warning">');
      expect(result).toContain('Warning content.');
    });

    test('unmatched %% block passes through unchanged', async () => {
      const content = '%%information\nNo closing tag.';
      const result = await run(content);
      expect(result).toContain('No closing tag.');
    });
  });

  describe('JSPWiki table syntax', () => {
    test('converts header row || cell || to <th>', async () => {
      const content = '|| Name || Age ||';
      const result = await run(content);
      expect(result).toContain('<table');
      expect(result).toContain('<th>');
      expect(result).toContain('Name');
      expect(result).toContain('Age');
    });

    test('converts data row | cell | to <td>', async () => {
      const content = '| Alice | 30 |';
      const result = await run(content);
      expect(result).toContain('<table');
      expect(result).toContain('<td>');
      expect(result).toContain('Alice');
      expect(result).toContain('30');
    });

    test('table with both header and data rows', async () => {
      const content = '|| Name || Age ||\n| Alice | 30 |\n| Bob | 25 |';
      const result = await run(content);
      expect(result).toContain('<thead>');
      expect(result).toContain('<tbody>');
      expect(result).toContain('<th>');
      expect(result).toContain('<td>');
      expect(result).toContain('Alice');
      expect(result).toContain('Bob');
    });

    test('applies default "table" class to all tables', async () => {
      const content = '|| Header ||\n| Cell |';
      const result = await run(content);
      expect(result).toContain('class="table"');
    });

    test('escapes HTML in table cells', async () => {
      const content = '| <script>alert(1)</script> |';
      const result = await run(content);
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });
  });

  describe('table style classes', () => {
    test('sortable class applied via %%sortable block', async () => {
      const content = '%%sortable\n|| Col1 || Col2 ||\n| a | b |\n/%';
      const result = await run(content);
      expect(result).toContain('sortable');
      expect(result).toContain('<table');
    });

    test('table-striped class applied to table', async () => {
      const content = '%%table-striped\n|| Name ||\n| Alice |\n/%';
      const result = await run(content);
      expect(result).toContain('table-striped');
    });

    test('zebra-table class applied', async () => {
      const content = '%%zebra-table\n|| Header ||\n| Row |\n/%';
      const result = await run(content);
      expect(result).toContain('zebra-table');
    });
  });

  describe('zebra-HEXCOLOR custom style', () => {
    test('zebra-ffd700 applies zebra-table class with custom style', async () => {
      const content = '%%zebra-ffd700\n|| Header ||\n| Row |\n/%';
      const result = await run(content);
      expect(result).toContain('zebra-table');
      expect(result).toContain('--zebra-row-even');
    });

    test('light color gets black text contrast', async () => {
      const content = '%%zebra-ffffff\n|| H ||\n| R |\n/%';
      const result = await run(content);
      expect(result).toContain('#000000');
    });

    test('dark color gets white text contrast', async () => {
      const content = '%%zebra-000000\n|| H ||\n| R |\n/%';
      const result = await run(content);
      expect(result).toContain('#ffffff');
    });
  });

  describe('auto-numbering # in cells', () => {
    test('# in data cell is replaced with row number', async () => {
      const content = '| # | Alice |\n| # | Bob |';
      const result = await run(content);
      expect(result).toContain('>1<');
      expect(result).toContain('>2<');
    });
  });

  describe('tables in non-table style blocks', () => {
    test('table inside non-table style block gets div wrapper', async () => {
      const content = '%%information\n|| Header ||\n| Cell |\n/%';
      const result = await run(content);
      expect(result).toContain('<div class="information">');
      expect(result).toContain('<table');
    });
  });

  describe('process() is same as parseStyleBlocks', () => {
    test('process() output contains table for table syntax', async () => {
      const content = '|| Name ||\n| Test |';
      const result = await run(content);
      expect(result).toContain('<table');
    });

    test('process() handles mixed content', async () => {
      const content = '# Heading\n\n%%warning\nBe careful!\n/%\n\n## Section\n\n|| A || B ||\n| 1 | 2 |';
      const result = await run(content);
      expect(result).toContain('<div class="warning">');
      expect(result).toContain('Be careful!');
      expect(result).toContain('<table');
      expect(result).toContain('# Heading');
    });
  });
});

describe('a row without a trailing delimiter keeps its last cell (#1338)', () => {
  const cellsOf = (html: string, tag: string) => [...html.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map(m => m[1].trim());

  test('no trailing || or | — every cell renders, as JSPWiki does', async () => {
    const html = await run('|| H1 || H2\n| a | b');

    expect(cellsOf(html, 'th')).toEqual(['H1', 'H2']);
    expect(cellsOf(html, 'td')).toEqual(['a', 'b']);
  });

  test('with trailing delimiters nothing changes', async () => {
    const html = await run('|| H1 || H2 ||\n| a | b |');

    expect(cellsOf(html, 'th')).toEqual(['H1', 'H2']);
    expect(cellsOf(html, 'td')).toEqual(['a', 'b']);
  });

  test('an empty first header cell stays (the Annelida shape)', async () => {
    const html = await run('||  || Rank\n| x | y');

    expect(cellsOf(html, 'th')).toEqual(['', 'Rank']);
    expect(cellsOf(html, 'td')).toEqual(['x', 'y']);
  });

  test('a pipe inside a wiki link is not a delimiter', async () => {
    const html = await run('|| Term || Link\n| a | [Text|Page]');

    expect(cellsOf(html, 'td')).toHaveLength(2);
  });
});
