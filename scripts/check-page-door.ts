#!/usr/bin/env tsx
/**
 * One code path saves a page (#1462).
 *
 * `PageManager` is the door: it validates, normalises the metadata, checks
 * conflicts, writes through the provider, brings the shared indexes into step
 * and records the audit event. Before #1462 there were two door methods and
 * about 35 callers, each doing its own share of that work — or none. Four of
 * the eight route paths that saved a page emitted no audit record (#1121), a
 * journal entry was missing from search until its first editor save (#804),
 * and a private page created from a template, renamed through the API,
 * ingested or imported landed in the shared search index and link graph,
 * which is what #1454 exists to prevent.
 *
 * Nothing in the codebase makes that a compile error, so this guard names the
 * two shapes it takes:
 *
 * 1. __No page write outside the door__ — `provider.savePage`,
 *    `provider.deletePage`, `provider.restoreDeletedPage` and the private
 *    store's trash writes (`restoreStorePage`, `purgeStorePage`,
 *    `purgeExpiredStoreTrash`, #1459) are PageManager's to call. A caller that
 *    reaches past it gets no validation, no audit and no index work — a
 *    restore that skips the door leaves the store's search index behind.
 * 2. __No shared-index write outside its owner__ — the link graph, the search
 *    index, attachment mentions and page assets are updated by the manager
 *    that owns them and by the page door, never by a route or another manager
 *    after a save. That is the copy-paste this issue removed, and every copy
 *    was slightly different.
 * 3. __No page file written by a route__ — a route that writes a page's bytes
 *    with `fs`/`fs-extra` is a save with no validation, no audit and no index
 *    work, however small the edit.
 * 4. __No second copy of a save condition__ — the title character rule is
 *    declared in `utils/pageTitleRule.ts` and applied at the door (#1455). It
 *    was written out three times in `WikiRoutes`, which is how the paths that
 *    pass no route could write a title the editor refuses.
 *
 * A site that is genuinely none of these says so at the line, or in the few
 * lines just above it, with `page-door-ignore: <why>` — the
 * `permission-subject-ignore` idiom: the reason sits where the reader is, not
 * in a list somewhere else. The shared-index owners are named below, since a
 * whole file is the unit there.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = ['src', 'addons'];

/**
 * Browser code (#1468): templates and client scripts. The title rule must reach
 * the browser from its declaration (`titleRule` in the view), never retyped —
 * the editor's retyped copy had drifted to refuse an apostrophe the server
 * accepts. Only `title-rule-copy` applies here; the other rules are server
 * writes.
 */
const BROWSER_SCAN = ['views', 'public/js'];

/** The page door itself, and the providers that implement the writes. */
const DOOR = 'src/managers/PageManager.ts';
const PROVIDERS = /^src\/providers\//;

/** A write that belongs to the page door. */
const PROVIDER_WRITE = /\b(?:provider|this\.provider|pageProvider)\s*(?:\??\.)\s*(savePage|deletePage|restoreDeletedPage|restoreStorePage|purgeStorePage|purgeExpiredStoreTrash)\s*\(/;

/** A shared index the door keeps in step after a page changes. */
const INDEX_WRITE = /\.(addPageToCache|updatePageInLinkGraph|removePageFromLinkGraph|updatePageInIndex|removePageFromIndex|syncPageMentions|syncPageAssets)\s*\(/;

/** A route writing page bytes itself — a save with none of the door's work. */
const FILE_WRITE = /\bfse?\s*\.\s*(writeFile|writeJson|outputFile|move|remove|copy)\s*\(/;

/** The title rule, spelled out somewhere other than where it is declared. */
const TITLE_RULE_COPY = /\[\\?\/\\\\#\?%"<>\|\*\]/;

/** The marker that says a line is deliberately none of these (#1462). */
const IGNORE = /page-door-ignore/;

/** `file` → why it may write a shared index: it owns that index. */
const INDEX_ALLOWED: Record<string, string> = {
  'src/managers/RenderingManager.ts': 'it owns the link graph',
  'src/managers/SearchManager.ts': 'it owns the search index'
};

interface Violation {
  file: string;
  line: number;
  rule: 'page-write-outside-door' | 'index-write-outside-owner' | 'page-file-written-by-route' | 'title-rule-copy' | 'stale-allowlist';
  detail: string;
}

/** Source with comments removed, so a mention in prose is not a call. */
function strippedLines(source: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of source.split('\n')) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end === -1) { out.push(''); continue; }
      line = line.slice(end + 2);
      inBlock = false;
    }
    const block = line.indexOf('/*');
    if (block !== -1) {
      const end = line.indexOf('*/', block + 2);
      if (end === -1) { inBlock = true; line = line.slice(0, block); }
      else line = line.slice(0, block) + line.slice(end + 2);
    }
    const lineComment = line.indexOf('//');
    if (lineComment !== -1) line = line.slice(0, lineComment);
    out.push(line);
  }
  return out;
}

function tsFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    let entries: string[];
    try { entries = readdirSync(current); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts') || entry.endsWith('.d.ts')) continue;
      found.push(full);
    }
  };
  walk(dir);
  return found;
}

/** Templates and client scripts, minified vendor bundles excepted. */
function browserFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    let entries: string[];
    try { entries = readdirSync(current); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'vendor') continue;
        walk(full);
        continue;
      }
      if (entry.endsWith('.min.js')) continue;
      if (entry.endsWith('.ejs') || entry.endsWith('.js')) found.push(full);
    }
  };
  walk(dir);
  return found;
}

export function scan(): Violation[] {
  const violations: Violation[] = [];
  const indexHit = new Set<string>();

  for (const root of BROWSER_SCAN) {
    for (const file of browserFiles(path.join(REPO, root))) {
      const rel = path.relative(REPO, file);
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (TITLE_RULE_COPY.test(line)) {
          violations.push({
            file: rel, line: index + 1, rule: 'title-rule-copy',
            detail: `a copy of the title rule in browser code (${line.trim()}) — read titleRule from the view, which comes from utils/pageTitleRule`
          });
        }
      });
    }
  }

  for (const root of SCAN) {
    for (const file of tsFiles(path.join(REPO, root))) {
      const rel = path.relative(REPO, file);
      // This guard names the patterns it bans, so it would flag itself.
      if (rel === 'scripts/check-page-door.ts') continue;
      // The door does both of these; that is what it is for.
      if (rel === DOOR) continue;
      const lines = strippedLines(readFileSync(file, 'utf8'));

      // The marker sits on the line or the one above it, as it reads best.
      const raw = readFileSync(file, 'utf8').split('\n');
      const excused = (at: number): boolean =>
        [1, 2, 3, 4].some((back) => IGNORE.test(raw[at - back] ?? ''));

      lines.forEach((line, index) => {
        const at = index + 1;
        // A provider implements these writes; it does not reach past the door.
        if (!PROVIDERS.test(rel) && PROVIDER_WRITE.test(line) && !excused(at)) {
          violations.push({
            file: rel, line: at, rule: 'page-write-outside-door',
            detail: `a page write past the door (${line.trim()}) — call PageManager.savePage / deletePage`
          });
        }
        // A provider's own page index is its data, not a shared index.
        if (!PROVIDERS.test(rel) && INDEX_WRITE.test(line)) {
          indexHit.add(rel);
          if (!INDEX_ALLOWED[rel] && !excused(at)) {
            violations.push({
              file: rel, line: at, rule: 'index-write-outside-owner',
              detail: `a shared-index write outside its owner (${line.trim()}) — the door does this after every save`
            });
          }
        }
        if (rel !== 'src/utils/pageTitleRule.ts' && TITLE_RULE_COPY.test(line) && !excused(at)) {
          violations.push({
            file: rel, line: at, rule: 'title-rule-copy',
            detail: `a second copy of the title rule (${line.trim()}) — import it from utils/pageTitleRule`
          });
        }
        if (rel.startsWith('src/routes/') && FILE_WRITE.test(line) && !excused(at)) {
          violations.push({
            file: rel, line: at, rule: 'page-file-written-by-route',
            detail: `a route writing files itself (${line.trim()}) — a page's bytes are the door's`
          });
        }
      });
    }
  }

  for (const rel of Object.keys(INDEX_ALLOWED)) {
    if (!indexHit.has(rel)) {
      violations.push({
        file: rel, line: 0, rule: 'stale-allowlist',
        detail: 'INDEX_ALLOWED entry no longer matches anything — remove it'
      });
    }
  }

  return violations;
}

function run(): void {
  console.log('Page door (#1462)');
  console.log('=================');
  const violations = scan();
  if (violations.length === 0) {
    console.log('Every page write goes through PageManager, the shared indexes are written by their owners, and the save conditions are declared once.');
    return;
  }
  for (const v of violations) {
    console.error(`  ${v.file}${v.line ? `:${v.line}` : ''}  [${v.rule}] ${v.detail}`);
  }
  console.error(`\n${violations.length} violation(s). See issue #1462.`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) run();
