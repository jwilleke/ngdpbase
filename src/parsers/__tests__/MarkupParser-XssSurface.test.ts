/**
 * What actually reaches the browser from untrusted page content (#1032).
 *
 * Established while assessing two showdown XSS advisories:
 *
 *   GHSA-cr32-g25g-vxjj — metadata title, requires `completeHTMLDocument`
 *   GHSA-22g5-r2x5-97cx — table header id, requires `tablesHeaderId`
 *
 * Neither option is enabled anywhere in ngdpbase, so neither advisory is
 * reachable. But checking that raised the larger question those advisories
 * only hint at: markdown permits raw HTML by design, and `SecurityFilter` —
 * which strips it — ships DISABLED (`ngdpbase.markup.filters.security.enabled`
 * defaults to false, deliberately, per #596).
 *
 * These tests record what the pipeline does by default. They are deliberately
 * written as observations rather than aspirations: several assert that
 * dangerous markup SURVIVES. That is the current, intended-by-default
 * behaviour for a trusted-author wiki, and pinning it means any change to that
 * posture is a visible, deliberate diff rather than a silent one.
 *
 * It is NOT safe for an instance whose authors are strangers — which the
 * public demo now is. See #1032.
 */

import MarkupParser from '../MarkupParser';
import FilterManager from '../../managers/FilterManager';

function makeEngine(securityFilterEnabled: boolean) {
  const configManager = {
    getProperty: (key: string, defaultValue: unknown) => {
      const config: Record<string, unknown> = {
        'ngdpbase.markup.enabled': true,
        'ngdpbase.markup.caching': false,
        'ngdpbase.markup.filters.enabled': true,
        'ngdpbase.markup.filters.security.enabled': securityFilterEnabled,
        'ngdpbase.markup.filters.security.prevent-xss': true,
        'ngdpbase.markup.filters.security.sanitize-html': true,
        'ngdpbase.markup.filters.security.strip-dangerous-content': true,
        'ngdpbase.markup.filters.spam.enabled': false,
        'ngdpbase.markup.filters.validation.enabled': true
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

async function render(markdown: string, securityFilterEnabled = false): Promise<string> {
  // #1117: FilterManager owns the chain — construct it first, as WikiEngine does.
  const engine = makeEngine(securityFilterEnabled);
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

describe('raw HTML in page content — the real exposure (#1032)', () => {
  // These record current default behaviour. They are not an endorsement of it.
  test('a script tag written by a page author survives by default', async () => {
    const html = await render("<script>alert('xss')</script>");

    expect(html).toContain('<script>');
  });

  test('an event-handler attribute survives by default', async () => {
    const html = await render('<svg onload=alert(1)>');

    expect(html).toMatch(/onload/i);
  });
});

describe('SecurityFilter closes it when enabled (#1032)', () => {
  test('script tags are stripped', async () => {
    const html = await render("<script>alert('xss')</script>", true);

    expect(html).not.toContain('<script>');
  });

  test('event-handler attributes are stripped', async () => {
    const html = await render('<svg onload=alert(1)>', true);

    expect(html).not.toMatch(/onload\s*=/i);
  });

  test('ordinary markup still renders', async () => {
    // The cost of enabling it: the allow-list is closed, so this guards
    // against the filter being so aggressive that normal pages break.
    const html = await render('Some **bold** text and a [link](https://example.org).', true);

    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('example.org');
  });

  test('tables, code blocks and blockquotes survive', async () => {
    // These were missing from the allow-list, so enabling the filter used to
    // delete them from every page — quieter than the encoding bug, same class
    // of "turning on security breaks the site".
    const html = await render(
      '| h |\n|---|\n| c |\n\n```\ncode\n```\n\n> quoted\n\n---\n',
      true
    );

    expect(html).toMatch(/<table[\s>]/);
    expect(html).toContain('<td>');
    expect(html).toMatch(/<code[\s>]/);
    expect(html).toMatch(/<blockquote[\s>]/);
    // `class` is allow-listed, so styling survives the filter too.
    expect(html).toContain('class="table"');
  });

  test('a hostile page is scrubbed while its legitimate parts render', async () => {
    // The whole point, in one case: the dangerous parts go, the rest stays.
    const html = await render(
      '## Heading\n\n<script>alert(1)</script>\n\n<iframe src="//evil"></iframe>\n\n' +
      '<a href="/ok" onclick="steal()">link</a>\n\nNormal **text**.',
      true
    );

    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/onclick/i);
    expect(html).toContain('<strong>text</strong>');
    expect(html).toContain('href');
    // <iframe> is NOT stripped at render any more (#1037). It is refused at
    // SAVE, where an author's frame can still be told apart from one our own
    // LocationPlugin emits for embedded maps. Blocking it here removed every
    // map on the wiki.
    expect(html).toContain('<iframe');
  });
});
