/**
 * The installed add-ons' lock file, `<data>/addons/addons-lock.json` (#1830).
 *
 * The installer (`addonInstaller.ts`) is its only writer. It is read here as
 * well, synchronously and with no other dependency, because the configuration
 * merge (`addonConfigLayer.ts`) runs before any manager and has to know which
 * folders in `<data>/addons` are installed add-ons at all: a folder the lock
 * does not name is never an add-on, whatever it contains.
 */

import fs from 'fs';
import path from 'path';

/** What the lock records for one installed add-on. */
export interface LockEntry {
  package: string;
  version: string;
  integrity: string;
  installedAt: string;
  /** The verified Sigstore provenance the install was accepted on. */
  provenance: { repository: string; verifiedAt: string };
}

export interface LockFile {
  lockfileVersion: 1;
  addons: Record<string, LockEntry>;
}

export const LOCK_FILE_NAME = 'addons-lock.json';
/** Verified tarballs, kept so a restart needs no registry. Dot-named: discovery skips it. */
export const PACKAGES_DIR_NAME = '.packages';

export function lockFilePath(addonsDir: string): string {
  return path.join(addonsDir, LOCK_FILE_NAME);
}

/** The lock file, or an empty one when there is none. Throws when it exists and is not JSON. */
export function readLockSync(addonsDir: string): LockFile {
  const file = lockFilePath(addonsDir);
  if (!fs.existsSync(file)) return { lockfileVersion: 1, addons: {} };
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<LockFile>;
  return { lockfileVersion: 1, addons: parsed.addons ?? {} };
}

/**
 * The folders in `addonsDir` that are installed add-ons for this site: named
 * in the lock file AND in the configured install map, and present on disk.
 * An unreadable lock file names none.
 */
export function lockedAddonDirsSync(addonsDir: string, configuredSlugs: Iterable<string>): string[] {
  let lock: LockFile;
  try { lock = readLockSync(addonsDir); } catch { return []; }
  const out: string[] = [];
  for (const slug of configuredSlugs) {
    if (!lock.addons[slug]) continue;
    const dir = path.join(addonsDir, slug);
    if (fs.existsSync(path.join(dir, 'package.json'))) out.push(dir);
  }
  return out;
}
