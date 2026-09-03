/**
 * Unit tests for the xml-index adapter (#912).
 *
 * @jest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { xmlIndexAdapter, extractItemUrls } from '../src/adapters/xml-index';
import type { FeedSourceConfig } from '../src/types';

// #1133 — the adapters go through `guardedFetch` now. Mocking the module is
// the seam, because production deliberately has no injectable transport
// parameter: one way to reach the network was the point.
vi.mock('../../../dist/src/http/guardedFetch.js', () => ({ guardedFetch: vi.fn() }));
import { guardedFetch } from '../../../dist/src/http/guardedFetch.js';
import type { EgressPolicy } from '../../../dist/src/http/ssrf.js';

const mockGuardedFetch = vi.mocked(guardedFetch);
const POLICY = {} as EgressPolicy;


const INDEX_URL = 'https://ospo.test/vaac/messages.html';
const base: FeedSourceConfig = {
  sourceId: 'vaac', adapter: 'xml-index', url: INDEX_URL, type: 'Event',
  linkPattern: 'xml_files/.*\\.xml$'
};

afterEach(() => vi.unstubAllGlobals());

const INDEX_HTML = `<html><body>
  <a href="xml_files/FVXX20_20260722_1123.xml">adv 1</a>
  <a href='xml_files/FVXX20_20260722_1310.xml'>adv 2</a>
  <a href="about.html">not an advisory</a>
  <a href="xml_files/FVXX20_20260722_1123.xml">dup</a>
</body></html>`;

const advisoryXml = (id: string, area: string) =>
  `<?xml version="1.0"?><advisory><id>${id}</id><volcano>${area}</volcano></advisory>`;

/** Route fetch by URL: index HTML, then per-item XML. */
/**
 * Route responses by URL — xml-index fetches an index, then each item it names.
 *
 * That two-phase shape is the reason this adapter mattered most (#1133): the
 * SECOND fetch targets a URL extracted from a document the first fetch
 * returned, so a remote document chooses the address. Scripting per-URL keeps
 * that visible in the test rather than collapsing both phases into one stub.
 */
const stubRouted = (map: Record<string, string>, okFor?: (u: string) => boolean): EgressPolicy => {
  mockGuardedFetch.mockImplementation((u: string) => {
    const body = map[u];
    const ok = okFor ? okFor(u) : body !== undefined;
    return Promise.resolve({
      status: ok ? 200 : 404,
      headers: {},
      body: Buffer.from(body ?? ''),
      finalUrl: u,
      chain: [u]
    });
  });
  return POLICY;
};

describe('extractItemUrls (#912)', () => {
  it('matches linkPattern, resolves relative → absolute, dedupes, keeps order', () => {
    const urls = extractItemUrls(INDEX_HTML, INDEX_URL, 'xml_files/.*\\.xml$', 100);
    expect(urls).toEqual([
      'https://ospo.test/vaac/xml_files/FVXX20_20260722_1123.xml',
      'https://ospo.test/vaac/xml_files/FVXX20_20260722_1310.xml'
    ]);
  });

  it('caps at maxItems', () => {
    expect(extractItemUrls(INDEX_HTML, INDEX_URL, 'xml_files/.*\\.xml$', 1)).toHaveLength(1);
  });

  it('returns [] when nothing matches', () => {
    expect(extractItemUrls(INDEX_HTML, INDEX_URL, 'nope/.*', 100)).toEqual([]);
  });
});

describe('xmlIndexAdapter (#912)', () => {
  const u1 = 'https://ospo.test/vaac/xml_files/FVXX20_20260722_1123.xml';
  const u2 = 'https://ospo.test/vaac/xml_files/FVXX20_20260722_1310.xml';

  it('fetch() two-phases: index → item docs, tagging each with __itemUrl', async () => {
    const policy = stubRouted({
      [INDEX_URL]: INDEX_HTML,
      [u1]: advisoryXml('A1', 'Etna'),
      [u2]: advisoryXml('A2', 'Kilauea')
    });
    const records = await xmlIndexAdapter.fetch(base, policy);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ id: 'A1', volcano: 'Etna', __itemUrl: u1 });
  });

  it('fetch() skips a failed item without failing the whole poll', async () => {
    const policy = stubRouted({
      [INDEX_URL]: INDEX_HTML,
      [u1]: advisoryXml('A1', 'Etna')
      // u2 missing → not ok → skipped
    });
    const records = await xmlIndexAdapter.fetch(base, policy);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: 'A1' });
  });

  it('fetch() throws when the index itself is non-ok', async () => {
    const policy = stubRouted({}, () => false);
    await expect(xmlIndexAdapter.fetch(base, policy)).rejects.toThrow(/404|HTTP/);
  });

  it('fetch() throws when linkPattern is missing', async () => {
    const policy = stubRouted({ [INDEX_URL]: INDEX_HTML });
    const { linkPattern: _omit, ...noPattern } = base;
    await expect(xmlIndexAdapter.fetch(noPattern, policy)).rejects.toThrow(/linkPattern/);
  });

  it('parse() lifts item fields (minus __itemUrl) and falls back to __itemUrl for id', () => {
    const r = xmlIndexAdapter.parse({ volcano: 'Etna', __itemUrl: u1 }, base);
    expect(r).toMatchObject({ sourceRecordId: u1, properties: { volcano: 'Etna' } });
    expect((r!.properties as Record<string, unknown>).__itemUrl).toBeUndefined();
  });

  it("parse() prefers the document's own id over __itemUrl", () => {
    expect(xmlIndexAdapter.parse({ id: 'A1', __itemUrl: u1 }, base)!.sourceRecordId).toBe('A1');
  });

  it('parse() honours recordIdField', () => {
    const r = xmlIndexAdapter.parse({ advisoryNumber: '2026/123', __itemUrl: u1 }, { ...base, recordIdField: 'advisoryNumber' });
    expect(r).toMatchObject({ sourceRecordId: '2026/123' });
    expect((r!.properties as Record<string, unknown>).__itemUrl).toBeUndefined();
  });
});
