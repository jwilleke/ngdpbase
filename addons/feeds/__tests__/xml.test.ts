/**
 * Unit tests for the xml adapter (#685 slice 8 — fast-xml-parser dependency).
 *
 * @jest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { xmlAdapter } from '../src/adapters/xml';
import { getAdapter } from '../src/adapters/index';
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


const base: FeedSourceConfig = { sourceId: 'ash', adapter: 'xml', url: 'https://x.test/feed.xml', type: 'Event' };


describe('xmlAdapter (#685)', () => {
  it('is registered in the adapter registry', () => {
    expect(getAdapter('xml')).toBe(xmlAdapter);
  });

  it('fetch() locates repeated elements via itemsPath', async () => {
    const policy = stubFetch('<rss><channel><item><id>a</id></item><item><id>b</id></item></channel></rss>');
    const items = await xmlAdapter.fetch({ ...base, itemsPath: 'rss.channel.item' }, policy);
    expect(items).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('fetch() coerces a single element to a 1-item array', async () => {
    const policy = stubFetch('<rss><channel><item><id>only</id></item></channel></rss>');
    const items = await xmlAdapter.fetch({ ...base, itemsPath: 'rss.channel.item' }, policy);
    expect(items).toEqual([{ id: 'only' }]);
  });

  it('fetch() without itemsPath unwraps the root and envelope-detects', async () => {
    const policy = stubFetch('<feed><items><id>1</id></items><items><id>2</id></items></feed>');
    const items = await xmlAdapter.fetch(base, policy);
    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('fetch() returns [] when itemsPath resolves to nothing', async () => {
    const policy = stubFetch('<feed><meta>x</meta></feed>');
    expect(await xmlAdapter.fetch({ ...base, itemsPath: 'feed.nope' }, policy)).toEqual([]);
  });

  it('fetch() throws on non-ok', async () => {
    const policy = stubFetch('', false, 503);
    await expect(xmlAdapter.fetch(base, policy)).rejects.toThrow(/503/);
  });

  it('exposes attributes with the @ prefix and text under #text', async () => {
    const policy = stubFetch('<doc><adv id="A1"><link href="https://x.test/a1">Advisory A1</link></adv></doc>');
    const [item] = await xmlAdapter.fetch({ ...base, itemsPath: 'doc.adv' }, policy);
    expect(item['@id']).toBe('A1');
    expect((item.link as Record<string, unknown>)['@href']).toBe('https://x.test/a1');
    expect((item.link as Record<string, unknown>)['#text']).toBe('Advisory A1');
  });

  it('parse() maps fields via dot-paths incl. attributes (VAAC-ish shape)', () => {
    const raw = {
      '@id': 'BEZY-2026-045',
      volcano: { '#text': 'Bezymianny', '@code': '300250' },
      cloud: { altitude: 9144 }
    };
    const cfg = {
      ...base,
      recordIdField: '@id',
      map: { volcano: 'volcano.#text', gvpCode: 'volcano.@code', altitude_m: 'cloud.altitude' }
    };
    expect(xmlAdapter.parse(raw, cfg)).toMatchObject({
      sourceRecordId: 'BEZY-2026-045',
      properties: { volcano: 'Bezymianny', gvpCode: '300250', altitude_m: 9144 }
    });
  });

  it('parse() lifts the element itself when no map is set', () => {
    const r = xmlAdapter.parse({ id: 'e1', title: 'T' }, base);
    expect(r).toMatchObject({ sourceRecordId: 'e1', properties: { id: 'e1', title: 'T' } });
  });

  it('parse() returns null when no id resolves', () => {
    expect(xmlAdapter.parse({ title: 'no id' }, base)).toBeNull();
  });
});
