/**
 * @file showdownGuard.test.ts
 * @description #599 — showdown ReDoS (CVE-2024-1899) guard.
 *
 * showdown@2.1.0 is the latest release and the advisory reports
 * `first_patched_version: null`; the registry has not been touched since
 * 2023-07-31. There is no upstream fix to wait for.
 */
import showdown from 'showdown';
import { guardShowdownInput, countUnclosedLinkOpeners } from '../showdownGuard';

const converter = () => new showdown.Converter({
  tables: true, strikethrough: true, tasklists: true, ghCodeBlocks: true
});

describe('#599 showdown ReDoS guard', () => {
  describe('the vulnerability', () => {
    test('the unguarded payload is catastrophically slow', () => {
      // Establishes the bug is real rather than assumed. Deliberately modest
      // (n=2000, ~0.4s) so the suite stays fast — n=4000 takes 16 SECONDS
      // unguarded, which is the actual DoS.
      const c = converter();
      const payload = '[]('.repeat(2000);

      const t0 = Date.now();
      c.makeHtml(payload);
      const unguarded = Date.now() - t0;

      const t1 = Date.now();
      c.makeHtml(guardShowdownInput(payload));
      const guarded = Date.now() - t1;

      expect(guarded).toBeLessThan(unguarded);
      // Order-of-magnitude, not a tight bound — CI timing varies.
      expect(guarded).toBeLessThan(100);
    });

    test('a large payload stays fast once guarded', () => {
      const c = converter();
      const t0 = Date.now();
      c.makeHtml(guardShowdownInput('[]('.repeat(20000)));
      expect(Date.now() - t0).toBeLessThan(1000);
    });
  });

  describe('output preservation', () => {
    // The property that makes this safe to apply unconditionally: an unclosed
    // opener never becomes an anchor, so escaping it cannot change what a
    // reader sees.
    test.each([
      ['a plain link', 'a [link](http://example.com) here'],
      ['parens inside a URL', '[nested](http://e.com/a(b)c)'],
      ['two links on a line', '[a](b) and [c](d)'],
      ['an image', '![img](pic.png)'],
      ['a reference link', '[ref][1]\n\n[1]: http://e.com'],
      ['links across lines', 'multi\n[x](y)\nlines'],
      ['no link syntax at all', 'just some prose']
    ])('leaves rendered output byte-identical: %s', (_name, input) => {
      const c = converter();
      expect(c.makeHtml(guardShowdownInput(input))).toBe(c.makeHtml(input));
    });

    test('an unclosed opener renders as the same visible text', () => {
      const c = converter();
      const html = c.makeHtml(guardShowdownInput('text with ]( unclosed'));
      // `&#40;` IS `(` to a browser — the source differs, the reading does not.
      expect(html).toContain('&#40;');
      expect(html).not.toContain('<a ');
    });

    test('content with no link syntax is returned unchanged by identity', () => {
      const input = 'no brackets here at all';
      expect(guardShowdownInput(input)).toBe(input);
    });

    test('content whose openers are all closed is returned unchanged', () => {
      const input = '[a](b) [c](d)';
      expect(guardShowdownInput(input)).toBe(input);
    });
  });

  describe('detection', () => {
    test('counts only unclosed openers', () => {
      expect(countUnclosedLinkOpeners('[a](b)')).toBe(0);
      expect(countUnclosedLinkOpeners('[a](')).toBe(1);
      expect(countUnclosedLinkOpeners('[a](\n[b](')).toBe(2);
      // A closing paren later on the line means we leave it alone.
      expect(countUnclosedLinkOpeners('[a]( then ) later')).toBe(0);
    });

    test('is linear, not quadratic, on a single long line', () => {
      // The obvious regex fix — /\]\((?![^)\n]*\))/ — reintroduces the very
      // quadratic scan this exists to prevent. Pin that it does not.
      const t0 = Date.now();
      guardShowdownInput('[]('.repeat(50000));
      expect(Date.now() - t0).toBeLessThan(1000);
    });
  });
});
