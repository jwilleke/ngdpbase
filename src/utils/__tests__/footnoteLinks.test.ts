/**
 * #2454 S1 — the footnote link rules from docs/design/shared-footnote-sources.md:
 * "Links: http and https only" (safeSourceUrl) and "R2. One rule for 'the same link'" (tidyUrl).
 */

import { safeSourceUrl, tidyUrl } from '../footnoteLinks';

describe('safeSourceUrl', () => {
  test.each([
    'http://example.com',
    'https://example.com/a?b=1#c',
    'HTTPS://Example.com/Path'
  ])('%s is a link', (url) => {
    expect(safeSourceUrl(url)).toBe(url);
  });

  test('returns the address as entered, without the spaces around it', () => {
    expect(safeSourceUrl('  https://example.com/a  ')).toBe('https://example.com/a');
  });

  test.each([
    ['javascript:'],
    ['data:'],
    ['file:'],
    ['ftp:'],
    ['mailto:']
  ])('a %s address is not a link', (scheme) => {
    expect(safeSourceUrl(`${scheme}//example.com/x`)).toBeNull();
    expect(safeSourceUrl(`${scheme}example`)).toBeNull();
  });

  test('a scheme in mixed case or with leading control characters is still judged by its parsed scheme', () => {
    expect(safeSourceUrl('JaVaScRiPt:1')).toBeNull();
    expect(safeSourceUrl('\tjavascript:1')).toBeNull();
    expect(safeSourceUrl('java\nscript:1')).toBeNull();
  });

  test.each([[''], ['   '], ['example.com'], ['//example.com'], ['/relative/path'], ['http://'], ['not a url']])(
    'a value that does not parse as an absolute address (%j) is not a link',
    (value) => {
      expect(safeSourceUrl(value)).toBeNull();
    }
  );

  test('a value that is not text is not a link', () => {
    expect(safeSourceUrl(undefined)).toBeNull();
    expect(safeSourceUrl(null)).toBeNull();
    expect(safeSourceUrl(42)).toBeNull();
  });
});

describe('tidyUrl', () => {
  test('http and https give the same key, and the key is https', () => {
    expect(tidyUrl('http://example.com/a')).toBe(tidyUrl('https://example.com/a'));
    expect(tidyUrl('http://example.com/a')).toBe('https://example.com/a');
  });

  test('the host is lower case and a leading www. is dropped', () => {
    expect(tidyUrl('https://WWW.Example.COM/Path')).toBe('https://example.com/Path');
    expect(tidyUrl('https://www.example.com/x')).toBe(tidyUrl('https://example.com/x'));
  });

  test('www. is dropped only at the start of the host', () => {
    expect(tidyUrl('https://notwww.example.com/')).toBe('https://notwww.example.com');
    expect(tidyUrl('https://a.www.example.com/')).toBe('https://a.www.example.com');
  });

  test('a trailing slash on the path is dropped', () => {
    expect(tidyUrl('https://example.com/a/')).toBe(tidyUrl('https://example.com/a'));
    expect(tidyUrl('https://example.com/')).toBe(tidyUrl('https://example.com'));
  });

  test('the path keeps its case', () => {
    expect(tidyUrl('https://example.com/A')).not.toBe(tidyUrl('https://example.com/a'));
  });

  test('utm_*, fbclid and gclid are dropped; other parameters stay in order', () => {
    expect(tidyUrl('https://example.com/a?utm_source=x&id=7&utm_medium=y&fbclid=1&q=z&gclid=2')).toBe(
      'https://example.com/a?id=7&q=z'
    );
    expect(tidyUrl('https://example.com/a?utm_source=x')).toBe('https://example.com/a');
  });

  test('a real query parameter makes a different key', () => {
    expect(tidyUrl('https://example.com/a?id=1')).not.toBe(tidyUrl('https://example.com/a?id=2'));
    expect(tidyUrl('https://example.com/a?id=1')).not.toBe(tidyUrl('https://example.com/a'));
  });

  test('parameter order is kept, so two orders are two keys', () => {
    expect(tidyUrl('https://example.com/a?x=1&y=2')).not.toBe(tidyUrl('https://example.com/a?y=2&x=1'));
  });

  test('a fragment stays in the key: page#a and page#b are two keys', () => {
    expect(tidyUrl('https://example.com/page#a')).toBe('https://example.com/page#a');
    expect(tidyUrl('https://example.com/page#a')).not.toBe(tidyUrl('https://example.com/page#b'));
  });

  test('a link that does not parse, or is not http or https, has no key and never matches another', () => {
    expect(tidyUrl('not a url')).toBeNull();
    expect(tidyUrl('')).toBeNull();
    expect(tidyUrl('javascript:1')).toBeNull();
    expect(tidyUrl('file:///etc/hosts')).toBeNull();
  });

  test('a port is part of the key, and the scheme is not: http and https on one port match', () => {
    expect(tidyUrl('http://a.com:443/x')).toBe(tidyUrl('https://a.com:443/x'));
    expect(tidyUrl('https://a.com:8443/x')).toBe('https://a.com:8443/x');
    expect(tidyUrl('https://a.com:8443/x')).not.toBe(tidyUrl('https://a.com:9443/x'));
    expect(tidyUrl('https://a.com:8443/x')).not.toBe(tidyUrl('https://a.com/x'));
  });

  test('the host is lower case with its port kept, and www. is still dropped', () => {
    expect(tidyUrl('http://WWW.A.com:8080/x')).toBe('https://a.com:8080/x');
  });

  test('a user:password@ part is left out of the key', () => {
    expect(tidyUrl('https://bob:secret@example.com/a')).toBe('https://example.com/a');
    expect(tidyUrl('https://bob@example.com/a')).toBe(tidyUrl('https://example.com/a'));
    expect(tidyUrl('https://bob:secret@example.com/a')).not.toContain('secret');
  });

  test('two tidy forms that differ stay different', () => {
    expect(tidyUrl('https://example.com/a')).not.toBe(tidyUrl('https://example.org/a'));
    expect(tidyUrl('https://example.com/a')).not.toBe(tidyUrl('https://example.com/b'));
  });

  test('the same address always gives the same key', () => {
    const key = tidyUrl('https://www.example.com/a/?utm_campaign=x#top');
    expect(key).toBe('https://example.com/a#top');
    expect(tidyUrl(key as string)).toBe(key);
  });
});
