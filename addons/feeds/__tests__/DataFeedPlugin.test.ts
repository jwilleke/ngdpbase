/**
 * Unit tests for the [DataFeed] plugin (#685 slice 7).
 *
 * @jest-environment node
 */
import { describe, expect, it } from 'vitest';
import DataFeedPlugin from '../src/DataFeedPlugin';
import type { NormalizedRecord } from '../src/adapters/types';

const recs: NormalizedRecord[] = [
  { sourceRecordId: 'a', fetchedAt: 'x', properties: { place: 'Ridgecrest', magnitude: 5.2 } },
  { sourceRecordId: 'b', fetchedAt: 'x', properties: { place: 'Aleutians', magnitude: 4.8 } },
  { sourceRecordId: 'c', fetchedAt: 'x', properties: { place: 'Hawaii', magnitude: 6.1 } }
];

const ctxWith = (records: NormalizedRecord[]) => ({
  engine: { getManager: (n: string) => (n === 'FeedManager' ? { getRecords: async () => records } : undefined) }
}) as never;

const exec = (params: Record<string, unknown>, records = recs) =>
  DataFeedPlugin.execute!(ctxWith(records), params as never) as Promise<string>;

describe('[DataFeed] plugin (#685)', () => {
  it('errors when source is missing', async () => {
    expect(await exec({})).toContain('source is required');
  });

  it('errors when the feeds addon / FeedManager is absent', async () => {
    const ctx = { engine: { getManager: () => undefined } } as never;
    const out = await DataFeedPlugin.execute!(ctx, { source: 'x' } as never);
    expect(out).toContain('not available');
  });

  it('reports an empty source', async () => {
    expect(await exec({ source: 'q' }, [])).toContain('no records for feed');
  });

  it('renders a table with default columns (union of property keys)', async () => {
    const out = await exec({ source: 'q' });
    expect(out).toContain('<table');
    expect(out).toContain('<th>place</th>');
    expect(out).toContain('<th>magnitude</th>');
    expect(out).toContain('Ridgecrest');
    expect(out).toContain('6.1');
  });

  it('honours an explicit columns list', async () => {
    const out = await exec({ source: 'q', columns: 'place' });
    expect(out).toContain('<th>place</th>');
    expect(out).not.toContain('<th>magnitude</th>');
  });

  it('sorts by a column descending', async () => {
    const out = await exec({ source: 'q', columns: 'place,magnitude', sort: 'magnitude-desc' });
    expect(out.indexOf('Hawaii')).toBeLessThan(out.indexOf('Ridgecrest')); // 6.1 before 5.2
    expect(out.indexOf('Ridgecrest')).toBeLessThan(out.indexOf('Aleutians')); // 5.2 before 4.8
  });

  it('applies max', async () => {
    const out = await exec({ source: 'q', columns: 'place,magnitude', sort: 'magnitude-desc', max: '1' });
    expect(out).toContain('Hawaii');
    expect(out).not.toContain('Aleutians');
  });

  it('renders a list when format=list (name via recordName)', async () => {
    const out = await exec({ source: 'q', format: 'list' });
    expect(out).toContain('<ul class="feed-list">');
    expect(out).toContain('<li>Ridgecrest</li>');
  });

  it('escapes cell values (no raw HTML injection)', async () => {
    const out = await exec({ source: 'q', columns: 'place' }, [
      { sourceRecordId: 'x', fetchedAt: 'x', properties: { place: '<b>xss</b>' } }
    ]);
    expect(out).toContain('&lt;b&gt;xss&lt;/b&gt;');
    expect(out).not.toContain('<b>xss</b>');
  });

  const vona: NormalizedRecord[] = [
    { sourceRecordId: 'v1', fetchedAt: 'x', properties: { volcano: 'Kilauea', color: 'YELLOW', gvp: '332010' } },
    { sourceRecordId: 'v2', fetchedAt: 'x', properties: { volcano: 'Great Sitkin', color: 'ORANGE', gvp: '311120' } }
  ];

  it('badge= wraps listed columns in value-classed pills', async () => {
    const out = await exec({ source: 'q', columns: 'volcano,color', badge: 'color' }, vona);
    expect(out).toContain('<span class="feed-badge feed-badge--yellow">YELLOW</span>');
    expect(out).toContain('<span class="feed-badge feed-badge--orange">ORANGE</span>');
    expect(out).not.toContain('feed-badge feed-badge--kilauea'); // unlisted column untouched
  });

  it('badge= slugs multi-word values and escapes the text', async () => {
    const out = await exec({ source: 'q', columns: 'color', badge: 'color' }, [
      { sourceRecordId: 'x', fetchedAt: 'x', properties: { color: 'NOT <SET>' } }
    ]);
    expect(out).toContain('feed-badge--not-set');
    expect(out).toContain('NOT &lt;SET&gt;');
  });

  it('link= renders the column as an anchor from a :prop template (token-safe, no braces)', async () => {
    const out = await exec(
      { source: 'q', columns: 'volcano,color', link: 'volcano=https://volcano.si.edu/volcano.cfm?vn=:gvp' },
      vona
    );
    expect(out).toContain('<a href="https://volcano.si.edu/volcano.cfm?vn=332010" target="_blank" rel="noopener noreferrer">Kilauea</a>');
    expect(out).toContain('vn=311120');
  });

  it('link= does not treat the URL scheme colon as a placeholder', async () => {
    const out = await exec(
      { source: 'q', columns: 'volcano', link: 'volcano=https://x.test/v/:gvp' },
      vona
    );
    expect(out).toContain('href="https://x.test/v/332010"');
  });

  it('link= leaves the cell plain when a placeholder is unresolvable', async () => {
    const out = await exec(
      { source: 'q', columns: 'volcano', link: 'volcano=https://x.test/:missing' },
      vona
    );
    expect(out).not.toContain('<a ');
    expect(out).toContain('Kilauea');
  });

  it('#922: a bare :prop template uses a full-URL property verbatim (no double-encode)', async () => {
    const r = [{ sourceRecordId: 'a', fetchedAt: 'x', properties: { title: 'Etna', link: 'https://www.volcanodiscovery.com/volcanoes/today.html' } }];
    const out = await exec({ source: 'q', columns: 'title', link: 'title=:link' }, r);
    expect(out).toContain('<a href="https://www.volcanodiscovery.com/volcanoes/today.html" target="_blank" rel="noopener noreferrer">Etna</a>');
    expect(out).not.toContain('https%3A%2F%2F'); // not percent-encoded into a relative path
  });

  it('#922: an embedded :prop is still segment-encoded', async () => {
    const r = [{ sourceRecordId: 'a', fetchedAt: 'x', properties: { gvp: '123 456' } }];
    const out = await exec({ source: 'q', columns: 'gvp', link: 'gvp=https://x.test/v?vn=:gvp' }, r);
    expect(out).toContain('vn=123%20456');
  });

  it('#922: a bare :prop rejects an unsafe scheme (no javascript: href)', async () => {
    const r = [{ sourceRecordId: 'a', fetchedAt: 'x', properties: { title: 'X', link: 'javascript:alert(1)' } }];
    const out = await exec({ source: 'q', columns: 'title', link: 'title=:link' }, r);
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('<a '); // no link emitted at all
  });

  it('#922: a bare :prop with a missing value stays plain text', async () => {
    const r = [{ sourceRecordId: 'a', fetchedAt: 'x', properties: { title: 'X' } }];
    const out = await exec({ source: 'q', columns: 'title', link: 'title=:link' }, r);
    expect(out).not.toContain('<a ');
    expect(out).toContain('X');
  });

  it('badge and link compose (linked pill)', async () => {
    const out = await exec(
      { source: 'q', columns: 'color', badge: 'color', link: 'color=https://x.test/:gvp' },
      vona
    );
    expect(out).toContain('<a href="https://x.test/332010" target="_blank" rel="noopener noreferrer"><span class="feed-badge feed-badge--yellow">YELLOW</span></a>');
  });

  const hotspots: NormalizedRecord[] = [
    { sourceRecordId: 'h1', fetchedAt: 'x', properties: { latitude: 44.789, longitude: -1.225, frp: 65.2, confidence: 'h' } },
    { sourceRecordId: 'h2', fetchedAt: 'x', properties: { latitude: 68.615, longitude: 156.989, frp: 12.1, confidence: 'n' } },
    { sourceRecordId: 'h3', fetchedAt: 'x', properties: { latitude: 'not-a-number', longitude: -1.0, frp: 5, confidence: 'l' } }
  ];

  it('format=map renders a Leaflet container, vendored assets, and one point per valid record (geohazardwatch#162)', async () => {
    const out = await exec({ source: 'q', format: 'map', columns: 'frp,confidence' }, hotspots);
    expect(out).toContain('<div id="datafeed-map-');
    expect(out).toContain('/addons/feeds/vendor/leaflet/leaflet.css');
    expect(out).toContain('/addons/feeds/vendor/leaflet/leaflet.js');
    expect(out).toContain('"lat":44.789');
    expect(out).toContain('"lat":68.615');
  });

  it('format=map skips records with a non-numeric or missing lat/lon', async () => {
    const out = await exec({ source: 'q', format: 'map' }, hotspots);
    // h3 (invalid latitude) must be dropped — only h1 and h2 are mappable.
    expect(out.match(/"radius":/g)).toHaveLength(2);
  });

  it('format=map reports no mappable records rather than an empty map when all lat/lon are invalid', async () => {
    const out = await exec(
      { source: 'q', format: 'map' },
      [{ sourceRecordId: 'x', fetchedAt: 'x', properties: { latitude: 'nope', longitude: 'nope' } }]
    );
    expect(out).toContain('no mappable records');
  });

  it('format=map defaults lat/lon column names to latitude/longitude', async () => {
    const out = await exec({ source: 'q', format: 'map' }, hotspots);
    expect(out).toContain('"lat":44.789,"lon":-1.225');
  });

  it('format=map honours custom lat/lon column names', async () => {
    const custom = [{ sourceRecordId: 'x', fetchedAt: 'x', properties: { y: 10, x: 20 } }];
    const out = await exec({ source: 'q', format: 'map', lat: 'y', lon: 'x' }, custom);
    expect(out).toContain('"lat":10,"lon":20');
  });

  it('format=map sizeBy scales marker radius between records, largest FRP gets the largest radius', async () => {
    const out = await exec({ source: 'q', format: 'map', sizeBy: 'frp' }, hotspots);
    // h1 (frp 65.2, the max among valid points) should get max radius (20);
    // h2 (frp 12.1, the min among valid points) should get min radius (4).
    expect(out).toMatch(/"lat":44\.789,"lon":-1\.225,"radius":20/);
    expect(out).toMatch(/"lat":68\.615,"lon":156\.989,"radius":4/);
  });

  it('format=map without sizeBy uses a fixed radius for every point', async () => {
    const out = await exec({ source: 'q', format: 'map' }, hotspots);
    expect(out).toMatch(/"radius":6.*"radius":6/s);
  });

  it('format=map popup content is drawn from columns= and HTML-escaped', async () => {
    const xss = [{ sourceRecordId: 'x', fetchedAt: 'x', properties: { latitude: 1, longitude: 2, note: '<script>alert(1)</script>' } }];
    const out = await exec({ source: 'q', format: 'map', columns: 'note' }, xss);
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script');
    expect(out).not.toContain('<script>alert(1)</script>');
  });

  it('format=map defaults max to 500 (higher than table/list default of 20)', async () => {
    const many = Array.from({ length: 30 }, (_, i) => (
      { sourceRecordId: `p${i}`, fetchedAt: 'x', properties: { latitude: i, longitude: i } }
    ));
    const out = await exec({ source: 'q', format: 'map' }, many);
    expect(out).toContain('"lat":29,"lon":29'); // the 30th point survived — table/list's max=20 would have dropped it
  });

  it('format=map respects an explicit max override', async () => {
    const many = Array.from({ length: 30 }, (_, i) => (
      { sourceRecordId: `p${i}`, fetchedAt: 'x', properties: { latitude: i, longitude: i } }
    ));
    const out = await exec({ source: 'q', format: 'map', max: '5', sort: 'latitude-asc' }, many);
    expect(out).toContain('"lat":4,"lon":4');
    expect(out).not.toContain('"lat":5,"lon":5');
  });
});
