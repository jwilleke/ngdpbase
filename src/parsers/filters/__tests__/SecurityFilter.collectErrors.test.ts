/**
 * SecurityFilter blocks dangerous constructs at SAVE time (#1037).
 *
 * `collectErrors` is the save-time half of the filter, and it is a different
 * job from `process()`:
 *
 *   process()       phase 'html'  — rendered output, strips by allow-list
 *   collectErrors() save time     — page SOURCE, refuses the write outright
 *
 * Conflating those two inputs is not hypothetical: `preventXSS()` was written
 * for source text and wired into the html phase, and it entity-encoded whole
 * rendered documents (#1032). These tests pin that this half reads source.
 *
 * The filter previously had no `collectErrors` at all. Because
 * `FilterChain.collectErrors()` skipped filters that did not define one, a
 * page containing `<script>` saved cleanly with the security filter enabled
 * and running — silently, with nothing to grep for.
 */

import SecurityFilter from '../SecurityFilter';
import { HTML_POLICY_KEY } from '../../../rendering/htmlPolicy';
import { shippedHtmlPolicy } from '../../../rendering/__tests__/__fixtures__/shippedHtmlPolicy';

// #1623: what HTML an author may write is the HTML policy, read from
// configuration — so the filter is initialized with an engine carrying the
// shipped one.
const engine = {
  getManager: (name: string) => (name === 'ConfigurationManager'
    ? { getProperty: (key: string, fallback: unknown) => (key === HTML_POLICY_KEY ? shippedHtmlPolicy : fallback) }
    : null)
};

class PolicyFilter extends SecurityFilter {
  constructor() {
    super();
    void this.onInitialize({ engine });
  }
}

const filter = () => new PolicyFilter();

describe('SecurityFilter.collectErrors — dangerous constructs (#1037, #1623)', () => {
  test.each([
    ['<script>alert(1)</script>',                    'The <script> tag is not allowed in page content'],
    ['<div onclick="steal()">x</div>',               'The onclick attribute on <div> is not allowed'],
    ['<a href="javascript:evil()">x</a>',            'The URL "javascript:evil()" in href on <a> uses a scheme that is not allowed'],
    ['<iframe src="//evil"></iframe>',               'The <iframe> tag is not allowed in page content'],
    ['<svg onload=alert(1)>',                        'The <svg> tag is not allowed in page content']
  ])('refuses %s, naming what is not allowed', async (content, message) => {
    const errors = await filter().collectErrors(content, {});

    expect(errors.map(e => e.rule)).toEqual(['html-policy']);
    expect(errors.map(e => e.message)).toEqual([message]);
    expect(errors.every(e => e.severity === 'error')).toBe(true);
  });

  test('reports the line so the author can find it', async () => {
    const errors = await filter().collectErrors('# Title\n\ntext\n\n<script>x</script>\n', {});

    expect(errors[0].line).toBe(5);
  });

  test('reports every offending line, not just the first', async () => {
    // An author fixing a page should not be sent round the loop once per
    // problem.
    const errors = await filter().collectErrors('<script>a</script>\nok\n<script>b</script>\n', {});

    expect(errors.map(e => e.line)).toEqual([1, 3]);
  });
});

describe('SecurityFilter.collectErrors — what it must NOT block (#1037)', () => {
  test.each([
    ['ordinary prose',        '# Heading\n\nSome **bold** text and a [link](https://example.org).'],
    ['tables',                '| a | b |\n|---|---|\n| 1 | 2 |'],
    ['code blocks',           '```js\nconst x = 1;\n```'],
    ['plain raw HTML',        '<div class="note"><span>fine</span></div>'],
    ['a normal link',         '<a href="https://example.org">safe</a>'],
    ['the word script',       'This page describes a shell script for backups.']
  ])('allows %s', async (_label, content) => {
    // Blocking legitimate content costs an author their work, so the shipped
    // policy keeps ordinary formatting HTML.
    expect(await filter().collectErrors(content, {})).toEqual([]);
  });

  test('empty content is not an error', async () => {
    expect(await filter().collectErrors('', {})).toEqual([]);
  });
});

describe('it reads SOURCE, not rendered HTML (#1037)', () => {
  test('flags a script tag written as markdown source', async () => {
    // At save time there is no rendered output to inspect — the raw tag is
    // sitting in the markdown, which is precisely why source is the right
    // input and line numbers are meaningful.
    const errors = await filter().collectErrors('Intro\n\n<script>x</script>', {});

    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(3);
  });

  test('does not require the filter to be initialized', async () => {
    // The save path calls this on a filter instance that may never have had
    // onInitialize() run; the engine in the call's context is enough.
    const errors = await new SecurityFilter().collectErrors('<script>x</script>', { engine });

    expect(errors).toHaveLength(1);
  });

  test('without a policy no author HTML is allowed — the failure is closed (#1623)', async () => {
    const errors = await new SecurityFilter().collectErrors('<div class="note">fine</div>', {});

    expect(errors.map(e => e.message)).toEqual(['The <div> tag is not allowed in page content']);
  });
});

describe('code is inert, so it is not scanned (#1037)', () => {
  test('a page documenting HTML in a fence still saves', async () => {
    // The wiki documents HTML — WikiFormsPlugin, the NCM pages. Refusing those
    // edits would make the rule unusable on exactly the content that needs it
    // most. Fenced text renders escaped and cannot execute.
    const doc = '# Docs\n\n```html\n<script src="/p.js"></script>\n```\n';

    expect(await filter().collectErrors(doc, {})).toEqual([]);
  });

  test('inline code spans are ignored too', async () => {
    const doc = 'Write `<iframe>` to embed a frame.';

    expect(await filter().collectErrors(doc, {})).toEqual([]);
  });

  test('but a real tag outside code is still caught, with the right line', async () => {
    // Blanking code must preserve line numbering, or the reported line points
    // an author at the wrong place.
    const doc = '```html\n<script>a</script>\n```\n\n<script>real</script>\n';
    const errors = await filter().collectErrors(doc, {});

    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(5);
  });
});

describe('raw <br> is a markup rule, not a security one (#1037)', () => {
  test('refuses a hand-written <br>', async () => {
    const errors = await filter().collectErrors('line one<br>line two', {});

    expect(errors.map(e => e.rule)).toEqual(['no-raw-br']);
    expect(errors[0].message).toContain('\\\\');
  });

  test("does NOT touch NCM's own line break", async () => {
    // The whole reason this is enforced at save and not at render: `\\`
    // becomes a <br> in the markup phase, so by render time an author's <br>
    // and one NCM generated are identical. Dropping `br` from the render
    // allow-list would break `\\`, `\\\` and table-cell breaks.
    expect(await filter().collectErrors('line one\\\\\nline two', {})).toEqual([]);
  });

  test('<br> inside a code fence is fine', async () => {
    expect(await filter().collectErrors('```html\n<br>\n```', {})).toEqual([]);
  });
});
