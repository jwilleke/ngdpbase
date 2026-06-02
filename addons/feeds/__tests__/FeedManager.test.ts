/**
 * Unit tests for the feeds addon (#685 slices 3–4).
 *
 * @jest-environment node
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

import { parseSourceConfigs } from '../src/config';
import { FeedManager } from '../src/FeedManager';
import { FeedCatalogSource } from '../src/FeedCatalogSource';
import { RecordStore } from '../src/RecordStore';
import { getByPath } from '../src/adapters/dotpath';
import { geojsonAdapter } from '../src/adapters/geojson';
import { recordToArticle } from '../src/normalize';
import type { SourceAdapter } from '../src/adapters/types';
import type { FeedSourceConfig } from '../src/types';

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

describe('parseSourceConfigs (#685)', () => {
  it('parses a valid source and stamps the key as sourceId', () => {
    const out = parseSourceConfigs({ 'usgs-quakes': { adapter: 'geojson', url: 'u', type: 'Event', intervalMinutes: 60 } });
    expect(out[0]).toMatchObject({ sourceId: 'usgs-quakes', adapter: 'geojson', url: 'u', type: 'Event', intervalMinutes: 60 });
  });
  it('keeps only string-valued map entries', () => {
    const out = parseSourceConfigs({ s: { adapter: 'geojson', url: 'u', type: 'Event', map: { a: 'x.y', bad: 1 } } });
    expect(out[0].map).toEqual({ a: 'x.y' });
  });
  it('skips entries missing required adapter/url/type', () => {
    const out = parseSourceConfigs({ good: { adapter: 'geojson', url: 'u', type: 'Event' }, bad: { adapter: 'geojson' } });
    expect(out.map(s => s.sourceId)).toEqual(['good']);
  });
  it('returns [] for absent / non-object input', () => {
    expect(parseSourceConfigs(undefined)).toEqual([]);
    expect(parseSourceConfigs([])).toEqual([]);
  });
  it('defaults schemaType to Article when absent', () => {
    expect(parseSourceConfigs({ s: { adapter: 'geojson', url: 'u', type: 'Event' } })[0].schemaType).toBe('Article');
  });
  it('accepts an explicit supported schemaType', () => {
    expect(parseSourceConfigs({ s: { adapter: 'geojson', url: 'u', type: 'Event', schemaType: 'Article' } })[0].schemaType).toBe('Article');
  });
  it('skips a source whose schemaType is not yet implemented', () => {
    const out = parseSourceConfigs({
      ok: { adapter: 'geojson', url: 'u', type: 'Event' },
      img: { adapter: 'geojson', url: 'u', type: 'Image', schemaType: 'ImageObject' }
    });
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

describe('geojsonAdapter.parse (#685)', () => {
  it('maps via config dot-paths and uses recordIdField', () => {
    const rec = geojsonAdapter.parse(feature('us1', 5.2, 'Ridgecrest', 1_700_000_000_000), quakeCfg);
    expect(rec).not.toBeNull();
    expect(rec!.sourceRecordId).toBe('us1');
    expect(rec!.properties).toEqual({ magnitude: 5.2, place: 'Ridgecrest', time: 1_700_000_000_000 });
  });
  it('lifts feature.properties when no map is configured', () => {
    const cfg = { ...quakeCfg, map: undefined };
    const rec = geojsonAdapter.parse(feature('us2', 4.8, 'Aleutians', 1), cfg);
    expect(rec!.properties).toMatchObject({ mag: 4.8, place: 'Aleutians' });
  });
  it('returns null when no id resolves', () => {
    expect(geojsonAdapter.parse({ properties: {} }, quakeCfg)).toBeNull();
  });

  it('fetch() reads a FeatureCollection (stubbed global fetch)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature('a', 1, 'x', 1)] })
    })));
    const raw = await geojsonAdapter.fetch(quakeCfg);
    expect(raw).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('fetch() throws on non-ok HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, statusText: 'down', json: async () => ({}) })));
    await expect(geojsonAdapter.fetch(quakeCfg)).rejects.toThrow(/503/);
    vi.unstubAllGlobals();
  });
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
  it('builds one source per config and registers each with the catalog', () => {
    const fm = new FeedManager(parseSourceConfigs({ a: { adapter: 'geojson', url: 'u', type: 'Event' } }), TMP);
    const registered: string[] = [];
    expect(fm.registerSources({ registerSource: (s: FeedCatalogSource) => registered.push(s.sourceId) })).toBe(1);
    expect(registered).toEqual(['a']);
  });

  it('ingest() runs adapter → store and the FeedCatalogSource then lists the records', async () => {
    const fakeAdapter: SourceAdapter = {
      name: 'geojson',
      fetch: async () => [feature('us1', 5.2, 'Ridgecrest', 1_700_000_000_000)],
      parse: (raw, cfg) => geojsonAdapter.parse(raw, cfg)
    };
    const fm = new FeedManager(
      [{ ...quakeCfg, sourceId: 'q1' }],
      TMP,
      () => fakeAdapter
    );
    const result = await fm.ingest('q1');
    expect(result).toMatchObject({ added: 1 });

    // Source registered → list/get project to Articles
    const captured: FeedCatalogSource[] = [];
    fm.registerSources({ registerSource: (s) => captured.push(s) });
    const page = await captured[0].list({});
    expect(page.total).toBe(1);
    expect(page.items[0]['@type']).toBe('Article');
    expect(await captured[0].get('q1:us1')).not.toBeNull();
  });

  it('ingest() throws on unknown source', async () => {
    const fm = new FeedManager([], TMP);
    await expect(fm.ingest('nope')).rejects.toThrow(/unknown source/);
  });

  it('ingest() throws on unknown adapter', async () => {
    const fm = new FeedManager([{ ...quakeCfg, sourceId: 'q2', adapter: 'nonesuch' }], TMP, () => null);
    await expect(fm.ingest('q2')).rejects.toThrow(/unknown adapter/);
  });
});
