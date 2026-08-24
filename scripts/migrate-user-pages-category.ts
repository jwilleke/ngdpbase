/**
 * #662 / #701 — one-time migration of legacy `system-category: "User Pages"`
 * to the canonical `user-profile` value.
 *
 * Background: before `dbdd0f52`, `UserManager.createUserPage()` seeded new user
 * profile pages with `system-category: "User Pages"`. That string is not in the
 * configured set of system categories, so any later save of those pages through
 * the /edit UI hits the validator at WikiRoutes.ts:1969 and returns HTTP 400.
 *
 * `dbdd0f52` fixed new pages to be created with `general`, and the 2026-05-12
 * `user-profile` category addition made `user-profile` the correct canonical
 * value going forward. This script handles the data side: rewrite the legacy
 * frontmatter on any pages still carrying `"User Pages"`.
 *
 * Usage:
 *   npm run migrate:user-pages-category          # apply changes
 *   npm run migrate:user-pages-category:dry      # preview changes
 *
 * Or directly:
 *   tsx scripts/migrate-user-pages-category.ts [--dry-run] [--data <path>] [--required <path>]
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
 * data/page-index.json. The index will catch up on the next save of each
 * migrated page; or stop the server, delete page-index.json, and restart to
 * force an immediate rebuild from frontmatter.
 */

// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment (#1091).
import '../src/bootstrap-env.js';
import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';

const LEGACY_VALUE = 'user pages';
const CANONICAL_VALUE = 'user-profile';

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
// VersioningFileProvider lays them out as pages/versions/<uuid>/v{N}/content.md.
// We don't migrate those: they're historical snapshots, not the live page.
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

export type Outcome = 'migrated' | 'already' | 'other-category' | 'error';

export interface TransformResult {
  outcome: Outcome;
  /** Previous value of `system-category` before transform (informational; original casing). */
  previous?: string;
  /** New file contents when outcome === 'migrated'; otherwise the input unchanged. */
  content: string;
}

/**
 * Pure string-in/string-out frontmatter transform. Exported so it can be tested
 * without touching the filesystem.
 */
export function transformFrontmatter(raw: string): TransformResult {
  const parsed = matter(raw);
  // Clone before mutating — gray-matter caches the parsed `data` object by input
  // string and reuses the same reference across calls.
  const data: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) };

  const current = data['system-category'];
  if (typeof current !== 'string') return { outcome: 'other-category', content: raw };

  const normalized = current.trim().toLowerCase();
  if (normalized === CANONICAL_VALUE) return { outcome: 'already', content: raw };
  if (normalized !== LEGACY_VALUE) return { outcome: 'other-category', content: raw };

  data['system-category'] = CANONICAL_VALUE;
  return {
    outcome: 'migrated',
    previous: current,
    content: matter.stringify(parsed.content, data)
  };
}

interface FileResult {
  outcome: Outcome;
  previous?: string;
}

async function migrateFile(filePath: string, dryRun: boolean): Promise<FileResult> {
  const raw = await fs.readFile(filePath, 'utf8');
  const result = transformFrontmatter(raw);
  if (result.outcome === 'migrated' && !dryRun) {
    await fs.writeFile(filePath, result.content, 'utf8');
  }
  return { outcome: result.outcome, previous: result.previous };
}

async function processDir(dir: string, label: string, dryRun: boolean): Promise<Record<Outcome, number>> {
  const totals: Record<Outcome, number> = { migrated: 0, already: 0, 'other-category': 0, error: 0 };
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
        console.log(`  ${tag}  ${path.relative(process.cwd(), filePath)} ("${result.previous}" → "${CANONICAL_VALUE}")`);
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

  console.log('#662/#701 — Legacy "User Pages" → user-profile category migration');
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
    'other-category': pagesTotals['other-category'] + requiredTotals['other-category'],
    error: pagesTotals.error + requiredTotals.error
  };

  console.log('\nSummary:');
  console.log(`  Migrated:        ${grand.migrated}`);
  console.log(`  Already correct: ${grand.already}`);
  console.log(`  Other category:  ${grand['other-category']}`);
  console.log(`  Errors:          ${grand.error}`);

  if (args.dryRun && grand.migrated > 0) {
    console.log('\nRe-run without --dry-run to apply.');
  }
  if (grand.migrated > 0 && !args.dryRun) {
    console.log('\nNote: data/page-index.json is NOT rewritten by this script. The index will catch up');
    console.log('on the next save of each migrated page; or stop the server, delete page-index.json,');
    console.log('and restart to force an immediate rebuild from frontmatter.');
  }

  process.exit(grand.error > 0 ? 1 : 0);
}

// Only run main() when this file is executed directly via tsx / node — not when
// imported by tests.
const invokedAsScript = (() => {
  const argv1 = process.argv[1] ?? '';
  return argv1.endsWith('migrate-user-pages-category.ts')
    || argv1.endsWith('migrate-user-pages-category.js');
})();

if (invokedAsScript) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
