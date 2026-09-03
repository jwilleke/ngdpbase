/**
 * Unit tests for the rest-json adapter + shared buildRecord/pickItemsArray (#685 slice 8).
 *
 * @jest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { restJsonAdapter } from '../src/adapters/restjson';
import { buildRecord, pickItemsArray } from '../src/adapters/buildRecord';
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


const base: FeedSourceConfig = { sourceId: 'api', adapter: 'rest-json', url: 'https://x.test/api', type: 'Event' };


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
    const policy = stubFetch([{ id: 1 }, { id: 2 }]);
    expect(await restJsonAdapter.fetch(base, policy)).toHaveLength(2);
  });
  it('fetch() unwraps an envelope', async () => {
    const policy = stubFetch({ results: [{ id: 1 }] });
    expect(await restJsonAdapter.fetch(base, policy)).toEqual([{ id: 1 }]);
  });
  it('fetch() honours itemsPath dot-path', async () => {
    const policy = stubFetch({ data: { events: [{ id: 'a' }] } });
    expect(await restJsonAdapter.fetch({ ...base, itemsPath: 'data.events' }, policy)).toEqual([{ id: 'a' }]);
  });
  it('fetch() throws on non-ok', async () => {
    const policy = stubFetch({}, false, 500);
    await expect(restJsonAdapter.fetch(base, policy)).rejects.toThrow(/500/);
  });
  it('fetch() returns [] when no array found', async () => {
    const policy = stubFetch({ a: 1 });
    expect(await restJsonAdapter.fetch(base, policy)).toEqual([]);
  });
  it('parse() lifts the item fields as properties', () => {
    const r = restJsonAdapter.parse({ id: 'u1', title: 'Quake', mag: 5 }, base);
    expect(r).toMatchObject({ sourceRecordId: 'u1', properties: { title: 'Quake', mag: 5 } });
  });
});
