/**
 * A fake npm registry for the add-on installer's tests (#1830): builds real
 * gzipped ustar tarballs and answers packument and tarball requests from
 * memory. No socket is opened.
 */
import crypto from 'crypto';
import { gzipSync } from 'zlib';
import type { RegistryFetch } from '../utils/addonInstaller.js';

export interface FakeTarEntry {
  name: string;
  data?: string | Buffer;
  /** ustar type flag: '0' file (default), '5' directory, '2' symlink, '1' hard link. */
  type?: string;
  linkname?: string;
  mode?: number;
}

function header(name: string, size: number, type: string, mode: number, linkname = ''): Buffer {
  const h = Buffer.alloc(512, 0);
  h.write(name, 0, 100, 'utf8');
  h.write(`${mode.toString(8).padStart(7, '0')}\0`, 100, 8, 'ascii');
  h.write('0000000\0', 108, 8, 'ascii');
  h.write('0000000\0', 116, 8, 'ascii');
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  h.write('00000000000\0', 136, 12, 'ascii');
  h.write('        ', 148, 8, 'ascii');
  h.write(type, 156, 1, 'ascii');
  h.write(linkname, 157, 100, 'utf8');
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return h;
}

/** A gzipped tarball of `entries`, names taken as given (npm puts everything under `package/`). */
export function makeTgz(entries: FakeTarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    const type = e.type ?? '0';
    const data = e.data === undefined ? Buffer.alloc(0) : Buffer.from(e.data);
    const longName = Buffer.byteLength(e.name) > 100;
    if (longName) {
      const record = Buffer.from(`path=${e.name}\n`);
      let len = record.length + 2;
      while (String(len).length + 1 + record.length !== len) len++;
      const pax = Buffer.concat([Buffer.from(`${len} `), record]);
      parts.push(header('PaxHeader', pax.length, 'x', 0o644), pax, Buffer.alloc((512 - (pax.length % 512)) % 512));
    }
    parts.push(header(longName ? 'longname' : e.name, type === '0' ? data.length : 0, type, e.mode ?? 0o644, e.linkname));
    if (type === '0') parts.push(data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(parts));
}

/** A minimal add-on package: package.json (with the given manifest) and index.js. */
export function addonTgz(pkg: Record<string, unknown>, extra: FakeTarEntry[] = []): Buffer {
  return makeTgz([
    { name: 'package/package.json', data: JSON.stringify(pkg) },
    { name: 'package/index.js', data: `export default { name: ${JSON.stringify((pkg.ngdpbase as { slug?: string } | undefined)?.slug ?? 'x')}, register() {} };\n` },
    ...extra
  ]);
}

export const sri = (data: Buffer): string => `sha512-${crypto.createHash('sha512').update(data).digest('base64')}`;

export interface FakeVersion {
  tgz: Buffer;
  /** Manifest fields the packument reports (defaults to what the tarball's package.json says). */
  manifest?: Record<string, unknown>;
  /** Override dist.integrity (to simulate a mismatch). */
  integrity?: string;
}

export const REGISTRY = 'https://registry.example.test';

/**
 * A registry holding `packages` (name → version → tarball). `calls` records
 * every URL asked for; `down` makes every request throw as an unreachable host
 * does.
 */
export function fakeRegistry(packages: Record<string, Record<string, FakeVersion>>): { fetch: RegistryFetch; calls: string[]; down: boolean } {
  const state = { calls: [] as string[], down: false, fetch: undefined as unknown as RegistryFetch };
  state.fetch = (url: string, { maxBytes }: { maxBytes: number }) => {
    state.calls.push(url);
    if (state.down) return Promise.reject(new Error('getaddrinfo ENOTFOUND registry.example.test'));
    const reply = (body: Buffer): Promise<{ status: number; body: Buffer }> => (body.length > maxBytes
      ? Promise.reject(new Error(`response body too large: exceeded maxBytes ${maxBytes}`))
      : Promise.resolve({ status: 200, body }));
    for (const [name, versions] of Object.entries(packages)) {
      const escaped = name.replace('/', '%2f');
      if (url === `${REGISTRY}/${escaped}`) {
        const out: Record<string, unknown> = {};
        for (const [version, v] of Object.entries(versions)) {
          out[version] = {
            name,
            version,
            ...(v.manifest ?? {}),
            dist: { tarball: `${REGISTRY}/${name}/-/${version}.tgz`, integrity: v.integrity ?? sri(v.tgz) }
          };
        }
        return reply(Buffer.from(JSON.stringify({ name, versions: out })));
      }
      for (const [version, v] of Object.entries(versions)) {
        if (url === `${REGISTRY}/${name}/-/${version}.tgz`) return reply(v.tgz);
      }
    }
    return Promise.resolve({ status: 404, body: Buffer.from('{"error":"Not found"}') });
  };
  return state;
}
