/**
 * #1532 — roughly where a request came from, in words a person recognises
 * ("Columbus, United States"), for the sign-in approval message and page.
 *
 * Two sources, both optional, both off unless the operator turns them on;
 * nothing is bundled and nothing is looked up outside the site:
 *
 * - Cloudflare's visitor-location headers (`cf-ipcity`, `cf-ipcountry`), only
 *   when the site says it is reached through Cloudflare. Anyone can send these
 *   headers to a site that is not behind Cloudflare, so they are never read
 *   unless the operator says so.
 * - A MaxMind GeoLite2 City database (`.mmdb`) the operator supplies, read
 *   with `mmdb-lib` (no dependencies of its own). Loaded on first use and
 *   again when the file changes; one that cannot be read is said once in the
 *   log and gives no location.
 *
 * Null when neither says anything: the location is left out, never guessed.
 */
import { readFile, stat } from 'node:fs/promises';
import { isIPv4, isIPv6 } from 'node:net';
import { Reader, type CityResponse } from 'mmdb-lib';
import logger from './logger.js';

export interface IpLocationSources {
  /** The site is reached only through Cloudflare, so its location headers can be believed. */
  behindCloudflare: boolean;
  /** Path to a GeoLite2 City `.mmdb` file, or '' for none. */
  geoliteFile: string;
}

/** A place name from a header or a database: printable, one line, short. */
function placeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const tidy = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80).trim();
  return tidy || null;
}

/** "United States" for "US"; null for anything that is not a real two-letter country (XX unknown, T1 Tor). */
function countryName(code: unknown): string | null {
  if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return null;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
}

function joined(city: string | null, country: string | null): string | null {
  const parts = [city, country].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(', ') : null;
}

/** An IPv4 address carried as IPv6 (::ffff:1.2.3.4) is looked up as the IPv4 address. */
function plainAddress(ip: string | undefined): string | null {
  if (!ip) return null;
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
  const address = v4 ?? ip;
  return isIPv4(address) || isIPv6(address) ? address : null;
}

let loaded: { file: string; mtimeMs: number; reader: Reader<CityResponse> } | null = null;
const warned = new Set<string>();

async function cityReader(file: string): Promise<Reader<CityResponse> | null> {
  try {
    const { mtimeMs } = await stat(file);
    if (loaded?.file === file && loaded.mtimeMs === mtimeMs) return loaded.reader;
    const reader = new Reader<CityResponse>(await readFile(file));
    loaded = { file, mtimeMs, reader };
    warned.delete(file);
    return reader;
  } catch (err) {
    if (!warned.has(file)) {
      warned.add(file);
      logger.warn(`[ipLocation] the GeoLite2 City file ${file} could not be read; sign-in approvals say no location (#1532): ${(err as Error).message}`);
    }
    return null;
  }
}

/** What the GeoLite2 City file says about `ip`, or null. */
async function fromGeolite(file: string, ip: string | undefined): Promise<string | null> {
  const address = plainAddress(ip);
  if (!address) return null;
  const reader = await cityReader(file);
  if (!reader) return null;
  // An IPv4-only database has no IPv6 addresses; mmdb-lib would walk it anyway.
  if (reader.metadata.ipVersion === 4 && !isIPv4(address)) return null;
  let found: CityResponse | null;
  try {
    found = reader.get(address);
  } catch {
    return null;
  }
  return joined(placeName(found?.city?.names?.en), countryName(found?.country?.iso_code) ?? placeName(found?.country?.names?.en));
}

/**
 * Roughly where `ip` is: Cloudflare's headers when the site is behind it and
 * they name a place, else the GeoLite2 file when one is configured, else null.
 */
export async function approximateLocation(
  ip: string | undefined,
  header: (name: string) => string | undefined,
  sources: IpLocationSources
): Promise<string | null> {
  if (sources.behindCloudflare) {
    const fromCloudflare = joined(placeName(header('cf-ipcity')), countryName(header('cf-ipcountry')));
    if (fromCloudflare) return fromCloudflare;
  }
  return sources.geoliteFile ? fromGeolite(sources.geoliteFile, ip) : null;
}
