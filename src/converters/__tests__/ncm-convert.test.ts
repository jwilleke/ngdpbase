/**
 * Tests for NCM S2 — HTML/JSPWiki→NCM via the existing converter registry
 * + §2.4 link normalization (#728 Phase 2 Slice 2).
 *
 * Property-based assertions (not exact converter output — that would be
 * brittle): the NCM-specific guarantees are what's tested.
 */

import { normalizeToNcm, normalizeLinks, NCM_VERSION } from '../ncm/index';
import type { NcmWarning } from '../ncm/types';
import matter from 'gray-matter';

describe('NCM §2.4 link normalization', () => {
  const run = (md: string) => {
    const w: NcmWarning[] = [];
    return { out: normalizeLinks(md, w), w };
  };

  test('external CommonMark link → NCM external form + link-externalized warning', () => {
    const { out, w } = run('see [Ext](https://example.com) here');
    expect(out).toBe('see [Ext|https://example.com|target="_blank"] here');
    expect(w).toEqual([{ kind: 'link-externalized', detail: 'https://example.com' }]);
  });

  test('relative/bare target → NCM internal form, no warning', () => {
    const { out, w } = run('[Home](StartPage) and [Up](../x)');
    expect(out).toBe('[Home|StartPage] and [Up|../x]');
    expect(w).toHaveLength(0);
  });

  test('images, other schemes, existing NCM links and footnotes are untouched', () => {
    const { out, w } = run(
      '![pic](https://cdn/x.png) [mail](mailto:a@b.com) [D|Page] text[^1]'
    );
    expect(out).toBe('![pic](https://cdn/x.png) [mail](mailto:a@b.com) [D|Page] text[^1]');
    expect(w).toHaveLength(0);
  });

  test('idempotent', () => {
    const w: NcmWarning[] = [];
    const once = normalizeLinks('[a](https://x.io) [b](Page)', w);
    expect(normalizeLinks(once, [])).toBe(once);
  });
});

describe('NCM HTML→NCM (delegates to HtmlConverter)', () => {
  const html =
    '<html><head><title>Doc Title</title></head><body><article>' +
    '<p>' + 'Lots of real article body text so the content selector keeps it. '.repeat(4) +
    'Visit <a href="https://example.com">Ext</a> and <a href="/InternalPage">Int</a>.</p>' +
    '<script>alert(1)</script>' +
    '<p><img src="https://cdn.example.com/x.png" alt="pic"></p>' +
    '</article></body></html>';

  test('produces NCM: external link form, internal link form, frontmatter stamped', () => {
    const r = normalizeToNcm(html, 'html');
    expect(r.content).toContain('[Ext|https://example.com|target="_blank"]');
    expect(r.content).toContain('[Int|/InternalPage]');
    const fm = matter(r.content);
    expect(fm.data.ncmVersion).toBe(NCM_VERSION);
    expect(fm.data.title).toBe('Doc Title');
  });

  test('dangerous HTML is gone; image left as Markdown (localization is S4)', () => {
    const r = normalizeToNcm(html, 'html');
    expect(r.content).not.toContain('alert(1)');
    expect(r.content).not.toContain('<script');
    expect(r.content).toContain('![pic](https://cdn.example.com/x.png)');
  });

  test('warnings are structured: link-externalized + an html-dropped from element removal', () => {
    const r = normalizeToNcm(html, 'html');
    expect(r.warnings.some(x => x.kind === 'link-externalized' && x.detail === 'https://example.com')).toBe(true);
    expect(r.warnings.some(x => x.kind === 'html-dropped')).toBe(true);
  });

  test('output is idempotent NCM', () => {
    const r = normalizeToNcm(html, 'html');
    expect(normalizeToNcm(r.content, 'ncm').content).toBe(r.content);
  });
});

describe('NCM JSPWiki→NCM (delegates to JSPWikiConverter)', () => {
  const jsp =
    '[{SET title=My JSP Page}]\n' +
    '!!! Big Heading\n\n' +
    'Text with external [Label|http://ext.example.com] and a [WikiPage] link.\n';

  test('converter metadata→frontmatter, external link → NCM form, wiki link preserved', () => {
    const r = normalizeToNcm(jsp, 'jspwiki');
    const fm = matter(r.content);
    // NCM contract: the delegate's metadata flows into frontmatter and the
    // S1 fixed point stamps ncmVersion. (JSPWikiConverter sets importedFrom
    // unconditionally — proving the composition without coupling the test to
    // JSPWiki's [{SET}] attribute-extraction specifics.)
    expect(fm.data.importedFrom).toBe('jspwiki');
    expect(fm.data.ncmVersion).toBe(NCM_VERSION);
    expect(r.content).toContain('[Label|http://ext.example.com|target="_blank"]');
    expect(r.content).toContain('[WikiPage]');
  });

  test('external link recorded + idempotent NCM out', () => {
    const r = normalizeToNcm(jsp, 'jspwiki');
    expect(r.warnings.some(x => x.kind === 'link-externalized')).toBe(true);
    expect(normalizeToNcm(r.content, 'ncm').content).toBe(r.content);
  });
});
