/**
 * Test pages — issue #1355
 *
 * `required-pages/` carries one small admin-only page per content shape that
 * has broken rendering. Each ships to every install so admins can check it by
 * eye, and this suite renders each through MarkupParser with the real `page`
 * markdown profile and checks what it must produce.
 *
 * A test page is any required page with the system keyword `test-page`. The
 * suite fails when one lacks the test-page frontmatter (author `system`,
 * category `system`, audience `[admin]`) or has no expectations below, so a
 * page cannot be added without saying what it tests.
 *
 * Shapes that are still broken are pinned with `knownBug`: they run as
 * `test.fails`, so the suite stays green today and turns red the moment the
 * bug is fixed — remove the marker then. Every rendering fix adds its shape to
 * a page here.
 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import MarkupParser from '../MarkupParser';
import { createMarkdownConverter } from '../../rendering/markdownConverter';

class MockEngine {
  managers: Map<string, unknown>;
  constructor() {
    this.managers = new Map([
      ['ConfigurationManager', {
        getProperty: (key: string, defaultValue: unknown) => {
          const cfg: Record<string, unknown> = {
            'ngdpbase.markup.enabled': true,
            'ngdpbase.markup.caching': false,
            'ngdpbase.markup.handlers.plugin.enabled': false,
            'ngdpbase.markup.handlers.wikitag.enabled': false,
            'ngdpbase.markup.handlers.form.enabled': false,
            'ngdpbase.markup.handlers.interwiki.enabled': false,
            'ngdpbase.markup.handlers.linkparser.enabled': false,
            'ngdpbase.filters.enabled': false
          };
          return cfg[key] ?? defaultValue;
        },
        isInitialized: () => true
      }],
      ['CacheManager', {
        isInitialized: () => true,
        region: () => ({ get: async () => null, set: async () => {} })
      }],
      ['RenderingManager', { converter: createMarkdownConverter('page') }]
    ]);
  }
  getManager(name: string) { return this.managers.get(name) || null; }
}

interface Expectation {
  /** What the shape is, as the page's section heading says it. */
  name: string;
  check: (html: string) => void;
  /** Issue number of a bug that still breaks this shape. */
  knownBug?: number;
}

/** No block element may sit inside a paragraph (#1368). */
const noBlockInParagraph: Expectation = {
  name: 'no block element inside a paragraph',
  check: (html) => expect(html).not.toMatch(/<p>\s*<(div|table|pre|ul|ol|blockquote)\b/)
};

const EXPECTATIONS: Record<string, Expectation[]> = {
  'Test Page: Style Blocks': [
    {
      name: 'a block on one line is a div, with no paragraph inside',
      check: (html) => expect(html).toContain('<div class="information">One line of text in a block.</div>')
    },
    {
      name: 'a block with several lines keeps its paragraph',
      check: (html) => expect(html).toMatch(/<div class="warning"><p>First line\.<br>\s*Second line\.<\/p>/)
    },
    {
      name: 'a block right under a line of text ends that paragraph',
      check: (html) => expect(html).toMatch(
        /<p>Text directly above the block\.<\/p>\s*<div class="commentbox">Inside the box\.<\/div>\s*<p>Text directly below the block\.<\/p>/
      )
    },
    {
      name: 'nested blocks are sibling divs inside their parent',
      check: (html) => expect(html).toMatch(
        /<div class="columns">\s*<div class="[^"]*\binformation\b[^"]*">Left\.<\/div>\s*<div class="[^"]*\bwarning\b[^"]*">Right\.<\/div>/
      )
    },
    {
      name: 'inline styles',
      check: (html) => {
        expect(html).toContain('<span class="text-danger">red</span>');
        expect(html).toContain('H<sub>2</sub>O');
        expect(html).toContain('x<sup>2</sup>');
      }
    },
    {
      name: 'a styled table',
      check: (html) => expect(html).toMatch(/<table class="table table-striped">.*<td>alpha<\/td><td>1<\/td>/s)
    },
    {
      name: 'no style markup left as text',
      check: (html) => expect(html.replace(/<code>[^<]*<\/code>/g, '')).not.toMatch(/%%|\/%/)
    },
    noBlockInParagraph
  ],

  'Test Page: Line Breaks': [
    { name: 'mid-line', check: (html) => expect(html).toContain('<p>First part<br>second part.</p>') },
    {
      name: 'at the end of a line is one break, not two',
      check: (html) => expect(html).toMatch(/<p>Line one<br>\s*Line two<\/p>/)
    },
    {
      name: 'break and clear floats',
      check: (html) => expect(html).toContain('Before the flush <br class="wiki-clearfix"> after the flush.')
    },
    {
      name: 'inside an inline style',
      check: (html) => expect(html).toContain('<span class="text-info">first half<br>second half</span>')
    },
    { name: 'inside code', check: (html) => expect(html).toContain('<code>a\\\\b</code>') }
  ],

  'Test Page: Tables': [
    {
      name: 'bold and italic in cells',
      knownBug: 1351,
      check: (html) => {
        expect(html).toContain('<td><strong>strong text</strong></td>');
        expect(html).toContain('<td><em>leaning text</em></td>');
      }
    },
    {
      name: 'rows without a trailing bar keep their last cell',
      knownBug: 1338,
      check: (html) => {
        expect(html).toMatch(/<th>\s*Three\s*<\/th>/);
        expect(html).toMatch(/<td>\s*c\s*<\/td>/);
        expect(html).toMatch(/<td>\s*f\s*<\/td>/);
      }
    },
    {
      name: 'a GFM table has a header and no separator row',
      knownBug: 1352,
      check: (html) => {
        expect(html).toMatch(/<th>\s*Col A\s*<\/th>/);
        expect(html).not.toContain('-------');
      }
    }
  ],

  'Test Page: Headings': [
    {
      name: 'a repeated heading gets its own id',
      check: (html) => {
        expect(html).toContain('<h2 id="overview">Overview</h2>');
        expect(html).toContain('<h2 id="overview-1">Overview</h2>');
      }
    },
    {
      name: 'a heading with an ampersand',
      check: (html) => expect(html).toContain('<h2 id="salt-pepper">Salt &amp; Pepper</h2>')
    }
  ]
};

interface TestPage { title: string; file: string; data: Record<string, unknown>; body: string }

function loadTestPages(): TestPage[] {
  const dir = path.join(process.cwd(), 'required-pages');
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data, content } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
      return { title: String(data.title ?? ''), file: f, data, body: content };
    })
    .filter((p) => Array.isArray(p.data['system-keywords']) && (p.data['system-keywords'] as unknown[]).includes('test-page'));
}

const pages = loadTestPages();

describe('test pages (#1355)', () => {
  let parser: MarkupParser;
  const rendered = new Map<string, Promise<string>>();
  const render = (page: TestPage): Promise<string> => {
    if (!rendered.has(page.title)) rendered.set(page.title, parser.parse(page.body, { pageName: page.title }));
    return rendered.get(page.title);
  };

  beforeAll(async () => {
    parser = new MarkupParser(new MockEngine());
    await parser.initialize();
  });

  afterAll(async () => {
    await parser.shutdown();
  });

  test('there are test pages, and every one has expectations', () => {
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.map((p) => p.title).sort()).toEqual(Object.keys(EXPECTATIONS).sort());
  });

  for (const page of pages) {
    describe(page.title, () => {
      test('is an admin-only system page', () => {
        expect(page.data.author).toBe('system');
        expect(page.data['system-category']).toBe('system');
        expect(page.data.audience).toEqual(['admin']);
      });

      for (const exp of EXPECTATIONS[page.title] ?? []) {
        const run = async () => exp.check(await render(page));
        if (exp.knownBug) test.fails(`${exp.name} — known bug #${exp.knownBug}`, run);
        else test(exp.name, run);
      }
    });
  }
});
