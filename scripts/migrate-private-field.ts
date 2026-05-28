/**
 * One-time migration of legacy private-signal spellings → canonical `private: true`.
 *
 * Walks every .md page file under the configured pages directories and rewrites
 * frontmatter so the page ends up in the canonical shape:
 *   - top-level `private: true` (#639 / #802 canonical semantic flag)
 *   - NO `user-keywords: [private]` entry (#639 Slice D — retired storage hint)
 *   - NO `system-location: 'private'` field (#802 Slice 2 — retired storage hint)
 *
 * Three legacy spellings the script can see and consolidate:
 *
 *   1. `user-keywords: [..., 'private', ...]`     — #639 user-keywords-based signal
 *   2. `system-location: 'private'`                — #122 storage-routing signal
 *   3. `private: true`                             — canonical (already correct)
 *
 * Idempotent. A page already in canonical shape returns 'already' with no rewrite.
 *
 * Run this as the explicit, batch alternative to the implicit per-save migrations.
 *
 * Usage:
 *   npm run migrate:private              # apply changes
 *   npm run migrate:private:dry          # preview changes
 *
 * Or directly:
 *   tsx scripts/migrate-private-field.ts [--dry-run] [--data <path>]
 *
 * Options:
 *   --dry-run         Preview without writing
 *   --data <path>     Override pages root (defaults to $SLOW_STORAGE/pages, falling back to ./data/pages)
 *   --required <path> Override required-pages directory (defaults to ./required-pages)
 *
 * Exit codes:
 *   0 — success (including dry-run)
 *   1 — at least one file failed to read/parse/write
 *   2 — invalid arguments / missing directories
 *
 * Page-index note: this script edits .md files only. It does NOT rewrite
 * data/page-index.json. Read fallbacks across providers make that safe — every consumer
 * reads either source — and the index will catch up the next time each page is saved
 * via PageManager. If you want a hard re-sync immediately, stop the server, delete
 * page-index.json, and restart; VersioningFileProvider rebuilds it from frontmatter.
 *
 * Conservative: only drops `system-location` when its value is exactly `'private'`.
 * Other values (if any exist) are left untouched.
 */

import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';

interface Args {
  dryRun: boolean;
  dataDir: string | null;
  requiredDir: string | null;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, dataDir: null, requiredDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--data' && argv[i + 1]) { out.dataDir = argv[++i]; }
    else if (a === '--required' && argv[i + 1]) { out.requiredDir = argv[++i]; }
  }
  return out;
}

function resolvePagesDir(override: string | null): string {
  if (override) return override;
  if (process.env.SLOW_STORAGE) return path.join(process.env.SLOW_STORAGE, 'pages');
  return path.join(process.cwd(), 'data', 'pages');
}

function resolveRequiredDir(override: string | null): string {
  if (override) return override;
  return path.join(process.cwd(), 'required-pages');
}

// Subdirectories under `pages/` that store version history rather than current pages.
// VersioningFileProvider lays them out as pages/versions/<uuid>/v{N}/content.md (and the
// parallel pages/versions/private/<creator>/<uuid>/...). We don't migrate those: they're
// historical content, not the live page, and rewriting them would break version diffs.
const SKIP_DIR_NAMES = new Set(['versions']);

async function* walkMarkdown(root: string): AsyncGenerator<string> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIR_NAMES.has(e.name)) continue;
      yield* walkMarkdown(path.join(root, e.name));
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      yield path.join(root, e.name);
    }
  }
}

export type Outcome = 'migrated' | 'already' | 'non-private' | 'error';

export interface TransformResult {
  outcome: Outcome;
  /** New file contents when outcome === 'migrated'; otherwise the input unchanged. */
  content: string;
}

/**
 * Pure string-in/string-out frontmatter transform. Exported so it can be tested
 * without touching the filesystem.
 *
 * Outcomes:
 *   - 'non-private'  — no private signal of any kind; content unchanged
 *   - 'already'      — canonical shape (private:true, no legacy signals); content unchanged
 *   - 'migrated'     — at least one legacy signal present and was consolidated
 *   - 'error'        — caller-level (read/write/parse failure); never returned here
 */
export function transformFrontmatter(raw: string): TransformResult {
  const parsed = matter(raw);
  // gray-matter caches the parsed `data` object by input string and reuses the
  // same reference across calls — clone before mutating so we don't poison the
  // cache for subsequent calls with the same input. Surfaced when two tests had
  // identical fixtures and the second saw the first's mutations.
  const data: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) };

  const userKeywordsRaw = data['user-keywords'];
  const userKeywords = Array.isArray(userKeywordsRaw) ? userKeywordsRaw.map(String) : [];
  const hasLegacyKeyword       = userKeywords.some((kw) => kw.toLowerCase() === 'private');
  const hasLegacySystemLocation = data['system-location'] === 'private';
  const hasTopLevel             = data.private === true;

  if (!hasLegacyKeyword && !hasLegacySystemLocation && !hasTopLevel) {
    return { outcome: 'non-private', content: raw };
  }

  const hasLegacyToClean = hasLegacyKeyword || hasLegacySystemLocation;
  if (!hasLegacyToClean && hasTopLevel) {
    return { outcome: 'already', content: raw };
  }

  // At least one legacy signal present — consolidate.
  data.private = true;

  if (hasLegacyKeyword) {
    const filtered = userKeywords.filter((kw) => kw.toLowerCase() !== 'private');
    if (filtered.length > 0) {
      data['user-keywords'] = filtered;
    } else {
      delete data['user-keywords'];
    }
  }

  if (hasLegacySystemLocation) {
    // Conservative: only drop when value === 'private'. Other values (if any
    // exist in the wild) are left alone for an operator to triage.
    delete data['system-location'];
  }

  return { outcome: 'migrated', content: matter.stringify(parsed.content, data) };
}

interface FileResult {
  outcome: Outcome;
}

async function migrateFile(filePath: string, dryRun: boolean): Promise<FileResult> {
  const raw = await fs.readFile(filePath, 'utf8');
  const result = transformFrontmatter(raw);
  if (result.outcome === 'migrated' && !dryRun) {
    await fs.writeFile(filePath, result.content, 'utf8');
  }
  return { outcome: result.outcome };
}

async function processDir(dir: string, label: string, dryRun: boolean): Promise<Record<Outcome, number>> {
  const totals: Record<Outcome, number> = { migrated: 0, already: 0, 'non-private': 0, error: 0 };
  if (!(await fs.pathExists(dir))) {
    console.log(`  (skip) ${label} directory not found: ${dir}`);
    return totals;
  }
  console.log(`\n${label}: ${dir}`);

  for await (const filePath of walkMarkdown(dir)) {
    try {
      const result = await migrateFile(filePath, dryRun);
      totals[result.outcome]++;
      if (result.outcome === 'migrated') {
        const tag = dryRun ? '[would migrate]' : '✓ migrated';
        console.log(`  ${tag}  ${path.relative(process.cwd(), filePath)}`);
      }
    } catch (err) {
      totals.error++;
      console.error(`  ✗ ERROR ${filePath}: ${(err as Error).message}`);
    }
  }
  return totals;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pagesDir = resolvePagesDir(args.dataDir);
  const requiredDir = resolveRequiredDir(args.requiredDir);

  console.log('Private-field migration (#639 Slice D + #802 Slice 2)');
  console.log(`  Mode: ${args.dryRun ? 'DRY RUN (no writes)' : 'APPLY'}`);
  console.log(`  Pages directory:    ${pagesDir}`);
  console.log(`  Required directory: ${requiredDir}`);

  if (!(await fs.pathExists(pagesDir)) && !(await fs.pathExists(requiredDir))) {
    console.error('Both directories missing. Pass --data and/or --required to override.');
    process.exit(2);
  }

  const pagesTotals = await processDir(pagesDir, 'pages', args.dryRun);
  const requiredTotals = await processDir(requiredDir, 'required-pages', args.dryRun);

  const grand = {
    migrated: pagesTotals.migrated + requiredTotals.migrated,
    already: pagesTotals.already + requiredTotals.already,
    'non-private': pagesTotals['non-private'] + requiredTotals['non-private'],
    error: pagesTotals.error + requiredTotals.error
  };

  console.log('\nSummary:');
  console.log(`  Migrated:         ${grand.migrated}`);
  console.log(`  Already migrated: ${grand.already}`);
  console.log(`  Non-private:      ${grand['non-private']}`);
  console.log(`  Errors:           ${grand.error}`);

  if (args.dryRun && grand.migrated > 0) {
    console.log('\nRe-run without --dry-run to apply.');
  }
  if (grand.migrated > 0 && !args.dryRun) {
    console.log('\nNote: data/page-index.json is NOT rewritten by this script. The index will catch up');
    console.log('on the next save of each page; or stop the server, delete page-index.json, and restart');
    console.log('to force an immediate rebuild from frontmatter.');
  }

  process.exit(grand.error > 0 ? 1 : 0);
}

// Only run main() when this file is executed directly via tsx / node — not when
// imported by tests. The test file imports `transformFrontmatter` only.
const invokedAsScript = (() => {
  const argv1 = process.argv[1] ?? '';
  return argv1.endsWith('migrate-private-field.ts')
    || argv1.endsWith('migrate-private-field.js');
})();

if (invokedAsScript) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
