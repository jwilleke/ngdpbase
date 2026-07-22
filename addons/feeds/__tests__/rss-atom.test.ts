/**
 * Unit tests for the rss-atom adapter (#913).
 *
 * @jest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rssAtomAdapter } from '../src/adapters/rss-atom';
import type { FeedSourceConfig } from '../src/types';

const base: FeedSourceConfig = { sourceId: 'vd', adapter: 'rss-atom', url: 'https://x.test/feed.rss', type: 'Event' };

afterEach(() => vi.unstubAllGlobals());
const stubText = (body: string, ok = true, status = 200) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status, statusText: 'x', text: async () => body })));

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>Volcano News</title>
  <item><title>Etna erupts</title><link>https://x.test/a</link><guid isPermaLink="false">news-1</guid></item>
  <item><title>Kilauea update</title><link>https://x.test/b</link><guid>news-2</guid></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <title>Quakes</title>
  <entry><title>M5.2</title><id>urn:evt:1</id><link href="https://x.test/e1"/></entry>
</feed>`;

describe('rssAtomAdapter (#913)', () => {
  it('fetch() locates RSS items at rss.channel.item', async () => {
    stubText(RSS);
    const items = await rssAtomAdapter.fetch(base);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: 'Etna erupts' });
  });

  it('fetch() locates Atom entries at feed.entry', async () => {
    stubText(ATOM);
    const items = await rssAtomAdapter.fetch(base);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'M5.2' });
  });

  it('fetch() coerces a single RSS item to a 1-element array', async () => {
    stubText('<rss><channel><item><title>only</title><guid>g1</guid></item></channel></rss>');
    expect(await rssAtomAdapter.fetch(base)).toHaveLength(1);
  });

  it('fetch() throws on non-ok', async () => {
    stubText('', false, 502);
    await expect(rssAtomAdapter.fetch(base)).rejects.toThrow(/502/);
  });

  it('parse() derives id from RSS guid (unwrapping the attribute object)', () => {
    // fast-xml-parser turns <guid isPermaLink="false">news-1</guid> into {'#text':'news-1','@isPermaLink':false}
    const raw = { title: 'Etna erupts', link: 'https://x.test/a', guid: { '#text': 'news-1', '@isPermaLink': false } };
    const r = rssAtomAdapter.parse(raw, base);
    expect(r).toMatchObject({ sourceRecordId: 'news-1', properties: { title: 'Etna erupts' } });
  });

  it('parse() derives id from Atom <id>, then falls back to link href', () => {
    expect(rssAtomAdapter.parse({ title: 'x', id: 'urn:evt:1' }, base)!.sourceRecordId).toBe('urn:evt:1');
    expect(rssAtomAdapter.parse({ title: 'x', link: { '@href': 'https://x.test/e1' } }, base)!.sourceRecordId).toBe('https://x.test/e1');
  });

  it('parse() honours recordIdField + map', () => {
    const cfg = { ...base, recordIdField: 'guid', map: { headline: 'title' } };
    const r = rssAtomAdapter.parse({ title: 'Etna', guid: 'news-9' }, cfg);
    expect(r).toMatchObject({ sourceRecordId: 'news-9', properties: { headline: 'Etna' } });
  });
});
