/**
 * #1947 / #1955, through the import engine since #2109 — a source's headers
 * and timeoutMs reach guardedFetch on every fetch of every shim, xml-index's
 * item fetches included, and a source that sets neither sends only the
 * engine's own options, so guardedFetch's site defaults (the User-Agent) and
 * the engine's timeout apply.
 *
 * `guardedFetch` is mocked at the module the engine imports, so the real
 * ImportManager is what calls it here: the feeds add-on has no other way out.
 *
 * @jest-environment node
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shimNames } from '../src/shims/index';
import type { FeedSourceConfig } from '../src/types';
import { feedEngine, POLL_CTX } from './__fixtures__/feedEngine';

vi.mock('../../../dist/src/http/guardedFetch.js', () => ({ guardedFetch: vi.fn() }));
import { guardedFetch } from '../../../dist/src/http/guardedFetch.js';

const mockGuardedFetch = vi.mocked(guardedFetch);

// Temp store dir — os.tmpdir, NEVER ./data (live-data-destruction rule).
const TMP = mkdtempSync(path.join(os.tmpdir(), 'feeds-reqopts-'));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const URL_OF = 'https://x.test/feed';
const ITEM_URL = 'https://x.test/items/a.xml';

/** A body each shim reads without error. */
const BODY: Record<string, string> = {
  geojson: '{"type":"FeatureCollection","features":[]}',
  'rest-json': '[]',
  xml: '<?xml version="1.0"?><doc><adv><id>1</id></adv></doc>',
  csv: 'id,name\n1,a\n',
  'rss-atom': '<?xml version="1.0"?><rss version="2.0"><channel><item><guid>1</guid><title>t</title></item></channel></rss>',
  'xml-index': '<a href="items/a.xml">a</a>'
};

let current = '';
beforeEach(() => {
  mockGuardedFetch.mockReset();
  mockGuardedFetch.mockImplementation((u: string) => {
    const body = u === ITEM_URL ? '<?xml version="1.0"?><advisory><id>a</id></advisory>' : BODY[current];
    return Promise.resolve({ status: 200, headers: {}, body: Buffer.from(body), finalUrl: u, chain: [u] });
  });
});

function cfgFor(adapter: string, over: Partial<FeedSourceConfig> = {}): FeedSourceConfig {
  current = adapter;
  return {
    sourceId: `s-${adapter}`, adapter, url: URL_OF, type: 'Event',
    ...(adapter === 'xml-index' ? { linkPattern: 'items/.*\\.xml$' } : {}),
    ...over
  };
}

describe('per-source request options reach guardedFetch through the engine (#1947, #1955, #2109)', () => {
  it('covers every feeds shim', () => {
    expect(shimNames().sort()).toEqual(Object.keys(BODY).sort());
  });

  for (const name of Object.keys(BODY)) {
    it(`${name}: passes headers and timeoutMs on every fetch`, async () => {
      const headers = { 'User-Agent': 'geohazardwatch.com (ops@example.com)', Accept: 'application/geo+json' };
      const cfg = cfgFor(name, { headers, timeoutMs: 90_000 });
      const { fm } = await feedEngine([cfg], TMP);
      await fm.ingest(cfg.sourceId, POLL_CTX);

      const calls = mockGuardedFetch.mock.calls;
      expect(calls.length).toBe(name === 'xml-index' ? 2 : 1);
      for (const [, options] of calls) {
        expect(options).toMatchObject({ headers, timeoutMs: 90_000 });
        expect(options.policy).toBeDefined();
      }
      if (name === 'xml-index') expect(calls[1][0]).toBe(ITEM_URL);
    });

    it(`${name}: sends no headers and the engine's timeout when the source sets neither`, async () => {
      const cfg = cfgFor(name);
      const { fm } = await feedEngine([cfg], TMP);
      await fm.ingest(cfg.sourceId, POLL_CTX);
      for (const [, options] of mockGuardedFetch.mock.calls) {
        expect(options.headers).toBeUndefined();
        expect(options.timeoutMs).toBe(30_000);
      }
    });
  }
});
