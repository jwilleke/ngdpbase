/**
 * #1947 / #1955 — a source's headers and timeoutMs reach guardedFetch from
 * every adapter, xml-index's item fetches included, and a source that sets
 * neither sends `{ policy }` alone, so guardedFetch's defaults (30 s, the site
 * User-Agent) are unchanged.
 *
 * @jest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adapterNames, getAdapter } from '../src/adapters';
import type { FeedSourceConfig } from '../src/types';

vi.mock('../../../dist/src/http/guardedFetch.js', () => ({ guardedFetch: vi.fn() }));
import { guardedFetch } from '../../../dist/src/http/guardedFetch.js';
import type { EgressPolicy } from '../../../dist/src/http/ssrf.js';

const mockGuardedFetch = vi.mocked(guardedFetch);
const POLICY = {} as EgressPolicy;

const URL_OF = 'https://x.test/feed';
const ITEM_URL = 'https://x.test/items/a.xml';

/** A body each adapter parses without error. */
const BODY: Record<string, string> = {
  geojson: '{"type":"FeatureCollection","features":[]}',
  'rest-json': '[]',
  xml: '<?xml version="1.0"?><doc><adv><id>1</id></adv></doc>',
  csv: 'id,name\n1,a\n',
  'rss-atom': '<?xml version="1.0"?><rss version="2.0"><channel><item><guid>1</guid><title>t</title></item></channel></rss>',
  'xml-index': '<a href="items/a.xml">a</a>'
};

beforeEach(() => {
  mockGuardedFetch.mockReset();
  mockGuardedFetch.mockImplementation((u: string) => {
    const adapter = (mockGuardedFetch as unknown as { currentAdapter: string }).currentAdapter;
    const body = u === ITEM_URL ? '<?xml version="1.0"?><advisory><id>a</id></advisory>' : BODY[adapter];
    return Promise.resolve({ status: 200, headers: {}, body: Buffer.from(body), finalUrl: u, chain: [u] });
  });
});

function cfgFor(adapter: string, over: Partial<FeedSourceConfig> = {}): FeedSourceConfig {
  (mockGuardedFetch as unknown as { currentAdapter: string }).currentAdapter = adapter;
  return {
    sourceId: 's', adapter, url: URL_OF, type: 'Event',
    ...(adapter === 'xml-index' ? { linkPattern: 'items/.*\\.xml$' } : {}),
    ...over
  };
}

describe('per-source request options reach guardedFetch (#1947, #1955)', () => {
  it('covers every registered adapter', () => {
    expect(adapterNames().sort()).toEqual(Object.keys(BODY).sort());
  });

  for (const name of Object.keys(BODY)) {
    it(`${name}: passes headers and timeoutMs on every fetch`, async () => {
      const headers = { 'User-Agent': 'geohazardwatch.com (ops@example.com)', Accept: 'application/geo+json' };
      await getAdapter(name)!.fetch(cfgFor(name, { headers, timeoutMs: 90_000 }), POLICY);

      const calls = mockGuardedFetch.mock.calls;
      expect(calls.length).toBe(name === 'xml-index' ? 2 : 1);
      for (const [, options] of calls) {
        expect(options).toEqual({ policy: POLICY, headers, timeoutMs: 90_000 });
      }
      if (name === 'xml-index') expect(calls[1][0]).toBe(ITEM_URL);
    });

    it(`${name}: sends only the policy when the source sets neither`, async () => {
      await getAdapter(name)!.fetch(cfgFor(name), POLICY);
      for (const [, options] of mockGuardedFetch.mock.calls) {
        expect(options).toEqual({ policy: POLICY });
      }
    });
  }
});
