/**
 * Config parse of the per-source request options (#1947 headers / userAgent,
 * #1955 timeoutMs) and the addon-wide settings that bound them.
 *
 * @jest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import logger from '../../../dist/src/utils/logger.js';
import { FEED_SETTING_DEFAULTS, parseSourceConfigs, readFeedSettings } from '../src/config';

const src = (over: Record<string, unknown>) => ({ s: { adapter: 'geojson', url: 'u', type: 'Event', ...over } });
const warnings = () => vi.mocked(logger.warn).mock.calls.map(([m]) => String(m));

afterEach(() => vi.restoreAllMocks());

describe('parseSourceConfigs — headers and userAgent (#1947)', () => {
  it('carries a headers map and folds userAgent in as User-Agent', () => {
    const [cfg] = parseSourceConfigs(src({ headers: { Accept: 'application/geo+json' }, userAgent: 'geohazardwatch.com (ops@example.com)' }), logger);
    expect(cfg.headers).toEqual({ Accept: 'application/geo+json', 'User-Agent': 'geohazardwatch.com (ops@example.com)' });
  });

  it('lets userAgent replace a User-Agent in headers, whatever its case', () => {
    const [cfg] = parseSourceConfigs(src({ headers: { 'user-agent': 'old' }, userAgent: 'new' }), logger);
    expect(cfg.headers).toEqual({ 'User-Agent': 'new' });
  });

  it('sets no headers when the source names none', () => {
    expect(parseSourceConfigs(src({}), logger)[0].headers).toBeUndefined();
  });

  it('refuses hop-by-hop, framing and credential headers with a warning, keeping the rest', () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const refused = ['Host', 'Content-Length', 'Connection', 'Transfer-Encoding', 'Cookie', 'Authorization', 'keep-alive', 'Upgrade', 'Proxy-Authorization', 'TE'];
    const headers: Record<string, string> = { Accept: 'text/csv' };
    for (const name of refused) headers[name] = 'x';
    const [cfg] = parseSourceConfigs(src({ headers }), logger);
    expect(cfg.headers).toEqual({ Accept: 'text/csv' });
    for (const name of refused) {
      expect(warnings().some(w => w.includes(`'${name}'`) && w.includes('may not set'))).toBe(true);
    }
  });

  it('refuses an invalid name or value, and a headers value that is not a map', () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const [cfg] = parseSourceConfigs(src({ headers: { 'Bad Name': 'x', 'X-Split': 'a\r\nInjected: 1', 'X-Num': 5, 'X-Ok': 'yes' } }), logger);
    expect(cfg.headers).toEqual({ 'X-Ok': 'yes' });
    expect(warnings()).toHaveLength(3);

    const [listed] = parseSourceConfigs(src({ headers: ['Accept: x'] }), logger);
    expect(listed.headers).toBeUndefined();
    expect(warnings().at(-1)).toMatch(/headers=.*must be a map/);
  });

  it('refuses a blank userAgent', () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    expect(parseSourceConfigs(src({ userAgent: '  ' }), logger)[0].headers).toBeUndefined();
    expect(warnings()[0]).toMatch(/'User-Agent'/);
  });
});

describe('parseSourceConfigs — timeoutMs (#1955)', () => {
  it('carries a timeoutMs inside the shipped range, ends included', () => {
    for (const ok of [5_000, 90_000, 300_000]) {
      expect(parseSourceConfigs(src({ timeoutMs: ok }), logger)[0].timeoutMs).toBe(ok);
    }
  });

  it('leaves timeoutMs unset when absent, so the 30 s guardedFetch default applies', () => {
    expect(parseSourceConfigs(src({}), logger)[0].timeoutMs).toBeUndefined();
  });

  it('refuses an out-of-range or non-integer timeoutMs with a warning, keeping the source', () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const bad = [4_999, 300_001, 0, -1, 1.5e4 + 0.5, '60000', null];
    for (const v of bad) {
      const [cfg] = parseSourceConfigs(src({ timeoutMs: v }), logger);
      expect(cfg).toBeDefined();
      expect(cfg.timeoutMs).toBeUndefined();
    }
    expect(warnings().filter(w => w.includes('ignoring timeoutMs'))).toHaveLength(bad.length);
  });

  it('applies the configured bounds', () => {
    const settings = { ...FEED_SETTING_DEFAULTS, timeoutMinMs: 1_000, timeoutMaxMs: 10_000 };
    expect(parseSourceConfigs(src({ timeoutMs: 2_000 }), logger, settings)[0].timeoutMs).toBe(2_000);
    expect(parseSourceConfigs(src({ timeoutMs: 20_000 }), logger, settings)[0].timeoutMs).toBeUndefined();
  });
});

describe('readFeedSettings (#1955)', () => {
  it('reads the addon keys', () => {
    expect(readFeedSettings({ 'max-concurrent-ingests': 2, 'timeout-min-ms': 1_000, 'timeout-max-ms': 60_000 }, logger))
      .toEqual({ maxConcurrentIngests: 2, timeoutMinMs: 1_000, timeoutMaxMs: 60_000 });
  });

  it('has fallbacks equal to the shipped config/default-config.json', () => {
    const shipped = JSON.parse(readFileSync(path.join(__dirname, '..', 'config', 'default-config.json'), 'utf8')) as Record<string, unknown>;
    const prefix = 'ngdpbase.addons.feeds.';
    const asRegistered = Object.fromEntries(
      Object.entries(shipped).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v])
    );
    expect(readFeedSettings(asRegistered, logger)).toEqual(FEED_SETTING_DEFAULTS);
  });

  it('falls back to the shipped values when a key is missing', () => {
    expect(readFeedSettings({}, logger)).toEqual({ maxConcurrentIngests: 4, timeoutMinMs: 5_000, timeoutMaxMs: 300_000 });
  });

  it('refuses an unusable value or an inverted range with a warning', () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    expect(readFeedSettings({ 'max-concurrent-ingests': 0 }, logger).maxConcurrentIngests).toBe(4);
    expect(readFeedSettings({ 'timeout-min-ms': 90_000, 'timeout-max-ms': 60_000 }, logger))
      .toMatchObject({ timeoutMinMs: 5_000, timeoutMaxMs: 300_000 });
    expect(warnings()).toHaveLength(2);
  });
});
