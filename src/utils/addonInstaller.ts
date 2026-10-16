/**
 * The add-on installer (#1830, slice 1): install the npm add-ons a site's
 * configuration names into `<data>/addons/<slug>/`, pinned and verified.
 *
 * AddonsManager owns it and calls {@link installConfiguredAddons} at boot,
 * before discovery. This module holds the mechanics only — registry, integrity,
 * unpacking, the lock file — and takes its outbound HTTP as a parameter, so the
 * only network it reaches is the guarded client AddonsManager hands it
 * (src/http, #1139).
 *
 * As decided on #1810:
 * - An add-on already in the lock file is used from disk, after its stored
 *   tarball's sha512 is checked against the lock and the unpacked folder
 *   against that tarball. No registry call. A folder that differs from its
 *   tarball is rewritten from it (logged); a tarball that fails its sha512 is
 *   not trusted, so the folder is set aside and the add-on is not loaded.
 * - An add-on not yet installed is resolved from the registry packument: the
 *   highest release in the configured range whose `ngdpbase.minVersion` this
 *   core meets (#1757). Its tarball's sha512 must equal the packument's
 *   `dist.integrity`, and its own package.json must name the same package,
 *   version and slug (the registry metadata and the tarball are not trusted to
 *   agree — "manifest confusion").
 * - Registry unreachable, or anything refused: that add-on is skipped with a
 *   reason, and the boot continues. It is tried again at the next start.
 *
 * Not in this slice: provenance (signature) verification, the admin Update
 * action, audit events and backup inclusion — see the AddonsManager doc.
 *
 * TODO(#1830): verify npm provenance (the Sigstore attestation naming the
 * expected repository) before installing. It needs a Sigstore verifier, which
 * is a new dependency and an operator decision.
 */

import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { writeFileAtomic } from './atomicWrite.js';
import { readTarGz, type TarEntry } from './tarGz.js';
import { matchingReleases, parseRange } from './semverRange.js';
import { isAtLeast } from './version.js';

/** One configured add-on: `ngdpbase.addons.install.<slug>`. */
export interface InstallSpec {
  package: string;
  version: string;
}

/** What the lock file records for one installed add-on. */
export interface LockEntry {
  package: string;
  version: string;
  integrity: string;
  installedAt: string;
}

export interface LockFile {
  lockfileVersion: 1;
  addons: Record<string, LockEntry>;
}

/** The outbound GET the installer is given. Throws when the host cannot be reached. */
export type RegistryFetch = (url: string, options: { maxBytes: number; accept: string }) => Promise<{ status: number; body: Buffer }>;

export interface InstallerOptions {
  /** `<data>/addons`: each add-on unpacks into a folder here. */
  addonsDir: string;
  /** Registry base URL, e.g. https://registry.npmjs.org */
  registry: string;
  /** This core's version, for `ngdpbase.minVersion`. */
  coreVersion: string;
  maxPackumentBytes: number;
  maxTarballBytes: number;
  maxUnpackedBytes: number;
  fetch: RegistryFetch;
  now?: () => Date;
}

export type InstallStatus =
  /** Installed now from the registry. */
  | 'installed'
  /** Already installed; verified against the lock, nothing changed. */
  | 'verified'
  /** Already installed; the folder differed from its verified tarball and was rewritten. */
  | 'repaired'
  /** Not installed (and not loaded); `reason` says why. */
  | 'skipped';

export interface InstallOutcome {
  slug: string;
  status: InstallStatus;
  version?: string;
  reason?: string;
  /** Registry could not be reached — the case admins are told to wait out. */
  registryUnreachable?: boolean;
}

export const LOCK_FILE_NAME = 'addons-lock.json';
/** Verified tarballs, kept so a restart needs no registry. Dot-named: discovery skips it. */
export const PACKAGES_DIR_NAME = '.packages';

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

class RegistryUnreachable extends Error {}

export function lockFilePath(addonsDir: string): string {
  return path.join(addonsDir, LOCK_FILE_NAME);
}

function tarballPath(addonsDir: string, slug: string, version: string): string {
  return path.join(addonsDir, PACKAGES_DIR_NAME, `${slug}-${version}.tgz`);
}

export async function readLock(addonsDir: string): Promise<LockFile> {
  const file = lockFilePath(addonsDir);
  if (!(await fs.pathExists(file))) return { lockfileVersion: 1, addons: {} };
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<LockFile>;
  return { lockfileVersion: 1, addons: parsed.addons ?? {} };
}

async function writeLock(addonsDir: string, lock: LockFile): Promise<void> {
  await writeFileAtomic(lockFilePath(addonsDir), `${JSON.stringify(lock, null, 2)}\n`);
}

/** `sha512-<base64>` of `data`. */
export function sha512Integrity(data: Buffer): string {
  return `sha512-${crypto.createHash('sha512').update(data).digest('base64')}`;
}

/** Whether `data` matches the sha512 in an SRI string (which may list several hashes). */
function integrityMatches(data: Buffer, sri: string): boolean {
  const wanted = sri.split(/\s+/).filter((h) => h.startsWith('sha512-'));
  if (wanted.length === 0) return false;
  const actual = sha512Integrity(data);
  return wanted.some((h) => h.split('?')[0] === actual);
}

/** Registry URL of a package's packument; a scoped name keeps its `@` and escapes its `/`. */
function packumentUrl(registry: string, name: string): string {
  return `${registry.replace(/\/+$/, '')}/${name.replace('/', '%2f')}`;
}

async function get(opts: InstallerOptions, url: string, maxBytes: number, accept: string): Promise<{ status: number; body: Buffer }> {
  try {
    return await opts.fetch(url, { maxBytes, accept });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A capped body is the package's fault, not the registry's.
    if (/too large/i.test(message)) throw new Error(message, { cause: err });
    throw new RegistryUnreachable(message, { cause: err });
  }
}

interface PackumentVersion {
  name?: string;
  version?: string;
  dist?: { tarball?: string; integrity?: string };
  ngdpbase?: { minVersion?: string; slug?: string };
}

/** Why this core cannot run `manifest`, or null when it can (#1757). */
function needsNewerCore(coreVersion: string, manifest: { ngdpbase?: { minVersion?: string } } | undefined): string | null {
  const minimum = manifest?.ngdpbase?.minVersion;
  if (!minimum) return null;
  try {
    return isAtLeast(coreVersion, minimum) ? null : minimum;
  } catch {
    return minimum;
  }
}

/** The release to install: highest in range that this core can run. */
async function resolveRelease(
  spec: InstallSpec,
  opts: InstallerOptions
): Promise<{ version: string; manifest: PackumentVersion; passedOver?: string } | { skip: string }> {
  const range = parseRange(spec.version);
  if (!range) return { skip: `version range '${spec.version}' is not one the installer understands` };

  const res = await get(opts, packumentUrl(opts.registry, spec.package), opts.maxPackumentBytes, 'application/json');
  if (res.status === 404) return { skip: `package ${spec.package} is not on the registry` };
  if (res.status >= 500 || res.status === 429) throw new RegistryUnreachable(`registry answered HTTP ${res.status}`);
  if (res.status !== 200) return { skip: `registry answered HTTP ${res.status} for ${spec.package}` };

  let packument: { name?: string; versions?: Record<string, PackumentVersion> };
  try {
    packument = JSON.parse(res.body.toString('utf8')) as typeof packument;
  } catch {
    return { skip: `registry metadata for ${spec.package} is not JSON` };
  }
  if (packument.name !== spec.package) return { skip: `registry answered for '${String(packument.name)}', not ${spec.package}` };

  const versions = packument.versions ?? {};
  const candidates = matchingReleases(Object.keys(versions), range);
  if (candidates.length === 0) return { skip: `no release of ${spec.package} matches '${spec.version}'` };

  let newestNeeds: string | null = null;
  for (const version of candidates) {
    const needs = needsNewerCore(opts.coreVersion, versions[version]);
    if (!needs) {
      return newestNeeds
        ? { version, manifest: versions[version], passedOver: `${candidates[0]} needs ngdpbase ${newestNeeds} or later` }
        : { version, manifest: versions[version] };
    }
    newestNeeds ??= needs;
  }
  return { skip: `every release of ${spec.package} matching '${spec.version}' needs a newer ngdpbase (the newest needs ngdpbase ${newestNeeds ?? '?'} or later; this is ${opts.coreVersion})` };
}

/**
 * The tarball's own package.json must agree with what was configured and what
 * the registry said; installing a package that says it is something else is
 * refusing to look.
 */
function checkTarballManifest(entries: TarEntry[], slug: string, spec: InstallSpec, version: string, coreVersion: string): string | null {
  const pkg = entries.find((e) => e.path === 'package.json')?.data;
  if (!pkg) return 'the tarball has no package.json';
  let manifest: PackumentVersion;
  try {
    manifest = JSON.parse(pkg.toString('utf8')) as PackumentVersion;
  } catch {
    return 'the tarball\'s package.json is not JSON';
  }
  if (manifest.name !== spec.package) return `the tarball's package.json names '${String(manifest.name)}', not ${spec.package}`;
  if (manifest.version !== version) return `the tarball's package.json says version '${String(manifest.version)}', not ${version}`;
  const declared = manifest.ngdpbase?.slug;
  if (declared !== undefined && declared !== slug) return `the package declares slug '${String(declared)}', not '${slug}'`;
  const needs = needsNewerCore(coreVersion, manifest);
  if (needs) return `${spec.package}@${version} needs ngdpbase ${needs} or later; this is ${coreVersion}`;
  return null;
}

/** Write `entries` into a fresh folder beside `target`, then swap it in. */
async function unpackInto(target: string, entries: TarEntry[]): Promise<void> {
  const parent = path.dirname(target);
  await fs.ensureDir(parent);
  const staging = await fs.mkdtemp(path.join(parent, `.staging-${path.basename(target)}-`));
  try {
    for (const entry of entries) {
      const dest = path.resolve(staging, entry.path);
      if (!dest.startsWith(staging + path.sep)) throw new Error(`tarball refused: '${entry.path}' leaves the package`);
      if (!entry.data) { await fs.ensureDir(dest); continue; }
      await fs.ensureDir(path.dirname(dest));
      // 'wx': never follow or overwrite anything already there.
      await fs.writeFile(dest, entry.data, { flag: 'wx', mode: entry.executable ? 0o755 : 0o644 });
    }
    await fs.remove(target);
    await fs.rename(staging, target);
  } catch (err) {
    await fs.remove(staging).catch(() => {});
    throw err;
  }
}

/** Whether `dir` holds exactly the tarball's files, byte for byte, and no others. */
async function folderMatches(dir: string, entries: TarEntry[]): Promise<boolean> {
  if (!(await fs.pathExists(dir))) return false;
  const files = new Map(entries.filter((e) => e.data).map((e) => [e.path, e.data!]));
  const seen = new Set<string>();
  const walk = async (rel: string): Promise<boolean> => {
    for (const d of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${d.name}` : d.name;
      if (d.isSymbolicLink()) return false;
      if (d.isDirectory()) { if (!(await walk(p))) return false; continue; }
      const expected = files.get(p);
      if (!expected || !expected.equals(await fs.readFile(path.join(dir, p)))) return false;
      seen.add(p);
    }
    return true;
  };
  return (await walk('')) && seen.size === files.size;
}

/** Move an untrusted folder out of discovery's way (dot-named), keeping it for inspection. */
async function setAside(addonsDir: string, slug: string, stamp: string): Promise<void> {
  const dir = path.join(addonsDir, slug);
  if (await fs.pathExists(dir)) await fs.rename(dir, path.join(addonsDir, `.rejected-${slug}-${stamp.replace(/[:.]/g, '-')}`));
}

async function useInstalled(slug: string, entry: LockEntry, opts: InstallerOptions, stamp: string): Promise<InstallOutcome> {
  const tgzPath = tarballPath(opts.addonsDir, slug, entry.version);
  const tgz = (await fs.pathExists(tgzPath)) ? await fs.readFile(tgzPath) : null;
  if (!tgz || !integrityMatches(tgz, entry.integrity)) {
    await setAside(opts.addonsDir, slug, stamp);
    return {
      slug,
      status: 'skipped',
      version: entry.version,
      reason: tgz
        ? `the stored tarball of ${entry.package}@${entry.version} does not match the sha512 in the lock file; the add-on folder was set aside and is not loaded`
        : `the stored tarball of ${entry.package}@${entry.version} is missing; the add-on folder was set aside and is not loaded`
    };
  }
  const dir = path.join(opts.addonsDir, slug);
  try {
    const entries = readTarGz(tgz, opts.maxUnpackedBytes);
    if (await folderMatches(dir, entries)) return { slug, status: 'verified', version: entry.version };
    await unpackInto(dir, entries);
  } catch (err) {
    await setAside(opts.addonsDir, slug, stamp);
    const message = err instanceof Error ? err.message : String(err);
    return { slug, status: 'skipped', version: entry.version, reason: `${message}; the add-on folder was set aside and is not loaded` };
  }
  return { slug, status: 'repaired', version: entry.version, reason: 'the add-on folder differed from its verified tarball and was rewritten from it' };
}

async function installFresh(slug: string, spec: InstallSpec, opts: InstallerOptions, lock: LockFile, stamp: string): Promise<InstallOutcome> {
  const resolved = await resolveRelease(spec, opts);
  if ('skip' in resolved) return { slug, status: 'skipped', reason: resolved.skip };
  const { version, manifest, passedOver } = resolved;

  const integrity = manifest.dist?.integrity;
  const tarball = manifest.dist?.tarball;
  if (!integrity || !integrity.includes('sha512-')) return { slug, status: 'skipped', version, reason: `${spec.package}@${version} has no sha512 integrity on the registry` };
  if (!tarball) return { slug, status: 'skipped', version, reason: `${spec.package}@${version} has no tarball address` };
  if (new URL(tarball).origin !== new URL(opts.registry).origin) {
    return { slug, status: 'skipped', version, reason: `the tarball of ${spec.package}@${version} is not on the configured registry (${tarball})` };
  }

  const res = await get(opts, tarball, opts.maxTarballBytes, 'application/octet-stream');
  if (res.status >= 500 || res.status === 429) throw new RegistryUnreachable(`registry answered HTTP ${res.status}`);
  if (res.status !== 200) return { slug, status: 'skipped', version, reason: `registry answered HTTP ${res.status} for the tarball of ${spec.package}@${version}` };
  if (!integrityMatches(res.body, integrity)) {
    return { slug, status: 'skipped', version, reason: `the tarball of ${spec.package}@${version} does not match its sha512 integrity; refused` };
  }

  const entries = readTarGz(res.body, opts.maxUnpackedBytes);
  const problem = checkTarballManifest(entries, slug, spec, version, opts.coreVersion);
  if (problem) return { slug, status: 'skipped', version, reason: `${problem}; refused` };

  const pinned = sha512Integrity(res.body);
  const tgzPath = tarballPath(opts.addonsDir, slug, version);
  await fs.ensureDir(path.dirname(tgzPath));
  await writeFileAtomic(tgzPath, res.body);
  await unpackInto(path.join(opts.addonsDir, slug), entries);
  const previous = lock.addons[slug];
  lock.addons[slug] = { package: spec.package, version, integrity: pinned, installedAt: stamp };
  await writeLock(opts.addonsDir, lock);
  if (previous && previous.version !== version) {
    await fs.remove(tarballPath(opts.addonsDir, slug, previous.version)).catch(() => {});
  }
  return passedOver
    ? { slug, status: 'installed', version, reason: `newest in range not installed: ${passedOver}` }
    : { slug, status: 'installed', version };
}

/** Why a configured entry cannot be acted on, or null. */
function specProblem(slug: string, spec: unknown): string | null {
  if (!SLUG.test(slug)) return `'${slug}' is not a valid add-on slug (lowercase letters, digits and hyphens)`;
  const s = spec as Partial<InstallSpec> | null;
  if (!s || typeof s !== 'object') return 'the entry must be { "package": "...", "version": "..." }';
  if (typeof s.package !== 'string' || !PACKAGE_NAME.test(s.package)) return `'${String(s.package)}' is not an npm package name`;
  if (typeof s.version !== 'string' || s.version.trim() === '') return 'the entry has no version range';
  return null;
}

/**
 * Install or verify every add-on in `specs` (`ngdpbase.addons.install`).
 * Never throws for one add-on's problem: each outcome says what happened.
 */
export async function installConfiguredAddons(specs: Record<string, unknown>, opts: InstallerOptions): Promise<InstallOutcome[]> {
  const slugs = Object.keys(specs);
  if (slugs.length === 0) return [];
  const stamp = (opts.now ?? (() => new Date()))().toISOString();
  await fs.ensureDir(opts.addonsDir);
  const lock = await readLock(opts.addonsDir);
  const outcomes: InstallOutcome[] = [];

  for (const slug of slugs) {
    const spec = specs[slug];
    const problem = specProblem(slug, spec);
    if (problem) { outcomes.push({ slug, status: 'skipped', reason: problem }); continue; }
    const { package: name, version } = spec as InstallSpec;
    try {
      const entry = lock.addons[slug];
      const range = parseRange(version);
      if (entry && entry.package === name && range && matchingReleases([entry.version], range).length === 1) {
        outcomes.push(await useInstalled(slug, entry, opts, stamp));
        continue;
      }
      if (!entry && (await fs.pathExists(path.join(opts.addonsDir, slug)))) {
        outcomes.push({ slug, status: 'skipped', reason: `${path.join(opts.addonsDir, slug)} already exists and was not installed by the installer; it is left as it is` });
        continue;
      }
      outcomes.push(await installFresh(slug, { package: name, version }, opts, lock, stamp));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outcomes.push(err instanceof RegistryUnreachable
        ? { slug, status: 'skipped', reason: `registry unreachable (${message})`, registryUnreachable: true }
        : { slug, status: 'skipped', reason: message });
    }
  }
  return outcomes;
}
