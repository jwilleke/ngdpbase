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

const filter = () => new SecurityFilter();

describe('SecurityFilter.collectErrors — dangerous constructs (#1037)', () => {
  test.each([
    ['<script>alert(1)</script>',                    'no-script-tag'],
    ['<div onclick="steal()">x</div>',               'no-event-handler'],
    ['<a href="javascript:evil()">x</a>',            'no-javascript-url'],
    ['<iframe src="//evil"></iframe>',               'no-embedded-frame'],
    ['<svg onload=alert(1)>',                        'no-inline-svg']
  ])('refuses %s', async (content, rule) => {
    const errors = await filter().collectErrors(content, {});

    expect(errors.map(e => e.rule)).toContain(rule);
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
    // Blocking legitimate content costs an author their work, so the rule set
    // is deliberately narrow: only constructs that execute or frame content.
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
    // onInitialize() run against a real engine; it must not depend on config.
    const errors = await new SecurityFilter().collectErrors('<script>x</script>', {});

    expect(errors).toHaveLength(1);
  });
});
