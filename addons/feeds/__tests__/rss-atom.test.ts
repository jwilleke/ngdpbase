/**
 * Unit tests for the rss-atom shim (#913; a shim since #2109).
 *
 * @jest-environment node
 */
import { describe, expect, it } from 'vitest';
import { rssAtomShim, rssAtomItems, rssAtomRecord } from '../src/shims/rss-atom';
import { readShim, recordsOf } from './__fixtures__/feedEngine';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>Volcano News</title>
  <item><title>Etna erupts</title><link>https://x.test/a</link><guid isPermaLink="false">news-1</guid></item>
  <item><title>Kilauea update</title><link>https://x.test/b</link><guid>news-2</guid></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <title>Quakes</title>
  <entry><title>M5.2</title><id>urn:evt:1</id><link href="https://x.test/e1"/></entry>
</feed>`;

describe('rssAtomShim (#913, #2109)', () => {
  it('locates RSS items at rss.channel.item', () => {
    const items = rssAtomItems(RSS, undefined);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: 'Etna erupts' });
  });

  it('locates Atom entries at feed.entry', () => {
    const items = rssAtomItems(ATOM, undefined);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'M5.2' });
  });

  it('coerces a single RSS item to a 1-element array', () => {
    expect(rssAtomItems('<rss><channel><item><title>only</title><guid>g1</guid></item></channel></rss>', undefined)).toHaveLength(1);
  });

  it('reads an RSS feed into record items with per-item keys', async () => {
    const result = await readShim(rssAtomShim, RSS);
    expect(recordsOf(result).map(r => r.id)).toEqual(['news-1', 'news-2']);
    expect(result.items.every(i => i.kind === 'record' && typeof i.itemKey === 'string' && i.itemKey.startsWith(`${(i.data as { id: string }).id}#`))).toBe(true);
    expect(rssAtomShim.duplicates).toBe('item');
  });

  it('derives id from RSS guid (unwrapping the attribute object)', () => {
    // fast-xml-parser turns <guid isPermaLink="false">news-1</guid> into {'#text':'news-1','@isPermaLink':false}
    const raw = { title: 'Etna erupts', link: 'https://x.test/a', guid: { '#text': 'news-1', '@isPermaLink': false } };
    expect(rssAtomRecord(raw, {})).toMatchObject({ id: 'news-1', properties: { title: 'Etna erupts' } });
  });

  it('derives id from Atom <id>, then falls back to link href', () => {
    expect(rssAtomRecord({ title: 'x', id: 'urn:evt:1' }, {})!.id).toBe('urn:evt:1');
    expect(rssAtomRecord({ title: 'x', link: { '@href': 'https://x.test/e1' } }, {})!.id).toBe('https://x.test/e1');
  });

  it('honours recordIdField + map', () => {
    expect(rssAtomRecord({ title: 'Etna', guid: 'news-9' }, { recordIdField: 'guid', map: { headline: 'title' } }))
      .toEqual({ id: 'news-9', properties: { headline: 'Etna' } });
  });
});
