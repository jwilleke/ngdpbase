/**
 * Shared parsing/discovery for the `ngdpbase.managers.addons-manager.addons-path`
 * config value.
 *
 * #924: `AddonsManager` (real runtime discovery) and `ConfigurationManager`
 * (the #672 boot-time "does this enabled addon exist" safety check) used to
 * each carry their own copy of this logic. They drifted: `AddonsManager` was
 * updated for #673's `node_modules:<glob>` packaged-addon syntax, but the
 * validator's copy was not, so it resolved a `node_modules:` entry as a
 * literal (non-existent) directory and treated every packaged addon as
 * "unknown" — crashing boot the moment one was enabled. Consolidating the
 * parsing/matching into one module removes the class of bug, not just this
 * instance of it.
 */

import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';

/** Prefix marking an addons-path entry as an npm-package glob rather than a directory. */
export const NPM_ADDON_PREFIX = 'node_modules:';

export interface SplitAddonsPath {
  /** Plain directory entries (bundled/drop-in), not yet resolved to absolute. */
  directories: string[];
  /** npm package name globs (the part after `node_modules:`), e.g. `@jwilleke/*-addon`. */
  npmPatterns: string[];
}

/**
 * Coerce the raw config value (string or string[]) and split it into
 * filesystem directory entries vs. `node_modules:<glob>` npm patterns.
 */
export function splitAddonsPath(raw: unknown): SplitAddonsPath {
  const entries = Array.isArray(raw) ? (raw as unknown[]).map(String) : [String(raw)];
  return {
    directories: entries.filter(p => !p.startsWith(NPM_ADDON_PREFIX)),
    npmPatterns: entries
      .filter(p => p.startsWith(NPM_ADDON_PREFIX))
      .map(p => p.slice(NPM_ADDON_PREFIX.length).trim())
      .filter(Boolean)
  };
}

/** Locate the `node_modules` directory to search for packaged addons (resolved from cwd). */
export function findNodeModulesDir(cwd: string = process.cwd()): string | null {
  const nm = path.resolve(cwd, 'node_modules');
  return fs.existsSync(nm) && fs.statSync(nm).isDirectory() ? nm : null;
}

/**
 * Expand a `@scope/glob` (or bare `glob`) npm pattern to matching package
 * directories under `nmRoot`.
 */
export function matchNpmPackageDirs(nmRoot: string, pattern: string): string[] {
  let baseDir = nmRoot;
  let nameGlob = pattern;
  if (pattern.startsWith('@')) {
    const slash = pattern.indexOf('/');
    const scope = slash > 0 ? pattern.slice(0, slash) : pattern;
    nameGlob = slash > 0 ? pattern.slice(slash + 1) : '*';
    baseDir = path.join(nmRoot, scope);
  }
  if (!fs.existsSync(baseDir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && minimatch(entry.name, nameGlob)) {
      out.push(path.join(baseDir, entry.name));
    }
  }
  return out;
}

/**
 * Best-effort addon identity for a packaged (npm) addon directory, derived
 * from its package-directory name alone — no module import, matching the
 * same boot-time-speed, no-module-loading design already accepted for the
 * directory-scan case (see `ConfigurationManager.assertConfiguredAddonsExist`).
 *
 * Follows the documented packaged-addon naming convention
 * (`@scope/<slug>-addon`, see docs/platform/deployment/addon-packaged.md):
 * strips a trailing `-addon` suffix if present, else returns the folder name
 * as-is.
 *
 * Caveat (same class as the existing directory-name heuristic): the addon's
 * *real* identity is whatever its module exports as `name` at runtime. A
 * package that doesn't follow the `-addon` naming convention, or whose
 * module exports a different `name`, won't be matched precisely here — this
 * is a validation-time approximation, not the source of truth.
 */
export function deriveAddonSlugFromPackageDirName(dirName: string): string {
  const suffix = '-addon';
  return dirName.endsWith(suffix) ? dirName.slice(0, -suffix.length) : dirName;
}

/**
 * Canonical identity for an addon directory (#927), resolved the SAME
 * import-free way in every layer (discovery, `isEnabled`, the boot-time
 * validator) so the four historical identities (folder name, module `name`,
 * config key, manifest slug) can no longer drift:
 *
 *   canonicalId = package.json `ngdpbase.slug`  ??  deriveAddonSlugFromPackageDirName(folder)
 *
 * Reads `package.json` statically — never imports the module — which is what
 * lets the boot validator compute the exact id the runtime will register
 * under, instead of guessing. The module's exported `name` is a display
 * label validated against this at load time, not a source of identity.
 */
export function resolveAddonSlug(
  addonDir: string,
  source: 'directory' | 'npm'
): string {
  const dirName = path.basename(addonDir);
  const pkgPath = path.join(addonDir, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      ngdpbase?: { slug?: unknown };
    };
    const slug = pkg?.ngdpbase?.slug;
    if (typeof slug === 'string' && slug.trim()) return slug.trim();
  } catch {
    /* no/invalid package.json — fall back to the folder-derived id */
  }
  // Fallback when no slug is declared. npm packages follow the
  // `@scope/<slug>-addon` publishing convention, so strip the conventional
  // trailing `-addon`. A plain directory (bundled/drop-in) addon's folder
  // name IS its identity verbatim — an addon may legitimately be named
  // `something-addon` on disk — so never strip there.
  return source === 'npm' ? deriveAddonSlugFromPackageDirName(dirName) : dirName;
}
