/**
 * Unit tests for the rest-json adapter + shared buildRecord/pickItemsArray (#685 slice 8).
 *
 * @jest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { restJsonAdapter } from '../src/adapters/restjson';
import { buildRecord, pickItemsArray } from '../src/adapters/buildRecord';
import type { FeedSourceConfig } from '../src/types';

const base: FeedSourceConfig = { sourceId: 'api', adapter: 'rest-json', url: 'https://x.test/api', type: 'Event' };

afterEach(() => vi.unstubAllGlobals());
const stubFetch = (body: unknown, ok = true, status = 200) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status, statusText: 'x', json: async () => body })));

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
    const r = buildRecord({ id: 'x', mag: 5 }, base, { id: 'x', mag: 5 });
    expect(r).toEqual({ sourceRecordId: 'x', fetchedAt: expect.any(String), properties: { id: 'x', mag: 5 } });
  });
  it('uses the dot-path map + recordIdField', () => {
    const cfg = { ...base, recordIdField: 'props.code', map: { m: 'props.mag' } };
    const r = buildRecord({ props: { code: 'us1', mag: 5.2 } }, cfg, undefined);
    expect(r).toMatchObject({ sourceRecordId: 'us1', properties: { m: 5.2 } });
  });
  it('returns null when no id resolves', () => {
    expect(buildRecord({ noid: true }, base, undefined)).toBeNull();
  });
});

describe('restJsonAdapter (#685)', () => {
  it('fetch() returns a bare array', async () => {
    stubFetch([{ id: 1 }, { id: 2 }]);
    expect(await restJsonAdapter.fetch(base)).toHaveLength(2);
  });
  it('fetch() unwraps an envelope', async () => {
    stubFetch({ results: [{ id: 1 }] });
    expect(await restJsonAdapter.fetch(base)).toEqual([{ id: 1 }]);
  });
  it('fetch() honours itemsPath dot-path', async () => {
    stubFetch({ data: { events: [{ id: 'a' }] } });
    expect(await restJsonAdapter.fetch({ ...base, itemsPath: 'data.events' })).toEqual([{ id: 'a' }]);
  });
  it('fetch() throws on non-ok', async () => {
    stubFetch({}, false, 500);
    await expect(restJsonAdapter.fetch(base)).rejects.toThrow(/500/);
  });
  it('fetch() returns [] when no array found', async () => {
    stubFetch({ a: 1 });
    expect(await restJsonAdapter.fetch(base)).toEqual([]);
  });
  it('parse() lifts the item fields as properties', () => {
    const r = restJsonAdapter.parse({ id: 'u1', title: 'Quake', mag: 5 }, base);
    expect(r).toMatchObject({ sourceRecordId: 'u1', properties: { title: 'Quake', mag: 5 } });
  });
});
