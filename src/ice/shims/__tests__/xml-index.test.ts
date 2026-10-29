/**
 * Unit tests for the xml-index shim (#912; a core shim since #2109).
 *
 * The shim is handed the index (the engine fetched it, as the source's URL)
 * and asks the engine to fetch each item it names (`tools.fetch`): the second
 * fetch targets a URL extracted from a document the first returned, so a
 * remote document chooses the address — which is why it must take the one
 * guarded path (#1133). Scripting the engine's fetch per URL keeps both
 * phases visible here; `requestOptions.test.ts` drives them through the real
 * engine.
 *
 * @jest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { xmlIndexShim, extractItemUrls } from '../xml-index';
import type { GuardedResponse } from '../../../http/guardedFetch';
import type { ShimTools } from '../../types';
import { fileOf, recordsOf } from './__fixtures__/readShim';

const INDEX_URL = 'https://ospo.test/vaac/messages.html';
const OPTIONS = { linkPattern: 'xml_files/.*\\.xml$' };

const INDEX_HTML = `<html><body>
  <a href="xml_files/FVXX20_20260722_1123.xml">adv 1</a>
  <a href='xml_files/FVXX20_20260722_1310.xml'>adv 2</a>
  <a href="about.html">not an advisory</a>
  <a href="xml_files/FVXX20_20260722_1123.xml">dup</a>
</body></html>`;

const advisoryXml = (id: string, area: string) =>
  `<?xml version="1.0"?><advisory><id>${id}</id><volcano>${area}</volcano></advisory>`;

/** The engine's fetch, answering by URL: 404 for anything not listed. */
function engineFetch(map: Record<string, string>) {
  return vi.fn<ShimTools['fetch']>(async (u: string): Promise<GuardedResponse> => {
    const body = map[u];
    return { status: body === undefined ? 404 : 200, headers: {}, body: Buffer.from(body ?? ''), finalUrl: u, chain: [u] };
  });
}

function read(fetch: ShimTools['fetch'], options: Record<string, unknown> = OPTIONS) {
  return xmlIndexShim.read!(fileOf(INDEX_HTML, INDEX_URL), { options, fetch });
}

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

describe('xmlIndexShim (#912, #2109)', () => {
  const u1 = 'https://ospo.test/vaac/xml_files/FVXX20_20260722_1123.xml';
  const u2 = 'https://ospo.test/vaac/xml_files/FVXX20_20260722_1310.xml';

  it('asks the engine for each item the index names, resolved against the index URL', async () => {
    const fetch = engineFetch({ [u1]: advisoryXml('A1', 'Etna'), [u2]: advisoryXml('A2', 'Kilauea') });
    const result = await read(fetch);
    expect(fetch.mock.calls.map(([u]) => u)).toEqual([u1, u2]);
    expect(recordsOf(result)).toEqual([
      { id: 'A1', properties: { id: 'A1', volcano: 'Etna' } },
      { id: 'A2', properties: { id: 'A2', volcano: 'Kilauea' } }
    ]);
    expect(result.partial).toBeUndefined();
  });

  it('skips a failed item without failing the read, and says so as a partial note', async () => {
    const result = await read(engineFetch({ [u1]: advisoryXml('A1', 'Etna') }));
    expect(recordsOf(result).map(r => r.id)).toEqual(['A1']);
    expect(result.partial).toBe(`1 of 2 item document(s) skipped: ${u2} (HTTP 404)`);
  });

  it('a fetch the engine refuses is skipped the same way', async () => {
    const fetch = vi.fn<ShimTools['fetch']>(async (u) => { throw new Error(`refused: ${u}`); });
    const result = await read(fetch);
    expect(result.items).toEqual([]);
    expect(result.partial).toContain(`${u1} (refused: ${u1})`);
  });

  it('caps the item fetches at the maxItems option', async () => {
    const fetch = engineFetch({ [u1]: advisoryXml('A1', 'Etna'), [u2]: advisoryXml('A2', 'Kilauea') });
    await read(fetch, { ...OPTIONS, maxItems: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('throws when linkPattern is missing', async () => {
    await expect(read(engineFetch({}), {})).rejects.toThrow(/linkPattern/);
  });

  it('lifts item fields (minus __itemUrl) and falls back to the item URL for the id', async () => {
    const [r] = recordsOf(await read(engineFetch({ [u1]: '<advisory><volcano>Etna</volcano></advisory>', [u2]: advisoryXml('A2', 'x') })));
    expect(r).toEqual({ id: u1, properties: { volcano: 'Etna' } });
  });

  it("prefers the document's own id over the item URL", async () => {
    const [r] = recordsOf(await read(engineFetch({ [u1]: advisoryXml('A1', 'Etna') })));
    expect(r.id).toBe('A1');
  });

  it('honours recordIdField', async () => {
    const doc = '<advisory><advisoryNumber>2026/123</advisoryNumber></advisory>';
    const [r] = recordsOf(await read(engineFetch({ [u1]: doc }), { ...OPTIONS, recordIdField: 'advisoryNumber' }));
    expect(r).toEqual({ id: '2026/123', properties: { advisoryNumber: '2026/123' } });
  });
});
