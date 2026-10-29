/**
 * Unit tests for the csv shim + parseCsv (#911; a shim since #2109).
 *
 * @jest-environment node
 */
import { describe, expect, it } from 'vitest';
import { csvShim, parseCsv, preambleSuspicion } from '../src/shims/csv';
import { recordItemKey } from '../src/shims/buildRecord';
import { readShim, recordsOf } from './__fixtures__/feedEngine';

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

describe('csvShim (#911, #2109)', () => {
  it('reads the CSV into one record item per row, keyed by id and content', async () => {
    const result = await readShim(csvShim, FIRMS);
    expect(result.items).toHaveLength(2);
    expect(result.items.every(i => i.kind === 'record')).toBe(true);
    expect(recordsOf(result)[0].properties).toMatchObject({ latitude: '64.4314', confidence: 'n' });
    expect(result.items[0].itemKey).toBe(recordItemKey(recordsOf(result)[0]));
  });

  it('declares per-item duplicates, CSV files and media types, and the feed items receiver', () => {
    expect(csvShim).toMatchObject({
      name: 'csv', direction: 'in', duplicates: 'item', produces: 'record', receivers: ['feeds.items'],
      accepts: { extensions: ['.csv', '.tsv'], mediaTypes: ['text/csv', 'text/tab-separated-values'] }
    });
  });

  it('lifts columns as properties and synthesizes a stable id when none', async () => {
    const [a] = recordsOf(await readShim(csvShim, 'latitude,longitude,confidence\n64.4314,144.83386,n\n'));
    const [b] = recordsOf(await readShim(csvShim, 'latitude,longitude,confidence\n64.4314,144.83386,n\n'));
    expect(a).toMatchObject({ properties: { latitude: '64.4314', confidence: 'n' } });
    // synthetic id is stable across identical rows...
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f]{16}$/);
    // ...order-independent (column reorder → same id)...
    const [reordered] = recordsOf(await readShim(csvShim, 'confidence,longitude,latitude\nn,144.83386,64.4314\n'));
    expect(reordered.id).toBe(a.id);
    // ...and the synthetic id does not leak into properties.
    expect(a.properties.id).toBeUndefined();
  });

  it('warns once on the read when the parse looks like it hit an unskipped preamble', async () => {
    const result = await readShim(csvShim, PREAMBLE);
    const warnings = result.items.flatMap(i => i.warnings ?? []);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('csv-preamble');
    expect(warnings[0].detail).toContain('skipLines');
  });

  it('does not warn once skipLines is set correctly', async () => {
    const result = await readShim(csvShim, PREAMBLE, { skipLines: 1 });
    expect(result.items.flatMap(i => i.warnings ?? [])).toEqual([]);
    expect(Object.keys(recordsOf(result)[0].properties)).toEqual(['ObservationDate', 'NFDRType', 'AvgERC']);
  });

  it('does not warn for an ordinary multi-column file', async () => {
    expect((await readShim(csvShim, FIRMS)).items.flatMap(i => i.warnings ?? [])).toEqual([]);
  });

  it('honours recordIdField when the CSV carries an id column', async () => {
    const [r] = recordsOf(await readShim(csvShim, 'event_id,mag\nev-9,5.2\n', { recordIdField: 'event_id' }));
    expect(r).toEqual({ id: 'ev-9', properties: { event_id: 'ev-9', mag: '5.2' } });
  });

  it('applies a dot-path map', async () => {
    const [r] = recordsOf(await readShim(csvShim, 'latitude,longitude,bright_ti4\n64.4,144.8,330\n', { recordIdField: 'bright_ti4', map: { lat: 'latitude', lon: 'longitude' } }));
    expect(r).toEqual({ id: '330', properties: { lat: '64.4', lon: '144.8' } });
  });

  it('knows nothing about feeds: a semicolon bank statement with a preamble reads with options alone', async () => {
    // The shape a later accounting import would hand it (#2109): no feed configuration anywhere.
    const statement = 'Account 1234 statement, October\nDate;Reference;Amount\n2026-10-01;TX-1;-12,50\n2026-10-02;TX-2;100,00\n';
    const result = await readShim(csvShim, statement, { delimiter: ';', skipLines: 1, recordIdField: 'Reference', map: { date: 'Date', amount: 'Amount' } });
    expect(recordsOf(result)).toEqual([
      { id: 'TX-1', properties: { date: '2026-10-01', amount: '-12,50' } },
      { id: 'TX-2', properties: { date: '2026-10-02', amount: '100,00' } }
    ]);
  });
});
