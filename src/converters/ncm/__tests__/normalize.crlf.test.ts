/**
 * #1125: NCM output is LF-only. CRLF arrives from browser form posts and
 * Windows imports; §3.1 byte-determinism is meaningless with two line-ending
 * conventions, and \r breaks every line-anchored regex downstream.
 */
import { normalizeToNcm, normalizeExistingPageToNcm } from '../index';

describe('NCM canonicalizes line endings', () => {
  test('normalizeToNcm strips CRLF', () => {
    const out = normalizeToNcm('---\ntitle: T\n---\nline one\r\nline two\r\n', 'markdown');
    expect(out.content).not.toContain('\r');
  });

  test('normalizeExistingPageToNcm strips CRLF', () => {
    const out = normalizeExistingPageToNcm('---\ntitle: T\n---\nbody[^1]\r\n\r\n[^1]: note\r\n');
    expect(out.content).not.toContain('\r');
  });

  test('LF input is a fixed point — no churn from the canonicalization', () => {
    const src = '---\ntitle: T\n---\nplain body\n';
    const once = normalizeExistingPageToNcm(src);
    const twice = normalizeExistingPageToNcm(once.content);
    expect(twice.content).toBe(once.content);
  });
});
