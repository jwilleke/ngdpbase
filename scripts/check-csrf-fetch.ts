#!/usr/bin/env tsx
/**
 * CSRF client-fetch guard (#727).
 *
 * The app-wide CSRF middleware (#663, src/app.ts) rejects every
 * state-changing request (POST/PUT/DELETE/PATCH) that doesn't carry the
 * token, returning a text/plain 403 the client's `r.json()` then chokes
 * on — surfacing only an opaque failure. Three bugs (#690, #709, and the
 * nine #727 rows) were all "client code that issued a raw fetch() for a
 * mutation without the token."
 *
 * The per-surface content-invariant tests catch a regression of the
 * *known* files. This guard catches *new* tokenless mutations anywhere
 * in the client surface before they ship — the durable measure that ends
 * the discover-via-operator-report cycle.
 *
 * Heuristic (matches the manual audit that produced an accurate result):
 * a client-surface file is a violation if it contains a bare `fetch(`
 * with a `method:` of POST/PUT/DELETE/PATCH AND the file references no
 * CSRF mechanism at all (`csrfFetch`, `X-CSRF-Token`, or `_csrf`). The
 * fix is always to route the mutation through `window.csrfFetch` (or, in
 * an EJS view with the token in scope, an `X-CSRF-Token` header).
 *
 * Escape hatch: a genuine server-side mutating fetch (e.g. a plugin
 * calling an external API during render — not subject to browser CSRF)
 * can add `// csrf-guard-ignore` anywhere in the file.
 *
 * Run via `npm run lint:csrf`. Wired into `npm run lint` / `lint:ci` /
 * `.husky/pre-commit`. Exits 1 on any violation.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '..');

/** Directories whose files run (or generate scripts that run) in the browser. */
const SCAN_DIRS = [
  'public/js',
  'views',
  'src/plugins',
  'src/parsers/handlers'
];
/** Addon client assets — addons/<name>/public/**. */
const ADDON_PUBLIC_GLOB = 'addons';

const FILE_EXT = new Set(['.js', '.ejs', '.ts']);
const IGNORE_FILE = new Set([
  // The csrfFetch wrapper itself necessarily calls the real fetch().
  'public/js/csrf.js'
]);
const SUPPRESS_MARKER = 'csrf-guard-ignore';

const MUTATION_METHOD = /\bmethod\s*:\s*['"`](POST|PUT|DELETE|PATCH)['"`]/i;
// A real fetch( call that is NOT csrfFetch( and NOT the
// `(window.csrfFetch || fetch)(` wrapper form.
const BARE_FETCH = /(?<![\w.])fetch\s*\(/g;

interface Violation {
  file: string;
  line: number;
  snippet: string;
}

function walk(dir: string, acc: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, acc);
    } else if (FILE_EXT.has(path.extname(entry))) {
      acc.push(full);
    }
  }
}

function collectFiles(): string[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(path.join(REPO, d), files);
  // addons/<name>/public/**
  const addonsRoot = path.join(REPO, ADDON_PUBLIC_GLOB);
  if (existsSync(addonsRoot)) {
    for (const addon of readdirSync(addonsRoot)) {
      const pub = path.join(addonsRoot, addon, 'public');
      if (existsSync(pub) && statSync(pub).isDirectory()) walk(pub, files);
    }
  }
  return files;
}

function hasCsrfMechanism(src: string): boolean {
  return (
    src.includes('csrfFetch') ||
    /X-CSRF-Token/i.test(src) ||
    /\b_csrf\b/.test(src)
  );
}

function findViolations(): Violation[] {
  const out: Violation[] = [];
  for (const abs of collectFiles()) {
    const rel = path.relative(REPO, abs);
    if (IGNORE_FILE.has(rel)) continue;
    const src = readFileSync(abs, 'utf-8');
    if (src.includes(SUPPRESS_MARKER)) continue;
    if (!MUTATION_METHOD.test(src)) continue; // no mutating fetch anywhere
    if (hasCsrfMechanism(src)) continue; // file handles CSRF — trust it

    // File has a mutating method: and zero CSRF mechanism. Pin the line(s)
    // of the offending bare fetch( for an actionable message.
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      BARE_FETCH.lastIndex = 0;
      if (BARE_FETCH.test(lines[i])) {
        // Look ahead a small window for the mutating method.
        const windowText = lines.slice(i, i + 6).join('\n');
        if (MUTATION_METHOD.test(windowText)) {
          out.push({ file: rel, line: i + 1, snippet: lines[i].trim().slice(0, 100) });
        }
      }
    }
    // Fallback: file flagged but the per-line pin missed (e.g. method on a
    // far line) — still report the file so it isn't silently passed.
    if (!out.some((v) => v.file === rel)) {
      out.push({ file: rel, line: 0, snippet: '(mutating fetch without CSRF token — see file)' });
    }
  }
  return out;
}

function main(): void {
  const violations = findViolations();
  console.log('CSRF client-fetch guard (#727)');
  console.log('==============================');
  if (violations.length === 0) {
    console.log('No tokenless state-changing client fetches found.');
    process.exit(0);
  }
  console.log(`VIOLATIONS (${violations.length}):`);
  for (const v of violations) {
    console.log(`  ${v.file}:${v.line}  ${v.snippet}`);
  }
  console.log('');
  console.log('Each state-changing fetch must carry the CSRF token (#663).');
  console.log('Fix: route through `window.csrfFetch` —');
  console.log('  (window.csrfFetch || fetch)(url, { method: ... })');
  console.log('or, in an EJS view with the token in scope, add header');
  console.log("  'X-CSRF-Token': '<%= csrfToken %>'.");
  console.log('Genuine server-side fetch (not browser-CSRF-subject) may add');
  console.log('  // csrf-guard-ignore');
  process.exit(1);
}

main();
