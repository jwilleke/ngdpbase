/**
 * Unit tests for the csv adapter + parseCsv (#911).
 *
 * @jest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { csvAdapter, parseCsv } from '../src/adapters/csv';
import type { FeedSourceConfig } from '../src/types';

const base: FeedSourceConfig = { sourceId: 'firms', adapter: 'csv', url: 'https://x.test/csv', type: 'Event' };

afterEach(() => vi.unstubAllGlobals());
const stubFetch = (body: string, ok = true, status = 200) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status, statusText: 'x', text: async () => body })));

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

describe('csvAdapter (#911)', () => {
  it('fetch() parses the CSV body into RawRecords', async () => {
    stubFetch(FIRMS);
    const rows = await csvAdapter.fetch(base);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ latitude: '64.4314', confidence: 'n' });
  });

  it('fetch() throws on non-ok', async () => {
    stubFetch('', false, 503);
    await expect(csvAdapter.fetch(base)).rejects.toThrow(/503/);
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

  it('parse() honours recordIdField when the CSV carries an id column', () => {
    const r = csvAdapter.parse({ event_id: 'ev-9', mag: '5.2' }, { ...base, recordIdField: 'event_id' });
    expect(r).toMatchObject({ sourceRecordId: 'ev-9', properties: { mag: '5.2' } });
  });

  it('parse() applies a dot-path map', () => {
    const r = csvAdapter.parse({ latitude: '64.4', longitude: '144.8', bright_ti4: '330' }, { ...base, recordIdField: 'bright_ti4', map: { lat: 'latitude', lon: 'longitude' } });
    expect(r).toMatchObject({ sourceRecordId: '330', properties: { lat: '64.4', lon: '144.8' } });
  });
});
