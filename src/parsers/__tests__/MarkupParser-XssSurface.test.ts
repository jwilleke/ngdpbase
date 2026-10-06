/**
 * What actually reaches the browser from untrusted page content (#1032).
 *
 * Established while assessing two showdown XSS advisories:
 *
 *   GHSA-cr32-g25g-vxjj — metadata title, requires `completeHTMLDocument`
 *   GHSA-22g5-r2x5-97cx — table header id, requires `tablesHeaderId`
 *
 * Neither option is enabled anywhere in ngdpbase, so neither advisory is
 * reachable. Checking that raised the larger question those advisories only
 * hint at: markdown permits raw HTML by design. Until #1623 the filter that
 * stripped it shipped disabled, so a page author's script ran for every
 * reader. Raw HTML in a page is now always held to the HTML policy
 * (`ngdpbase.markup.html-policy`); these tests pin that, with the policy as it
 * ships and with none at all.
 */

import MarkupParser from '../MarkupParser';
import FilterManager from '../../managers/FilterManager';
import { HTML_POLICY_KEY } from '../../rendering/htmlPolicy';
import { shippedHtmlPolicy } from '../../rendering/__tests__/__fixtures__/shippedHtmlPolicy';

function makeEngine(policy: unknown) {
  const configManager = {
    getProperty: (key: string, defaultValue: unknown) => {
      const config: Record<string, unknown> = {
        'ngdpbase.markup.enabled': true,
        'ngdpbase.markup.caching': false,
        'ngdpbase.filters.enabled': true,
        'ngdpbase.filters.spam.enabled': false,
        'ngdpbase.filters.validation.enabled': true,
        [HTML_POLICY_KEY]: policy
      };
      return key in config ? config[key] : defaultValue;
    }
  };

  const managers = new Map<string, unknown>([['ConfigurationManager', configManager]]);
  return {
    managers,
    getManager: (name: string) => managers.get(name) ?? null
  };
}

async function render(markdown: string, policy: unknown = shippedHtmlPolicy): Promise<string> {
  // #1117: FilterManager owns the chain — construct it first, as WikiEngine does.
  const engine = makeEngine(policy);
  const filterManager = new FilterManager(engine);
  await filterManager.initialize();
  engine.managers.set('FilterManager', filterManager);
  const parser = new MarkupParser(engine);
  await parser.initialize();
  return parser.parse(markdown, { pageName: 'XssSurface', userContext: { isAuthenticated: true } });
}

describe('neither showdown XSS advisory is reachable here (#1032)', () => {
  test('no table header ids are emitted, so GHSA-22g5-r2x5-97cx has no target', async () => {
    // The advisory injects through a double quote in a table header, breaking
    // out of the unescaped `id` attribute. That attribute only exists when
    // `tablesHeaderId` is on; ngdpbase never enables it.
    const html = await render('| a"><svg onload=alert(1)> |\n|---|\n| cell |');

    expect(html).not.toMatch(/<th[^>]*\sid=/i);
  });

  test('completeHTMLDocument is never enabled, so GHSA-cr32-g25g-vxjj has no target', async () => {
    // That advisory injects through frontmatter metadata into a <title> tag,
    // which only exists in complete-document mode.
    const html = await render('---\ntitle: a</title><svg onload=alert(1)>\n---\n\nbody');

    expect(html).not.toMatch(/<title[\s>]/i);
  });
});

describe('raw HTML in page content meets the HTML policy (#1623)', () => {
  test('a script tag written by a page author does not reach the page', async () => {
    const html = await render("<script>alert('xss')</script>");

    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert');
  });

  test('an event-handler attribute does not reach the page', async () => {
    const html = await render('<svg onload=alert(1)>');

    expect(html).not.toMatch(/onload/i);
  });

  test('with no policy configured, the failure is closed', async () => {
    const html = await render('<b>bold</b> and <script>alert(1)</script>', null);

    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<script');
    expect(html).toContain('bold');
  });

  test('ordinary markup still renders', async () => {
    const html = await render('Some **bold** text and a [link](https://example.org).');

    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('example.org');
  });

  test('tables, code blocks and blockquotes survive', async () => {
    const html = await render('| h |\n|---|\n| c |\n\n```\ncode\n```\n\n> quoted\n\n---\n');

    expect(html).toMatch(/<table[\s>]/);
    expect(html).toContain('<td>');
    expect(html).toMatch(/<code[\s>]/);
    expect(html).toMatch(/<blockquote[\s>]/);
    expect(html).toContain('class="table"');
  });

  test('a hostile page is scrubbed while its legitimate parts render', async () => {
    const html = await render(
      '## Heading\n\n<script>alert(1)</script>\n\n<iframe src="//evil"></iframe>\n\n' +
      '<a href="/ok" onclick="steal()">link</a>\n\nNormal **text**.'
    );

    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/onclick/i);
    expect(html).toContain('<strong>text</strong>');
    expect(html).toContain('href="/ok"');
    // An author's <iframe> is not allowed. The maps LocationPlugin embeds are
    // plugin output, merged after markdown-it, which the policy never sees.
    expect(html).not.toContain('<iframe');
  });
});
