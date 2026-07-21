/**
 * #865 Slice 1 — attachment `mentions` reconciler.
 *
 * The `mentions` list on each attachment record was historically written at
 * upload/attach time and drifted as pages were edited: a 2026-07-21 live scan
 * found 86% of "empty-mentions" records actually referenced by page content.
 * This script rebuilds every record's `mentions` from an actual scan of live
 * page content, exactly mirroring the save-time extraction
 * (AttachmentManager.syncPageMentions: `[{Image src='…'}]` / `[{ATTACH
 * src='…'}]` local filenames), so batch state matches what per-page saves
 * would eventually converge to.
 *
 * Also fixes stale display URLs implicitly: every regenerated mention URL is
 * `/view/<page>` (pre-#364 records carried `/wiki/` prefixes).
 *
 * Idempotent: a second run reports 0 changes. The metadata file is backed up
 * beside itself (`.bak-reconcile`) before the first write.
 *
 * Usage:
 *   npm run reconcile:mentions          # apply
 *   npm run reconcile:mentions:dry      # preview
 *
 * Options:
 *   --dry-run           Preview without writing
 *   --pages <dir>       Pages root      (default $SLOW_STORAGE/pages, ./data/pages)
 *   --metadata <file>   Metadata file   (default <pages-parent>/attachments/attachment-metadata.json)
 *
 * Exit codes: 0 success (incl. no-op); 1 failure; 2 bad arguments.
 *
 * Reporting extras (read-only): counts references in page content that name a
 * known attachment file OUTSIDE the canonical markup (e.g. markdown links) —
 * those do NOT become mentions (save-time sync wouldn't add them either) but
 * are surfaced so the #865 report slice can show them.
 */

import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';

interface Args {
  dryRun: boolean;
  pagesDir: string | null;
  metadataPath: string | null;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, pagesDir: null, metadataPath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--pages' && argv[i + 1]) { out.pagesDir = argv[++i]; }
    else if (a === '--metadata' && argv[i + 1]) { out.metadataPath = argv[++i]; }
  }
  return out;
}

function resolvePagesDir(override: string | null): string {
  if (override) return override;
  if (process.env.SLOW_STORAGE) return path.join(process.env.SLOW_STORAGE, 'pages');
  return path.join(process.cwd(), 'data', 'pages');
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

export interface Mention { '@type': string; name: string; url: string }
export interface AttachmentRecord {
  identifier?: string;
  name?: string;
  mentions?: Mention[];
  [key: string]: unknown;
}

/** Canonical save-time extraction — MUST mirror AttachmentManager.syncPageMentions. */
export function extractLocalAttachmentRefs(content: string): Set<string> {
  const srcPattern = /\[\{(?:Image|ATTACH)\s[^}]*?src='([^']+)'/gi;
  const refs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = srcPattern.exec(content)) !== null) {
    const src = m[1];
    if (src.startsWith('media://') || src.startsWith('http://') ||
        src.startsWith('https://') || src.startsWith('/')) continue;
    refs.add(src);
  }
  return refs;
}

/**
 * Identifier-URL references — `/attachments/<sha256>` anywhere in content
 * (markdown embeds like storybook route maps). Mirrors
 * AttachmentManager.extractAttachmentIdRefs.
 */
export function extractAttachmentIdRefs(content: string): Set<string> {
  const idPattern = /\/attachments\/([a-f0-9]{64})\b/g;
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = idPattern.exec(content)) !== null) ids.add(m[1]);
  return ids;
}

export interface ReconcileResult {
  /** identifier → sorted page names that reference the record's filename */
  mentionsByRecord: Map<string, string[]>;
  /** filenames referenced in content with no matching record */
  unresolvedRefs: Set<string>;
  /** filenames of known records seen in content OUTSIDE canonical markup (report-only) */
  looseTextRefs: Set<string>;
}

/**
 * Pure reconciliation: canonical-markup references per page → mentions per
 * record. `pages` maps pageName → raw content. Matching is by exact record
 * `name` (filename), the same key getAttachmentByFilename uses.
 */
export function computeMentions(
  records: AttachmentRecord[],
  pages: Map<string, string>
): ReconcileResult {
  const byFilename = new Map<string, AttachmentRecord>();
  const knownIds = new Set<string>();
  for (const r of records) {
    if (r.name && r.identifier) byFilename.set(r.name, r);
    if (r.identifier) knownIds.add(r.identifier);
  }

  const mentionsByRecord = new Map<string, Set<string>>();
  const unresolvedRefs = new Set<string>();
  const looseTextRefs = new Set<string>();

  const addMention = (id: string, pageName: string) => {
    if (!mentionsByRecord.has(id)) mentionsByRecord.set(id, new Set());
    mentionsByRecord.get(id)!.add(pageName);
  };

  for (const [pageName, content] of pages) {
    const refs = extractLocalAttachmentRefs(content);
    for (const filename of refs) {
      const rec = byFilename.get(filename);
      if (!rec?.identifier) { unresolvedRefs.add(filename); continue; }
      addMention(rec.identifier, pageName);
    }
    // #865: identifier-URL references (markdown embeds, storybook route maps)
    for (const id of extractAttachmentIdRefs(content)) {
      if (knownIds.has(id)) addMention(id, pageName);
    }
    // Report-only: known filenames appearing outside canonical markup
    for (const [filename, rec] of byFilename) {
      if (refs.has(filename)) continue;
      if (rec.identifier && content.includes(filename)) looseTextRefs.add(filename);
    }
  }

  const sorted = new Map<string, string[]>();
  for (const [id, names] of mentionsByRecord) sorted.set(id, [...names].sort());
  return { mentionsByRecord: sorted, unresolvedRefs, looseTextRefs };
}

/** Build the Mention[] array for a page-name list (canonical /view/ URLs). */
export function toMentions(pageNames: string[]): Mention[] {
  return pageNames.map(name => ({
    '@type': 'WebPage',
    name,
    url: `/view/${encodeURIComponent(name)}`
  }));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pagesDir = resolvePagesDir(args.pagesDir);
  const metadataPath = args.metadataPath
    ?? path.join(path.dirname(pagesDir), 'attachments', 'attachment-metadata.json');

  if (!(await fs.pathExists(pagesDir))) { console.error(`Pages dir not found: ${pagesDir}`); process.exit(2); }
  if (!(await fs.pathExists(metadataPath))) { console.error(`Metadata file not found: ${metadataPath}`); process.exit(2); }

  const metadata = await fs.readJson(metadataPath) as { attachments?: Record<string, AttachmentRecord> };
  const attachmentsMap = metadata.attachments ?? {};
  const records = Object.values(attachmentsMap);

  // Load pages: pageName = frontmatter title (the name the save pipeline
  // passes to syncPageMentions), falling back to the file basename.
  const pages = new Map<string, string>();
  for await (const file of walkMarkdown(pagesDir)) {
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = matter(raw);
      const title = typeof parsed.data.title === 'string' && parsed.data.title
        ? parsed.data.title
        : path.basename(file, '.md');
      pages.set(title, raw);
    } catch { /* unreadable/unparseable page — skip */ }
  }

  const { mentionsByRecord, unresolvedRefs, looseTextRefs } = computeMentions(records, pages);

  let recordsChanged = 0, mentionsAdded = 0, mentionsRemoved = 0, staleWikiUrls = 0;
  for (const rec of records) {
    if (!rec.identifier) continue;
    const oldMentions = rec.mentions ?? [];
    staleWikiUrls += oldMentions.filter(m => typeof m.url === 'string' && m.url.startsWith('/wiki/')).length;
    const newNames = mentionsByRecord.get(rec.identifier) ?? [];
    const oldNames = oldMentions.map(m => m.name).sort();
    const changed = JSON.stringify(oldNames) !== JSON.stringify(newNames)
      || oldMentions.some(m => typeof m.url === 'string' && !m.url.startsWith('/view/'));
    if (!changed) continue;
    recordsChanged++;
    const oldSet = new Set(oldNames);
    const newSet = new Set(newNames);
    mentionsAdded += newNames.filter(n => !oldSet.has(n)).length;
    mentionsRemoved += oldNames.filter(n => !newSet.has(n)).length;
    if (!args.dryRun) rec.mentions = toMentions(newNames);
  }

  const orphans = records.filter(r => r.identifier && (mentionsByRecord.get(r.identifier) ?? []).length === 0);

  console.log(`#865 mentions reconciliation${args.dryRun ? ' (dry run)' : ''}`);
  console.log(`  pages scanned:        ${pages.size}`);
  console.log(`  attachment records:   ${records.length}`);
  console.log(`  records changed:      ${recordsChanged} (+${mentionsAdded} / -${mentionsRemoved} mentions)`);
  console.log(`  stale /wiki/ URLs:    ${staleWikiUrls} (all regenerated as /view/)`);
  console.log(`  true orphans (post):  ${orphans.length}`);
  console.log(`  unresolved refs:      ${unresolvedRefs.size} (markup references no record matches)`);
  console.log(`  loose text refs:      ${looseTextRefs.size} (filename in content outside [{Image}]/[{ATTACH}] markup — NOT counted as mentions)`);

  if (args.dryRun) { console.log('  (dry run — no files written)'); process.exit(0); }

  if (recordsChanged > 0) {
    const backupPath = `${metadataPath}.bak-reconcile`;
    if (!(await fs.pathExists(backupPath))) await fs.copy(metadataPath, backupPath);
    await fs.writeJson(metadataPath, metadata, { spaces: 2 });
    console.log(`  metadata written (backup: ${backupPath})`);
  } else {
    console.log('  no changes — metadata untouched');
  }
  process.exit(0);
}

if (process.argv[1] && process.argv[1].includes('reconcile-attachment-mentions')) {
  main().catch(err => { console.error(err); process.exit(1); });
}
