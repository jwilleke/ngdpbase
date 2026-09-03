
/**
 * Tests for Sist2AssetProvider.
 *
 * The @elastic/elasticsearch Client and global fetch are mocked so no real
 * network connections are made.
 */

import { Sist2AssetProvider } from '../src/Sist2AssetProvider';
import type { Client } from '@elastic/elasticsearch';
import { guardedFetch } from '../../../dist/src/http/guardedFetch.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(overrides = {}) {
  return {
    search: vi.fn(),
    get: vi.fn(),
    // #998: healthCheck now verifies the configured index exists. Defaults to
    // present so unrelated tests are unaffected.
    indices: { exists: vi.fn().mockResolvedValue(true) },
    ...overrides
  } as unknown as Client;
}

function makeSist2Doc(overrides = {}) {
  return {
    name: 'IMG_001',
    path: 'jims/data/photos/family',
    mime: 'image/jpeg',
    extension: 'jpg',
    size: 3145728,
    mtime: 1700000000,
    width: 4032,
    height: 3024,
    thumbnail: 1,
    index: 1776001547,
    checksum: 'abc123',
    tag: 'family vacation',
    exif_make: 'Apple',
    exif_model: 'iPhone 14 Pro',
    exif_datetime: '2023:07:15 14:30:00',
    exif_gps_latitude_dec: '40.7128',
    exif_gps_longitude_dec: '-74.0060',
    exif_exposure_time: '1/250',
    exif_fnumber: 'f/1.8',
    exif_focal_length: '6.86 mm',
    exif_iso_speed_ratings: '100',
    ...overrides
  };
}

function makeSearchResponse(docs, total) {
  return {
    hits: {
      total: { value: total, relation: 'eq' },
      hits: docs.map((doc, i) => ({
        _index: 'sist2',
        _id: `69dba20b.0000${i.toString(16).padStart(4, '0')}`,
        _score: 1.0,
        _source: doc
      }))
    }
  };
}

// ---------------------------------------------------------------------------
// The outbound boundary (#1133)
// ---------------------------------------------------------------------------
//
// This used to assign `global.fetch`. The provider now goes through
// `guardedFetch` with an egress policy, so a global stub would pass while
// testing nothing. Mocking the module is the seam; production deliberately has
// no injectable transport parameter, because one way to reach the network was
// the point.

vi.mock('../../../dist/src/http/guardedFetch.js', () => ({ guardedFetch: vi.fn() }));

const mockFetch = vi.mocked(guardedFetch);

/** The config reader the provider holds; sets nothing, so egress defaults apply. */
const NO_EGRESS_CONFIG = (_key: string, fallback?: unknown): unknown => fallback;

/** Script a guardedFetch response in the shape the provider reads. */
const respondWith = (status: number, body = '') =>
  mockFetch.mockResolvedValue({
    status, headers: {}, body: Buffer.from(body),
    finalUrl: 'http://sist2:4090/', chain: ['http://sist2:4090/']
  });

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// search()
// ---------------------------------------------------------------------------

describe('search()', () => {
  test('no query uses match_all', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([makeSist2Doc()], 1))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    await provider.search({});

    const body = client.search.mock.calls[0][0].body;
    expect(body.query.bool.must).toMatchObject({ match_all: {} });
  });

  test('text query uses multi_match on name/path/content/tag', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([makeSist2Doc()], 1))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    await provider.search({ query: 'family photo' });

    const body = client.search.mock.calls[0][0].body;
    expect(body.query.bool.must.multi_match.query).toBe('family photo');
    expect(body.query.bool.must.multi_match.fields).toContain('name');
    expect(body.query.bool.must.multi_match.fields).toContain('path');
    expect(body.query.bool.must.multi_match.fields).toContain('content');
    expect(body.query.bool.must.multi_match.fields).toContain('tag');
  });

  test('mimeCategory image adds prefix filter', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([], 0))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    await provider.search({ mimeCategory: 'image' });

    const filter = client.search.mock.calls[0][0].body.query.bool.filter;
    expect(filter).toContainEqual({ prefix: { mime: 'image/' } });
  });

  test('mimeCategory document adds terms filter', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([], 0))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    await provider.search({ mimeCategory: 'document' });

    const filter = client.search.mock.calls[0][0].body.query.bool.filter;
    const termsFilter = filter.find((f) => f.terms?.mime);
    expect(termsFilter).toBeDefined();
    expect(termsFilter.terms.mime).toContain('application/pdf');
  });

  test('year filter adds mtime range', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([], 0))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    await provider.search({ year: 2023 });

    const filter = client.search.mock.calls[0][0].body.query.bool.filter;
    const rangeFilter = filter.find((f) => f.range?.mtime);
    expect(rangeFilter).toBeDefined();
    const start2023 = new Date(2023, 0, 1).getTime() / 1000;
    const start2024 = new Date(2024, 0, 1).getTime() / 1000;
    expect(rangeFilter.range.mtime.gte).toBe(start2023);
    expect(rangeFilter.range.mtime.lt).toBe(start2024);
  });

  test('indexIds adds terms filter on index field', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([], 0))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [1776001547], NO_EGRESS_CONFIG);

    await provider.search({});

    const filter = client.search.mock.calls[0][0].body.query.bool.filter;
    expect(filter).toContainEqual({ terms: { index: [1776001547] } });
  });

  test('empty indexIds does not add index filter', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([], 0))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    await provider.search({});

    const body = client.search.mock.calls[0][0].body;
    const filter = body.query.bool.filter ?? [];
    const hasIndexFilter = filter.some((f) => f.terms?.index !== undefined);
    expect(hasIndexFilter).toBe(false);
  });

  test('pagination params forwarded to ES', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([], 0))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    await provider.search({ pageSize: 10, offset: 20 });

    const body = client.search.mock.calls[0][0].body;
    expect(body.size).toBe(10);
    expect(body.from).toBe(20);
  });

  test('returns correct AssetPage shape', async () => {
    const doc = makeSist2Doc();
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([doc], 1))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    const page = await provider.search({});

    expect(page.total).toBe(1);
    expect(page.hasMore).toBe(false);
    expect(page.results).toHaveLength(1);
    expect(page.results[0].providerId).toBe('sist2');
  });

  // ── #998 — no aggregations are requested ─────────────────────────────────
  //
  // These facets (#520) fed the asset-picker sidebar that #745 deleted, so
  // nothing has read `AssetPage.aggregations` since. On `elasticsearch-nas`
  // the `by_extension` terms agg targeted a `text` field and every query died
  // with "Fielddata is disabled on [extension]". `search()` has no try/catch,
  // so AssetManager caught it, logged a warn, and the provider contributed
  // zero results — ~2M documents unreachable while health reported green.
  //
  // Re-adding an aggregation re-arms that failure for any index whose mapping
  // does not match sist2's, so it must not come back unnoticed.

  test('#998 — search() requests no aggregations', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([], 0))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    await provider.search({ query: 'jpg' });

    const body = client.search.mock.calls[0][0].body;
    expect(body.aggs).toBeUndefined();
    expect(body.aggregations).toBeUndefined();
  });

  test('#998 — no aggregations requested even with filters applied', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([], 0))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [1, 2], NO_EGRESS_CONFIG);

    await provider.search({ query: 'jpg', mimeCategory: 'image', year: 2024, extension: 'jpg' });

    const body = client.search.mock.calls[0][0].body;
    expect(body.aggs).toBeUndefined();
  });

  test('#998 — the returned page carries no aggregations key', async () => {
    const doc = makeSist2Doc();
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([doc], 1))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    const page = await provider.search({});

    expect(page).not.toHaveProperty('aggregations');
    // The results themselves are unaffected — that is the whole point.
    expect(page.results).toHaveLength(1);
  });

  // ── #998 follow-up — a failed query must not masquerade as "no results" ──
  //
  // Before this, search() had no try/catch: an ES rejection propagated to
  // AssetManager, which logged a warn and moved on. A broken provider was
  // indistinguishable from an empty index, and health stayed green because the
  // index existed and the cluster answered. That is precisely how the
  // aggregation fault hid.

  test('#998 — an ES error returns an empty page instead of throwing', async () => {
    const client = makeClient({
      search: vi.fn().mockRejectedValue(new Error('search_phase_execution_exception'))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    // One broken provider must not take down the merged asset search.
    const page = await provider.search({ query: 'jpg' });

    expect(page).toEqual({ results: [], total: 0, hasMore: false });
  });

  test('#998 — a failed search turns the health check UNHEALTHY', async () => {
    const client = makeClient({
      search: vi.fn().mockRejectedValue(new Error('Fielddata is disabled on [extension]'))
    });
    respondWith(200);
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    // Dependencies are fine — index exists, sist2 answers — so the pre-existing
    // checks alone would report green, exactly as they did during the outage.
    await expect(provider.healthCheckDetailed()).resolves.toMatchObject({ healthy: true });

    await provider.search({ query: 'jpg' });

    const health = await provider.healthCheckDetailed();
    expect(health.healthy).toBe(false);
    expect(health.message).toContain('last search FAILED');
    expect(health.message).toContain('Fielddata is disabled on [extension]');
  });

  test('#998 — a later successful search clears the unhealthy state', async () => {
    const doc = makeSist2Doc();
    const search = vi.fn()
      .mockRejectedValueOnce(new Error('transient cluster blip'))
      .mockResolvedValueOnce(makeSearchResponse([doc], 1));
    const client = makeClient({ search });
    respondWith(200);
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    await provider.search({ query: 'jpg' });
    await expect(provider.healthCheckDetailed()).resolves.toMatchObject({ healthy: false });

    // Recovery must not require a restart — a transient failure that latched
    // permanently would be its own false alarm.
    const page = await provider.search({ query: 'jpg' });
    expect(page.results).toHaveLength(1);
    await expect(provider.healthCheckDetailed()).resolves.toMatchObject({ healthy: true });
  });
});

// ---------------------------------------------------------------------------
// getById()
// ---------------------------------------------------------------------------

describe('getById()', () => {
  test('returns mapped AssetRecord on hit', async () => {
    const doc = makeSist2Doc();
    const client = makeClient({
      get: vi.fn().mockResolvedValue({
        found: true,
        _id: '69dba20b.00001234',
        _source: doc
      })
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    const record = await provider.getById('69dba20b.00001234');

    expect(record).not.toBeNull();
    expect(record.id).toBe('69dba20b.00001234');
    expect(record.encodingFormat).toBe('image/jpeg');
    expect(record.filename).toBe('IMG_001.jpg');
  });

  test('returns null when not found (statusCode 404)', async () => {
    const client = makeClient({
      get: vi.fn().mockRejectedValue({ statusCode: 404 })
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    const record = await provider.getById('nonexistent');
    expect(record).toBeNull();
  });

  test('re-throws non-404 errors', async () => {
    const client = makeClient({
      get: vi.fn().mockRejectedValue({ statusCode: 500, message: 'ES error' })
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    await expect(provider.getById('bad')).rejects.toMatchObject({ statusCode: 500 });
  });
});

// ---------------------------------------------------------------------------
// getThumbnail()
// ---------------------------------------------------------------------------

describe('getThumbnail()', () => {
  test('returns Buffer on 200', async () => {
    const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    respondWith(200, imageBytes.toString('binary'));
    mockFetch.mockResolvedValue({
      status: 200, headers: {}, body: imageBytes,
      finalUrl: 'http://sist2:4090/', chain: ['http://sist2:4090/']
    });
    const provider = new Sist2AssetProvider(makeClient(), 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    const buf = await provider.getThumbnail('69dba20b.00001234', 'sm');

    expect(buf).toBeInstanceOf(Buffer);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://sist2:4090/t/69dba20b.00001234',
      expect.objectContaining({ policy: expect.anything() })
    );
  });

  test('returns null when sist2 returns non-200 (thumbnail not generated)', async () => {
    respondWith(404);
    const provider = new Sist2AssetProvider(makeClient(), 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    const buf = await provider.getThumbnail('69dba20b.00001234', 'sm');
    expect(buf).toBeNull();
  });

  test('returns null on network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = new Sist2AssetProvider(makeClient(), 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    const buf = await provider.getThumbnail('69dba20b.00001234', 'sm');
    expect(buf).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// healthCheck()
// ---------------------------------------------------------------------------

describe('healthCheck() — #998', () => {
  // The bug this replaced: healthCheck pinged only the sist2 UI, so a provider
  // whose configured index had been renamed away reported "sist2 reachable"
  // while every search returned nothing. A health check that cannot fail for
  // the most likely misconfiguration is worse than none — it turns a broken
  // feature into a confidently healthy one.

  test('healthy when the index exists and sist2 responds', async () => {
    respondWith(200);
    const provider = new Sist2AssetProvider(makeClient(), 'elasticsearch-nas', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    const result = await provider.healthCheckDetailed();
    expect(result.healthy).toBe(true);
    expect(result.message).toContain('elasticsearch-nas');
    expect(await provider.healthCheck()).toBe(true);
  });

  test('UNHEALTHY when the configured index does not exist', async () => {
    // The exact jimstest failure: cluster up, sist2 up, index absent.
    respondWith(200);
    const client = makeClient({ indices: { exists: vi.fn().mockResolvedValue(false) } });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    const result = await provider.healthCheckDetailed();
    expect(result.healthy).toBe(false);
    // Must name the index AND the key that fixes it.
    expect(result.message).toContain("'sist2'");
    expect(result.message).toContain('es-index');
  });

  test('reports Elasticsearch unreachable distinctly from a missing index', async () => {
    // Different fixes: one is config, the other is infrastructure.
    const client = makeClient({
      indices: { exists: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) }
    });
    const provider = new Sist2AssetProvider(client, 'elasticsearch-nas', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    const result = await provider.healthCheckDetailed();
    expect(result.healthy).toBe(false);
    expect(result.message).toContain('es-url');
  });

  test('reports sist2 down while noting search still works', async () => {
    respondWith(503);
    const provider = new Sist2AssetProvider(makeClient(), 'elasticsearch-nas', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    const result = await provider.healthCheckDetailed();
    expect(result.healthy).toBe(false);
    expect(result.message).toContain('search works');
    expect(result.message).toContain('thumbnails');
  });

  test('returns false on a sist2 network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = new Sist2AssetProvider(makeClient(), 'elasticsearch-nas', 'http://sist2:4090', [], NO_EGRESS_CONFIG);

    expect(await provider.healthCheck()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _hitToRecord field mapping
// ---------------------------------------------------------------------------

describe('AssetRecord field mapping', () => {
  function getRecord(docOverrides = {}) {
    const doc = makeSist2Doc(docOverrides);
    const client = makeClient({
      get: vi.fn().mockResolvedValue({ found: true, _id: 'test-id', _source: doc })
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG);
    // Access private method via cast
    return provider._hitToRecord('test-id', doc);
  }

  test('thumbnail=0 → no thumbnailUrl', () => {
    const record = getRecord({ thumbnail: 0 });
    expect(record.thumbnailUrl).toBeUndefined();
  });

  test('thumbnail=1 → thumbnailUrl set', () => {
    const record = getRecord({ thumbnail: 1 });
    expect(record.thumbnailUrl).toBe('http://sist2:4090/t/test-id');
  });

  test('thumbnail=2 → thumbnailUrl set (multi-page PDF)', () => {
    const record = getRecord({ thumbnail: 2 });
    expect(record.thumbnailUrl).toBe('http://sist2:4090/t/test-id');
  });

  test('url always points to sist2 file endpoint', () => {
    const record = getRecord();
    expect(record.url).toBe('http://sist2:4090/f/test-id');
  });

  test('insertSnippet uses [{Image src=...}] format', () => {
    const record = getRecord();
    expect(record.insertSnippet).toBe("[{Image src='http://sist2:4090/f/test-id'}]");
  });

  test('keywords populated from space-separated tag field', () => {
    const record = getRecord({ tag: 'family vacation' });
    expect(record.keywords).toEqual(['family', 'vacation']);
  });

  test('keywords empty when no tag field', () => {
    const record = getRecord({ tag: undefined });
    expect(record.keywords).toEqual([]);
  });

  test('dimensions set when width and height present', () => {
    const record = getRecord({ width: 4032, height: 3024 });
    expect(record.dimensions).toEqual({ width: 4032, height: 3024 });
  });

  test('dimensions undefined when width/height missing', () => {
    const record = getRecord({ width: undefined, height: undefined });
    expect(record.dimensions).toBeUndefined();
  });

  test('metadata.camera populated from EXIF fields', () => {
    const record = getRecord();
    expect(record.metadata.camera).toBeDefined();
    expect(record.metadata.camera.make).toBe('Apple');
    expect(record.metadata.camera.model).toBe('iPhone 14 Pro');
  });

  test('metadata.gps populated from decimal lat/lon', () => {
    const record = getRecord();
    expect(record.metadata.gps).toBeDefined();
    expect(record.metadata.gps.latitude).toBeCloseTo(40.7128);
    expect(record.metadata.gps.longitude).toBeCloseTo(-74.006);
  });

  test('metadata.gps undefined when no GPS EXIF', () => {
    const record = getRecord({
      exif_gps_latitude_dec: undefined,
      exif_gps_longitude_dec: undefined
    });
    expect(record.metadata.gps).toBeUndefined();
  });

  test('dateModified ISO 8601 from mtime epoch', () => {
    const record = getRecord({ mtime: 1700000000 });
    expect(record.dateModified).toBe(new Date(1700000000 * 1000).toISOString());
  });

  test('dateCreated parsed from EXIF datetime (ISO 8601 string, date part correct)', () => {
    // EXIF datetime has no timezone — parsed as local time, so only the date
    // portion is stable across machines.
    const record = getRecord({ exif_datetime: '2023:07:15 14:30:00' });
    expect(record.dateCreated).toBeDefined();
    expect(record.dateCreated).toMatch(/^2023-07-15/);
  });

  test('filename built from name + extension', () => {
    const record = getRecord({ name: 'IMG_001', extension: 'jpg' });
    expect(record.filename).toBe('IMG_001.jpg');
  });

  test('description is the sist2 path', () => {
    const record = getRecord({ path: 'jims/data/photos/family' });
    expect(record.description).toBe('jims/data/photos/family');
  });

  test('mentions is always empty array', () => {
    const record = getRecord();
    expect(record.mentions).toEqual([]);
  });

  test('providerId is "sist2"', () => {
    const record = getRecord();
    expect(record.providerId).toBe('sist2');
  });
});

// ---------------------------------------------------------------------------
// _resolveAllowedPaths()
// ---------------------------------------------------------------------------

describe('_resolveAllowedPaths()', () => {
  const pathAccess = {
    admin: [],
    editor: ['family/'],
    jim: ['jims/', 'family/'],
    viewer: ['public/']
  };

  function makeProvider(pa = pathAccess) {
    return new Sist2AssetProvider(makeClient(), 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG, pa);
  }

  test('null pathAccess → null (unrestricted)', () => {
    const provider = new Sist2AssetProvider(makeClient(), 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG, null);
    expect(provider._resolveAllowedPaths(['editor'], '')).toBeNull();
  });

  test('admin role with empty array → null (unrestricted)', () => {
    expect(makeProvider()._resolveAllowedPaths(['admin'], '')).toBeNull();
  });

  test('editor role → specific paths returned', () => {
    const paths = makeProvider()._resolveAllowedPaths(['editor'], '');
    expect(paths).toEqual(['family/']);
  });

  test('viewer role → viewer paths returned', () => {
    const paths = makeProvider()._resolveAllowedPaths(['viewer'], '');
    expect(paths).toEqual(['public/']);
  });

  test('multiple roles → union of paths', () => {
    const paths = makeProvider()._resolveAllowedPaths(['editor', 'viewer'], '');
    expect(paths).toEqual(expect.arrayContaining(['family/', 'public/']));
    expect(paths).toHaveLength(2);
  });

  test('role with empty array in set → null (admin wins)', () => {
    // If any matching principal has [], entire result is unrestricted
    const paths = makeProvider()._resolveAllowedPaths(['editor', 'admin'], '');
    expect(paths).toBeNull();
  });

  test('unrecognised role not in pathAccess → null (fall-through, not denied)', () => {
    const paths = makeProvider()._resolveAllowedPaths(['superuser'], '');
    expect(paths).toBeNull();
  });

  test('username match → username paths returned', () => {
    const paths = makeProvider()._resolveAllowedPaths(['editor'], 'jim');
    // editor gives ['family/'], jim gives ['jims/', 'family/'] → union
    expect(paths).toEqual(expect.arrayContaining(['jims/', 'family/']));
    expect(paths).toHaveLength(2);
  });

  test('username match only (no role match) → username paths returned', () => {
    const paths = makeProvider()._resolveAllowedPaths([], 'jim');
    expect(paths).toEqual(expect.arrayContaining(['jims/', 'family/']));
    expect(paths).toHaveLength(2);
  });

  test('username with empty array → null (unrestricted)', () => {
    const pa = { jim: [] };
    const paths = makeProvider(pa)._resolveAllowedPaths([], 'jim');
    expect(paths).toBeNull();
  });

  test('username not in pathAccess → null (fall-through)', () => {
    const paths = makeProvider()._resolveAllowedPaths([], 'unknown');
    expect(paths).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// search() — path access control integration
// ---------------------------------------------------------------------------

describe('search() path access control', () => {
  const pathAccess = {
    admin: [],
    editor: ['family/'],
    jim: ['jims/', 'family/'],
    viewer: ['public/']
  };

  test('no pathAccess config → no path filter in ES query', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([], 0))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG, null);

    await provider.search({ userRoles: ['editor'], username: 'alice' });

    const filter = client.search.mock.calls[0][0].body.query.bool.filter ?? [];
    const hasBoolShould = filter.some((f) => f.bool?.should);
    expect(hasBoolShould).toBe(false);
  });

  test('admin role → no path filter added (unrestricted)', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([], 0))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG, pathAccess);

    await provider.search({ userRoles: ['admin'], username: 'alice' });

    const filter = client.search.mock.calls[0][0].body.query.bool.filter ?? [];
    const hasBoolShould = filter.some((f) => f.bool?.should);
    expect(hasBoolShould).toBe(false);
  });

  test('editor role → path bool/should filter added', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([], 0))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG, pathAccess);

    await provider.search({ userRoles: ['editor'], username: 'alice' });

    const filter = client.search.mock.calls[0][0].body.query.bool.filter;
    const boolFilter = filter.find((f) => f.bool?.should);
    expect(boolFilter).toBeDefined();
    expect(boolFilter.bool.minimum_should_match).toBe(1);
    const prefixes = boolFilter.bool.should.map((s) => s.prefix.path);
    expect(prefixes).toEqual(['family/']);
  });

  test('username match → username paths included', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([], 0))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG, pathAccess);

    await provider.search({ userRoles: ['editor'], username: 'jim' });

    const filter = client.search.mock.calls[0][0].body.query.bool.filter;
    const boolFilter = filter.find((f) => f.bool?.should);
    expect(boolFilter).toBeDefined();
    const prefixes = boolFilter.bool.should.map((s) => s.prefix.path);
    // editor gives family/, jim gives jims/ + family/ → union = jims/, family/
    expect(prefixes).toEqual(expect.arrayContaining(['jims/', 'family/']));
    expect(prefixes).toHaveLength(2);
  });

  test('no userRoles/username → no path filter added (fall-through)', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([], 0))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG, pathAccess);

    await provider.search({});

    const filter = client.search.mock.calls[0][0].body.query.bool.filter ?? [];
    const hasBoolShould = filter.some((f) => f.bool?.should);
    expect(hasBoolShould).toBe(false);
  });

  test('role not in pathAccess → no path filter (permissive fallback)', async () => {
    const client = makeClient({
      search: vi.fn().mockResolvedValue(makeSearchResponse([], 0))
    });
    const provider = new Sist2AssetProvider(client, 'sist2', 'http://sist2:4090', [], NO_EGRESS_CONFIG, pathAccess);

    await provider.search({ userRoles: ['contributor'], username: 'alice' });

    const filter = client.search.mock.calls[0][0].body.query.bool.filter ?? [];
    const hasBoolShould = filter.some((f) => f.bool?.should);
    expect(hasBoolShould).toBe(false);
  });
});
