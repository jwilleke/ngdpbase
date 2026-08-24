/**
 * #778 Slice 1: one-time migration of legacy `[{ALLOW <action> <principals>}]` page-ACL
 * markup → frontmatter `audience` / `access` fields (Tier 1 of the ACL evaluator).
 *
 * Walks every .md page file under the configured pages directories. For any page
 * with `[{ALLOW ...}]` lines in the body, derives the equivalent audience/access
 * frontmatter and strips the legacy markup from the body. Other frontmatter fields
 * (especially `lastModified` and `user-keywords`) are preserved untouched.
 *
 * Tier 3 markup → frontmatter mapping:
 *   - `[{ALLOW view All}]`        → no audience/access (public is the default)
 *   - `[{ALLOW view <P1,P2,…>}]`  → `audience: [P1, P2, …]`
 *   - `[{ALLOW <action> <P…>}]`   → `access: { <action>: [P…] }` for non-view actions
 *
 * Trailing `principal` keyword and surrounding whitespace are tolerated (legacy
 * JSPWiki variants observed on real pages).
 *
 * Multiple ALLOW lines for the same action union together. Existing frontmatter
 * `audience` / `access` is merged with the derived values, not overwritten — re-runs
 * are idempotent because the second run finds no markup to migrate.
 *
 * Usage:
 *   npm run migrate:page-acl              # apply changes
 *   npm run migrate:page-acl:dry          # preview changes
 *
 * Or directly:
 *   tsx scripts/migrate-page-acl-to-frontmatter.ts [--dry-run] [--data <path>]
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
 * Page-index note: this script edits .md files only. The page-index will catch up the
 * next time each page is saved via PageManager, or on the next full rebuild.
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
// VersioningFileProvider lays them out as pages/versions/<uuid>/v{N}/content.md (plus
// pages/versions/private/<creator>/<uuid>/...). Migrating history would rewrite
// recorded revisions — we touch live pages only.
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

// Standalone ALLOW lines: leading/trailing whitespace, optional trailing
// `principal` keyword (legacy JSPWiki variant), action is a single word,
// principals are a comma-separated list. The entire line must be the markup
// (nothing else) so embedded mentions in docs/tests don't get rewritten.
const ALLOW_LINE_RE = /^\s*\[\{ALLOW\s+(\w+)\s+([^}]+?)(?:\s+principal\s*)?\}\]\s*$/;

export type Outcome = 'migrated' | 'no-markup' | 'error';

export interface TransformResult {
  outcome: Outcome;
  /** New file contents when outcome === 'migrated'; otherwise the input unchanged. */
  content: string;
  /** Per-action principal sets derived from the ALLOW markup (for the per-file report). */
  derived?: {
    audience: string[];
    access: Record<string, string[]>;
    publicViewSeen: boolean;
  };
}

/**
 * Pure string-in/string-out transform. Exported so it can be tested without
 * touching the filesystem.
 */
export function transformFrontmatter(raw: string): TransformResult {
  const parsed = matter(raw);
  // gray-matter caches the parsed `data` object by input string — clone before
  // mutating so we don't poison the cache for subsequent calls.
  const data: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) };

  // Pass 1 — find and strip ALLOW lines; collect action → principals.
  const lines = parsed.content.split('\n');
  const remaining: string[] = [];
  const actionPrincipals = new Map<string, Set<string>>();
  let publicViewSeen = false;
  let anyMatched = false;

  for (const line of lines) {
    const m = line.match(ALLOW_LINE_RE);
    if (!m) {
      remaining.push(line);
      continue;
    }
    anyMatched = true;
    const action = m[1].toLowerCase();
    const principals = m[2].split(',').map(p => p.trim()).filter(Boolean);
    if (action === 'view' && principals.some(p => p.toLowerCase() === 'all')) {
      publicViewSeen = true;
      const nonAll = principals.filter(p => p.toLowerCase() !== 'all');
      if (nonAll.length > 0) {
        if (!actionPrincipals.has('view')) actionPrincipals.set('view', new Set());
        for (const p of nonAll) actionPrincipals.get('view')!.add(p);
      }
    } else {
      if (!actionPrincipals.has(action)) actionPrincipals.set(action, new Set());
      for (const p of principals) actionPrincipals.get(action)!.add(p);
    }
  }

  if (!anyMatched) return { outcome: 'no-markup', content: raw };

  // Pass 2 — apply to frontmatter, merging with existing values (union).
  const viewPrincipals = actionPrincipals.get('view') ?? new Set<string>();
  actionPrincipals.delete('view');

  // audience: only set when view was constrained to specific principals (not `All`).
  // If `view All` was the only view line we drop the field — public is the default.
  if (!publicViewSeen && viewPrincipals.size > 0) {
    const existing = Array.isArray(data.audience) ? (data.audience as unknown[]).map(String) : [];
    const merged = mergeUnique(existing, [...viewPrincipals]);
    data.audience = merged;
  } else if (publicViewSeen && viewPrincipals.size > 0) {
    // `view All` + `view Trusted` is a contradiction in JSPWiki semantics.
    // Preserve the more-restrictive view: keep `audience` set, drop `All`.
    const existing = Array.isArray(data.audience) ? (data.audience as unknown[]).map(String) : [];
    const merged = mergeUnique(existing, [...viewPrincipals]);
    data.audience = merged;
  }
  // else: pure `view All` (or no view lines) — leave audience alone.

  // access.<action> for non-view actions.
  if (actionPrincipals.size > 0) {
    const existingAccess = (data.access && typeof data.access === 'object')
      ? { ...(data.access as Record<string, unknown>) }
      : {};
    for (const [action, principals] of actionPrincipals) {
      const existingForAction = Array.isArray(existingAccess[action])
        ? (existingAccess[action] as unknown[]).map(String)
        : [];
      existingAccess[action] = mergeUnique(existingForAction, [...principals]);
    }
    data.access = existingAccess;
  }

  // Trim leading blank lines left behind by stripping the markup.
  while (remaining.length > 0 && remaining[0].trim() === '') remaining.shift();
  const newBody = remaining.join('\n');

  return {
    outcome: 'migrated',
    content: matter.stringify(newBody, data),
    derived: {
      audience: Array.isArray(data.audience) ? (data.audience as unknown[]).map(String) : [],
      access: extractAccessSummary(data.access),
      publicViewSeen
    }
  };
}

function mergeUnique(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...a, ...b]) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function extractAccessSummary(access: unknown): Record<string, string[]> {
  if (!access || typeof access !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(access as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = v.map(String);
  }
  return out;
}

interface FileResult {
  outcome: Outcome;
  derived?: TransformResult['derived'];
}

async function migrateFile(filePath: string, dryRun: boolean): Promise<FileResult> {
  const raw = await fs.readFile(filePath, 'utf8');
  const result = transformFrontmatter(raw);
  if (result.outcome === 'migrated' && !dryRun) {
    await fs.writeFile(filePath, result.content, 'utf8');
  }
  return { outcome: result.outcome, derived: result.derived };
}

function fmtDerived(d: TransformResult['derived']): string {
  if (!d) return '';
  const parts: string[] = [];
  if (d.publicViewSeen && d.audience.length === 0) parts.push('view=public');
  if (d.audience.length > 0) parts.push(`audience=[${d.audience.join(', ')}]`);
  for (const [action, principals] of Object.entries(d.access)) {
    parts.push(`access.${action}=[${principals.join(', ')}]`);
  }
  return parts.join('; ');
}

async function processDir(dir: string, label: string, dryRun: boolean): Promise<Record<Outcome, number>> {
  const totals: Record<Outcome, number> = { migrated: 0, 'no-markup': 0, error: 0 };
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
        const rel = path.relative(process.cwd(), filePath);
        console.log(`  ${tag}  ${rel}`);
        const summary = fmtDerived(result.derived);
        if (summary) console.log(`      → ${summary}`);
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

  console.log('#778 Slice 1 — Page-ACL markup → frontmatter migration');
  console.log(`  Mode: ${args.dryRun ? 'DRY RUN (no writes)' : 'APPLY'}`);
  console.log(`  Pages directory:    ${pagesDir}`);
  console.log(`  Required directory: ${requiredDir}`);

  if (!(await fs.pathExists(pagesDir)) && !(await fs.pathExists(requiredDir))) {
    console.error('Both directories missing. Pass --data and/or --required to override.');
    process.exit(2);
  }

  const pagesTotals = await processDir(pagesDir, 'pages', args.dryRun);
  const requiredTotals = await processDir(requiredDir, 'required-pages', args.dryRun);

  const grand: Record<Outcome, number> = {
    migrated: pagesTotals.migrated + requiredTotals.migrated,
    'no-markup': pagesTotals['no-markup'] + requiredTotals['no-markup'],
    error: pagesTotals.error + requiredTotals.error
  };

  console.log('\nSummary:');
  console.log(`  Migrated:    ${grand.migrated}`);
  console.log(`  No markup:   ${grand['no-markup']}`);
  console.log(`  Errors:      ${grand.error}`);

  if (args.dryRun && grand.migrated > 0) {
    console.log('\nRe-run without --dry-run to apply.');
  }
  if (grand.migrated > 0 && !args.dryRun) {
    console.log('\nNote: data/page-index.json is NOT rewritten by this script. The index will catch up');
    console.log('on the next save of each page, or via a `pages.rebuild` job.');
  }

  process.exit(grand.error > 0 ? 1 : 0);
}

const invokedAsScript = (() => {
  const argv1 = process.argv[1] ?? '';
  return argv1.endsWith('migrate-page-acl-to-frontmatter.ts')
    || argv1.endsWith('migrate-page-acl-to-frontmatter.js');
})();

if (invokedAsScript) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
