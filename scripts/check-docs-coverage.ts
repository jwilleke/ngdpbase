#!/usr/bin/env tsx
/**
 * Docs coverage check (#660).
 *
 * Enforces the lightweight invariants from docs/DOCUMENTATION-STANDARDS.md
 * that the rest of the repo can't easily catch:
 *
 * ERROR  — fails CI / blocks the commit:
 *   1. A doc file's `code:` frontmatter field points to a source path that
 *      does not exist. (Stale reference.)
 *   2. A source file in src/managers/, src/plugins/, or src/providers/ is
 *      not mentioned anywhere in docs/Developer-Documentation.md. (New code
 *      slipped in without an index entry — exactly the failure mode #660
 *      was filed for.)
 *
 * WARN  — reported but does not fail:
 *   3. A source file in src/managers/, src/plugins/, or src/providers/
 *      has no dedicated doc page (docs/<category>/<Name>.md).
 *   4. A doc file in those three directories has no frontmatter at all,
 *      or no `code:` field. (Will become an error after the mass-conversion
 *      pass.)
 *
 * Run via `npm run lint:docs`. Integrated into `npm run lint`.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DocFrontmatter {
  name?: string;
  description?: string;
  category?: string;
  code?: string;
  dateModified?: string;
}

const REPO_ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(REPO_ROOT, 'docs', 'Developer-Documentation.md');
const TRACKED_CATEGORIES = ['managers', 'plugins', 'providers'] as const;
type Category = (typeof TRACKED_CATEGORIES)[number];

function listSourceFiles(category: Category): string[] {
  const dir = path.join(REPO_ROOT, 'src', category);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
    // Skip well-known helper files that aren't documented as modules.
    // - `types.ts` — TypeScript type declarations
    // - lowercase-leading names — utility helpers (`renderImage.ts` etc.);
    //   real managers/plugins/providers are PascalCase by convention.
    .filter((f) => f !== 'types.ts')
    .filter((f) => /^[A-Z]/.test(f))
    .map((f) => f.replace(/\.ts$/, ''));
}

function listDocFiles(category: Category): string[] {
  const dir = path.join(REPO_ROOT, 'docs', category);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !f.includes('-Complete-Guide'))
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

interface Finding {
  level: 'ERROR' | 'WARN';
  category: Category | 'global';
  message: string;
}

function check(): Finding[] {
  const findings: Finding[] = [];

  if (!existsSync(INDEX_PATH)) {
    findings.push({
      level: 'ERROR',
      category: 'global',
      message: `Index file missing: ${path.relative(REPO_ROOT, INDEX_PATH)}`
    });
    return findings;
  }
  const indexContent = readFileSync(INDEX_PATH, 'utf-8');

  for (const category of TRACKED_CATEGORIES) {
    const sources = listSourceFiles(category);
    const docs = listDocFiles(category);
    const docsSet = new Set(docs);

    // Rule 2: every source file must appear by name in the index.
    for (const src of sources) {
      const tokens = [src, `${src}.ts`, `${src}.md`];
      const found = tokens.some((t) => indexContent.includes(t));
      if (!found) {
        findings.push({
          level: 'ERROR',
          category,
          message:
            `src/${category}/${src}.ts is not mentioned in docs/Developer-Documentation.md. ` +
            `Add a row to the ${category} table so contributors can find it.`
        });
      }
    }

    // Rule 3: warn on source files without a dedicated doc page.
    for (const src of sources) {
      if (!docsSet.has(src)) {
        findings.push({
          level: 'WARN',
          category,
          message: `src/${category}/${src}.ts has no doc page at docs/${category}/${src}.md`
        });
      }
    }

    // Rules 1 + 4: every doc in this category must have frontmatter with
    // a valid `code:` field.
    for (const doc of docs) {
      const docPath = path.join(REPO_ROOT, 'docs', category, `${doc}.md`);
      const fm = parseFrontmatter(docPath);
      if (!fm) {
        findings.push({
          level: 'WARN',
          category,
          message: `docs/${category}/${doc}.md has no YAML frontmatter (DOCUMENTATION-STANDARDS.md requires it for ${category}/)`
        });
        continue;
      }
      if (!fm.code) {
        findings.push({
          level: 'WARN',
          category,
          message: `docs/${category}/${doc}.md frontmatter is missing the \`code:\` field`
        });
        continue;
      }
      const codeAbs = path.join(REPO_ROOT, fm.code);
      if (!existsSync(codeAbs) || !statSync(codeAbs).isFile()) {
        findings.push({
          level: 'ERROR',
          category,
          message: `docs/${category}/${doc}.md has \`code: ${fm.code}\` but that file does not exist`
        });
      }
    }
  }

  return findings;
}

function main(): void {
  const findings = check();
  const errors = findings.filter((f) => f.level === 'ERROR');
  const warns = findings.filter((f) => f.level === 'WARN');

  // Coverage summary
  console.log('Docs coverage check (#660)');
  console.log('==========================');
  for (const category of TRACKED_CATEGORIES) {
    const total = listSourceFiles(category).length;
    const docs = listDocFiles(category).length;
    const pct = total === 0 ? 0 : Math.round((docs / total) * 100);
    console.log(`  ${category.padEnd(10)} ${docs}/${total} documented (${pct}%)`);
  }
  console.log('');

  if (errors.length > 0) {
    console.log(`ERRORS (${errors.length}):`);
    for (const f of errors) console.log(`  [${f.category}] ${f.message}`);
    console.log('');
  }
  if (warns.length > 0) {
    console.log(`WARNINGS (${warns.length}):`);
    for (const f of warns) console.log(`  [${f.category}] ${f.message}`);
    console.log('');
  }

  if (errors.length === 0 && warns.length === 0) {
    console.log('All checks passed.');
  } else if (errors.length === 0) {
    console.log(`No errors. ${warns.length} warning(s) — see DOCUMENTATION-STANDARDS.md for the policy.`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
