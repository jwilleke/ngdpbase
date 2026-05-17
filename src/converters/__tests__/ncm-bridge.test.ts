/**
 * Tests for the NCM → ConversionResult bridge (#728 Phase 2 Slice 5b).
 * Exercises the exact composition ImportManager now uses for html/jspwiki:
 *   ncmToConversionResult(normalizeToNcm(content, formatId))
 */

import { normalizeToNcm, ncmToConversionResult } from '../ncm/index';

describe('ncmToConversionResult bridge', () => {
  test('splits NCM frontmatter→metadata, body→content; warnings stay structured (S3 lossless)', () => {
    const ncm = normalizeToNcm('---\ntitle: T\n---\nbody [E](https://x.io)\n', 'markdown');
    const cr = ncmToConversionResult(ncm);
    expect(cr.metadata.title).toBe('T');
    expect(cr.metadata.ncmVersion).toBe(ncm.ncmVersion);
    expect(cr.content).toContain('body');
    expect(Array.isArray(cr.warnings)).toBe(true);
    cr.warnings.forEach(w => {
      expect(typeof w.kind).toBe('string');
      expect(typeof w.detail).toBe('string');
    });
  });

  test('html import path: NCM external link form + ncmVersion in metadata + structured warnings', () => {
    const html =
      '<html><head><title>Doc</title></head><body><article>' +
      ('Plenty of article body so the content selector keeps it. '.repeat(4)) +
      'Go <a href="https://example.com">Ext</a>.</article></body></html>';
    const cr = ncmToConversionResult(normalizeToNcm(html, 'html'));

    expect(cr.metadata.title).toBe('Doc');
    expect(cr.metadata.ncmVersion).toBe(1);
    expect(cr.content).toContain('[Ext|https://example.com|target="_blank"]');
    expect(cr.content).not.toContain('---'); // frontmatter was split out into metadata
    expect(cr.warnings.some(w => w.kind === 'link-externalized' && w.detail === 'https://example.com')).toBe(true);
  });

  test('jspwiki import path: importedFrom + ncmVersion surface as metadata', () => {
    const jsp = '!!! Title\n\nText [L|http://e.com] and [WikiPage].\n';
    const cr = ncmToConversionResult(normalizeToNcm(jsp, 'jspwiki'));
    expect(cr.metadata.importedFrom).toBe('jspwiki');
    expect(cr.metadata.ncmVersion).toBe(1);
    expect(cr.content).toContain('[L|http://e.com|target="_blank"]');
    expect(cr.content).toContain('[WikiPage]');
  });
});
