/**
 * #754: one-time backfill of `created` (ISO 8601) into page frontmatter.
 *
 * Walks every .md page file under the configured pages directories and, for any
 * page missing a `created` field, derives one from the most reliable available
 * source — in priority order:
 *
 *   1. **v1 manifest dateCreated** — `<dir>/versions/<uuid>/manifest.json` →
 *      `versions[0].dateCreated`. The most accurate source: it's literally the
 *      timestamp the page was first written by VersioningFileProvider.
 *   2. **File mtime** — when no manifest exists (very old pages predating
 *      versioning, or pages created outside the versioning flow).
 *   3. **`lastModified`** — last-resort seed when neither manifest nor a usable
 *      mtime is available. Clearly lossy and flagged in the per-file output.
 *
 * Idempotent: pages that already have a `created` field are skipped.
 *
 * Safety guarantees (per `feedback_test_data_destruction` and the global rule):
 *   - NEVER mutates `lastModified`
 *   - NEVER mutates `user-keywords`
 *   - NEVER deletes any file or directory
 *   - Dry-run is the default unless `--apply` is passed
 *
 * Usage:
 *   npm run migrate:page-created               # dry-run preview
 *   npm run migrate:page-created -- --apply    # actually write
 *
 * Or directly:
 *   tsx scripts/migrate-page-created.ts [--apply] [--data <path>] [--required <path>]
 *
 * Options:
 *   --apply            Write changes (default is dry-run)
 *   --data <path>      Override pages root (defaults to $SLOW_STORAGE/pages, falling back to ./data/pages)
 *   --required <path>  Override required-pages directory (defaults to ./required-pages)
 *
 * Exit codes:
 *   0 — success (including dry-run)
 *   1 — at least one file failed to read/parse/write
 *   2 — invalid arguments / missing directories
 *
 * Page-index note: this script edits .md files only. It does NOT rewrite
 * data/page-index.json. The index will catch up the next time each page is
 * saved (VersioningFileProvider.savePage propagates `created` into the index
 * entry). If you want a hard re-sync immediately, stop the server, delete
 * page-index.json, and restart — the index rebuilds from frontmatter.
 */

// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment (#1091).
import '../src/bootstrap-env.js';
import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';

interface Args {
  apply: boolean;
  dataDir: string | null;
  requiredDir: string | null;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { apply: false, dataDir: null, requiredDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--dry-run') out.apply = false; // explicit but redundant
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
// VersioningFileProvider lays them out as pages/versions/<uuid>/v{N}/content.md (and
// pages/versions/private/<uuid>/...). We don't migrate those: they're historical
// content, not live pages, and rewriting them would corrupt version diffs.
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

export type Source = 'manifest' | 'mtime' | 'lastModified';
export type Outcome = 'migrated' | 'already' | 'error';

export interface TransformResult {
  outcome: Outcome;
  /** Source used to derive `created` when outcome === 'migrated'. */
  source?: Source;
  /** Value written when outcome === 'migrated'. */
  created?: string;
  /** New file contents when outcome === 'migrated'; otherwise the input unchanged. */
  content: string;
}

/**
 * Pure string-in/string-out frontmatter transform. Exported so it can be tested
 * without touching the filesystem.
 *
 * @param raw      Original file contents (including frontmatter)
 * @param sources  Candidate `created` values, tried in priority order.
 *                 Pass `undefined` for any source that's unavailable.
 *                 The first defined non-empty string is used.
 */
export function transformFrontmatter(
  raw: string,
  sources: { manifest?: string; mtime?: string; lastModified?: string }
): TransformResult {
  const parsed = matter(raw);
  // gray-matter caches parsed `data` by input — clone before mutating so we
  // don't poison the cache for subsequent identical inputs (see the
  // migrate-private-field cache-poisoning fix for the same reason).
  const data: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) };

  if (typeof data.created === 'string' && data.created.length > 0) {
    return { outcome: 'already', content: raw };
  }

  let source: Source;
  let value: string;
  if (sources.manifest) {
    source = 'manifest';
    value = sources.manifest;
  } else if (sources.mtime) {
    source = 'mtime';
    value = sources.mtime;
  } else if (sources.lastModified) {
    source = 'lastModified';
    value = sources.lastModified;
  } else {
    return { outcome: 'error', content: raw };
  }

  data.created = value;
  return { outcome: 'migrated', source, created: value, content: matter.stringify(parsed.content, data) };
}

/**
 * Find the v1 manifest for a given .md file path and return its v1 `dateCreated`.
 *
 * Layout:
 *   pages/<uuid>.md                          → pages/versions/<uuid>/manifest.json
 *   pages/private/<creator>/<uuid>.md        → pages/versions/private/<uuid>/manifest.json
 *   required-pages/<uuid>.md                 → required-pages/versions/<uuid>/manifest.json
 *
 * Returns `undefined` when no manifest is found, parsing fails, or v1 has no dateCreated.
 */
export async function readManifestDateCreated(
  filePath: string,
  pagesDir: string,
  requiredDir: string
): Promise<string | undefined> {
  const uuid = path.basename(filePath, '.md');

  // Determine which versions root applies based on which side of the tree we're under.
  const rel = path.relative(pagesDir, filePath);
  const underPages = !rel.startsWith('..') && !path.isAbsolute(rel);
  const relReq = path.relative(requiredDir, filePath);
  const underRequired = !relReq.startsWith('..') && !path.isAbsolute(relReq);

  const candidates: string[] = [];
  if (underPages) {
    // Private layout: pages/private/<creator>/<uuid>.md → versions/private/<uuid>
    const isPrivate = rel.split(path.sep)[0] === 'private';
    if (isPrivate) {
      candidates.push(path.join(pagesDir, 'versions', 'private', uuid, 'manifest.json'));
    } else {
      candidates.push(path.join(pagesDir, 'versions', uuid, 'manifest.json'));
    }
  }
  if (underRequired) {
    candidates.push(path.join(requiredDir, 'versions', uuid, 'manifest.json'));
  }

  for (const manifestPath of candidates) {
    if (!(await fs.pathExists(manifestPath))) continue;
    try {
      const raw = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(raw) as { versions?: Array<{ version?: number; dateCreated?: string }> };
      const versions = Array.isArray(manifest.versions) ? manifest.versions : [];
      // v1 is conventionally first, but be defensive — find the entry with version===1.
      const v1 = versions.find((v) => v.version === 1) ?? versions[0];
      if (v1?.dateCreated) return v1.dateCreated;
    } catch {
      // Fall through to next candidate / null
    }
  }
  return undefined;
}

interface FileResult {
  outcome: Outcome;
  source?: Source;
  filePath: string;
  created?: string;
}

async function migrateFile(
  filePath: string,
  pagesDir: string,
  requiredDir: string,
  apply: boolean
): Promise<FileResult> {
  const raw = await fs.readFile(filePath, 'utf8');

  // Parse just to read existing lastModified for the fallback chain.
  const parsedForLM = matter(raw);
  const lastModified = (parsedForLM.data as Record<string, unknown>).lastModified;

  // Gather candidate `created` values in priority order.
  const manifestCreated = await readManifestDateCreated(filePath, pagesDir, requiredDir);
  let mtimeIso: string | undefined;
  if (!manifestCreated) {
    try {
      const stat = await fs.stat(filePath);
      mtimeIso = stat.mtime.toISOString();
    } catch {
      mtimeIso = undefined;
    }
  }

  const result = transformFrontmatter(raw, {
    manifest: manifestCreated,
    mtime: mtimeIso,
    lastModified: typeof lastModified === 'string' ? lastModified : undefined
  });

  if (result.outcome === 'migrated' && apply) {
    await fs.writeFile(filePath, result.content, 'utf8');
  }

  return { outcome: result.outcome, source: result.source, filePath, created: result.created };
}

interface DirTotals {
  migrated: number;
  already: number;
  error: number;
  bySource: Record<Source, number>;
}

function emptyTotals(): DirTotals {
  return { migrated: 0, already: 0, error: 0, bySource: { manifest: 0, mtime: 0, lastModified: 0 } };
}

async function processDir(dir: string, label: string, pagesDir: string, requiredDir: string, apply: boolean): Promise<DirTotals> {
  const totals = emptyTotals();
  if (!(await fs.pathExists(dir))) {
    console.log(`  (skip) ${label} directory not found: ${dir}`);
    return totals;
  }
  console.log(`\n${label}: ${dir}`);

  for await (const filePath of walkMarkdown(dir)) {
    try {
      const result = await migrateFile(filePath, pagesDir, requiredDir, apply);
      if (result.outcome === 'migrated') {
        totals.migrated++;
        if (result.source) totals.bySource[result.source]++;
        const tag = apply ? '✓ migrated' : '[would migrate]';
        const flag = result.source === 'lastModified' ? ' ⚠ lossy (lastModified seed)' : '';
        console.log(`  ${tag}  [${result.source}] ${result.created}  ${path.relative(process.cwd(), filePath)}${flag}`);
      } else if (result.outcome === 'already') {
        totals.already++;
      } else {
        totals.error++;
        console.warn(`  ⚠ NO SOURCE  ${filePath} — neither manifest, mtime, nor lastModified available`);
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

  console.log('#754 — Backfill `created` field on page frontmatter');
  console.log(`  Mode: ${args.apply ? 'APPLY (writes files)' : 'DRY RUN (no writes — pass --apply to commit)'}`);
  console.log(`  Pages directory:    ${pagesDir}`);
  console.log(`  Required directory: ${requiredDir}`);

  if (!(await fs.pathExists(pagesDir)) && !(await fs.pathExists(requiredDir))) {
    console.error('Both directories missing. Pass --data and/or --required to override.');
    process.exit(2);
  }

  const pagesTotals = await processDir(pagesDir, 'pages', pagesDir, requiredDir, args.apply);
  const requiredTotals = await processDir(requiredDir, 'required-pages', pagesDir, requiredDir, args.apply);

  const grand: DirTotals = {
    migrated: pagesTotals.migrated + requiredTotals.migrated,
    already: pagesTotals.already + requiredTotals.already,
    error: pagesTotals.error + requiredTotals.error,
    bySource: {
      manifest: pagesTotals.bySource.manifest + requiredTotals.bySource.manifest,
      mtime: pagesTotals.bySource.mtime + requiredTotals.bySource.mtime,
      lastModified: pagesTotals.bySource.lastModified + requiredTotals.bySource.lastModified
    }
  };

  console.log('\nSummary:');
  console.log(`  Migrated:                       ${grand.migrated}`);
  console.log(`    from v1 manifest dateCreated: ${grand.bySource.manifest}`);
  console.log(`    from file mtime:              ${grand.bySource.mtime}`);
  console.log(`    from lastModified (LOSSY):    ${grand.bySource.lastModified}`);
  console.log(`  Already had 'created':          ${grand.already}`);
  console.log(`  Errors / no source:             ${grand.error}`);

  if (!args.apply && grand.migrated > 0) {
    console.log('\nRe-run with --apply to write the changes.');
  }
  if (grand.migrated > 0 && args.apply) {
    console.log('\nNote: data/page-index.json is NOT rewritten by this script. Each page-index entry');
    console.log('will pick up `created` on the next save (VersioningFileProvider propagates it through).');
    console.log('To force immediate index resync: stop the server, delete page-index.json, restart.');
  }

  process.exit(grand.error > 0 ? 1 : 0);
}

// Only run main() when this file is executed directly via tsx / node — not when
// imported by tests. The test file imports `transformFrontmatter` / `readManifestDateCreated` only.
const invokedAsScript = (() => {
  const argv1 = process.argv[1] ?? '';
  return argv1.endsWith('migrate-page-created.ts')
    || argv1.endsWith('migrate-page-created.js');
})();

if (invokedAsScript) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
