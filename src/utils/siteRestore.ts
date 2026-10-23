/**
 * A whole-site restore, staged for the next start, all or nothing (#1876).
 *
 * The databases already restore this way (#1723): each is copied to
 * `<live>.staged`, and the next start renames it into place before anything
 * opens it. This extends the same shape to every part of the site whose
 * owning manager stages its restore (attachments, role membership, persons,
 * organizations, footnotes and comments). Each owner does its own work, as
 * Manager-SOT asks; this module only holds the one record that binds the
 * parts together, so they go in together or not at all.
 *
 * The record is the __site restore manifest__ (`ngdpbase.backup.restore-manifest`,
 * default `${FAST_STORAGE}/site-restore.json`):
 *
 * - __Staging__ (BackupManager.restoreFromFile): the manifest is written in
 *   state `staging` before any part is staged. Each owner stages its files
 *   beside its live ones and records its part — the pairs `{ live, staged }`
 *   it will swap. Any failure discards every part already recorded and the
 *   manifest. Only when every part is staged is the state set to `staged`:
 *   that write is the commit.
 * - __Applying__ (each owner's `initialize`, before it reads its data): the
 *   owner asks {@link gatePart}. A part is applied only when the manifest is
 *   committed and every part that is still pending has all of its staged
 *   files in place, so a set that lost a part applies none of it. Each live
 *   path steps aside as `<live>.pre-restore`, and the staged one takes its
 *   name: a rename, never a write into live data. The part is then marked
 *   applied in the manifest, so a start that stops half-way picks up where it
 *   stopped instead of seeing a "missing" part.
 * - __Refused__: an interrupted staging, a part whose staged files are gone,
 *   or a tampered manifest (an owner checks every live path it is asked to
 *   replace) sets the manifest to `refused`, and each part's staged files are
 *   set aside as `*.incomplete` — never applied, never retried.
 * - __Done__: once every part is applied or set aside, the manifest is
 *   renamed `<manifest>.done`, which BackupManager reports to admins at the
 *   end of the start and keeps as `<manifest>.last`.
 *
 * Everything here is synchronous file renames on the owner's own paths: it
 * runs once at start, before the owner serves anything.
 *
 * __BackupManager's own__ (#1986): only BackupManager and the backup
 * internals (`directoryBackup.ts`, and `instanceEnvBackup.ts`, which applies
 * the staged `.env` at the very start of the process, before BackupManager
 * can be loaded) import this module, enforced by `npm run lint:backup`. A
 * manager or provider records its part through the `siteRestore` restore
 * option and applies it at start through BackupManager's
 * `applyStagedPartAtStart` / `siteRestorePartAtStart`.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SiteRestoreStaging, StagedRestoreAtStart, StagedSwap } from '../managers/BaseManager.js';

/** The config key naming the site restore manifest. */
export const SITE_RESTORE_MANIFEST_KEY = 'ngdpbase.backup.restore-manifest';
/** Its default: beside the other instance data in FAST_STORAGE. */
export const SITE_RESTORE_MANIFEST_DEFAULT = './data/site-restore.json';

/** One manager's share of a site restore. */
export interface SiteRestorePart {
  manager: string;
  swaps: StagedSwap[];
  /** Further files to remove when the restore is discarded (DatabaseManager's own manifest). */
  discard?: string[];
  status?: 'applied' | 'set-aside';
  note?: string;
}

export interface SiteRestoreManifest {
  version: 1;
  state: 'staging' | 'staged' | 'refused';
  reason?: string;
  /** When staging began. */
  stagedAt: string;
  /** When the backup it came from was taken. */
  backup: string;
  /** The backup document's filename. */
  source: string;
  stagedBy: string;
  /** The backup of the live data taken just before staging: restoring it undoes this one. */
  safetyBackup?: string;
  parts: SiteRestorePart[];
}

/** The staged copy of a live path: beside it, so staging and applying name the same path. */
export const stagedPathFor = (live: string): string => `${live}.staged`;
/** Where a live path is kept once a restore has replaced it. */
export const keptPathFor = (live: string): string => `${live}.pre-restore`;

/** The manifest file for this site, read through the configuration (never a constant). */
export function siteRestoreFile(configManager: { getResolvedDataPath(key: string, def: string): string } | null | undefined): string {
  return configManager?.getResolvedDataPath(SITE_RESTORE_MANIFEST_KEY, SITE_RESTORE_MANIFEST_DEFAULT) ?? SITE_RESTORE_MANIFEST_DEFAULT;
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * The manifest, or null when there is none. Throws when a file is there but
 * is not a manifest: a restore record that can't be read is never ignored.
 */
export function readSiteRestore(file: string): SiteRestoreManifest | null {
  if (!isFile(file)) return null;
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as SiteRestoreManifest;
  if (parsed?.version !== 1 || !Array.isArray(parsed.parts) || !['staging', 'staged', 'refused'].includes(parsed.state)) {
    throw new Error(`${path.basename(file)} is not a site restore manifest`);
  }
  return parsed;
}

function writeSiteRestore(file: string, manifest: SiteRestoreManifest): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, file);
}

/** Start staging a site restore: the record exists before any part is staged, so an interrupted staging is recognised. */
export function beginSiteRestore(file: string, meta: Omit<SiteRestoreManifest, 'version' | 'state' | 'parts'>): void {
  if (isFile(file)) throw new Error('A site restore is already staged; cancel it or replace it first');
  writeSiteRestore(file, { version: 1, state: 'staging', ...meta, parts: [] });
}

/** Record one owner's staged part. Only while staging. */
export function recordStagedPart(file: string, part: SiteRestorePart): void {
  const manifest = readSiteRestore(file);
  if (!manifest || manifest.state !== 'staging') throw new Error('No site restore is being staged');
  manifest.parts = [...manifest.parts.filter((p) => p.manager !== part.manager), { manager: part.manager, swaps: part.swaps, ...(part.discard ? { discard: part.discard } : {}) }];
  writeSiteRestore(file, manifest);
}

/**
 * The site restore being staged, as one manager's `restore()` gets it
 * (`ManagerRestoreOptions.siteRestore`, #1986): its part is recorded under
 * that manager's name, so a manager records its own part and no other.
 */
export function stagingFor(file: string, manager: string): SiteRestoreStaging {
  return {
    stagedPathFor,
    record: (swaps, options) => recordStagedPart(file, { manager, swaps, ...(options?.discard ? { discard: options.discard } : {}) })
  };
}

/** The commit: every part is staged. */
export function commitSiteRestore(file: string): SiteRestoreManifest {
  const manifest = readSiteRestore(file);
  if (!manifest || manifest.state !== 'staging') throw new Error('No site restore is being staged');
  for (const part of manifest.parts) {
    const missing = part.swaps.filter((s) => !existsSync(s.staged));
    if (missing.length > 0) throw new Error(`${part.manager} recorded staged files that are not there: ${missing.map((s) => path.basename(s.staged)).join(', ')}`);
  }
  manifest.state = 'staged';
  writeSiteRestore(file, manifest);
  return manifest;
}

/**
 * Throw a staged (or half-staged) site restore away: every part's staged
 * files and the manifest are removed. Live data is never touched.
 */
export function discardSiteRestore(file: string): SiteRestoreManifest | null {
  let manifest: SiteRestoreManifest | null;
  try {
    manifest = readSiteRestore(file);
  } catch {
    manifest = null;
  }
  for (const part of manifest?.parts ?? []) {
    for (const swap of part.swaps) rmSync(swap.staged, { recursive: true, force: true });
    for (const extra of part.discard ?? []) rmSync(extra, { recursive: true, force: true });
  }
  rmSync(file, { force: true });
  return manifest;
}

/** Move a staged path aside as `*.incomplete`, so it is neither applied nor retried. */
export function setAsidePath(staged: string): void {
  if (!existsSync(staged)) return;
  const target = `${staged}.incomplete`;
  rmSync(target, { recursive: true, force: true });
  renameSync(staged, target);
}

export type PartGate =
  | { decision: 'none' }
  | { decision: 'apply'; part: SiteRestorePart; manifest: SiteRestoreManifest }
  | { decision: 'set-aside'; reason: string; part?: SiteRestorePart };

/**
 * Whether `manager`'s part of a site restore is to be applied now. `none`:
 * there is no site restore, or it has no part for this manager, or that part
 * is done. `apply`: the restore is committed and every part still pending has
 * its staged files. `set-aside`: it isn't, and the set is marked refused.
 */
export function gatePart(file: string, manager: string): PartGate {
  let manifest: SiteRestoreManifest | null;
  try {
    manifest = readSiteRestore(file);
  } catch (err) {
    // A record that can't be read applies nothing. It is left where it is,
    // untouched — the path may be misconfigured to name some other file —
    // and every start says so until it is fixed.
    return { decision: 'set-aside', reason: `the site restore manifest ${file} cannot be read: ${(err as Error).message}` };
  }
  if (!manifest) return { decision: 'none' };
  const part = manifest.parts.find((p) => p.manager === manager);
  if (!part || part.status) return { decision: 'none' };
  if (manifest.state === 'staging') {
    return refuse(file, manifest, part, 'the site restore was still being staged when the server stopped (interrupted staging)');
  }
  if (manifest.state === 'refused') {
    return { decision: 'set-aside', reason: manifest.reason ?? 'the site restore was refused', part };
  }
  const setAsideAlready = manifest.parts.filter((p) => p.status === 'set-aside').map((p) => p.manager);
  if (setAsideAlready.length > 0) {
    return refuse(file, manifest, part, `part of it (${setAsideAlready.join(', ')}) was not applied, and the parts belong together`);
  }
  const missing = manifest.parts
    .filter((p) => !p.status)
    .flatMap((p) => p.swaps.filter((s) => !existsSync(s.staged)).map((s) => `${p.manager}: ${path.basename(s.staged)}`));
  if (missing.length > 0) {
    return refuse(file, manifest, part, `staged files are missing (${missing.join(', ')}), and the parts belong together`);
  }
  return { decision: 'apply', part, manifest };
}

function refuse(file: string, manifest: SiteRestoreManifest, part: SiteRestorePart, reason: string): PartGate {
  manifest.state = 'refused';
  manifest.reason = reason;
  writeSiteRestore(file, manifest);
  return { decision: 'set-aside', reason, part };
}

/**
 * Record what became of `manager`'s part. A part set aside refuses the rest
 * of the set. When every part is done the manifest becomes `<file>.done`.
 */
export function markPart(file: string, manager: string, status: 'applied' | 'set-aside', note?: string): void {
  let manifest: SiteRestoreManifest | null;
  try {
    manifest = readSiteRestore(file);
  } catch {
    return;
  }
  if (!manifest) return;
  const part = manifest.parts.find((p) => p.manager === manager);
  if (!part) return;
  part.status = status;
  if (note) part.note = note;
  if (status === 'set-aside' && manifest.state !== 'refused') {
    manifest.state = 'refused';
    manifest.reason = note ?? `${manager}'s part was not applied`;
  }
  writeSiteRestore(file, manifest);
  if (manifest.parts.every((p) => p.status)) {
    const done = `${file}.done`;
    rmSync(done, { force: true });
    renameSync(file, done);
  }
}

/**
 * Apply `manager`'s part of a staged site restore, at start, before the
 * manager reads its data. `allowed` says which live paths this manager may
 * replace, so a tampered manifest cannot rename an arbitrary file.
 * `strays` lists staged paths of this manager's that exist on disk, found by
 * the manager: with no committed restore naming them they are set aside.
 * `put` puts one swap in place instead of the rename, for a part whose live
 * path is not one file or folder of its own (the audit files share the log
 * folder): it moves the live content to `kept` and the staged one in, and
 * throws to refuse. Returns null when there was nothing to do.
 */
export function applyPartAtStart(
  file: string,
  manager: string,
  options: { allowed: (swap: StagedSwap) => boolean; strays?: () => string[]; put?: (swap: StagedSwap, kept: string) => void }
): StagedRestoreAtStart | null {
  const gate = gatePart(file, manager);
  if (gate.decision === 'none') {
    const strays = options.strays?.() ?? [];
    if (strays.length === 0) return null;
    for (const s of strays) setAsidePath(s);
    return { applied: [], refused: `staged files with no site restore naming them (an interrupted staging): ${strays.map((s) => path.basename(s)).join(', ')} — set aside as *.incomplete` };
  }
  if (gate.decision === 'set-aside') {
    for (const swap of gate.part?.swaps ?? []) setAsidePath(swap.staged);
    for (const s of options.strays?.() ?? []) setAsidePath(s);
    if (gate.part) markPart(file, manager, 'set-aside', gate.reason);
    return { applied: [], refused: gate.reason };
  }
  const bad = gate.part.swaps.find((s) => !options.allowed(s) || s.staged !== stagedPathFor(s.live));
  if (bad) {
    const reason = `the site restore manifest names ${bad.live}, which is not ${manager}'s to replace`;
    for (const swap of gate.part.swaps) if (swap.staged === stagedPathFor(swap.live)) setAsidePath(swap.staged);
    markPart(file, manager, 'set-aside', reason);
    return { applied: [], refused: reason };
  }
  const applied: StagedRestoreAtStart['applied'] = [];
  try {
    for (const swap of gate.part.swaps) {
      const kept = keptPathFor(swap.live);
      if (options.put) {
        options.put(swap, kept);
      } else {
        rmSync(kept, { recursive: true, force: true });
        if (existsSync(swap.live)) renameSync(swap.live, kept);
        mkdirSync(path.dirname(swap.live), { recursive: true });
        renameSync(swap.staged, swap.live);
      }
      applied.push({ live: swap.live, kept });
    }
  } catch (err) {
    const reason = `applying ${manager}'s part failed after ${applied.length} of ${gate.part.swaps.length} paths: ${(err as Error).message}`;
    markPart(file, manager, 'set-aside', reason);
    return { applied, refused: reason };
  }
  markPart(file, manager, 'applied');
  return { applied };
}

/**
 * What a start did with a site restore, for BackupManager to tell admins at
 * the end of the start: the finished record (`<file>.done`, then kept as
 * `<file>.last`), or a record with parts still pending — their managers did
 * not start — which is then refused and its pending parts set aside.
 */
export function finishSiteRestoreAtBoot(file: string): SiteRestoreManifest | null {
  const done = `${file}.done`;
  let manifest: SiteRestoreManifest | null;
  try {
    manifest = readSiteRestore(file);
  } catch {
    manifest = null;
  }
  if (manifest) {
    if (manifest.state === 'staging') refuse(file, manifest, manifest.parts[0], 'the site restore was still being staged when the server stopped (interrupted staging)');
    const pending = manifest.parts.filter((p) => !p.status);
    for (const part of pending) {
      for (const swap of part.swaps) setAsidePath(swap.staged);
      for (const extra of part.discard ?? []) setAsidePath(extra);
      markPart(file, part.manager, 'set-aside', `${part.manager} did not apply its part at start, so it was set aside`);
    }
    if (manifest.parts.length === 0 && isFile(file)) {
      rmSync(done, { force: true });
      renameSync(file, done);
    }
  }
  if (!isFile(done)) return null;
  const finished = JSON.parse(readFileSync(done, 'utf8')) as SiteRestoreManifest;
  const last = `${file}.last`;
  rmSync(last, { force: true });
  renameSync(done, last);
  return finished;
}
