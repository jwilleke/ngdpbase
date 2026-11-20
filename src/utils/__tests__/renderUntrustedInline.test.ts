/**
 * #1123 — the untrusted-inline render profile.
 *
 * "One renderer, one sanitizer" was designed for trusted page authors: raw
 * HTML survives by config, [{Plugin}] and [{$var}] execute, and the
 * SecurityFilter allow-list admits <iframe>/<img> because an author-written
 * one is refused at SAVE. Comments pass no save gate and their authors are
 * never trusted, so this profile composes the SAME engine differently:
 * the same markdown-it core (#1273), the same SecurityFilter sanitizer with its config
 * forced on, a tightened tag list, and no MarkupParser — so plugin and
 * variable syntax is inert by construction rather than by switch.
 */
vi.unmock('../renderUntrustedInline');

import { renderUntrustedInline } from '../renderUntrustedInline';
import { TEST_FORMATTERS } from '../../test-support/plugins';

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
      TEST_FORMATTERS,
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
    const html = await renderUntrustedInline(TEST_FORMATTERS, 'line one\nline two', makeEngine());
    expect(html).toContain('<br');
  });
});

describe('bare web addresses in a comment (#2443)', () => {
  test('a bare http(s) address links and keeps its new-tab attributes through the filter', async () => {
    const html = await renderUntrustedInline(TEST_FORMATTERS, 'see https://example.org/x', makeEngine());
    expect(html).toMatch(/<a[^>]+href="https:\/\/example\.org\/x"[^>]*>/);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test('the href of a bare address is the address as typed, escaped once', async () => {
    const html = await renderUntrustedInline(TEST_FORMATTERS, 'see https://a.com/?a=1&b=2 and https://a.com/?q=&amp;x', makeEngine());
    expect(html).toContain('href="https://a.com/?a=1&amp;b=2"');
    expect(html).toContain('href="https://a.com/?q=&amp;amp;x"');
    expect(html).not.toContain('&amp;amp;amp;');
  });

  test('an upper-case scheme gets the same attributes', async () => {
    const html = await renderUntrustedInline(TEST_FORMATTERS, 'see HTTPS://EXAMPLE.COM/x', makeEngine());
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test('a link an author wrote in HTML gets no new-tab attributes, whatever its class', async () => {
    const html = await renderUntrustedInline(
      TEST_FORMATTERS,
      '<a href="https://evil.example/" class="wiki-link external-link">x</a>',
      makeEngine()
    );
    expect(html).not.toContain('target=');
    expect(html).not.toContain('rel=');
  });

  test('a bare address next to such a link still gets them', async () => {
    const html = await renderUntrustedInline(
      TEST_FORMATTERS,
      '<a href="https://evil.example/" class="wiki-link external-link">x</a> https://example.org/y',
      makeEngine()
    );
    expect(html.match(/target="_blank"/g)).toHaveLength(1);
  });

  test('javascript: and data: addresses are not links, and raw HTML is still stripped', async () => {
    const html = await renderUntrustedInline(
      TEST_FORMATTERS,
      'javascript:alert(1) data:text/html,hi <script>alert(1)</script><a href="javascript:alert(2)">x</a>',
      makeEngine()
    );
    expect(html).not.toMatch(/<a[^>]+href="(?:javascript|data):/i);
    expect(html).not.toContain('<script');
  });
});

describe('what a hostile commenter writes does not survive', () => {
  test('script tags are stripped even when the SITE filter is off', async () => {
    // The page path gates SecurityFilter on config because page authors are
    // trusted by config. Commenters never are: the profile forces it on.
    const html = await renderUntrustedInline(TEST_FORMATTERS, "<script>alert('x')</script>hello", makeEngine(false));
    expect(html).not.toContain('<script');
    expect(html).toContain('hello');
  });

  test('iframes are stripped — the page allow-list admits them, this profile does not', async () => {
    const html = await renderUntrustedInline(TEST_FORMATTERS, '<iframe src="https://evil.example"></iframe>ok', makeEngine());
    expect(html).not.toContain('<iframe');
  });

  test('images are stripped — an external src is a tracking pixel aimed at every reader', async () => {
    const html = await renderUntrustedInline(TEST_FORMATTERS, '![x](https://evil.example/pixel.png) and <img src="https://evil.example/p.png">', makeEngine());
    expect(html).not.toContain('<img');
  });

  test('event-handler attributes are stripped', async () => {
    const html = await renderUntrustedInline(TEST_FORMATTERS, '<b onclick="steal()">hi</b>', makeEngine());
    expect(html).not.toMatch(/onclick/i);
    expect(html).toContain('hi');
  });

  test('javascript: hrefs are dropped', async () => {
    // markdown-it (#1273) refuses to build a link to a javascript: URL at all
    // (validateLink), so the markup stays inert text — nothing is clickable.
    // showdown built the <a> and SecurityFilter stripped the href.
    const html = await renderUntrustedInline(TEST_FORMATTERS, '[click](javascript:alert(1))', makeEngine());
    expect(html).not.toMatch(/<a\b/);
    expect(html).not.toMatch(/href\s*=\s*["']?\s*javascript:/i);
  });

  test('a raw javascript: link in HTML is sanitized too', async () => {
    const html = await renderUntrustedInline(TEST_FORMATTERS, '<a href="javascript:alert(1)">x</a>', makeEngine());
    expect(html).not.toMatch(/href\s*=\s*["']?\s*javascript:/i);
  });
});

describe('wiki machinery is inert by construction', () => {
  test('plugin syntax stays literal text', async () => {
    const html = await renderUntrustedInline(TEST_FORMATTERS, '[{SearchPlugin query=secret}]', makeEngine());
    expect(html).toContain('[{SearchPlugin query=secret}]');
  });

  test('variable syntax stays literal text', async () => {
    const html = await renderUntrustedInline(TEST_FORMATTERS, '[{$applicationname}]', makeEngine());
    expect(html).toContain('[{$applicationname}]');
  });
});
