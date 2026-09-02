/**
 * Unit tests for per-source record shaping — dedupeBy + maxAgeHours (#989).
 *
 * @jest-environment node
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

import { shapeRecords } from '../src/dedupe';
import { parseSourceConfigs } from '../src/config';
import { FeedManager } from '../src/FeedManager';
import { recordDateIso } from '../src/normalize';
import type { NormalizedRecord, SourceAdapter } from '../src/adapters/types';
import type { FeedSourceConfig } from '../src/types';

// Temp store dir — os.tmpdir, NEVER ./data (live-data-destruction rule).
const TMP = mkdtempSync(path.join(os.tmpdir(), 'feeds-dedupe-test-'));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const NOW = Date.parse('2026-07-27T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const baseCfg: FeedSourceConfig = {
  sourceId: 'vaac', adapter: 'xml-index', url: 'https://example.test/index.html', type: 'Advisory'
};

/** A record with a group key and an `occurredAt` timestamp. */
const rec = (id: string, volcano: string | undefined, occurredAt?: string): NormalizedRecord => ({
  sourceRecordId: id,
  fetchedAt: new Date(NOW).toISOString(),
  properties: { ...(volcano !== undefined ? { volcanoName: volcano } : {}), ...(occurredAt ? { occurredAt } : {}) }
});

const ids = (r: NormalizedRecord[]) => r.map(x => x.sourceRecordId);


// #1133 — FeedManager resolves the egress policy per ingest and hands it to
// the adapter. It holds a ConfigReader, not a transport; these tests pass a
// reader that sets nothing, so the shipped egress defaults apply.
const NO_EGRESS_CONFIG = (_key: string, fallback?: unknown): unknown => fallback;

describe('shapeRecords — pass-through (#989)', () => {
  it('returns the input untouched when neither key is configured', () => {
    const input = [rec('a', 'Rainier', hoursAgo(1)), rec('b', 'Rainier', hoursAgo(2))];
    const out = shapeRecords(input, baseCfg, NOW);
    expect(out.records).toBe(input); // same reference — no copy, no work
    expect(out).toMatchObject({ droppedDuplicates: 0, droppedStale: 0 });
  });

  it('treats maxAgeHours <= 0 as unconfigured rather than dropping everything', () => {
    const input = [rec('a', 'Rainier', hoursAgo(500))];
    expect(shapeRecords(input, { ...baseCfg, maxAgeHours: 0 }, NOW).records).toHaveLength(1);
  });
});

describe('shapeRecords — dedupeBy (#989)', () => {
  const cfg = { ...baseCfg, dedupeBy: 'volcanoName' };

  it('keeps only the newest record per group key', () => {
    const out = shapeRecords([
      rec('r-old', 'Rainier', hoursAgo(10)),
      rec('r-new', 'Rainier', hoursAgo(1)),
      rec('s-only', 'Shasta', hoursAgo(5))
    ], cfg, NOW);

    expect(ids(out.records).sort()).toEqual(['r-new', 's-only']);
    expect(out.droppedDuplicates).toBe(1);
  });

  it('preserves the original relative order of survivors', () => {
    const out = shapeRecords([
      rec('shasta', 'Shasta', hoursAgo(5)),
      rec('rainier-old', 'Rainier', hoursAgo(9)),
      rec('rainier-new', 'Rainier', hoursAgo(1)),
      rec('hood', 'Hood', hoursAgo(3))
    ], cfg, NOW);

    expect(ids(out.records)).toEqual(['shasta', 'rainier-new', 'hood']);
  });

  it('never groups records that lack the key — a dedupeBy typo is a no-op, not a wipe', () => {
    const input = [rec('a', 'Rainier', hoursAgo(1)), rec('b', 'Shasta', hoursAgo(2)), rec('c', 'Hood', hoursAgo(3))];
    // 'volcano_name' does not exist on any record.
    const out = shapeRecords(input, { ...baseCfg, dedupeBy: 'volcano_name' }, NOW);
    expect(ids(out.records)).toEqual(['a', 'b', 'c']);
    expect(out.droppedDuplicates).toBe(0);
  });

  it('treats null and empty-string group values as ungrouped', () => {
    const withNull: NormalizedRecord = {
      sourceRecordId: 'n', fetchedAt: '', properties: { volcanoName: null, occurredAt: hoursAgo(1) }
    };
    const withEmpty: NormalizedRecord = {
      sourceRecordId: 'e', fetchedAt: '', properties: { volcanoName: '', occurredAt: hoursAgo(2) }
    };
    const out = shapeRecords([withNull, withEmpty], cfg, NOW);
    expect(ids(out.records)).toEqual(['n', 'e']);
  });

  it('does not group object- or array-valued keys — they would all stringify alike', () => {
    // String({}) === '[object Object]', so grouping these would merge unrelated
    // records into one bucket and delete the rest on the next poll.
    const objKey = (id: string, v: unknown, occurredAt: string): NormalizedRecord => ({
      sourceRecordId: id, fetchedAt: '', properties: { volcanoName: v, occurredAt }
    });
    const out = shapeRecords([
      objKey('a', { name: 'Rainier' }, hoursAgo(1)),
      objKey('b', { name: 'Shasta' }, hoursAgo(2)),
      objKey('c', ['Hood'], hoursAgo(3))
    ], cfg, NOW);

    expect(ids(out.records)).toEqual(['a', 'b', 'c']);
    expect(out.droppedDuplicates).toBe(0);
  });

  it('groups numeric and boolean keys, but never NaN', () => {
    const numKey = (id: string, v: unknown, occurredAt: string): NormalizedRecord => ({
      sourceRecordId: id, fetchedAt: '', properties: { volcanoName: v, occurredAt }
    });
    const out = shapeRecords([
      numKey('n-old', 42, hoursAgo(9)),
      numKey('n-new', 42, hoursAgo(1)),
      numKey('nan-1', NaN, hoursAgo(2)),
      numKey('nan-2', NaN, hoursAgo(3))
    ], cfg, NOW);

    expect(ids(out.records)).toEqual(['n-new', 'nan-1', 'nan-2']);
  });

  it('prefers a dated record over an undated one in the same group', () => {
    const out = shapeRecords([rec('undated', 'Rainier'), rec('dated', 'Rainier', hoursAgo(99))], cfg, NOW);
    expect(ids(out.records)).toEqual(['dated']);
  });

  it('keeps the first record when a whole group is undated — stable across polls', () => {
    const first = shapeRecords([rec('x', 'Rainier'), rec('y', 'Rainier')], cfg, NOW);
    const again = shapeRecords([rec('x', 'Rainier'), rec('y', 'Rainier')], cfg, NOW);
    expect(ids(first.records)).toEqual(['x']);
    expect(ids(again.records)).toEqual(ids(first.records));
  });

  it('ranks on dedupeDateField when the source names one', () => {
    const withIssued = (id: string, issued: string): NormalizedRecord => ({
      sourceRecordId: id, fetchedAt: '', properties: { volcanoName: 'Rainier', issuedAt: issued, occurredAt: hoursAgo(1) }
    });
    // occurredAt would pick 'a'; issuedAt must pick 'b'.
    const out = shapeRecords(
      [withIssued('a', hoursAgo(10)), withIssued('b', hoursAgo(2))],
      { ...cfg, dedupeDateField: 'issuedAt' },
      NOW
    );
    expect(ids(out.records)).toEqual(['b']);
  });
});

describe('shapeRecords — maxAgeHours (#989)', () => {
  it('discards records older than the window', () => {
    const out = shapeRecords([
      rec('fresh', 'Rainier', hoursAgo(2)),
      rec('stale', 'Shasta', hoursAgo(72))
    ], { ...baseCfg, maxAgeHours: 48 }, NOW);

    expect(ids(out.records)).toEqual(['fresh']);
    expect(out.droppedStale).toBe(1);
  });

  it('keeps undated records — unknown age is not evidence of staleness', () => {
    const out = shapeRecords([rec('undated', 'Rainier')], { ...baseCfg, maxAgeHours: 1 }, NOW);
    expect(ids(out.records)).toEqual(['undated']);
    expect(out.droppedStale).toBe(0);
  });

  it('applies without dedupeBy — a plain age filter is valid on its own', () => {
    const out = shapeRecords([
      rec('a', undefined, hoursAgo(1)),
      rec('b', undefined, hoursAgo(100))
    ], { ...baseCfg, maxAgeHours: 24 }, NOW);
    expect(ids(out.records)).toEqual(['a']);
  });

  it('runs after grouping — a group whose OWN latest is stale drops entirely', () => {
    // Rainier reissued 1h ago (survives); Shasta's newest is 72h old (drops).
    const out = shapeRecords([
      rec('r-old', 'Rainier', hoursAgo(80)),
      rec('r-new', 'Rainier', hoursAgo(1)),
      rec('s-old', 'Shasta', hoursAgo(90)),
      rec('s-new', 'Shasta', hoursAgo(72))
    ], { ...baseCfg, dedupeBy: 'volcanoName', maxAgeHours: 48 }, NOW);

    expect(ids(out.records)).toEqual(['r-new']);
    expect(out.droppedDuplicates).toBe(2);
    expect(out.droppedStale).toBe(1);
  });
});

describe('recordDateIso (#989) — one definition of "newest"', () => {
  it('falls back through the conventional chain', () => {
    const r: NormalizedRecord = { sourceRecordId: 'x', fetchedAt: '', properties: { pubDate: '2026-07-01T00:00:00Z' } };
    expect(recordDateIso(r)).toBe('2026-07-01T00:00:00.000Z');
  });

  it('accepts epoch milliseconds, as the catalog projection always has', () => {
    const r: NormalizedRecord = { sourceRecordId: 'x', fetchedAt: '', properties: { time: 1_700_000_000_000 } };
    expect(recordDateIso(r)).toBe('2023-11-14T22:13:20.000Z');
  });

  it('returns undefined rather than falling through when the first present field is unparseable', () => {
    const r: NormalizedRecord = { sourceRecordId: 'x', fetchedAt: '', properties: { occurredAt: 'not a date', time: 1_700_000_000_000 } };
    expect(recordDateIso(r)).toBeUndefined();
  });
});

describe('parseSourceConfigs — shaping + adapter keys (#989)', () => {
  it('carries dedupeBy, maxAgeHours and dedupeDateField through', () => {
    const [cfg] = parseSourceConfigs({
      vaac: { adapter: 'xml-index', url: 'u', type: 'Advisory', dedupeBy: 'volcanoName', maxAgeHours: 48, dedupeDateField: 'issuedAt' }
    });
    expect(cfg).toMatchObject({ dedupeBy: 'volcanoName', maxAgeHours: 48, dedupeDateField: 'issuedAt' });
  });

  it('rejects a non-positive or non-numeric maxAgeHours instead of coercing it', () => {
    for (const bad of [0, -1, 'soon', null, NaN]) {
      const [cfg] = parseSourceConfigs({ s: { adapter: 'geojson', url: 'u', type: 'Event', maxAgeHours: bad } });
      expect(cfg.maxAgeHours).toBeUndefined();
    }
  });

  it('ignores a blank dedupeBy', () => {
    const [cfg] = parseSourceConfigs({ s: { adapter: 'geojson', url: 'u', type: 'Event', dedupeBy: '   ' } });
    expect(cfg.dedupeBy).toBeUndefined();
  });

  it('carries the adapter keys that were previously dropped (linkPattern, maxItems, delimiter)', () => {
    const [cfg] = parseSourceConfigs({
      vaac: { adapter: 'xml-index', url: 'u', type: 'Advisory', linkPattern: 'xml_files/.*\\.xml$', maxItems: 25, delimiter: '\t' }
    });
    expect(cfg).toMatchObject({ linkPattern: 'xml_files/.*\\.xml$', maxItems: 25, delimiter: '\t' });
  });
});

describe('FeedManager.ingest — shaping is applied before the store (#989)', () => {
  it('stores only the newest record per group, so the store carries no duplicates', async () => {
    const raw = [
      { id: 'r-old', volcanoName: 'Rainier', occurredAt: hoursAgo(10) },
      { id: 'r-new', volcanoName: 'Rainier', occurredAt: hoursAgo(1) },
      { id: 's-1', volcanoName: 'Shasta', occurredAt: hoursAgo(2) }
    ];
    const adapter: SourceAdapter = {
      name: 'stub',
      fetch: async () => raw,
      parse: (r) => ({
        sourceRecordId: String(r.id),
        fetchedAt: new Date(NOW).toISOString(),
        properties: { volcanoName: r.volcanoName, occurredAt: r.occurredAt }
      })
    };

    const fm = new FeedManager(
      [{ sourceId: 'vaac-1', adapter: 'stub', url: 'u', type: 'Advisory', dedupeBy: 'volcanoName' }],
      TMP,
      NO_EGRESS_CONFIG,
      () => adapter
    );

    const result = await fm.ingest('vaac-1');
    expect(result.added).toBe(2);

    const captured: { sourceId: string; list: (o: object) => Promise<{ total: number }> }[] = [];
    fm.registerSources({ registerSource: s => captured.push(s) });
    expect((await captured[0].list({})).total).toBe(2);
  });
});
