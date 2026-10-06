/**
 * #1623 — one HTML policy, met by save and render alike.
 *
 * Before this, a save was checked by a handful of per-line regexes and the
 * render was not filtered at all (`filters.security.enabled` shipped false).
 * The three payloads below passed the save check and executed when the page
 * was viewed. Each is now refused at save, naming what is not allowed, and
 * stripped at render — by the same policy, read from the same configuration
 * key, through the same parser.
 */
import fs from 'fs';
import path from 'path';
import { describe, test, expect } from 'vitest';
import MarkupParser from '../../parsers/MarkupParser';
import SecurityFilter from '../../parsers/filters/SecurityFilter';
import { createMarkdownConverter } from '../markdownConverter';
import { HTML_POLICY_KEY, asHtmlPolicy, filterAuthorHtml, htmlPolicyViolations } from '../htmlPolicy';
import { shippedHtmlPolicy as shippedPolicy } from './__fixtures__/shippedHtmlPolicy';

const root = path.join(__dirname, '../../..');

function makeEngine(policy: unknown = shippedPolicy) {
  const config: Record<string, unknown> = {
    'ngdpbase.markup.enabled': true,
    'ngdpbase.markup.caching': false,
    [HTML_POLICY_KEY]: policy
  };
  const configManager = { getProperty: (key: string, fallback: unknown) => (key in config ? config[key] : fallback) };
  const managers = new Map<string, unknown>([['ConfigurationManager', configManager]]);
  managers.set('RenderingManager', { converter: createMarkdownConverter('page', () => configManager.getProperty(HTML_POLICY_KEY, null)) });
  managers.set('PluginManager', {
    // Plugin output is ours, not the author's: an embedded map is an <iframe>
    // with a style and an onclick — none of which the author policy allows.
    execute: (name: string) => Promise.resolve(name === 'MapEmbed'
      ? '<iframe src="https://maps.example/embed" style="border:0" onclick="track()"></iframe>'
      : '')
  });
  return { managers, getManager: (name: string) => managers.get(name) ?? null };
}

async function render(markdown: string): Promise<string> {
  const engine = makeEngine();
  const parser = new MarkupParser(engine);
  await parser.initialize();
  engine.managers.set('MarkupParser', parser);
  return parser.parse(markdown, { pageName: 'HtmlPolicy', userContext: { isAuthenticated: true, username: 'author' } });
}

async function saveErrors(markdown: string) {
  const engine = makeEngine();
  const filter = new SecurityFilter();
  await filter.initialize({ engine });
  return filter.collectErrors(markdown, { engine });
}

/** Does the rendered HTML carry anything that would run script? */
function executes(html: string): boolean {
  return /\son[a-z]+\s*=/i.test(html) || /<script/i.test(html) || /(?:href|src)\s*=\s*["']?\s*(?:&#0*106;|j)avascript:/i.test(html);
}

const BYPASSES: Array<[string, string]> = [
  ['an event handler on the line after its tag', '<img src=x\nonerror=alert(1)>'],
  ['an entity-encoded javascript: scheme', '<a href="&#106;avascript:alert(1)">x</a>'],
  ['an indented line inside a block of HTML', '<div>\n    <img src=x onerror=alert(1)>\n</div>']
];

describe('the three bypasses that passed save and executed (#1623)', () => {
  test.each(BYPASSES)('%s is refused at save, naming what is not allowed', async (_name, payload) => {
    const errors = (await saveErrors(payload)).filter((e) => e.rule === 'html-policy');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.message).join(' ')).toMatch(/onerror|scheme/);
  });

  test.each(BYPASSES)('%s is stripped at render', async (_name, payload) => {
    const html = await render(payload);
    expect(executes(html)).toBe(false);
  });

  test('the line reported is the line the offending tag is on', async () => {
    const errors = (await saveErrors('# Title\n\ntext\n\n<div>\n    <img src=x onerror=alert(1)>\n</div>')).filter((e) => e.rule === 'html-policy');
    expect(errors).toEqual([expect.objectContaining({ line: 6, message: 'The onerror attribute on <img> is not allowed' })]);
  });

  test('a raw block (%%add-css) writes its text as HTML without markdown-it — held to the policy too', async () => {
    const html = await render('%%add-css\n%%b\nx\n/%\n.a > .b { color: red } /* c */ <img src=x onerror=alert(2)>\n/%');
    expect(executes(html)).toBe(false);
    expect(html).toContain('.a &gt; .b { color: red }');
  });
});

describe('what the shipped policy keeps', () => {
  test('ordinary formatting HTML renders as written', async () => {
    const html = await render('<details open><summary>More</summary>\n\n**inside**\n\n</details>\n\nH<sub>2</sub>O and <kbd>Ctrl</kbd> and <span class="note">n</span>');
    expect(html).toContain('<details open>');
    expect(html).toContain('<summary>More</summary>');
    expect(html).toContain('<strong>inside</strong>');
    expect(html).toContain('</details>');
    expect(html).toContain('<sub>2</sub>');
    expect(html).toContain('<kbd>Ctrl</kbd>');
    expect(html).toContain('<span class="note">n</span>');
  });

  test('ordinary markdown is untouched', async () => {
    const html = await render('## Heading\n\nSome **bold**, a [link](https://example.org) and `<code>`.\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('href="https://example.org"');
    expect(html).toContain('<code>&lt;code&gt;</code>');
    expect(html).toMatch(/<table class="table">/);
  });

  test('HTML in code is documentation, not HTML — neither refused nor stripped', async () => {
    const doc = 'Use `<script>` with care:\n\n```html\n<img src=x onerror=alert(1)>\n```';
    expect((await saveErrors(doc)).filter((e) => e.rule === 'html-policy')).toEqual([]);
    expect(await render(doc)).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('a data: URL is an image source only', () => {
    const policy = asHtmlPolicy(shippedPolicy);
    expect(filterAuthorHtml('<img src="data:image/png;base64,AAAA">', policy)).toContain('src="data:image/png');
    expect(htmlPolicyViolations('<a href="data:text/html,x">x</a>', policy)).toHaveLength(1);
  });

  test('without a policy no author HTML survives — the failure is closed', () => {
    expect(filterAuthorHtml('<b>x</b><span data-jspwiki-placeholder="u-1"></span>', null))
      .toBe('x<span data-jspwiki-placeholder="u-1"></span>');
  });
});

describe('plugin and handler output is not author HTML', () => {
  test('a plugin\'s <iframe>, style and onclick reach the page untouched', async () => {
    const html = await render('Map:\n\n[{MapEmbed}]\n\n<iframe src="https://evil.example"></iframe>');
    expect(html).toMatch(/<iframe [^>]*src="https:\/\/maps\.example\/embed"/);
    expect(html).toContain('style="border:0"');
    expect(html).toContain('onclick="track()"');
    // The author's own <iframe> is not allowed.
    expect(html).not.toContain('evil.example');
  });

  test('a <wiki:If> block is merged after markdown-it, its plugin output intact and not nested in a <p>', async () => {
    const html = await render('<wiki:If test="true">\n[{MapEmbed}]\n</wiki:If>');
    expect(html).toContain('onclick="track()"');
    expect(html).not.toMatch(/<p>\s*<p>/);
  });
});

describe('shipped required pages meet the shipped policy', () => {
  const dir = path.join(root, 'required-pages');
  const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));

  test.each(pages)('%s', async (file) => {
    const body = fs.readFileSync(path.join(dir, file), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
    const errors = (await saveErrors(body)).filter((e) => e.rule === 'html-policy');
    expect(errors).toEqual([]);
  });
});
