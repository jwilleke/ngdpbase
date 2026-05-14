#!/usr/bin/env tsx
/**
 * One-shot migration: add the doc-style frontmatter (per
 * DOCUMENTATION-STANDARDS.md / #660) to every `.md` file in
 * `docs/{managers,plugins,providers}/` that doesn't already have it,
 * and backfill the `code:` field where it's missing.
 *
 * For each file:
 *   - Determines `name` from the filename
 *   - Determines `category` from the parent directory
 *   - Determines `code` by checking whether `src/<category>/<name>.ts` exists
 *     (omitted otherwise — e.g. for *-Guide.md, plugin-formatters.md,
 *     CalendarPlugin which lives in addons/calendar/, etc.)
 *   - Extracts `description` from the first non-empty paragraph after the
 *     first `# Title` heading; falls back to a generic placeholder if none
 *     can be inferred (rare — most docs have an Overview / opening line)
 *   - Sets `dateModified` to today
 *   - Sets `category` to the directory name
 *   - Leaves any other existing frontmatter fields intact
 *
 * Existing frontmatter values are preserved; only missing fields are added.
 * Run via `tsx scripts/migrate-docs-frontmatter.ts [--dry-run]`.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..');
const CATEGORIES = ['managers', 'plugins', 'providers'] as const;
const TODAY = '2026-05-14';
const DRY_RUN = process.argv.includes('--dry-run');

interface Frontmatter {
  name?: string;
  description?: string;
  dateModified?: string;
  category?: string;
  code?: string;
  relatedModules?: string[];
  version?: string;
  status?: string;
  author?: string;
}

function extractDescription(body: string): string | null {
  // Strip leading blank lines.
  const lines = body.split('\n');
  let i = 0;
  // Skip the first H1 if present.
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && lines[i].startsWith('# ')) i++;
  // Find the first non-empty, non-heading, non-bold-label line that has
  // enough content to be a description.
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('**') && line.endsWith('**')) continue;
    if (line.startsWith('---')) continue;
    if (line.startsWith('| ') || line.startsWith('|---')) continue;
    if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('+ ')) continue;
    if (line.startsWith('> ')) continue;
    if (line.startsWith('```')) continue;
    if (line.startsWith('!')) continue;
    if (/^\d+\.\s/.test(line)) continue;
    // Strip markdown links / bold / italic.
    let desc = line
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
    if (desc.length > 200) desc = desc.slice(0, 197).trimEnd() + '…';
    return desc;
  }
  return null;
}

function parseFrontmatter(content: string): { fm: Frontmatter | null; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { fm: null, body: content };
  try {
    const fm = yaml.load(match[1]) as Frontmatter;
    return { fm: fm || {}, body: match[2] };
  } catch {
    return { fm: null, body: content };
  }
}

function serializeFrontmatter(fm: Frontmatter): string {
  // Preserve key order: name, description, dateModified, category, code,
  // then any other fields in insertion order. js-yaml's `dump` defaults are
  // reasonable; force flowLevel=-1 (block style) and lineWidth=200.
  const ordered: Record<string, unknown> = {};
  for (const k of ['name', 'description', 'dateModified', 'category', 'code', 'relatedModules', 'version', 'status', 'author']) {
    if (fm[k as keyof Frontmatter] !== undefined) {
      ordered[k] = fm[k as keyof Frontmatter];
    }
  }
  // Include any other keys preserved as-is.
  for (const k of Object.keys(fm)) {
    if (!(k in ordered)) ordered[k] = (fm as Record<string, unknown>)[k];
  }
  return yaml.dump(ordered, { lineWidth: 200, noRefs: true }).trimEnd();
}

interface Result {
  path: string;
  action: 'skipped' | 'added' | 'updated';
  reason?: string;
}

function migrateOne(category: string, file: string): Result {
  const absPath = path.join(REPO_ROOT, 'docs', category, file);
  const relPath = path.relative(REPO_ROOT, absPath);
  const content = readFileSync(absPath, 'utf-8');
  const { fm: existing, body } = parseFrontmatter(content);

  const name = file.replace(/\.md$/, '');
  const srcCandidate = `src/${category}/${name}.ts`;
  const srcExists = existsSync(path.join(REPO_ROOT, srcCandidate)) &&
    statSync(path.join(REPO_ROOT, srcCandidate)).isFile();

  // Build the new frontmatter, starting from any existing values.
  const next: Frontmatter = { ...(existing || {}) };

  let changed = false;

  // name
  if (!next.name) {
    next.name = name;
    changed = true;
  }
  // description — extract from body only if absent
  if (!next.description) {
    const desc = extractDescription(body) || `${name} documentation`;
    next.description = desc;
    changed = true;
  }
  // category
  if (next.category !== category) {
    next.category = category;
    changed = true;
  }
  // dateModified — set if missing; do NOT touch if already present (avoid
  // gratuitous diff churn on files that have a meaningful prior date).
  if (!next.dateModified) {
    next.dateModified = TODAY;
    changed = true;
  }
  // code — only set if source file exists and the field is missing.
  if (!next.code && srcExists) {
    next.code = srcCandidate;
    changed = true;
  }

  // Drive-by: fix stale `src/<cat>/<Name>.js` references in the body to
  // `.ts`, but only when the .ts source actually exists (avoids breaking
  // historical .js references to truly removed files).
  let updatedBody = body;
  if (srcExists) {
    const stalePattern = new RegExp(`src/${category}/${name}\\.js\\b`, 'g');
    if (stalePattern.test(updatedBody)) {
      updatedBody = updatedBody.replace(stalePattern, `src/${category}/${name}.ts`);
      changed = true;
    }
  }

  if (!changed) {
    return { path: relPath, action: 'skipped', reason: 'already complete' };
  }

  const newFmBlock = `---\n${serializeFrontmatter(next)}\n---\n`;
  // Preserve a single trailing newline between frontmatter and body.
  const bodyTrimmed = updatedBody.replace(/^\n+/, '');
  const newContent = `${newFmBlock}\n${bodyTrimmed}`;

  if (!DRY_RUN) {
    writeFileSync(absPath, newContent, 'utf-8');
  }
  const action: Result['action'] = existing ? 'updated' : 'added';
  return { path: relPath, action };
}

function main(): void {
  console.log(DRY_RUN ? 'DRY RUN — no files will be written\n' : 'Migrating doc frontmatter\n');
  const results: Result[] = [];

  for (const category of CATEGORIES) {
    const dir = path.join(REPO_ROOT, 'docs', category);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .filter((f) => !f.includes('-Complete-Guide'))
      .filter((f) => !f.startsWith('_'));
    for (const f of files) {
      results.push(migrateOne(category, f));
    }
  }

  const added = results.filter((r) => r.action === 'added').length;
  const updated = results.filter((r) => r.action === 'updated').length;
  const skipped = results.filter((r) => r.action === 'skipped').length;

  for (const r of results) {
    const mark = r.action === 'added' ? '+' : r.action === 'updated' ? '~' : '=';
    console.log(`  ${mark} ${r.path}`);
  }

  console.log('');
  console.log(`Summary: +${added} added  ~${updated} updated  =${skipped} unchanged`);
  if (DRY_RUN) console.log('(dry run — no files written)');
}

main();
