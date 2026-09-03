/**
 * Unit tests for the csv adapter + parseCsv (#911).
 *
 * @jest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { csvAdapter, parseCsv, preambleSuspicion } from '../src/adapters/csv';
import type { FeedSourceConfig } from '../src/types';

// #1133 — the adapters go through `guardedFetch` with an egress policy now.
// They used to call the global `fetch`, so these tests stubbed that; a global
// stub would now pass while testing nothing. Mocking the module is the seam,
// because production deliberately has no injectable transport parameter —
// one way to reach the network was the point.
vi.mock('../../../dist/src/http/guardedFetch.js', () => ({ guardedFetch: vi.fn() }));
import { guardedFetch } from '../../../dist/src/http/guardedFetch.js';
import type { EgressPolicy } from '../../../dist/src/http/ssrf.js';

const mockGuardedFetch = vi.mocked(guardedFetch);

/** Any object: `guardedFetch` is mocked, so the policy is never inspected here. */
const POLICY = {} as EgressPolicy;

/** Script the next guardedFetch response. */
const stubFetch = (body: unknown, ok = true, status = 200): EgressPolicy => {
  mockGuardedFetch.mockResolvedValue({
    status: ok ? status : status,
    headers: {},
    // The old stubs returned `json: async () => body` for JSON feeds and
    // `text: async () => body` for the rest; guardedFetch hands back bytes, so
    // an object body is serialised here rather than at every call site.
    body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
    finalUrl: 'https://x.test/',
    chain: ['https://x.test/']
  });
  return POLICY;
};


const base: FeedSourceConfig = { sourceId: 'firms', adapter: 'csv', url: 'https://x.test/csv', type: 'Event' };


// A trimmed FIRMS VIIRS response (two rows).
const FIRMS = 'latitude,longitude,bright_ti4,acq_date,confidence\n64.4314,144.83386,330.28,2026-07-22,n\n-1.2,50.5,301.1,2026-07-22,h\n';

describe('parseCsv (#911)', () => {
  it('parses a header row into keyed record objects', () => {
    const rows = parseCsv(FIRMS);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ latitude: '64.4314', longitude: '144.83386', bright_ti4: '330.28', acq_date: '2026-07-22', confidence: 'n' });
    expect(rows[1].confidence).toBe('h');
  });

  it('handles quoted fields with embedded commas, quotes, and newlines', () => {
    const csv = 'name,note\n"Doe, Jane","she said ""hi""\nsecond line"\nBob,plain\n';
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual({ name: 'Doe, Jane', note: 'she said "hi"\nsecond line' });
    expect(rows[1]).toEqual({ name: 'Bob', note: 'plain' });
  });

  it('tolerates CRLF, a trailing-newline-less final row, a BOM, and blank lines', () => {
    const csv = '﻿a,b\r\n1,2\r\n\r\n3,4';
    expect(parseCsv(csv)).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  });

  it('honours a custom delimiter (TSV)', () => {
    expect(parseCsv('a\tb\n1\t2\n', '\t')).toEqual([{ a: '1', b: '2' }]);
  });

  it('returns [] for empty / header-only input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,b,c\n')).toEqual([]);
  });
});

// The FEMS NFDRS shape from #1102: a human-readable caption above the real header.
const PREAMBLE = [
  '"Stations used in the building of the data sheet are: PINE CREEK, TOWN CREEK"',
  '"ObservationDate","NFDRType","AvgERC"',
  '"2026-08-21","O",58.1',
  ''
].join('\n');

describe('parseCsv skipLines (#1102)', () => {
  it('without skipLines, a caption is taken as the header and every other column is lost', () => {
    // Pinning the BUG, so the fix below is measured against the real behaviour
    // rather than an assumed one.
    const rows = parseCsv(PREAMBLE);
    expect(Object.keys(rows[0])).toHaveLength(1);
    expect(Object.keys(rows[0])[0]).toMatch(/^Stations used/);
    expect(rows[0]['Stations used in the building of the data sheet are: PINE CREEK, TOWN CREEK'])
      .toBe('ObservationDate');
  });

  it('skipLines: 1 yields the real header and every column', () => {
    const rows = parseCsv(PREAMBLE, ',', 1);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).toEqual(['ObservationDate', 'NFDRType', 'AvgERC']);
    expect(rows[0].AvgERC).toBe('58.1');
  });

  it('skipLines: 0 is identical to omitting it — no regression for existing feeds', () => {
    expect(parseCsv(FIRMS, ',', 0)).toEqual(parseCsv(FIRMS));
  });

  it('skipLines beyond the row count returns [] rather than throwing', () => {
    expect(parseCsv(PREAMBLE, ',', 99)).toEqual([]);
  });

  it('skipLines consuming all but the header returns [] — a header with no data rows', () => {
    expect(parseCsv(PREAMBLE, ',', 2)).toEqual([]);
  });
});

describe('preambleSuspicion (#1102)', () => {
  it('flags a single prose column', () => {
    expect(preambleSuspicion(['Stations used in the building of the data sheet are: PINE CREEK']))
      .toMatch(/^Stations used/);
  });

  it('flags a single over-long column even without whitespace', () => {
    expect(preambleSuspicion(['a'.repeat(41)])).not.toBeNull();
  });

  it('does NOT flag a legitimate single-column CSV with a short field name', () => {
    expect(preambleSuspicion(['id'])).toBeNull();
    expect(preambleSuspicion(['station_id'])).toBeNull();
  });

  it('does not flag a multi-column parse, however prose-like the names', () => {
    expect(preambleSuspicion(['a long name here', 'b'])).toBeNull();
  });

  it('does not flag an empty column list', () => {
    expect(preambleSuspicion([])).toBeNull();
  });
});

describe('csvAdapter (#911)', () => {
  it('fetch() parses the CSV body into RawRecords', async () => {
    const policy = stubFetch(FIRMS);
    const rows = await csvAdapter.fetch(base, policy);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ latitude: '64.4314', confidence: 'n' });
  });

  it('fetch() throws on non-ok', async () => {
    const policy = stubFetch('', false, 503);
    await expect(csvAdapter.fetch(base, policy)).rejects.toThrow(/503/);
  });

  it('parse() lifts columns as properties and synthesizes a stable id when none', () => {
    const row = { latitude: '64.4314', longitude: '144.83386', confidence: 'n' };
    const a = csvAdapter.parse(row, base);
    const b = csvAdapter.parse({ ...row }, base);
    expect(a).toMatchObject({ properties: { latitude: '64.4314', confidence: 'n' } });
    // synthetic id is stable across identical rows...
    expect(a!.sourceRecordId).toBe(b!.sourceRecordId);
    expect(a!.sourceRecordId).toMatch(/^[0-9a-f]{16}$/);
    // ...order-independent (column reorder → same id)...
    const reordered = csvAdapter.parse({ confidence: 'n', longitude: '144.83386', latitude: '64.4314' }, base);
    expect(reordered!.sourceRecordId).toBe(a!.sourceRecordId);
    // ...and the synthetic id does not leak into properties.
    expect(a!.properties.id).toBeUndefined();
  });

  it('fetch() warns when the parse looks like it hit an unskipped preamble', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const policy = stubFetch(PREAMBLE);
    await csvAdapter.fetch(base, policy);
    expect(spy).toHaveBeenCalledTimes(1);
    const msg = String(spy.mock.calls[0][0]);
    expect(msg).toContain("feed 'firms'");
    expect(msg).toContain('skipLines');
    spy.mockRestore();
  });

  it('fetch() does not warn once skipLines is set correctly', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const policy = stubFetch(PREAMBLE);
    const rows = await csvAdapter.fetch({ ...base, skipLines: 1 }, policy);
    expect(spy).not.toHaveBeenCalled();
    expect(Object.keys(rows[0])).toEqual(['ObservationDate', 'NFDRType', 'AvgERC']);
    spy.mockRestore();
  });

  it('fetch() does not warn for an ordinary multi-column feed', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const policy = stubFetch(FIRMS);
    await csvAdapter.fetch(base, policy);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('parse() honours recordIdField when the CSV carries an id column', () => {
    const r = csvAdapter.parse({ event_id: 'ev-9', mag: '5.2' }, { ...base, recordIdField: 'event_id' });
    expect(r).toMatchObject({ sourceRecordId: 'ev-9', properties: { mag: '5.2' } });
  });

  it('parse() applies a dot-path map', () => {
    const r = csvAdapter.parse({ latitude: '64.4', longitude: '144.8', bright_ti4: '330' }, { ...base, recordIdField: 'bright_ti4', map: { lat: 'latitude', lon: 'longitude' } });
    expect(r).toMatchObject({ sourceRecordId: '330', properties: { lat: '64.4', lon: '144.8' } });
  });
});
