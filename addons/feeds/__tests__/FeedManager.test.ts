/**
 * Unit tests for the feeds addon (#685 slices 3–4), on the import engine
 * since #2109: FeedManager asks the real ImportManager to fetch each source,
 * core's record shims read it, and FeedManager's receiver stores it.
 *
 * @jest-environment node
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

import { parseSourceConfigs } from '../src/config';

import { FeedCatalogSource } from '../src/FeedCatalogSource';
import { RecordStore } from '../src/RecordStore';
import { getByPath } from '../../../dist/src/ice/shims/dotpath.js';
import { recordToArticle } from '../src/normalize';
import { FEED_PERMISSION, FEED_POLL_JOB, type FeedJobs } from '../src/FeedManager';
import MarqueePluginModule from '../../../dist/src/plugins/MarqueePlugin';
import { asExecuted } from '../../../dist/src/test-support/plugins.js';
import type { FeedSourceConfig } from '../src/types';
import { feedEngine, POLL_CTX } from './__fixtures__/feedEngine';

// #1133, #2109 — every fetch is the import engine's, through `guardedFetch`.
// Mocking that module is the seam, because production deliberately has no
// injectable transport parameter: one way to reach the network was the point.
vi.mock('../../../dist/src/http/guardedFetch.js', () => ({ guardedFetch: vi.fn() }));
import { guardedFetch } from '../../../dist/src/http/guardedFetch.js';
import { buildAddonHost } from '../../../dist/src/utils/addonHost.js';

/** The host core hands the feeds add-on (#1813). */
const HOST = buildAddonHost('feeds', {});

const MarqueePlugin = asExecuted(MarqueePluginModule);

const mockGuardedFetch = vi.mocked(guardedFetch);

/** Script every guardedFetch response from here on. */
const stubFetch = (body: unknown, ok = true, status = 200): void => {
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
};


// Temp store dir — os.tmpdir, NEVER ./data (live-data-destruction rule).
const TMP = mkdtempSync(path.join(os.tmpdir(), 'feeds-test-'));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const quakeCfg: FeedSourceConfig = {
  sourceId: 'usgs-quakes', adapter: 'geojson', url: 'https://example.test/q.geojson',
  type: 'Event', recordIdField: 'id', map: { magnitude: 'properties.mag', place: 'properties.place', time: 'properties.time' }
};

const feature = (id: string, mag: number, place: string, time: number) => ({
  type: 'Feature', id, properties: { mag, place, time }, geometry: { type: 'Point', coordinates: [1, 2, 10] }
});

/** A GeoJSON FeatureCollection body. */
const collection = (...features: unknown[]) => JSON.stringify({ type: 'FeatureCollection', features });

beforeEach(() => { mockGuardedFetch.mockReset(); });

describe('parseSourceConfigs (#685)', () => {
  it('parses a valid source and stamps the key as sourceId', () => {
    const out = parseSourceConfigs({ 'usgs-quakes': { adapter: 'geojson', url: 'u', type: 'Event', intervalMinutes: 60 } }, HOST.logger);
    expect(out[0]).toMatchObject({ sourceId: 'usgs-quakes', adapter: 'geojson', url: 'u', type: 'Event', intervalMinutes: 60 });
  });
  it('keeps only string-valued map entries', () => {
    const out = parseSourceConfigs({ s: { adapter: 'geojson', url: 'u', type: 'Event', map: { a: 'x.y', bad: 1 } } }, HOST.logger);
    expect(out[0].map).toEqual({ a: 'x.y' });
  });
  it('skips entries missing required adapter/url/type', () => {
    const out = parseSourceConfigs({ good: { adapter: 'geojson', url: 'u', type: 'Event' }, bad: { adapter: 'geojson' } }, HOST.logger);
    expect(out.map(s => s.sourceId)).toEqual(['good']);
  });
  it('returns [] for absent / non-object input', () => {
    expect(parseSourceConfigs(undefined, HOST.logger)).toEqual([]);
    expect(parseSourceConfigs([], HOST.logger)).toEqual([]);
  });
  it('defaults schemaType to Article when absent', () => {
    expect(parseSourceConfigs({ s: { adapter: 'geojson', url: 'u', type: 'Event' } }, HOST.logger)[0].schemaType).toBe('Article');
  });
  it('accepts an explicit supported schemaType', () => {
    expect(parseSourceConfigs({ s: { adapter: 'geojson', url: 'u', type: 'Event', schemaType: 'Article' } }, HOST.logger)[0].schemaType).toBe('Article');
  });
  it('skips a source whose schemaType is not yet implemented', () => {
    const out = parseSourceConfigs({
      ok: { adapter: 'geojson', url: 'u', type: 'Event' },
      img: { adapter: 'geojson', url: 'u', type: 'Image', schemaType: 'ImageObject' }
    }, HOST.logger);
    expect(out.map(s => s.sourceId)).toEqual(['ok']); // ImageObject not implemented yet → skipped
  });
});

describe('FeedCatalogSource.types (#685) — declared from config.schemaType', () => {
  it('registers as Article by default', () => {
    const src = new FeedCatalogSource({ sourceId: 's', adapter: 'geojson', url: 'u', type: 'Event' }, new RecordStore(TMP, 'types-a'));
    expect(src.types).toEqual(['Article']);
  });
  it('reflects an explicit schemaType', () => {
    const src = new FeedCatalogSource({ sourceId: 's', adapter: 'geojson', url: 'u', type: 'Event', schemaType: 'Article' }, new RecordStore(TMP, 'types-b'));
    expect(src.types).toEqual(['Article']);
  });
});

describe('getByPath (#685)', () => {
  const o = { properties: { mag: 5.2 }, geometry: { coordinates: [1, 2, 10] } };
  it('reads nested object paths', () => expect(getByPath(o, 'properties.mag')).toBe(5.2));
  it('reads array index segments', () => expect(getByPath(o, 'geometry.coordinates.2')).toBe(10));
  it('returns undefined for missing segments', () => expect(getByPath(o, 'properties.depth')).toBeUndefined());
  it('returns undefined past a non-object', () => expect(getByPath(o, 'properties.mag.x')).toBeUndefined());
});

describe('RecordStore — change detection (#685)', () => {
  let store: RecordStore;
  beforeEach(() => { store = new RecordStore(TMP, `s-${Math.random().toString(36).slice(2)}`); });

  const rec = (id: string, mag: number) => ({ sourceRecordId: id, fetchedAt: new Date().toISOString(), properties: { mag } });

  it('counts added on first upsert', async () => {
    expect(await store.upsertAll([rec('a', 5), rec('b', 4)])).toEqual({ added: 2, updated: 0, unchanged: 0, removed: 0 });
  });
  it('re-ingesting identical content yields all unchanged (no churn) — fetchedAt ignored', async () => {
    await store.upsertAll([rec('a', 5)]);
    const r = await store.upsertAll([{ sourceRecordId: 'a', fetchedAt: 'later', properties: { mag: 5 } }]);
    expect(r).toEqual({ added: 0, updated: 0, unchanged: 1, removed: 0 });
  });
  it('detects updated when properties change', async () => {
    await store.upsertAll([rec('a', 5)]);
    expect(await store.upsertAll([rec('a', 6)])).toMatchObject({ updated: 1, unchanged: 0 });
  });
  it('detects removed when a record disappears upstream', async () => {
    await store.upsertAll([rec('a', 5), rec('b', 4)]);
    expect(await store.upsertAll([rec('a', 5)])).toMatchObject({ removed: 1, unchanged: 1 });
  });
  it('persists across instances (list/get)', async () => {
    await store.upsertAll([rec('a', 5)]);
    const reopened = new RecordStore(TMP, (store as unknown as { file: string }).file.split(path.sep).slice(-2)[0]);
    expect(await reopened.get('a')).toMatchObject({ sourceRecordId: 'a', properties: { mag: 5 } });
    expect(await reopened.list()).toHaveLength(1);
  });
});

describe('recordToArticle (#685)', () => {
  it('projects to an Article with identifier, name, date, domain keywords', () => {
    const art = recordToArticle(
      { sourceRecordId: 'us1', fetchedAt: 'x', properties: { place: 'Ridgecrest', time: 1_700_000_000_000 } },
      quakeCfg
    );
    expect(art['@type']).toBe('Article');
    expect(art.identifier).toBe('usgs-quakes:us1');
    expect(art.name).toBe('Ridgecrest');
    expect(art['@id']).toBe('/feeds/usgs-quakes/us1');
    expect(art.keywords).toEqual(['Event']);
    expect(art['ngdp:category']).toBe('Event');
    expect(art.dateCreated).toBe(new Date(1_700_000_000_000).toISOString());
  });
  it('falls back to sourceId+id for name when no title-ish property', () => {
    const art = recordToArticle({ sourceRecordId: 'x', fetchedAt: 'x', properties: {} }, quakeCfg);
    expect(art.name).toBe('usgs-quakes x');
  });
});

describe('FeedManager (#685)', () => {
  it('builds one source per config and registers each with the catalog', async () => {
    const { fm } = await feedEngine(parseSourceConfigs({ a: { adapter: 'geojson', url: 'u', type: 'Event' } }, HOST.logger), TMP);
    const registered: string[] = [];
    expect(fm.registerSources({ registerSource: (s: FeedCatalogSource) => registered.push(s.sourceId) })).toBe(1);
    expect(registered).toEqual(['a']);
  });

  it('ingest() goes through the engine — URL source → shim → receiver → store — and the FeedCatalogSource lists the records', async () => {
    stubFetch(collection(feature('us1', 5.2, 'Ridgecrest', 1_700_000_000_000)));
    const { fm } = await feedEngine([{ ...quakeCfg, sourceId: 'q1' }], TMP);
    const result = await fm.ingest('q1', POLL_CTX);
    expect(result).toMatchObject({ added: 1 });
    expect(mockGuardedFetch).toHaveBeenCalledWith(quakeCfg.url, expect.objectContaining({ policy: expect.anything() }));

    // Source registered → list/get project to Articles
    const captured: FeedCatalogSource[] = [];
    fm.registerSources({ registerSource: (s) => captured.push(s) });
    const page = await captured[0].list({});
    expect(page.total).toBe(1);
    expect(page.items[0]['@type']).toBe('Article');
    expect(await captured[0].get('q1:us1')).not.toBeNull();
  });

  it('ingest() throws on unknown source', async () => {
    const { fm } = await feedEngine([], TMP);
    await expect(fm.ingest('nope', POLL_CTX)).rejects.toThrow(/unknown source/);
  });

  it('ingest() throws on an adapter no shim answers to', async () => {
    stubFetch('{}');
    const { fm } = await feedEngine([{ ...quakeCfg, sourceId: 'q2', adapter: 'nonesuch' }], TMP);
    await expect(fm.ingest('q2', POLL_CTX)).rejects.toThrow(/core\.nonesuch is not available/);
  });

  it('ingest() throws on a non-2xx fetch and leaves the store as it was', async () => {
    stubFetch(collection(feature('keep', 5, 'Kept', 1)));
    const { fm } = await feedEngine([{ ...quakeCfg, sourceId: 'q3' }], TMP);
    await fm.ingest('q3', POLL_CTX);
    stubFetch('{}', false, 503);
    await expect(fm.ingest('q3', POLL_CTX)).rejects.toThrow(/HTTP 503/);
    expect((await fm.getRecords('q3')).map(r => r.sourceRecordId)).toEqual(['keep']);
  });

  it('ingest() throws on a body its shim cannot read, and leaves the store as it was', async () => {
    stubFetch(collection(feature('keep', 5, 'Kept', 1)));
    const { fm } = await feedEngine([{ ...quakeCfg, sourceId: 'q4' }], TMP);
    await fm.ingest('q4', POLL_CTX);
    stubFetch('<html>maintenance</html>');
    await expect(fm.ingest('q4', POLL_CTX)).rejects.toThrow(/q4/);
    expect(await fm.getRecords('q4')).toHaveLength(1);
  });

  it('a feed shim can be switched off by the site (D6): its sources then fail', async () => {
    stubFetch(collection(feature('a', 1, 'x', 1)));
    const { fm } = await feedEngine([{ ...quakeCfg, sourceId: 'q5' }], TMP, { config: { 'ngdpbase.import.shims.core.geojson.enabled': false } });
    await expect(fm.ingest('q5', POLL_CTX)).rejects.toThrow(/core\.geojson is not available/);
  });
});

describe('FeedManager as the receiver feeds.items (#2109)', () => {
  it('registers only its receiver; the format shims are core\'s, any add-on\'s to use', async () => {
    const { im } = await feedEngine([], TMP);
    expect(im.listShims().filter(s => s.owner === 'feeds')).toEqual([]);
    expect(im.listShims().filter(s => s.produces === 'record').map(s => s.id))
      .toEqual(['core.geojson', 'core.rest-json', 'core.xml', 'core.csv', 'core.rss-atom', 'core.xml-index']);
  });

  it('checks its existing permission with the run\'s context (D5): refused, nothing is fetched or stored', async () => {
    stubFetch(collection(feature('a', 1, 'x', 1)));
    const { fm, permits } = await feedEngine([{ ...quakeCfg, sourceId: 'r1' }], TMP, { permit: () => false });
    await expect(fm.ingest('r1', POLL_CTX)).rejects.toThrow(/may not import into Feed items/);
    expect(permits).toHaveBeenCalledWith(expect.objectContaining({ username: POLL_CTX.username, job: FEED_POLL_JOB }), FEED_PERMISSION);
    expect(mockGuardedFetch).not.toHaveBeenCalled();
    expect(await fm.getRecords('r1')).toEqual([]);
  });

  it('is never offered for an upload, and an upload into it is refused', async () => {
    const { im } = await feedEngine([], TMP);
    const admin = { username: 'admin', roles: ['admin'], isAuthenticated: true } as never;
    expect((await im.receiversFor(admin)).map(r => r.id)).not.toContain('feeds.items');
    await expect(im.enqueueUpload({ source: { type: 'upload', files: [{ name: 'x.csv', bytes: Buffer.from('a\n1') }] }, receiver: 'feeds.items' }, admin))
      .rejects.toThrow(/takes no uploads/);
  });

  it('per-item duplicates: an unchanged item is skipped by the engine, yet stays in the store; a changed one is updated; a gone one removed', async () => {
    const { fm, im } = await feedEngine([{ ...quakeCfg, sourceId: 'd1' }], TMP);
    stubFetch(collection(feature('a', 5, 'Alpha', 1), feature('b', 4, 'Bravo', 2), feature('c', 3, 'Charlie', 3)));
    expect(await fm.ingest('d1', POLL_CTX)).toEqual({ added: 3, updated: 0, unchanged: 0, removed: 0 });

    stubFetch(collection(feature('a', 5, 'Alpha', 1), feature('b', 4.4, 'Bravo', 2)));
    expect(await fm.ingest('d1', POLL_CTX)).toEqual({ added: 0, updated: 1, unchanged: 1, removed: 1 });
    expect((await fm.getRecords('d1')).map(r => [r.sourceRecordId, r.properties.magnitude])).toEqual([['a', 5], ['b', 4.4]]);

    // The engine's report for the run: 'a' skipped as already seen, 'b' handed as changed.
    const [run] = im.importRunsFor(POLL_CTX);
    expect(run.files[0]).toMatchObject({ status: 'imported', stored: 1, duplicates: 1, chain: ['core.geojson'] });
  });

  it('an unchanged poll is a duplicate file to the engine and changes nothing in the store', async () => {
    const { fm, im } = await feedEngine([{ ...quakeCfg, sourceId: 'd2' }], TMP);
    stubFetch(collection(feature('a', 5, 'Alpha', 1)));
    await fm.ingest('d2', POLL_CTX);
    expect(await fm.ingest('d2', POLL_CTX)).toEqual({ added: 0, updated: 0, unchanged: 1, removed: 0 });
    expect(im.importRunsFor(POLL_CTX)[0].files[0]).toMatchObject({ status: 'duplicate', message: '0 added, 0 updated, 1 unchanged, 0 removed' });
  });

  it('an empty source empties the store, as an ingest always has', async () => {
    const { fm } = await feedEngine([{ ...quakeCfg, sourceId: 'd3' }], TMP);
    stubFetch(collection(feature('a', 5, 'Alpha', 1)));
    await fm.ingest('d3', POLL_CTX);
    stubFetch(collection());
    expect(await fm.ingest('d3', POLL_CTX)).toEqual({ added: 0, updated: 0, unchanged: 0, removed: 1 });
  });
});

describe('existing feed records carry over onto the engine (#2109)', () => {
  // Record stores written by the pre-#2109 adapters (generated from these same
  // bodies before the move), copied into a temp dir: the first fetch through
  // the engine must neither re-add nor drop anything.
  const FIXTURES = path.join(__dirname, '__fixtures__', 'pre-ice-stores');
  const BODIES: Record<string, string> = {
    'https://x.test/firms.csv': 'latitude,longitude,bright_ti4,acq_date,confidence\n64.4314,144.83386,330.28,2026-07-22,n\n-1.2,50.5,301.1,2026-07-22,h\n',
    'https://x.test/feed.rss': `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>Volcano News</title>
  <item><title>Etna erupts</title><link>https://x.test/a</link><guid isPermaLink="false">news-1</guid></item>
  <item><title>Kilauea update</title><link>https://x.test/b</link><guid>news-2</guid></item>
</channel></rss>`,
    'https://x.test/q.geojson': collection(
      { type: 'Feature', id: 'q1', properties: { mag: 5.1, place: 'Alaska', time: 1700000000000 }, geometry: { type: 'Point', coordinates: [1, 2, 10] } },
      { type: 'Feature', id: 'q2', properties: { mag: 6.3, place: 'Chile', time: 1700000100000 }, geometry: { type: 'Point', coordinates: [3, 4, 20] } }
    )
  };
  const SOURCES: FeedSourceConfig[] = [
    { sourceId: 'firms', adapter: 'csv', url: 'https://x.test/firms.csv', type: 'Event' },
    { sourceId: 'volcano-news', adapter: 'rss-atom', url: 'https://x.test/feed.rss', type: 'Event' },
    { sourceId: 'usgs-quakes', adapter: 'geojson', url: 'https://x.test/q.geojson', type: 'Event', recordIdField: 'id', map: { magnitude: 'properties.mag', place: 'properties.place', time: 'properties.time' } }
  ];
  type StoreFile = { records: Record<string, { record: { sourceRecordId: string; properties: unknown }; hash: string }> };

  for (const src of SOURCES) {
    it(`${src.adapter}: the first fetch on the engine finds every stored record unchanged — same ids, same hashes`, async () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'feeds-carry-'));
      try {
        cpSync(path.join(FIXTURES, src.sourceId), path.join(dir, src.sourceId), { recursive: true });
        const file = path.join(dir, src.sourceId, 'records.json');
        const before = JSON.parse(readFileSync(file, 'utf8')) as StoreFile;
        mockGuardedFetch.mockImplementation((u: string) => Promise.resolve({ status: 200, headers: {}, body: Buffer.from(BODIES[u]), finalUrl: u, chain: [u] }));

        const { fm } = await feedEngine([src], dir);
        const n = Object.keys(before.records).length;
        expect(await fm.ingest(src.sourceId, POLL_CTX)).toEqual({ added: 0, updated: 0, unchanged: n, removed: 0 });

        const after = JSON.parse(readFileSync(file, 'utf8')) as StoreFile;
        expect(Object.keys(after.records).sort()).toEqual(Object.keys(before.records).sort());
        for (const [id, entry] of Object.entries(before.records)) {
          expect(after.records[id].hash).toBe(entry.hash);
          expect(after.records[id].record.properties).toEqual(entry.record.properties);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

describe('FeedManager.startScheduler — the poll is a background job (#2109)', () => {
  function jobsStub() {
    const registered: Array<Parameters<FeedJobs['registerMaintenance']>[0]> = [];
    return { registered, jobs: { registerMaintenance: (spec: Parameters<FeedJobs['registerMaintenance']>[0]) => { registered.push(spec); } } };
  }

  it('registers the routine job feeds.poll, every minute, and no timer of its own', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const { fm } = await feedEngine([{ ...quakeCfg, sourceId: 'j1' }], TMP);
    const { jobs, registered } = jobsStub();
    fm.startScheduler(jobs);
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({ id: 'feeds.poll', everyMs: 60_000 });
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it('a job run fetches each due source with the job\'s context and a stated reason, end to end into the store', async () => {
    stubFetch(collection(feature('a', 5, 'Alpha', 1)));
    const { fm, permits } = await feedEngine([{ ...quakeCfg, sourceId: 'j2' }], TMP);
    const ingest = vi.spyOn(fm, 'ingest');
    const { jobs, registered } = jobsStub();
    fm.startScheduler(jobs);
    const summary = await registered[0].run(POLL_CTX as never);
    expect(summary).toBe('started j2');
    await vi.waitFor(async () => expect(await fm.getRecords('j2')).toHaveLength(1));
    expect(ingest).toHaveBeenCalledWith('j2', expect.objectContaining({
      username: POLL_CTX.username, job: 'feeds.poll', reason: "fetch feed 'j2' on its schedule (#2109)"
    }));
    expect(permits).toHaveBeenCalledWith(expect.objectContaining({ reason: "fetch feed 'j2' on its schedule (#2109)" }), FEED_PERMISSION);
    // Not due again within its interval.
    expect(await registered[0].run(POLL_CTX as never)).toBeUndefined();
  });

  it('after stopScheduler the job does nothing; with no sources none is registered', async () => {
    const { fm } = await feedEngine([{ ...quakeCfg, sourceId: 'j3' }], TMP);
    const { jobs, registered } = jobsStub();
    fm.startScheduler(jobs);
    fm.stopScheduler();
    expect(await registered[0].run(POLL_CTX as never)).toBe('feeds stopped');
    expect(mockGuardedFetch).not.toHaveBeenCalled();

    const empty = await feedEngine([], TMP);
    const none = jobsStub();
    empty.fm.startScheduler(none.jobs);
    expect(none.registered).toEqual([]);
  });
});

describe('FeedManager.toMarqueeText (#685 slice 5 — inline consumer)', () => {
  // A source with 3 quakes with ascending times → "latest first" must reverse.
  async function ingestedManager() {
    stubFetch(collection(
      feature('a', 5.0, 'Alpha', 1_700_000_000_000),
      feature('b', 4.5, 'Bravo', 1_700_000_500_000),
      feature('c', 4.1, 'Charlie', 1_700_000_900_000)
    ));
    const { fm } = await feedEngine([{ ...quakeCfg, sourceId: 'mq' }], TMP);
    await fm.ingest('mq', POLL_CTX);
    return fm;
  }

  it('returns latest-first record names joined, respecting max', async () => {
    const fm = await ingestedManager();
    expect(await fm.toMarqueeText({ source: 'mq', max: '2', sep: ' | ' })).toBe('Charlie | Bravo');
  });

  it('defaults max to 5 and uses the bullet separator', async () => {
    const fm = await ingestedManager();
    expect(await fm.toMarqueeText({ source: 'mq' })).toBe('Charlie   •   Bravo   •   Alpha');
  });

  it('returns empty string for an unknown / missing source', async () => {
    const fm = await ingestedManager();
    expect(await fm.toMarqueeText({ source: 'nope' })).toBe('');
    expect(await fm.toMarqueeText({})).toBe('');
  });

  it('end-to-end: MarqueePlugin fetch= renders feed data with NO new plugin', async () => {
    const fm = await ingestedManager();
    const ctx = { engine: { getManager: (n: string) => (n === 'FeedManager' ? fm : undefined) } };
    const out = await MarqueePlugin.execute(ctx, { fetch: 'FeedManager.toMarqueeText(source=mq,max=2)' });
    expect(out).toContain('Charlie');
    expect(out).toContain('Bravo');
    expect(out).not.toContain('Alpha'); // max=2
    expect(out).toContain('ngdp-mq'); // rendered the marquee wrapper, not an error span
  });
});
