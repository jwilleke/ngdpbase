/**
 * Shared parsing/discovery for the `ngdpbase.managers.addons-manager.addons-path`
 * config value, used by `AddonsManager` (runtime discovery), `ConfigurationManager`
 * (the #672 boot-time "does this enabled addon exist" check) and the add-on
 * config layer, so the three cannot drift (#924).
 *
 * #2102: the packaged model (`node_modules:<glob>` entries) is gone. A site
 * config may still hold such an entry; it is ignored, never treated as a
 * directory, and never stops the boot.
 */

import * as fs from 'fs';
import * as path from 'path';

/** The retired packaged-model prefix, recognised only so the entry can be ignored with a warning. */
const RETIRED_PACKAGED_PREFIX = 'node_modules:';

export interface SplitAddonsPath {
  /** Plain directory entries (bundled/drop-in), not yet resolved to absolute. */
  directories: string[];
  /** Retired `node_modules:` entries (#2102): ignored; AddonsManager warns about them once at start. */
  retired: string[];
}

/**
 * Coerce the raw config value (string or string[]) and split it into
 * filesystem directory entries and retired `node_modules:` entries.
 */
export function splitAddonsPath(raw: unknown): SplitAddonsPath {
  const entries = Array.isArray(raw) ? (raw as unknown[]).map(String) : [String(raw)];
  return {
    directories: entries.filter(p => !p.trim().startsWith(RETIRED_PACKAGED_PREFIX)),
    retired: entries.filter(p => p.trim().startsWith(RETIRED_PACKAGED_PREFIX))
  };
}

/** The warning for one retired `node_modules:` entry (#2102). */
export function retiredAddonsPathWarning(entry: string): string {
  return `addons-path entry '${entry}' is no longer supported and is ignored; install add-ons with ngdpbase.addons.install`;
}

/** The config key naming the add-ons to install (#1830). */
export const ADDONS_INSTALL_KEY = 'ngdpbase.addons.install';

/**
 * Where installed add-ons live (#1830): `<data>/addons`, one folder per slug.
 * Only a folder the lock file names, for a slug still in the install map, is
 * an add-on (see `addonLock.ts`); anything else there is never loaded.
 */
export function installedAddonsDir(dataFolder: string, cwd: string = process.cwd()): string {
  return path.resolve(cwd, dataFolder, 'addons');
}

/** The slugs `ngdpbase.addons.install` names, from a merged or shipped+custom view. */
export function configuredInstallSlugs(config: Record<string, unknown>): string[] {
  const map = config[ADDONS_INSTALL_KEY];
  return map && typeof map === 'object' && !Array.isArray(map) ? Object.keys(map) : [];
}

/**
 * Canonical identity for an addon directory (#927), resolved the SAME
 * import-free way in every layer (discovery, `isEnabled`, the boot-time
 * validator):
 *
 *   canonicalId = package.json `ngdpbase.slug`  ??  the folder name verbatim
 *
 * Reads `package.json` statically — never imports the module. The module's
 * exported `name` is a display label validated against this at load time,
 * not a source of identity.
 */
export function resolveAddonSlug(addonDir: string): string {
  const dirName = path.basename(addonDir);
  const pkgPath = path.join(addonDir, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      ngdpbase?: { slug?: unknown };
    };
    const slug = pkg?.ngdpbase?.slug;
    if (typeof slug === 'string' && slug.trim()) return slug.trim();
  } catch {
    /* no/invalid package.json — fall back to the folder name */
  }
  return dirName;
}
