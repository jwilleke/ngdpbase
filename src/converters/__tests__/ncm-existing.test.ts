/**
 * Tests for normalizeExistingPageToNcm (#728 Phase 2 Slice 5a) — the
 * "convert existing page" composition: §2.4 links + S1 fixed point.
 */

import { normalizeExistingPageToNcm, NCM_VERSION } from '../ncm/index';
import matter from 'gray-matter';

describe('normalizeExistingPageToNcm', () => {
  test('existing page with CommonMark links → NCM forms + ncmVersion stamped', () => {
    const raw = '---\ntitle: Old Page\nslug: old-page\n---\n' +
      'See [Docs](https://example.com/docs) and [Home](StartPage).\n';
    const r = normalizeExistingPageToNcm(raw);
    expect(r.content).toContain('[Docs|https://example.com/docs|target="_blank"]');
    expect(r.content).toContain('[Home|StartPage]');
    const fm = matter(r.content);
    expect(fm.data.title).toBe('Old Page');
    expect(fm.data.ncmVersion).toBe(r.ncmVersion);
    expect(r.warnings.some(w => w.kind === 'link-externalized')).toBe(true);
  });

  test('idempotent — converting an already-NCM page is byte-identical', () => {
    const raw = '---\ntitle: P\n---\nplain body, no links\n';
    const once = normalizeExistingPageToNcm(raw);
    const twice = normalizeExistingPageToNcm(once.content);
    expect(twice.content).toBe(once.content);
  });

  test('frontmatter-less page gains ncmVersion and stays stable', () => {
    const r1 = normalizeExistingPageToNcm('# Heading\n\nbody\n');
    expect(matter(r1.content).data.ncmVersion).toBe(NCM_VERSION);
    expect(normalizeExistingPageToNcm(r1.content).content).toBe(r1.content);
  });
});
