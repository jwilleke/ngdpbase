#!/usr/bin/env node

/**
 * Version Management Script for ngdpbase
 *
 * Helps manage semantic versioning for the project.
 *
 * Usage:
 *   node version.js                    - Show current version
 *   node version.js patch              - Increment patch version (bug fixes)
 *   node version.js minor              - Increment minor version (new features)
 *   node version.js major              - Increment major version (breaking changes)
 *   node version.js set <version>      - Set specific version
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find project root by walking up from __dirname until we find package.json
function findProjectRoot(): string {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error('Could not find project root (no package.json found)');
}

const PROJECT_ROOT = findProjectRoot();
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, 'package.json');
const PACKAGE_LOCK_PATH = path.join(PROJECT_ROOT, 'package-lock.json');
const CHANGELOG_PATH = path.join(PROJECT_ROOT, 'CHANGELOG.md');
const APP_CONFIG_PATH = path.join(PROJECT_ROOT, 'config/app-default-config.json');

/**
 * Package.json structure
 */
interface PackageJson {
  name: string;
  version: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Parsed version components
 */
export interface VersionComponents {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Version increment type
 */
export type VersionIncrementType = 'major' | 'minor' | 'patch';

/**
 * Read package.json
 *
 * @returns {PackageJson} Parsed package.json
 */
function readPackageJson(): PackageJson {
  try {
    const content = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8');
    return JSON.parse(content) as PackageJson;
  } catch (error) {
    console.error('Error reading package.json:', (error as Error).message);
    process.exit(1);
  }
}

/**
 * Write package.json
 *
 * @param {PackageJson} packageData - Package data to write
 */
function writePackageJson(packageData: PackageJson): void {
  try {
    const content = JSON.stringify(packageData, null, 2) + '\n';
    fs.writeFileSync(PACKAGE_JSON_PATH, content);
  } catch (error) {
    console.error('Error writing package.json:', (error as Error).message);
    process.exit(1);
  }
}

/**
 * Update version in app-default-config.json
 *
 * @param {string} newVersion - New version string
 */
function updateAppConfig(newVersion: string): void {
  try {
    const content = fs.readFileSync(APP_CONFIG_PATH, 'utf8');
    const config = JSON.parse(content) as Record<string, unknown>;
    config['ngdpbase.version'] = newVersion;
    fs.writeFileSync(APP_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
    console.log(`Updated app-default-config.json with version ${newVersion}`);
  } catch (error) {
    console.warn('Warning: Could not update app-default-config.json:', (error as Error).message);
  }
}

/**
 * Update the version fields in package-lock.json.
 *
 * The lockfile mirrors the project version in two places — the top-level
 * `version` and the root package entry `packages[""].version` — and npm rewrites
 * both on the next `npm install`. Leaving them behind meant every satellite
 * checkout showed a two-line `package-lock.json` diff after any build, which had
 * to be inspected and discarded by hand at every release. Keeping them in
 * lockstep here removes the drift at the source.
 *
 * A parse → mutate → `JSON.stringify(…, null, 2)` round-trip is byte-identical
 * to npm's own formatting for this lockfile, so this rewrites exactly the two
 * version lines and nothing else. Dependency resolution is untouched: only the
 * project's own version is edited, never any package entry.
 *
 * Warns rather than fails — a missing or unparseable lockfile must not abort a
 * release, matching how a missing app-default-config.json is handled.
 *
 * @param {string} newVersion - New version string
 */
function updatePackageLock(newVersion: string): void {
  try {
    if (!fs.existsSync(PACKAGE_LOCK_PATH)) {
      console.warn('Warning: package-lock.json not found, skipping');
      return;
    }
    const content = fs.readFileSync(PACKAGE_LOCK_PATH, 'utf8');
    const lock = applyVersionToLock(JSON.parse(content) as PackageLock, newVersion);
    fs.writeFileSync(PACKAGE_LOCK_PATH, JSON.stringify(lock, null, 2) + '\n');
    console.log(`Updated package-lock.json with version ${newVersion}`);
  } catch (error) {
    console.warn('Warning: Could not update package-lock.json:', (error as Error).message);
  }
}

/**
 * Minimal shape of the parts of package-lock.json this tool touches.
 */
export interface PackageLock {
  version?: string;
  lockfileVersion?: number;
  packages?: Record<string, { version?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * Set the project's own version in a parsed lockfile — the pure half of
 * {@link updatePackageLock}, split out so the mapping is testable without
 * touching the filesystem.
 *
 * Writes exactly two fields: the top-level `version` and the root package entry
 * `packages[""].version`. Dependency entries are never touched — only npm may
 * change those, and rewriting one here would corrupt resolution.
 *
 * @param {PackageLock} lock - Parsed lockfile (mutated in place and returned)
 * @param {string} newVersion - New version string
 * @returns {PackageLock} The same object, for convenient chaining
 */
export function applyVersionToLock(lock: PackageLock, newVersion: string): PackageLock {
  lock.version = newVersion;
  // lockfileVersion 1 has no `packages` map — guard rather than assume v2/v3.
  const rootEntry = lock.packages?.[''];
  if (rootEntry) rootEntry.version = newVersion;
  return lock;
}

/**
 * Parse a semantic version string
 *
 * @param {string} version - Version string (e.g., "1.2.3")
 * @returns {VersionComponents} Parsed version components
 * @throws {Error} If version format is invalid
 */
export function parseVersion(version: string): VersionComponents {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  };
}

/**
 * Format version components into string
 *
 * @param {number} major - Major version
 * @param {number} minor - Minor version
 * @param {number} patch - Patch version
 * @returns {string} Formatted version string
 */
export function formatVersion(major: number, minor: number, patch: number): string {
  return `${major}.${minor}.${patch}`;
}

/**
 * Increment version based on type
 *
 * @param {string} currentVersion - Current version string
 * @param {VersionIncrementType} type - Type of increment
 * @returns {string} New version string
 * @throws {Error} If increment type is invalid
 */
export function incrementVersion(currentVersion: string, type: VersionIncrementType): string {
  const { major, minor, patch } = parseVersion(currentVersion);

  switch (type) {
  case 'patch':
    return formatVersion(major, minor, patch + 1);
  case 'minor':
    return formatVersion(major, minor + 1, 0);
  case 'major':
    return formatVersion(major + 1, 0, 0);
  default:
    throw new Error(`Invalid increment type: ${String(type)}`);
  }
}

/**
 * Get current date in ISO format (YYYY-MM-DD)
 *
 * @returns {string} Current date
 */
function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Update CHANGELOG.md for a new release
 *
 * @param {string} newVersion - New version number
 */
function updateChangelogForRelease(newVersion: string): void {
  try {
    let changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    const newHeader = `## [${newVersion}] - ${getCurrentDate()}`;

    if (/## \[Unreleased\]/.test(changelog)) {
      // Replace [Unreleased] heading, preserving a fresh one above the new entry
      const replacement = `## [Unreleased]\n\n### Planned\n- Future enhancements\n\n${newHeader}`;
      changelog = changelog.replace(/## \[Unreleased\]/, replacement);
    } else {
      // No [Unreleased] section — insert new version after the header block (first ---)
      const insertAfter = /^---\s*\n/m;
      if (insertAfter.test(changelog)) {
        changelog = changelog.replace(insertAfter, `---\n\n${newHeader}\n\n`);
      } else {
        // Fallback: prepend to the first ## heading
        changelog = changelog.replace(/^(## )/m, `${newHeader}\n\n$1`);
      }
    }

    fs.writeFileSync(CHANGELOG_PATH, changelog);
    console.log(`Updated CHANGELOG.md with version ${newVersion}`);
  } catch (error) {
    console.warn('Warning: Could not update CHANGELOG.md:', (error as Error).message);
  }
}

/**
 * Extract the release notes for a specific version from CHANGELOG.md.
 * Returns the content between `## [version]` and the next `## [` heading.
 */
function extractChangelogNotes(version: string): string {
  try {
    const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    const escaped = version.replace(/\./g, '\\.');
    const pattern = new RegExp(`## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`);
    const match = changelog.match(pattern);
    if (match?.[1]) return match[1].trim();
  } catch {
    // ignore — caller handles empty notes
  }
  return '';
}

/**
 * Create a git tag and push it to origin.
 */
function createGitTag(version: string): void {
  const tag = `v${version}`;
  try {
    execSync(`git tag ${tag}`, { stdio: 'inherit' });
    execSync(`git push origin ${tag}`, { stdio: 'inherit' });
    console.log(`✅ Git tag ${tag} created and pushed`);
  } catch (error) {
    console.error('Error creating git tag:', (error as Error).message);
    process.exit(1);
  }
}

/**
 * Create a GitHub release using the `gh` CLI.
 * Release notes are written to a temp file to avoid shell-escaping issues.
 */
function createGitHubRelease(version: string, notes: string): void {
  const tag = `v${version}`;
  const tmpFile = path.join(PROJECT_ROOT, '.release-notes.tmp');
  try {
    fs.writeFileSync(tmpFile, notes || `Release ${tag}`);
    execSync(`gh release create ${tag} --title "${tag}" --notes-file "${tmpFile}"`, { stdio: 'inherit' });
    fs.unlinkSync(tmpFile);
    console.log(`✅ GitHub release ${tag} created`);
  } catch (error) {
    console.error('Error creating GitHub release:', (error as Error).message);
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    process.exit(1);
  }
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
ngdpbase Version Management

Usage:
  node version.js                         - Show current version and info
  node version.js patch                   - Increment patch (bug fixes: 1.2.0 → 1.2.1)
  node version.js minor                   - Increment minor (new features: 1.2.0 → 1.3.0)
  node version.js major                   - Increment major (breaking changes: 1.2.0 → 2.0.0)
  node version.js set <version>           - Set specific version (e.g., 1.2.3)
  node version.js patch --tag-only        - Bump + create/push git tag (no GH release)
  node version.js minor --release         - Bump + create/push tag + GitHub release
  node version.js help                    - Show this help

Semantic Versioning:
  MAJOR.MINOR.PATCH
  - MAJOR: Incompatible API changes
  - MINOR: Backward-compatible functionality additions
  - PATCH: Backward-compatible bug fixes
`);
}

/**
 * Main CLI function
 */
function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];
  const doRelease = args.includes('--release');
  const doTagOnly = args.includes('--tag-only');

  const packageData = readPackageJson();
  const currentVersion = packageData.version;

  if (!command || command === 'help') {
    if (!command) {
      console.log(`Current version: ${currentVersion}`);
      console.log(`Project: ${packageData.name}`);
      console.log(`Description: ${packageData.description || 'No description'}`);
      console.log('\nRun "node version.js help" for usage information.');
    } else {
      showHelp();
    }
    return;
  }

  try {
    let newVersion: string;

    switch (command) {
    case 'patch':
    case 'minor':
    case 'major':
      newVersion = incrementVersion(currentVersion, command);
      break;

    case 'set':
      newVersion = args[1];
      if (!newVersion) {
        console.error('Error: Please specify a version to set');
        process.exit(1);
      }
      // Validate version format
      parseVersion(newVersion);
      break;

    default:
      console.error(`Error: Unknown command "${command}"`);
      console.log('Run "node version.js help" for usage information.');
      process.exit(1);
    }

    // Update package.json
    packageData.version = newVersion;
    writePackageJson(packageData);

    // Update package-lock.json (its two version fields mirror package.json)
    updatePackageLock(newVersion);

    // Update app-default-config.json
    updateAppConfig(newVersion);

    // Update changelog if incrementing
    if (['patch', 'minor', 'major'].includes(command)) {
      updateChangelogForRelease(newVersion);
    }

    console.log(`Version updated: ${currentVersion} → ${newVersion}`);
    console.log(`Type: ${command.toUpperCase()}`);

    if (command === 'major') {
      console.log('\n⚠️  MAJOR version bump - ensure breaking changes are documented!');
    } else if (command === 'minor') {
      console.log('\n✨ MINOR version bump - new features added');
    } else if (command === 'patch') {
      console.log('\n🐛 PATCH version bump - bug fixes');
    }

    // Tag and/or release if requested
    if (doRelease || doTagOnly) {
      createGitTag(newVersion);
    }
    if (doRelease) {
      const notes = extractChangelogNotes(newVersion);
      createGitHubRelease(newVersion, notes);
    }
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}

// Run main only when executed directly (ESM-safe).
// `require.main === module` would crash under "type": "module".
const argvPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (argvPath === __filename) {
  main();
}
