/**
 * #1123 — the untrusted-inline render profile.
 *
 * "One renderer, one sanitizer" was designed for trusted page authors: raw
 * HTML survives by config, [{Plugin}] and [{$var}] execute, and the
 * SecurityFilter allow-list admits <iframe>/<img> because an author-written
 * one is refused at SAVE. Comments pass no save gate and their authors are
 * never trusted, so this profile composes the SAME engine differently:
 * the same showdown core, the same SecurityFilter sanitizer with its config
 * forced on, a tightened tag list, and no MarkupParser — so plugin and
 * variable syntax is inert by construction rather than by switch.
 */
vi.unmock('../renderUntrustedInline');

import { renderUntrustedInline } from '../renderUntrustedInline';

function makeEngine(siteSecurityEnabled = false) {
  return {
    getManager: (name: string) =>
      name === 'ConfigurationManager'
        ? {
          getProperty: (key: string, fallback: unknown) =>
            key === 'ngdpbase.filters.security.enabled' ? siteSecurityEnabled : fallback
        }
        : null
  } as never;
}

describe('markdown that should work in a comment', () => {
  test('emphasis, code, links, lists, blockquotes', async () => {
    const html = await renderUntrustedInline(
      '**bold** and `code`\n\n- item one\n- item two\n\n> quoted\n\n[a link](https://example.org/x)',
      makeEngine()
    );
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<li>item one</li>');
    expect(html).toContain('<blockquote>');
    expect(html).toMatch(/<a[^>]+href="https:\/\/example\.org\/x"/);
  });

  test('single newlines become line breaks', async () => {
    const html = await renderUntrustedInline('line one\nline two', makeEngine());
    expect(html).toContain('<br');
  });
});

describe('what a hostile commenter writes does not survive', () => {
  test('script tags are stripped even when the SITE filter is off', async () => {
    // The page path gates SecurityFilter on config because page authors are
    // trusted by config. Commenters never are: the profile forces it on.
    const html = await renderUntrustedInline("<script>alert('x')</script>hello", makeEngine(false));
    expect(html).not.toContain('<script');
    expect(html).toContain('hello');
  });

  test('iframes are stripped — the page allow-list admits them, this profile does not', async () => {
    const html = await renderUntrustedInline('<iframe src="https://evil.example"></iframe>ok', makeEngine());
    expect(html).not.toContain('<iframe');
  });

  test('images are stripped — an external src is a tracking pixel aimed at every reader', async () => {
    const html = await renderUntrustedInline('![x](https://evil.example/pixel.png) and <img src="https://evil.example/p.png">', makeEngine());
    expect(html).not.toContain('<img');
  });

  test('event-handler attributes are stripped', async () => {
    const html = await renderUntrustedInline('<b onclick="steal()">hi</b>', makeEngine());
    expect(html).not.toMatch(/onclick/i);
    expect(html).toContain('hi');
  });

  test('javascript: hrefs are dropped', async () => {
    const html = await renderUntrustedInline('[click](javascript:alert(1))', makeEngine());
    expect(html).not.toContain('javascript:');
  });
});

describe('wiki machinery is inert by construction', () => {
  test('plugin syntax stays literal text', async () => {
    const html = await renderUntrustedInline('[{SearchPlugin query=secret}]', makeEngine());
    expect(html).toContain('[{SearchPlugin query=secret}]');
  });

  test('variable syntax stays literal text', async () => {
    const html = await renderUntrustedInline('[{$applicationname}]', makeEngine());
    expect(html).toContain('[{$applicationname}]');
  });
});
