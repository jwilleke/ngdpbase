/**
 * Unit tests for the rest-json shim and the shared record builder (#685 slice 8; a core shim since #2109).
 *
 * @jest-environment node
 */
import { describe, expect, it } from 'vitest';
import { restJsonShim, jsonItems } from '../restjson';
import { buildRecord, pickItemsArray, recordOptions } from '../record';
import { readShim, recordsOf } from './__fixtures__/readShim';

describe('pickItemsArray (#685)', () => {
  it('returns the body when it is an array', () => {
    expect(pickItemsArray([1, 2])).toEqual([1, 2]);
  });
  it('finds a common envelope key', () => {
    expect(pickItemsArray({ results: [{ id: 1 }] })).toEqual([{ id: 1 }]);
  });
  it('falls back to the first array-valued property', () => {
    expect(pickItemsArray({ meta: 1, rows: [{ id: 9 }] })).toEqual([{ id: 9 }]);
  });
  it('returns [] when no array is present', () => {
    expect(pickItemsArray({ a: 1 })).toEqual([]);
    expect(pickItemsArray('nope')).toEqual([]);
  });
});

describe('buildRecord (#685, shared)', () => {
  it('lifts the item itself when no map (rest-json default)', () => {
    expect(buildRecord({ id: 'x', mag: 5 }, {}, { id: 'x', mag: 5 })).toEqual({ id: 'x', properties: { id: 'x', mag: 5 } });
  });
  it('uses the dot-path map + recordIdField', () => {
    const r = buildRecord({ props: { code: 'us1', mag: 5.2 } }, { recordIdField: 'props.code', map: { m: 'props.mag' } }, undefined);
    expect(r).toEqual({ id: 'us1', properties: { m: 5.2 } });
  });
  it('returns null when no id resolves', () => {
    expect(buildRecord({ noid: true }, {}, undefined)).toBeNull();
  });
});

describe('recordOptions (#2109)', () => {
  it('keeps each option of the right type and drops the rest', () => {
    expect(recordOptions({
      recordIdField: 'id', map: { a: 'x.y', bad: 1 }, itemsPath: 'rows', delimiter: '\t', skipLines: 2,
      linkPattern: 'x', maxItems: 5, extra: true
    })).toEqual({ recordIdField: 'id', map: { a: 'x.y' }, itemsPath: 'rows', delimiter: '\t', skipLines: 2, linkPattern: 'x', maxItems: 5 });
    expect(recordOptions({ recordIdField: 3, skipLines: -1, maxItems: 0, delimiter: '' })).toEqual({});
  });
});

describe('restJsonShim (#685)', () => {
  it('reads a bare array', () => {
    expect(jsonItems([{ id: 1 }, { id: 2 }], undefined)).toHaveLength(2);
  });
  it('unwraps an envelope', () => {
    expect(jsonItems({ results: [{ id: 1 }] }, undefined)).toEqual([{ id: 1 }]);
  });
  it('honours itemsPath dot-path', async () => {
    const result = await readShim(restJsonShim, JSON.stringify({ data: { events: [{ id: 'a' }] } }), { itemsPath: 'data.events' });
    expect(recordsOf(result)).toEqual([{ id: 'a', properties: { id: 'a' } }]);
  });
  it('reads nothing when no array is found', async () => {
    expect((await readShim(restJsonShim, '{"a":1}')).items).toEqual([]);
  });
  it('throws on a body that is not JSON (the engine fails the file)', async () => {
    await expect(readShim(restJsonShim, '<html>')).rejects.toThrow();
  });
  it('lifts the item fields as properties', async () => {
    const [r] = recordsOf(await readShim(restJsonShim, JSON.stringify([{ id: 'u1', title: 'Quake', mag: 5 }])));
    expect(r).toEqual({ id: 'u1', properties: { id: 'u1', title: 'Quake', mag: 5 } });
  });
});
