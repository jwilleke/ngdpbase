/**
 * `[Title]` → `[store/Title]` inside a store (#1457) — the matching rules.
 *
 * The rewrite is the one-time migration's text half, and what it must NOT
 * touch is the point: a public title, another store's page, and anything it
 * has already rewritten. The last is what makes a second boot cheap and safe.
 */

import { rewriteToPrivateLinks } from '../privateLinkRewrite';

const STORE = 'default';
const TITLES = ['Notes', 'Trip Plan'];

const rewrite = (content: string) => rewriteToPrivateLinks(content, STORE, TITLES);

describe('rewriteToPrivateLinks (#1457)', () => {
  test('a link to a page in the same store gains the store', () => {
    const result = rewrite('See [Notes] and [Trip Plan].');
    expect(result.content).toBe('See [default/Notes] and [default/Trip Plan].');
    expect(result.rewritten).toBe(2);
  });

  test('a title this store does not have is left alone — it is a public page', () => {
    const result = rewrite('See [Welcome] and [Notes].');
    expect(result.content).toBe('See [Welcome] and [default/Notes].');
    expect(result.rewritten).toBe(1);
    expect(result.unchangedTargets).toContain('Welcome');
  });

  test('a link into another store is left alone', () => {
    const result = rewrite('See [vault/Notes].');
    expect(result.content).toBe('See [vault/Notes].');
    expect(result.rewritten).toBe(0);
  });

  test('a second run writes nothing: what it produced parses as a private link', () => {
    const once = rewrite('See [Notes].');
    const twice = rewriteToPrivateLinks(once.content, STORE, TITLES);
    expect(twice.rewritten).toBe(0);
    expect(twice.content).toBe(once.content);
  });

  test('a piped target keeps its display text and takes the case of the page', () => {
    const result = rewrite('See [my jottings|notes].');
    expect(result.content).toBe('See [my jottings|default/Notes].');
  });

  test('`[Title]` matches byte-exactly: the target is prose the reader sees', () => {
    const result = rewrite('See [notes].');
    expect(result.rewritten).toBe(0);
  });

  test('a fragment survives the rewrite', () => {
    expect(rewrite('See [Notes#today].').content).toBe('See [default/Notes#today].');
  });

  test('an external link, a checkbox and an empty store are untouched', () => {
    expect(rewrite('- [ ] todo\n<https://example.com>\n[https://example.com]').rewritten).toBe(0);
    const noPages = rewriteToPrivateLinks('See [Notes].', STORE, []);
    expect(noPages.content).toBe('See [Notes].');
    expect(noPages.rewritten).toBe(0);
  });
});
