/**
 * One-time migration for #893 (Slice 1 of EPIC #869) — vocabulary-bucket purification.
 *
 * Walks every .md page file under the configured pages directories and rewrites
 * frontmatter so each page conforms to the five-bucket model decided 2026-07-21:
 *
 *   1. Lifecycle terms (`draft` / `review` / `published`) leave BOTH keyword
 *      arrays and become the single-valued `status:` field. An existing
 *      explicit `status:` wins; otherwise the highest state found wins
 *      (published > review > draft). `published` is represented by ABSENCE of
 *      the field, so a page whose only lifecycle term was 'published' simply
 *      loses the keyword.
 *   2. `capture` (machine provenance — the #881 bookmarklet) moves from
 *      `user-keywords` into `system-keywords`.
 *
 * Idempotent: a page already in canonical shape returns 'clean' with no rewrite.
 * The implicit per-save migration in PageManager.savePageWithContext applies the
 * same rules; this script is the explicit batch alternative (mirrors
 * scripts/migrate-private-field.ts from #639/#802).
 *
 * Usage:
 *   npm run migrate:vocabulary          # apply changes
 *   npm run migrate:vocabulary:dry      # preview changes
 *
 * Or directly:
 *   tsx scripts/migrate-vocabulary-slice1.ts [--dry-run] [--data <path>] [--required <path>]
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
 * Page-index note: this script edits .md files only, same as the private-field
 * migration. The page index catches up on next save; for a hard re-sync stop the
 * server, delete page-index.json, restart.
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

// Version-history subdirectories are historical content, not the live page —
// rewriting them would break version diffs (same rule as migrate-private-field).
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

export type Outcome = 'migrated' | 'clean' | 'error';

export interface TransformResult {
  outcome: Outcome;
  /** New file contents when outcome === 'migrated'; otherwise the input unchanged. */
  content: string;
  /** Human-readable notes for the summary log (what moved where). */
  notes: string[];
}

const LIFECYCLE_ORDER = ['draft', 'review', 'published'];

/**
 * Pure string-in/string-out frontmatter transform. Exported for tests.
 * Serialization traps guarded per #545 (scalar-vs-array) and #862 (multi-value
 * shape): scalar keyword fields are treated as one-element arrays, and arrays
 * are always written back as YAML sequences.
 */
export function transformFrontmatter(raw: string): TransformResult {
  const parsed = matter(raw);
  // Clone — gray-matter caches parsed data by input string (see
  // migrate-private-field.ts for the war story).
  const data: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) };
  const notes: string[] = [];

  const toArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : [];

  const userKw = toArr(data['user-keywords']);
  const systemKw = toArr(data['system-keywords']);
  const hadScalarUserKw = typeof data['user-keywords'] === 'string';

  const isLifecycle = (kw: string) => LIFECYCLE_ORDER.includes(kw.toLowerCase());
  const isCapture = (kw: string) => kw.toLowerCase() === 'capture';

  const lifecycleFound = [...userKw, ...systemKw].filter(isLifecycle).map(k => k.toLowerCase());
  const captureInUser = userKw.some(isCapture);

  const changed = lifecycleFound.length > 0 || captureInUser || hadScalarUserKw;
  if (!changed) return { outcome: 'clean', content: raw, notes };

  // Lifecycle → status. Explicit status wins; else highest state; 'published'
  // maps to field ABSENCE.
  const explicitStatus = typeof data.status === 'string' && data.status !== '' ? data.status : undefined;
  if (lifecycleFound.length > 0 && !explicitStatus) {
    const highest = lifecycleFound.sort(
      (a, b) => LIFECYCLE_ORDER.indexOf(b) - LIFECYCLE_ORDER.indexOf(a)
    )[0];
    if (highest !== 'published') {
      data.status = highest;
      notes.push(`status: ${highest}`);
    } else {
      notes.push('published keyword dropped (absent status = published)');
    }
  } else if (lifecycleFound.length > 0) {
    notes.push(`lifecycle keywords dropped (explicit status: ${explicitStatus} kept)`);
  }

  const newUserKw = userKw.filter(kw => !isLifecycle(kw) && !isCapture(kw));
  let newSystemKw = systemKw.filter(kw => !isLifecycle(kw));
  if (captureInUser && !newSystemKw.some(isCapture)) {
    newSystemKw = [...newSystemKw, 'capture'];
    notes.push('capture: user-keywords → system-keywords');
  }

  if (newUserKw.length > 0) data['user-keywords'] = newUserKw;
  else delete data['user-keywords'];
  if (newSystemKw.length > 0) data['system-keywords'] = newSystemKw;
  else delete data['system-keywords'];
  if (hadScalarUserKw) notes.push('user-keywords normalized scalar → array (#545)');

  return { outcome: 'migrated', content: matter.stringify(parsed.content, data), notes };
}

async function migrateFile(file: string, dryRun: boolean): Promise<TransformResult['outcome']> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const result = transformFrontmatter(raw);
    if (result.outcome === 'migrated' && !dryRun) {
      await fs.writeFile(file, result.content, 'utf8');
    }
    if (result.outcome === 'migrated') {
      console.log(`  ${dryRun ? '[dry] ' : ''}${file}: ${result.notes.join('; ')}`);
    }
    return result.outcome;
  } catch (err) {
    console.error(`  ERROR ${file}: ${(err as Error).message}`);
    return 'error';
  }
}

async function processDir(root: string, dryRun: boolean, counts: Record<Outcome, number>): Promise<void> {
  for await (const file of walkMarkdown(root)) {
    const outcome = await migrateFile(file, dryRun);
    counts[outcome]++;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pagesDir = resolvePagesDir(args.dataDir);
  const requiredDir = resolveRequiredDir(args.requiredDir);

  const pagesExists = await fs.pathExists(pagesDir);
  const requiredExists = await fs.pathExists(requiredDir);
  if (!pagesExists && !requiredExists) {
    console.error(`Neither pages dir (${pagesDir}) nor required-pages dir (${requiredDir}) exists.`);
    process.exit(2);
  }

  console.log(`#893 vocabulary migration${args.dryRun ? ' (dry run)' : ''}`);
  const counts: Record<Outcome, number> = { migrated: 0, clean: 0, error: 0 };
  if (pagesExists) {
    console.log(`Pages: ${pagesDir}`);
    await processDir(pagesDir, args.dryRun, counts);
  }
  if (requiredExists) {
    console.log(`Required pages: ${requiredDir}`);
    await processDir(requiredDir, args.dryRun, counts);
  }

  console.log(`\nSummary: ${counts.migrated} migrated, ${counts.clean} already clean, ${counts.error} errors`);
  process.exit(counts.error > 0 ? 1 : 0);
}

// Only run when executed directly (not when imported by tests)
if (process.argv[1] && process.argv[1].includes('migrate-vocabulary-slice1')) {
  void main();
}
