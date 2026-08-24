/**
 * #641: repair malformed YAML frontmatter from JSPWiki imports.
 *
 * Two patterns observed:
 *
 *   Pattern 1 — missing closing fence (~48 jimstest pages):
 *     File starts with `---` but never has a second `---`. Strict YAML tries to
 *     parse the entire file as a mapping and chokes on body content.
 *
 *   Pattern 2 — JSPWiki ACL markup leaked inside frontmatter (~8 jimstest pages):
 *     Frontmatter has both fences but contains lines like `[{ALLOW view Trusted}]`
 *     between YAML keys. Those are JSPWiki ACL markers — the legacy equivalent of
 *     the new `audience` / `access` fields, which already exist on these pages so
 *     the markers are redundant. Strip them.
 *
 * Usage:
 *   npm run repair:frontmatter             # apply changes
 *   npm run repair:frontmatter:dry         # preview changes
 *
 * Or directly:
 *   tsx scripts/repair-jspwiki-frontmatter.ts [--dry-run] [--data <path>]
 *
 * The repair preserves the page body verbatim. The script does NOT rewrite
 * page-index.json — VersioningFileProvider will re-read repaired files on the
 * next save (or stop server / delete index / restart for a hard re-sync).
 */

// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment (#1091).
import '../src/bootstrap-env.js';
import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import yaml from 'js-yaml';

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

export type Outcome = 'clean' | 'repaired-pattern1' | 'repaired-pattern2' | 'unrepaired';

export interface RepairResult {
  outcome: Outcome;
  /** New file contents when outcome starts with 'repaired-'; otherwise the input unchanged. */
  content: string;
  /** Diagnostic message when outcome === 'unrepaired'. */
  reason?: string;
}

const ALLOW_LINE_RE = /^\s*\[\{ALLOW\b[^}]*\}\]\s*$/;

/**
 * Strip JSPWiki `[{...}]` plugin/ACL markup from a list of frontmatter lines.
 *
 * Handles three sub-cases:
 *  - single-line markup like `[{ALLOW view Trusted}]`
 *  - multi-line markup spans like `[{If group='Admin'\n  <div>...</div>}]`
 *    (scanned by tracking unbalanced `[{` until the matching `}]`)
 *  - whitespace-only lines that result inside a stripped span
 *
 * Returns the filtered lines plus a count of how many were stripped.
 */
function stripJspwikiMarkup(lines: string[]): { lines: string[]; stripped: number } {
  const out: string[] = [];
  let stripped = 0;
  let inSpan = false; // true while inside a multi-line `[{...}]` block
  for (const line of lines) {
    if (inSpan) {
      stripped++;
      if (line.includes('}]')) inSpan = false;
      continue;
    }
    if (ALLOW_LINE_RE.test(line)) {
      stripped++;
      continue;
    }
    // Multi-line plugin start: `[{Name ...` without a closing `}]` on the same line.
    const trimmed = line.trim();
    if (/^\[\{[A-Z][a-zA-Z]*\b/.test(trimmed) && !line.includes('}]')) {
      inSpan = true;
      stripped++;
      continue;
    }
    out.push(line);
  }
  return { lines: out, stripped };
}

/**
 * Pure string-in/string-out transform. Tries gray-matter first (clean files
 * pass straight through), then tries each repair strategy in order.
 */
export function repairFrontmatter(raw: string): RepairResult {
  // Fast path: already parses cleanly.
  try {
    matter(raw);
    return { outcome: 'clean', content: raw };
  } catch { /* needs repair */ }

  const lines = raw.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { outcome: 'unrepaired', content: raw, reason: 'no opening --- fence' };
  }

  // Find closing fence (after the opening one).
  const closingIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');

  // ----- Pattern 2: closing fence exists; strip JSPWiki markup from frontmatter -----
  // Note: the closing fence we detect may be a false positive — a `---` line
  // inside a fenced code block in the body. If pattern-2 repair fails, fall
  // through to pattern 1 which scans for the longest YAML-parseable prefix.
  if (closingIdx > 0) {
    const fmLines = lines.slice(1, closingIdx);
    const { lines: stripped, stripped: count } = stripJspwikiMarkup(fmLines);
    if (count > 0) {
      // Drop trailing blank lines from the stripped frontmatter.
      while (stripped.length > 0 && stripped[stripped.length - 1].trim() === '') {
        stripped.pop();
      }
      const repaired = ['---', ...stripped, '---', ...lines.slice(closingIdx + 1)].join('\n');
      try {
        matter(repaired);
        return { outcome: 'repaired-pattern2', content: repaired };
      } catch { /* fall through to pattern-1 */ }
    }
    // Either no markup to strip OR pattern-2 still didn't parse. Fall through.
  }

  // ----- Pattern 1: no closing fence. Find the largest YAML-parseable prefix. -----
  // Walk forward through lines after the opening `---`. Try to parse the
  // accumulated content as YAML. The longest prefix that parses cleanly AND
  // produces an object with a `title` field is the frontmatter.
  let bestEnd = -1; // exclusive index — last accepted line is bestEnd - 1
  for (let n = 1; n <= lines.length; n++) {
    const candidate = lines.slice(1, n).join('\n');
    try {
      const parsed = yaml.load(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'title' in parsed) {
        bestEnd = n;
      }
    } catch { /* parse failure — stop searching */
      break;
    }
  }
  if (bestEnd <= 1) {
    return { outcome: 'unrepaired', content: raw, reason: 'pattern1: could not find a YAML-parseable prefix with a title field' };
  }

  // Walk back from bestEnd to drop any trailing blank lines from the frontmatter.
  let fmEnd = bestEnd;
  while (fmEnd > 1 && lines[fmEnd - 1].trim() === '') {
    fmEnd--;
  }
  const fmContent = lines.slice(1, fmEnd);
  const body = lines.slice(fmEnd); // includes any blank line that originally separated FM from body
  const repaired = ['---', ...fmContent, '---', ...body].join('\n');

  // Verify.
  try {
    matter(repaired);
    return { outcome: 'repaired-pattern1', content: repaired };
  } catch (err) {
    return { outcome: 'unrepaired', content: raw, reason: `pattern1 repair still fails: ${(err as Error).message}` };
  }
}

async function repairFile(filePath: string, dryRun: boolean): Promise<Outcome> {
  const raw = await fs.readFile(filePath, 'utf8');
  const result = repairFrontmatter(raw);
  if ((result.outcome === 'repaired-pattern1' || result.outcome === 'repaired-pattern2') && !dryRun) {
    await fs.writeFile(filePath, result.content, 'utf8');
  }
  if (result.outcome === 'unrepaired') {
    console.error(`  ✗ UNREPAIRED ${path.relative(process.cwd(), filePath)}: ${result.reason}`);
  }
  return result.outcome;
}

async function processDir(dir: string, label: string, dryRun: boolean): Promise<Record<Outcome, number>> {
  const totals: Record<Outcome, number> = { clean: 0, 'repaired-pattern1': 0, 'repaired-pattern2': 0, unrepaired: 0 };
  if (!(await fs.pathExists(dir))) {
    console.log(`  (skip) ${label} not found: ${dir}`);
    return totals;
  }
  console.log(`\n${label}: ${dir}`);

  for await (const filePath of walkMarkdown(dir)) {
    try {
      const outcome = await repairFile(filePath, dryRun);
      totals[outcome]++;
      if (outcome === 'repaired-pattern1' || outcome === 'repaired-pattern2') {
        const tag = dryRun ? '[would repair]' : '✓ repaired';
        const pat = outcome === 'repaired-pattern1' ? '(no closing fence)' : '(stripped ALLOW lines)';
        console.log(`  ${tag} ${pat} ${path.relative(process.cwd(), filePath)}`);
      }
    } catch (err) {
      totals.unrepaired++;
      console.error(`  ✗ ERROR ${filePath}: ${(err as Error).message}`);
    }
  }
  return totals;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pagesDir = resolvePagesDir(args.dataDir);
  const requiredDir = resolveRequiredDir(args.requiredDir);

  console.log('#641 — JSPWiki frontmatter repair');
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
    clean: pagesTotals.clean + requiredTotals.clean,
    'repaired-pattern1': pagesTotals['repaired-pattern1'] + requiredTotals['repaired-pattern1'],
    'repaired-pattern2': pagesTotals['repaired-pattern2'] + requiredTotals['repaired-pattern2'],
    unrepaired: pagesTotals.unrepaired + requiredTotals.unrepaired
  };

  console.log('\nSummary:');
  console.log(`  Clean:                  ${grand.clean}`);
  console.log(`  Repaired (pattern 1):   ${grand['repaired-pattern1']}  (no closing fence)`);
  console.log(`  Repaired (pattern 2):   ${grand['repaired-pattern2']}  (stripped ALLOW lines)`);
  console.log(`  Unrepaired:             ${grand.unrepaired}`);

  if (args.dryRun && (grand['repaired-pattern1'] + grand['repaired-pattern2']) > 0) {
    console.log('\nRe-run without --dry-run to apply.');
  }

  process.exit(grand.unrepaired > 0 ? 1 : 0);
}

const invokedAsScript = (() => {
  const argv1 = process.argv[1] ?? '';
  return argv1.endsWith('repair-jspwiki-frontmatter.ts')
    || argv1.endsWith('repair-jspwiki-frontmatter.js');
})();

if (invokedAsScript) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
