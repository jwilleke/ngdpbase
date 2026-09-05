/**
 * #1187 — a feed ingest refuses a private address for real.
 *
 * `FeedManager.test.ts` and every adapter test mock `guardedFetch` to test
 * parsing; that mock always succeeds and proves nothing about the boundary.
 * This file does NOT mock `guardedFetch`. It mocks what lies beneath — the
 * `request` functions of `node:http` / `node:https`, the only way
 * `guardedFetch` reaches a socket — and records every call. A refused source
 * must produce no call; an allowed one exactly one.
 *
 * The policy is resolved from the manager's own `ConfigReader` per ingest and
 * handed to the adapter, as production does. Sabotage that hand-off — pass a
 * permissive literal, or `{}` — and the RFC1918 case reaches the socket and
 * goes red. Link-local would still be refused, being mechanism rather than
 * policy, which is why both cases are here.
 */
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FeedManager } from '../src/FeedManager';
import type { FeedSourceConfig } from '../src/types';
import { ALLOWED_RANGES_KEY } from '../../../dist/src/http/egressPolicy.js';
import { REFUSAL } from '../../../dist/src/http/ssrf.js';

const witness = vi.hoisted(() => ({ requests: [] as string[] }));

function fakeRequest(url: unknown): EventEmitter & { end: () => void; destroy: () => void } {
  witness.requests.push(String(url));
  const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
  req.end = () => { process.nextTick(() => req.emit('error', new Error('socket witness: no network in tests'))); };
  req.destroy = () => undefined;
  return req;
}

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return { ...actual, request: vi.fn(fakeRequest), default: { ...actual, request: vi.fn(fakeRequest) } };
});
vi.mock('node:https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:https')>();
  return { ...actual, request: vi.fn(fakeRequest), default: { ...actual, request: vi.fn(fakeRequest) } };
});

// Temp store dir — os.tmpdir, NEVER ./data.
const TMP = mkdtempSync(path.join(os.tmpdir(), 'feeds-egress-'));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const source = (sourceId: string, url: string): FeedSourceConfig => ({
  sourceId, adapter: 'geojson', url, type: 'Event', recordIdField: 'id', map: { magnitude: 'properties.mag' }
});

function readerWith(allowed: () => string[]) {
  return (key: string, fallback?: unknown): unknown => (key === ALLOWED_RANGES_KEY ? allowed() : fallback);
}

beforeEach(() => {
  witness.requests.length = 0;
});

describe('#1187 — ingest through the real guardedFetch', () => {
  test('a link-local feed URL is refused before any socket', async () => {
    const fm = new FeedManager([source('meta', 'http://169.254.169.254/latest/meta-data')], TMP, readerWith(() => []));
    await expect(fm.ingest('meta')).rejects.toThrow(REFUSAL);
    expect(witness.requests).toEqual([]);
  });

  test('an RFC1918 feed URL is refused under the shipped policy', async () => {
    const fm = new FeedManager([source('lan', 'http://10.0.0.5/feed.geojson')], TMP, readerWith(() => []));
    await expect(fm.ingest('lan')).rejects.toThrow(REFUSAL);
    expect(witness.requests).toEqual([]);
  });

  test('a .local name is refused before resolution', async () => {
    const fm = new FeedManager([source('mdns', 'http://sensor.local/feed.geojson')], TMP, readerWith(() => []));
    await expect(fm.ingest('mdns')).rejects.toThrow(REFUSAL);
    expect(witness.requests).toEqual([]);
  });

  test('the same RFC1918 feed is fetched once its prefix is allowed — and the policy is read per ingest', async () => {
    let allowed: string[] = [];
    const fm = new FeedManager([source('lan', 'http://10.0.0.5/feed.geojson')], TMP, readerWith(() => allowed));

    await expect(fm.ingest('lan')).rejects.toThrow(REFUSAL);
    expect(witness.requests).toEqual([]);

    allowed = ['10.0.0.0/8'];
    // The witness fails every request, so ingest still rejects — with the
    // witness's error, not the guard's. The request was made, to the URL.
    await expect(fm.ingest('lan')).rejects.toThrow('socket witness');
    expect(witness.requests).toEqual(['http://10.0.0.5/feed.geojson']);

    allowed = [];
    await expect(fm.ingest('lan')).rejects.toThrow(REFUSAL);
    expect(witness.requests).toHaveLength(1);
  });

  test('a public feed URL reaches the request step', async () => {
    const fm = new FeedManager([source('pub', 'https://feeds.example/q.geojson')], TMP, readerWith(() => []));
    await expect(fm.ingest('pub')).rejects.toThrow('socket witness');
    expect(witness.requests).toEqual(['https://feeds.example/q.geojson']);
  });
});
