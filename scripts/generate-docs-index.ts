#!/usr/bin/env tsx
/**
 * Auto-generates the canonical index tables in
 * `docs/Developer-Documentation.md` (#660 follow-up).
 *
 * Reads frontmatter from `docs/{managers,plugins,providers}/*.md` (the
 * mass-converted descriptions from `8b15ffbc`) and the actual file
 * inventory in `src/{managers,plugins,providers}/`, then rewrites the
 * regions between marker pairs:
 *
 *   <!-- AUTO:quick-nav BEGIN -->
 *   <!-- AUTO:quick-nav END -->
 *
 *   <!-- AUTO:<category>-table BEGIN -->
 *   <!-- AUTO:<category>-table END -->
 *
 *   <!-- AUTO:doc-status BEGIN -->
 *   <!-- AUTO:doc-status END -->
 *
 * Modes:
 *   --check     Don't write; exit 1 if the generated output would differ
 *               from disk. Used by `npm run docs:index:check` and the
 *               pre-commit hook.
 *   (default)   Write the file in place. Used by `npm run docs:index`.
 *
 * Tradeoffs picked (see #660 thread):
 *   - Source-only rows show `_no doc page yet_` rather than parsing
 *     JSDoc out of the .ts file. Honest, minimal, nudges toward stubs.
 *   - Quick-nav counts auto-update; the Architecture/Testing/API rows
 *     are hardcoded in this file since they don't map to src/.
 *   - Anything outside the marker pairs stays hand-editable.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(REPO_ROOT, 'docs', 'Developer-Documentation.md');
const CHECK = process.argv.includes('--check');

const CATEGORIES = ['managers', 'plugins', 'providers'] as const;
type Category = (typeof CATEGORIES)[number];

interface DocFrontmatter {
  name?: string;
  description?: string;
  category?: string;
  code?: string;
  status?: string;
}

interface ModuleRow {
  name: string;
  description: string;
  hasDoc: boolean;
  hasCompleteGuide: boolean;
  hasSource: boolean;
}

// ─── Inventory ────────────────────────────────────────────────────────────

function listSourceFiles(category: Category): string[] {
  const dir = path.join(REPO_ROOT, 'src', category);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
    .filter((f) => f !== 'types.ts')
    .filter((f) => /^[A-Z]/.test(f))
    .map((f) => f.replace(/\.ts$/, ''));
}

function listDocFiles(category: Category): string[] {
  const dir = path.join(REPO_ROOT, 'docs', category);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !f.startsWith('_'))
    .map((f) => f.replace(/\.md$/, ''));
}

function parseFrontmatter(filePath: string): DocFrontmatter | null {
  const content = readFileSync(filePath, 'utf-8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    return yaml.load(match[1]) as DocFrontmatter;
  } catch {
    return null;
  }
}

function collectRows(category: Category): ModuleRow[] {
  const sources = new Set(listSourceFiles(category));
  const docs = listDocFiles(category);
  const docNames = new Set(docs.filter((d) => !d.includes('-Complete-Guide')));

  const names = new Set<string>([...sources, ...docNames]);
  const rows: ModuleRow[] = [];
  for (const name of names) {
    const docPath = path.join(REPO_ROOT, 'docs', category, `${name}.md`);
    const guidePath = path.join(REPO_ROOT, 'docs', category, `${name}-Complete-Guide.md`);
    const hasDoc = existsSync(docPath);
    const hasGuide = existsSync(guidePath);
    const hasSource = sources.has(name);
    const fm = hasDoc ? parseFrontmatter(docPath) : null;
    const description = fm?.description?.trim() || (hasDoc ? '' : '_no doc page yet_');
    rows.push({ name, description, hasDoc, hasCompleteGuide: hasGuide, hasSource });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

// ─── Renderers ────────────────────────────────────────────────────────────

function statusCell(category: Category, row: ModuleRow): string {
  if (row.hasDoc && row.hasCompleteGuide) {
    return `📘 [doc](${category}/${row.name}.md) + [guide](${category}/${row.name}-Complete-Guide.md)`;
  }
  if (row.hasDoc) {
    return `✅ [doc](${category}/${row.name}.md)`;
  }
  return `⚠️ [src/${category}/${row.name}.ts](../src/${category}/${row.name}.ts)`;
}

function renderModuleTable(category: Category, rows: ModuleRow[]): string {
  const lines: string[] = [];
  lines.push('| Module | Doc status | Description |');
  lines.push('| --- | --- | --- |');
  for (const r of rows) {
    const desc = r.description || '_no description in frontmatter_';
    lines.push(`| ${r.name} | ${statusCell(category, r)} | ${desc} |`);
  }
  return lines.join('\n');
}

function renderQuickNav(byCategory: Record<Category, ModuleRow[]>): string {
  const lines: string[] = [];
  lines.push('| Category | Count (src/) | Documented | Description |');
  lines.push('| ---------- | --- | --- | ------------- |');
  for (const cat of CATEGORIES) {
    const rows = byCategory[cat];
    const total = rows.filter((r) => r.hasSource).length;
    const documented = rows.filter((r) => r.hasDoc).length;
    const label = cat[0].toUpperCase() + cat.slice(1);
    const blurb =
      cat === 'managers' ? 'Core system managers' :
        cat === 'plugins' ? 'JSPWiki-style content plugins' :
          'Storage and service providers';
    lines.push(`| [${label}](#${cat}) | ${total} | ${documented} | ${blurb} |`);
  }
  // Hand-curated rows for non-module sections.
  lines.push('| [Architecture](#architecture) | n/a | 15+ | System design and patterns |');
  lines.push('| [Testing](#testing) | n/a | 3 | Testing guides and strategies |');
  lines.push('| [API](#api-reference) | n/a | Auto-gen | TypeDoc generated API reference |');
  return lines.join('\n');
}

function renderDocStatus(byCategory: Record<Category, ModuleRow[]>): string {
  const lines: string[] = [];
  for (const cat of CATEGORIES) {
    const rows = byCategory[cat];
    const total = rows.filter((r) => r.hasSource).length;
    const documented = rows.filter((r) => r.hasDoc && r.hasSource).length;
    const withGuide = rows.filter((r) => r.hasCompleteGuide && r.hasSource).length;
    const pct = total === 0 ? 0 : Math.round((documented / total) * 100);
    const sourceOnly = rows.filter((r) => r.hasSource && !r.hasDoc).map((r) => r.name);
    const label = cat[0].toUpperCase() + cat.slice(1);
    // __bold__, not **bold** — MD050 is pinned to underscore, and generated
    // output has to satisfy the same rules as everything else in the repo.
    lines.push(`__${label}:__ ${documented}/${total} with quick-reference docs (${pct}%)` +
      (withGuide > 0 ? `; ${withGuide} with Complete Guides` : '') +
      (sourceOnly.length > 0 ? `. ${sourceOnly.length} source-only:` : '.'));
    lines.push('');
    if (sourceOnly.length > 0) {
      lines.push(`- ${sourceOnly.join(', ')}`);
      lines.push('');
    }
  }
  return lines.join('\n').trimEnd();
}

// ─── Marker rewriter ──────────────────────────────────────────────────────

function rewriteRegion(content: string, marker: string, body: string): string {
  const begin = `<!-- AUTO:${marker} BEGIN -->`;
  const end = `<!-- AUTO:${marker} END -->`;
  const pattern = new RegExp(
    `(${escapeRegex(begin)})[\\s\\S]*?(${escapeRegex(end)})`,
    'g'
  );
  if (!pattern.test(content)) {
    throw new Error(`Marker pair "${marker}" not found in index file`);
  }
  return content.replace(pattern, (_m, b, e) => `${b}\n${body}\n${e}`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Main ─────────────────────────────────────────────────────────────────

function main(): void {
  const byCategory: Record<Category, ModuleRow[]> = {
    managers: collectRows('managers'),
    plugins: collectRows('plugins'),
    providers: collectRows('providers')
  };

  let content = readFileSync(INDEX_PATH, 'utf-8');
  content = rewriteRegion(content, 'quick-nav', renderQuickNav(byCategory));
  for (const cat of CATEGORIES) {
    content = rewriteRegion(content, `${cat}-table`, renderModuleTable(cat, byCategory[cat]));
  }
  content = rewriteRegion(content, 'doc-status', renderDocStatus(byCategory));

  const onDisk = readFileSync(INDEX_PATH, 'utf-8');
  if (content === onDisk) {
    console.log('docs/Developer-Documentation.md is up to date.');
    return;
  }

  if (CHECK) {
    console.error('docs/Developer-Documentation.md is OUT OF DATE.');
    console.error('Run `npm run docs:index` to regenerate.');
    process.exit(1);
  }

  writeFileSync(INDEX_PATH, content, 'utf-8');
  console.log('docs/Developer-Documentation.md regenerated.');
}

main();
