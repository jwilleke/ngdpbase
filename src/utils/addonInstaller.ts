/**
 * The add-on installer (#1830): install the npm add-ons a site's configuration
 * names into `<data>/addons/<slug>/`, pinned and verified.
 *
 * AddonsManager owns it and calls {@link installConfiguredAddons} at boot,
 * before discovery. This module holds the mechanics only — registry, integrity,
 * provenance, unpacking, the lock file — and takes its outbound HTTP, its
 * provenance check and its audit hook as parameters, so the only network it
 * reaches is the guarded client AddonsManager hands it (src/http, #1139).
 *
 * As decided on #1810:
 * - An add-on already in the lock file is used from disk, after its stored
 *   tarball's sha512 is checked against the lock and the unpacked folder
 *   against that tarball. No registry call. A folder that differs from its
 *   tarball is rewritten from it; a tarball that fails its sha512 is not
 *   trusted, so the folder is set aside and the add-on is not loaded.
 * - An add-on not yet installed is resolved from the registry packument: the
 *   highest release in the configured range whose `ngdpbase.minVersion` this
 *   core meets (#1757). Its tarball's sha512 must equal the packument's
 *   `dist.integrity`; its Sigstore provenance must be valid for that tarball
 *   and name the configured repository; and its own package.json must name the
 *   same package, version and slug (the registry metadata and the tarball are
 *   not trusted to agree — "manifest confusion").
 * - Registry unreachable, or anything refused: that add-on is skipped with a
 *   reason, and the boot continues. It is tried again at the next start.
 */

import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';
import { writeFileAtomic } from './atomicWrite.js';
import { folderMatches, readTarball, unpackTarball, type TarballFiles } from './addonTarball.js';
import { PACKAGES_DIR_NAME, lockFilePath, readLockSync, type LockEntry, type LockFile } from './addonLock.js';
import { normaliseRepository, type ProvenanceResult } from './addonProvenance.js';
import { isAtLeast } from './version.js';

/** One configured add-on: `ngdpbase.addons.install.<slug>`. */
export interface InstallSpec {
  package: string;
  version: string;
  /** The source repository its provenance must name, e.g. `github.com/jwilleke/yourphr`. */
  repository: string;
}

/** The outbound GET the installer is given. Throws when the host cannot be reached. */
export type RegistryFetch = (url: string, options: { maxBytes: number; accept: string }) => Promise<{ status: number; body: Buffer }>;

/** Check a release's attestations. Throws when the check cannot be made (trust root unreachable). */
export type ProvenanceCheck = (input: { attestations: unknown; name: string; version: string; sha512Hex: string; repository: string }) => Promise<ProvenanceResult>;

/** What is about to be installed, for the audit record written before it is. */
export interface InstallRecord {
  slug: string;
  package: string;
  version: string;
  integrity: string;
  repository: string;
  /** The version this replaces, when the configuration moved it. */
  previousVersion?: string;
}

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
  checkProvenance: ProvenanceCheck;
  /**
   * Called once everything is verified and before anything is written. If it
   * throws (an audit record that must be written could not be), nothing is
   * installed.
   */
  beforeInstall?: (record: InstallRecord) => Promise<void>;
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

/** Which verification refused, for `addon-verify-failed`. */
export type FailedCheck = 'integrity' | 'provenance' | 'tarball' | 'manifest' | 'lock' | 'folder';

export interface InstallOutcome {
  slug: string;
  status: InstallStatus;
  package?: string;
  version?: string;
  reason?: string;
  /** Registry (or the provenance trust root) could not be reached — the case admins are told to wait out. */
  registryUnreachable?: boolean;
  /** Set when a verification refused, or (for `repaired`) found the folder changed. */
  failedCheck?: FailedCheck;
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

class RegistryUnreachable extends Error {}

/** A verification refused. */
class Refused extends Error {
  constructor(readonly check: FailedCheck, message: string) {
    super(message);
  }
}

function tarballPath(addonsDir: string, slug: string, version: string): string {
  return path.join(addonsDir, PACKAGES_DIR_NAME, `${slug}-${version}.tgz`);
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
  dist?: { tarball?: string; integrity?: string; attestations?: { url?: string } };
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

/** Releases (no prereleases) of `versions` in `range`, highest first. */
function releasesInRange(versions: string[], range: string): string[] {
  return semver.rsort(versions.filter((v) => semver.valid(v) && semver.satisfies(v, range)));
}

/** The release to install: highest in range that this core can run. */
async function resolveRelease(
  spec: InstallSpec,
  opts: InstallerOptions
): Promise<{ version: string; manifest: PackumentVersion; passedOver?: string } | { skip: string }> {
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
  const candidates = releasesInRange(Object.keys(versions), spec.version);
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
function checkTarballManifest(files: TarballFiles, slug: string, spec: InstallSpec, version: string, coreVersion: string): { check: FailedCheck | null; problem: string } | null {
  const pkg = files.get('package.json');
  if (!pkg) return { check: 'manifest', problem: 'the tarball has no package.json' };
  let manifest: PackumentVersion;
  try {
    manifest = JSON.parse(pkg.toString('utf8')) as PackumentVersion;
  } catch {
    return { check: 'manifest', problem: 'the tarball\'s package.json is not JSON' };
  }
  if (manifest.name !== spec.package) return { check: 'manifest', problem: `the tarball's package.json names '${String(manifest.name)}', not ${spec.package}` };
  if (manifest.version !== version) return { check: 'manifest', problem: `the tarball's package.json says version '${String(manifest.version)}', not ${version}` };
  const declared = manifest.ngdpbase?.slug;
  if (declared !== undefined && declared !== slug) return { check: 'manifest', problem: `the package declares slug '${String(declared)}', not '${slug}'` };
  const needs = needsNewerCore(coreVersion, manifest);
  if (needs) return { check: null, problem: `${spec.package}@${version} needs ngdpbase ${needs} or later; this is ${coreVersion}` };
  return null;
}

/** Move an untrusted folder out of discovery's way (dot-named), keeping it for inspection. */
async function setAside(addonsDir: string, slug: string, stamp: string): Promise<void> {
  const dir = path.join(addonsDir, slug);
  if (await fs.pathExists(dir)) await fs.rename(dir, path.join(addonsDir, `.rejected-${slug}-${stamp.replace(/[:.]/g, '-')}`));
}

async function useInstalled(slug: string, entry: LockEntry, opts: InstallerOptions, stamp: string): Promise<InstallOutcome> {
  const base = { slug, package: entry.package, version: entry.version };
  const tgzPath = tarballPath(opts.addonsDir, slug, entry.version);
  const tgz = (await fs.pathExists(tgzPath)) ? await fs.readFile(tgzPath) : null;
  if (!tgz || !integrityMatches(tgz, entry.integrity)) {
    await setAside(opts.addonsDir, slug, stamp);
    return {
      ...base,
      status: 'skipped',
      failedCheck: 'lock',
      reason: tgz
        ? `the stored tarball of ${entry.package}@${entry.version} does not match the sha512 in the lock file; the add-on folder was set aside and is not loaded`
        : `the stored tarball of ${entry.package}@${entry.version} is missing; the add-on folder was set aside and is not loaded`
    };
  }
  const dir = path.join(opts.addonsDir, slug);
  try {
    const files = await readTarball(tgz, opts.maxUnpackedBytes);
    if (await folderMatches(dir, files)) return { ...base, status: 'verified' };
    await unpackTarball(tgzPath, dir);
  } catch (err) {
    await setAside(opts.addonsDir, slug, stamp);
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, status: 'skipped', failedCheck: 'tarball', reason: `${message}; the add-on folder was set aside and is not loaded` };
  }
  return { ...base, status: 'repaired', failedCheck: 'folder', reason: 'the add-on folder differed from its verified tarball and was rewritten from it' };
}

async function installFresh(slug: string, spec: InstallSpec, opts: InstallerOptions, lock: LockFile, stamp: string): Promise<InstallOutcome> {
  const resolved = await resolveRelease(spec, opts);
  if ('skip' in resolved) return { slug, package: spec.package, status: 'skipped', reason: resolved.skip };
  const { version, manifest, passedOver } = resolved;
  const base = { slug, package: spec.package, version };
  const what = `${spec.package}@${version}`;

  const integrity = manifest.dist?.integrity;
  const tarball = manifest.dist?.tarball;
  if (!integrity || !integrity.includes('sha512-')) throw new Refused('integrity', `${what} has no sha512 integrity on the registry`);
  if (!tarball) return { ...base, status: 'skipped', reason: `${what} has no tarball address` };
  const registryOrigin = new URL(opts.registry).origin;
  if (new URL(tarball).origin !== registryOrigin) {
    return { ...base, status: 'skipped', reason: `the tarball of ${what} is not on the configured registry (${tarball})` };
  }

  const res = await get(opts, tarball, opts.maxTarballBytes, 'application/octet-stream');
  if (res.status >= 500 || res.status === 429) throw new RegistryUnreachable(`registry answered HTTP ${res.status}`);
  if (res.status !== 200) return { ...base, status: 'skipped', reason: `registry answered HTTP ${res.status} for the tarball of ${what}` };
  if (!integrityMatches(res.body, integrity)) throw new Refused('integrity', `the tarball of ${what} does not match its sha512 integrity`);

  // Provenance: the attestation must be for this exact tarball, from the configured repository.
  const attestationsUrl = manifest.dist?.attestations?.url;
  if (!attestationsUrl) throw new Refused('provenance', `${what} has no provenance attestation on the registry`);
  if (new URL(attestationsUrl).origin !== registryOrigin) throw new Refused('provenance', `the attestations of ${what} are not on the configured registry`);
  const att = await get(opts, attestationsUrl, opts.maxPackumentBytes, 'application/json');
  if (att.status >= 500 || att.status === 429) throw new RegistryUnreachable(`registry answered HTTP ${att.status}`);
  if (att.status !== 200) throw new Refused('provenance', `registry answered HTTP ${att.status} for the attestations of ${what}`);
  let attestations: unknown;
  try { attestations = JSON.parse(att.body.toString('utf8')); } catch { throw new Refused('provenance', `the attestations of ${what} are not JSON`); }
  const sha512Hex = crypto.createHash('sha512').update(res.body).digest('hex');
  let provenance: ProvenanceResult;
  try {
    provenance = await opts.checkProvenance({ attestations, name: spec.package, version, sha512Hex, repository: spec.repository });
  } catch (err) {
    throw new RegistryUnreachable(`provenance could not be checked: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  if (!provenance.ok) throw new Refused('provenance', provenance.reason);

  let files: TarballFiles;
  try {
    files = await readTarball(res.body, opts.maxUnpackedBytes);
  } catch (err) {
    throw new Refused('tarball', err instanceof Error ? err.message : String(err));
  }
  const problem = checkTarballManifest(files, slug, spec, version, opts.coreVersion);
  if (problem?.check) throw new Refused(problem.check, problem.problem);
  if (problem) return { ...base, status: 'skipped', reason: problem.problem };

  const pinned = sha512Integrity(res.body);
  const previous = lock.addons[slug];
  await opts.beforeInstall?.({
    slug, package: spec.package, version, integrity: pinned, repository: provenance.repository,
    ...(previous && previous.version !== version ? { previousVersion: previous.version } : {})
  });

  const tgzPath = tarballPath(opts.addonsDir, slug, version);
  await fs.ensureDir(path.dirname(tgzPath));
  await writeFileAtomic(tgzPath, res.body);
  await unpackTarball(tgzPath, path.join(opts.addonsDir, slug));
  lock.addons[slug] = {
    package: spec.package,
    version,
    integrity: pinned,
    installedAt: stamp,
    provenance: { repository: provenance.repository, verifiedAt: stamp }
  };
  await writeLock(opts.addonsDir, lock);
  if (previous && previous.version !== version) {
    await fs.remove(tarballPath(opts.addonsDir, slug, previous.version)).catch(() => {});
  }
  return passedOver
    ? { ...base, status: 'installed', reason: `newest in range not installed: ${passedOver}` }
    : { ...base, status: 'installed' };
}

/** Why a configured entry cannot be acted on, or null. */
function specProblem(slug: string, spec: unknown): string | null {
  if (!SLUG.test(slug)) return `'${slug}' is not a valid add-on slug (lowercase letters, digits and hyphens)`;
  const s = spec as Partial<InstallSpec> | null;
  if (!s || typeof s !== 'object') return 'the entry must be { "package": "...", "version": "...", "repository": "..." }';
  if (typeof s.package !== 'string' || !PACKAGE_NAME.test(s.package)) return `'${String(s.package)}' is not an npm package name`;
  if (typeof s.version !== 'string' || semver.validRange(s.version) === null) return `version range '${String(s.version)}' is not a semver range`;
  if (typeof s.repository !== 'string' || !normaliseRepository(s.repository)) {
    return 'the entry has no "repository" (host/owner/repo) for its provenance to be checked against';
  }
  return null;
}

/** Whether the lock entry still answers the configured spec. */
function lockAnswers(entry: LockEntry | undefined, spec: InstallSpec): entry is LockEntry {
  return !!entry
    && entry.package === spec.package
    && semver.satisfies(entry.version, spec.version)
    && entry.provenance?.repository === normaliseRepository(spec.repository);
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
  const lock = readLockSync(opts.addonsDir);
  const outcomes: InstallOutcome[] = [];

  for (const slug of slugs) {
    const raw = specs[slug];
    const problem = specProblem(slug, raw);
    if (problem) { outcomes.push({ slug, status: 'skipped', reason: problem }); continue; }
    const spec = raw as InstallSpec;
    try {
      const entry = lock.addons[slug];
      if (lockAnswers(entry, spec)) {
        outcomes.push(await useInstalled(slug, entry, opts, stamp));
        continue;
      }
      if (!entry && (await fs.pathExists(path.join(opts.addonsDir, slug)))) {
        outcomes.push({ slug, status: 'skipped', reason: `${path.join(opts.addonsDir, slug)} already exists and was not installed by the installer; it is left as it is` });
        continue;
      }
      outcomes.push(await installFresh(slug, spec, opts, lock, stamp));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof RegistryUnreachable) {
        outcomes.push({ slug, package: spec.package, status: 'skipped', reason: `registry unreachable (${message})`, registryUnreachable: true });
      } else if (err instanceof Refused) {
        outcomes.push({ slug, package: spec.package, status: 'skipped', failedCheck: err.check, reason: `${message}; refused` });
      } else {
        outcomes.push({ slug, package: spec.package, status: 'skipped', reason: message });
      }
    }
  }
  return outcomes;
}
