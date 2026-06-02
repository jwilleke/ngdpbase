/**
 * Unit tests for the feeds addon skeleton (#685 slice 3).
 *
 * @jest-environment node
 */
import { parseSourceConfigs } from '../src/config';
import { FeedManager } from '../src/FeedManager';
import { FeedCatalogSource } from '../src/FeedCatalogSource';

const usgs = {
  adapter: 'geojson',
  url: 'https://example.test/quakes.geojson',
  type: 'Event',
  intervalMinutes: 60,
  recordIdField: 'id',
  map: { magnitude: 'properties.mag', bad: 123 }
};

describe('parseSourceConfigs (#685)', () => {
  it('parses a valid source and stamps the key as sourceId', () => {
    const out = parseSourceConfigs({ 'usgs-quakes': usgs });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      sourceId: 'usgs-quakes',
      adapter: 'geojson',
      url: 'https://example.test/quakes.geojson',
      type: 'Event',
      intervalMinutes: 60,
      recordIdField: 'id'
    });
  });

  it('keeps only string-valued map entries', () => {
    const out = parseSourceConfigs({ 'usgs-quakes': usgs });
    expect(out[0].map).toEqual({ magnitude: 'properties.mag' }); // numeric `bad` dropped
  });

  it('skips entries missing required adapter/url/type', () => {
    const out = parseSourceConfigs({
      good: { adapter: 'geojson', url: 'u', type: 'Event' },
      noUrl: { adapter: 'geojson', type: 'Event' },
      noAdapter: { url: 'u', type: 'Event' }
    });
    expect(out.map(s => s.sourceId)).toEqual(['good']);
  });

  it('returns [] for absent / non-object input', () => {
    expect(parseSourceConfigs(undefined)).toEqual([]);
    expect(parseSourceConfigs(null)).toEqual([]);
    expect(parseSourceConfigs([])).toEqual([]);
    expect(parseSourceConfigs('x')).toEqual([]);
  });
});

describe('FeedManager (#685 skeleton)', () => {
  it('builds one FeedCatalogSource per configured source', () => {
    const fm = new FeedManager(parseSourceConfigs({
      a: { adapter: 'geojson', url: 'u', type: 'Event' },
      b: { adapter: 'rest-json', url: 'u', type: 'NewsArticle' }
    }));
    expect(fm.getSourceIds().sort()).toEqual(['a', 'b']);
  });

  it('registers each source with the catalog registrar and returns the count', () => {
    const registered: string[] = [];
    const registrar = { registerSource: (s: FeedCatalogSource) => registered.push(s.sourceId) };
    const fm = new FeedManager(parseSourceConfigs({
      a: { adapter: 'geojson', url: 'u', type: 'Event' }
    }));
    const n = fm.registerSources(registrar);
    expect(n).toBe(1);
    expect(registered).toEqual(['a']);
  });

  it('registers nothing when no sources are configured (inert skeleton)', () => {
    const fm = new FeedManager(parseSourceConfigs({}));
    const registrar = { registerSource: () => { throw new Error('should not be called'); } };
    expect(fm.registerSources(registrar)).toBe(0);
    expect(fm.getSourceIds()).toEqual([]);
  });
});

describe('FeedCatalogSource (#685 skeleton — empty until slice 4)', () => {
  const src = new FeedCatalogSource({ sourceId: 'usgs-quakes', adapter: 'geojson', url: 'u', type: 'Event' });

  it('exposes sourceId, types and adapter from config', () => {
    expect(src.sourceId).toBe('usgs-quakes');
    expect(src.types).toEqual(['Event']);
    expect(src.adapter).toBe('geojson');
    expect(src.currentSchemaVersion).toBe(1);
  });

  it('list() returns an empty page', async () => {
    await expect(src.list({})).resolves.toEqual({ items: [], total: 0 });
  });

  it('get() returns null', async () => {
    await expect(src.get('anything')).resolves.toBeNull();
  });

  it('rebuild() resolves without error', async () => {
    await expect(src.rebuild()).resolves.toBeUndefined();
  });
});
