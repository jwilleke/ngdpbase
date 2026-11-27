/**
 * #2454 S1 — the footnote link rules from docs/design/shared-footnote-sources.md:
 * "Links: http and https only" (safeSourceUrl) and "R2. One rule for 'the same link'" (tidyUrl).
 */

import { safeSourceUrl, stripUrlCredentials, tidyUrl } from '../footnoteLinks';

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
    expect(tidyUrl('http://example.com:443/x')).toBe(tidyUrl('https://example.com:443/x'));
    expect(tidyUrl('https://example.com:8443/x')).toBe('https://example.com:8443/x');
    expect(tidyUrl('https://example.com:8443/x')).not.toBe(tidyUrl('https://example.com:9443/x'));
    expect(tidyUrl('https://example.com:8443/x')).not.toBe(tidyUrl('https://example.com/x'));
  });

  test('the host is lower case with its port kept, and www. is still dropped', () => {
    expect(tidyUrl('http://WWW.Example.com:8080/x')).toBe('https://example.com:8080/x');
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

describe('stripUrlCredentials (Jim, 2026-11-23: save the link without a username or password, never refuse it)', () => {
  test.each([
    ['https://bob:secret@example.com/a?x=1#top', 'https://example.com/a?x=1#top'],
    ['http://bob@example.com/a', 'http://example.com/a'],
    ['https://:secret@example.com/a', 'https://example.com/a'],
    ['  https://bob:secret@example.com/a  ', 'https://example.com/a']
  ])('%s is saved as %s', (given, saved) => {
    expect(stripUrlCredentials(given)).toBe(saved);
  });

  test('an address with no username or password is returned exactly as entered, spaces around it removed', () => {
    expect(stripUrlCredentials('HTTPS://Example.com/Path?b=2&a=1')).toBe('HTTPS://Example.com/Path?b=2&a=1');
    expect(stripUrlCredentials('  https://example.com  ')).toBe('https://example.com');
    expect(stripUrlCredentials('https://example.com/a@b')).toBe('https://example.com/a@b');
  });

  test('the result never holds the password, and still passes the http and https check', () => {
    const saved = stripUrlCredentials('https://bob:hunter2@example.com:8443/a');
    expect(saved).not.toContain('hunter2');
    expect(saved).not.toContain('bob');
    expect(safeSourceUrl(saved)).toBe(saved);
    expect(saved).toBe('https://example.com:8443/a');
  });

  test('a value that is not an http or https link is returned as given, for the caller to refuse', () => {
    expect(stripUrlCredentials('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(stripUrlCredentials('')).toBe('');
    expect(stripUrlCredentials('ftp://bob:secret@example.com/')).toBe('ftp://bob:secret@example.com/');
  });
});
