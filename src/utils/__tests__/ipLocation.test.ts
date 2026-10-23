/**
 * #1532 — where a sign-in came from: Cloudflare's headers only when the site
 * says it is behind Cloudflare, else an operator's GeoLite2 City file, else
 * nothing. The database is made at run time (tinyMmdb) in a per-test temp
 * directory, which is all that is removed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { approximateLocation } from '../ipLocation';
import { tinyMmdb } from './__fixtures__/tinyMmdb';

const COLUMBUS = { city: { names: { en: 'Columbus' } }, country: { iso_code: 'US', names: { en: 'United States' } } };
const IN_DB = '81.2.69.160';
const NOT_IN_DB = '203.0.113.9';

const headers = (h: Record<string, string>) => (name: string): string | undefined => h[name];
const CF = headers({ 'cf-ipcity': 'Paris', 'cf-ipcountry': 'FR' });
const NONE = headers({});

describe('approximateLocation (#1532)', () => {
  let dir: string;
  let mmdb: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1532-iploc-'));
    mmdb = path.join(dir, 'GeoLite2-City.mmdb');
    fs.writeFileSync(mmdb, tinyMmdb(COLUMBUS));
  });

  afterEach(() => {
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('nothing configured: no location, whatever the headers say', async () => {
    expect(await approximateLocation(IN_DB, CF, { behindCloudflare: false, geoliteFile: '' })).toBeNull();
  });

  test('Cloudflare off: its headers are never believed (anyone can send them)', async () => {
    // Sabotage check: reading the headers regardless of the switch returns "Paris, France" and turns this red.
    expect(await approximateLocation(NOT_IN_DB, CF, { behindCloudflare: false, geoliteFile: mmdb })).toBeNull();
    expect(await approximateLocation(IN_DB, CF, { behindCloudflare: false, geoliteFile: mmdb })).toBe('Columbus, United States');
  });

  test('Cloudflare on: the city and country it names, ahead of the database', async () => {
    expect(await approximateLocation(IN_DB, CF, { behindCloudflare: true, geoliteFile: mmdb })).toBe('Paris, France');
    expect(await approximateLocation(IN_DB, CF, { behindCloudflare: true, geoliteFile: '' })).toBe('Paris, France');
  });

  test('Cloudflare on but naming nothing usable: the database, else nothing', async () => {
    const unknown = headers({ 'cf-ipcountry': 'XX' });
    expect(await approximateLocation(IN_DB, unknown, { behindCloudflare: true, geoliteFile: mmdb })).toBe('Columbus, United States');
    expect(await approximateLocation(IN_DB, headers({ 'cf-ipcountry': 'T1' }), { behindCloudflare: true, geoliteFile: '' })).toBeNull();
    expect(await approximateLocation(IN_DB, headers({ 'cf-ipcountry': 'DE' }), { behindCloudflare: true, geoliteFile: '' })).toBe('Germany');
  });

  test('a header value is one tidy line: control characters go, length is capped', async () => {
    const odd = headers({ 'cf-ipcity': `Evil\r\nBcc: x@example.com${'a'.repeat(200)}`, 'cf-ipcountry': 'us' });
    const where = await approximateLocation(IN_DB, odd, { behindCloudflare: true, geoliteFile: '' });
    expect(where).not.toMatch(/[\r\n]/);
    expect(where!.length).toBeLessThanOrEqual(80);
  });

  test('the database: a listed address, an unlisted one, an IPv4 address carried as IPv6, and junk', async () => {
    const sources = { behindCloudflare: false, geoliteFile: mmdb };
    expect(await approximateLocation(IN_DB, NONE, sources)).toBe('Columbus, United States');
    expect(await approximateLocation(`::ffff:${IN_DB}`, NONE, sources)).toBe('Columbus, United States');
    expect(await approximateLocation(NOT_IN_DB, NONE, sources)).toBeNull();
    expect(await approximateLocation('2001:db8::1', NONE, sources)).toBeNull();
    expect(await approximateLocation('not an address', NONE, sources)).toBeNull();
    expect(await approximateLocation(undefined, NONE, sources)).toBeNull();
  });

  test('a database file that is missing or not a database gives no location, and the next good one is read', async () => {
    expect(await approximateLocation(IN_DB, NONE, { behindCloudflare: false, geoliteFile: path.join(dir, 'missing.mmdb') })).toBeNull();
    const bad = path.join(dir, 'bad.mmdb');
    fs.writeFileSync(bad, 'not a database');
    expect(await approximateLocation(IN_DB, NONE, { behindCloudflare: false, geoliteFile: bad })).toBeNull();
    fs.writeFileSync(bad, tinyMmdb({ city: { names: { en: 'Leeds' } }, country: { iso_code: 'GB' } }));
    fs.utimesSync(bad, new Date(), new Date(Date.now() + 5_000));
    expect(await approximateLocation(IN_DB, NONE, { behindCloudflare: false, geoliteFile: bad })).toBe('Leeds, United Kingdom');
  });
});
