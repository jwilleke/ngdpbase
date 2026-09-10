#!/usr/bin/env tsx
/**
 * Run the Markdown fix steps (#1332) across a page store — the migration form
 * of Convert to NCM.
 *
 * The steps are the ones PageManager.normalizePageContent runs
 * (src/converters/ncm/fix/): `--mode convert` (the default) runs every step,
 * `--mode save` only the ones safe on an ordinary save, and
 * `--steps id,id` exactly the named ones. The ids are listed by `--steps
 * list`. Every step is idempotent, so pages already fixed are skipped.
 *
 * By default a DRY RUN: reads page files, never writes them, and produces a
 * report of every page that would change, with a few changed lines each.
 *
 * With `--apply` it writes the same changes through the page store, the only
 * way that keeps version history and the page index right: one new version per
 * page, editor `system`, and the page's own `lastModified` kept, so Recent
 * Changes is not flooded and date-sorted lists do not reshuffle. It refuses to
 * run while the server is up — two processes writing one page store corrupts
 * the index — so stop it first (`./server.sh stop <env>`) and start it after.
 * Each page is re-read and re-converted at apply time; the dry-run report is
 * never used as input.
 *
 * Usage:
 *   npx tsx scripts/fix-page-markdown.ts --data /path/to/pages \
 *     [--steps jspwiki-bullets,bullet-markers] [--report private/fix-dry-run.md] \
 *     [--base-url https://host/view/]
 *   npx tsx scripts/fix-page-markdown.ts --data /path/to/pages --apply
 *
 * `--apply` boots the engine from the same `.env` the server uses, so `--data`
 * must be that instance's page directory; the script checks they match.
 *
 * Current pages only: `versions/` and `deleted/` are skipped.
 */

import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import { structuredPatch } from 'diff';
import { FIX_STEPS, runFixes, selectFixSteps, type RunFixesOptions } from '../src/converters/ncm/fix/index.js';

/** Up to `max` changed lines, as `before → after`, from a line diff. */
function samples(before: string, after: string, max = 3): Array<{ line: number; before: string; after: string }> {
  const out: Array<{ line: number; before: string; after: string }> = [];
  for (const hunk of structuredPatch('', '', before, after, '', '', { context: 0 }).hunks) {
    const removed = hunk.lines.filter((l) => l.startsWith('-')).map((l) => l.slice(1));
    const added = hunk.lines.filter((l) => l.startsWith('+')).map((l) => l.slice(1));
    for (let i = 0; i < Math.max(removed.length, added.length) && out.length < max; i++) {
      const b = removed[i];
      const a = added[i];
      out.push({
        line: hunk.oldStart + i,
        before: b === undefined ? '(nothing)' : b.trim() === '' ? '(empty line)' : b,
        after: a === undefined ? '(removed)' : a.trim() === '' ? '(empty line)' : a
      });
    }
    if (out.length >= max) break;
  }
  return out;
}

/** The server's PID lock (src/app.ts). A live PID means the server is up. */
function serverRunning(): number | null {
  const pidFile = path.join(process.cwd(), '.ngdpbase.pid');
  if (!fs.existsSync(pidFile)) return null;
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  if (!pid) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

interface ProviderLike {
  savePage(name: string, content: string, metadata: Record<string, unknown>, options: { preserveLastModified: boolean }): Promise<void>;
}

interface PageChange {
  title: string;
  file: string;
  author: string;
  isPrivate: boolean;
  steps: string[];
  samples: Array<{ line: number; before: string; after: string }>;
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'versions' || entry.name === 'deleted') continue;
      await walk(full, out);
    } else if (entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const apply = argv.includes('--apply');
  const stepsArg = get('--steps');
  if (stepsArg === 'list') {
    for (const s of FIX_STEPS) console.log(`${s.id}${s.safeOnSave ? ' (safe on save)' : ''}: ${s.summary}`);
    return;
  }
  const dataDir = get('--data');
  if (!dataDir || !(await fs.pathExists(dataDir))) {
    console.error('✗ --data <page store directory> is required and must exist');
    process.exit(1);
  }
  const mode = get('--mode') ?? 'convert';
  if (mode !== 'convert' && mode !== 'save') {
    console.error('✗ --mode must be convert or save');
    process.exit(1);
  }
  const options: RunFixesOptions = stepsArg ? { steps: stepsArg.split(',').map((s) => s.trim()) } : { mode };
  let stepIds: string[];
  try {
    stepIds = selectFixSteps(options).map((s) => s.id);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)} (see --steps list)`);
    process.exit(1);
  }
  const reportPath = get('--report') ?? `private/fix-${apply ? 'applied' : 'dry-run'}.md`;
  const baseUrl = get('--base-url');

  let provider: ProviderLike | null = null;
  if (apply) {
    const pid = serverRunning();
    if (pid) {
      console.error(`✗ The server is running (PID ${pid}). Stop it first — ./server.sh stop <env> — then re-run.`);
      process.exit(1);
    }
    await import('../src/bootstrap-env.js');
    const expected = path.resolve(process.env.SLOW_STORAGE ?? '', 'pages');
    if (path.resolve(dataDir) !== expected) {
      console.error(`✗ --data ${dataDir} is not this instance's page store (${expected}). --apply writes through the engine, which uses .env.`);
      process.exit(1);
    }
    const { default: WikiEngine } = await import('../src/WikiEngine.js');
    const engine = new WikiEngine();
    await engine.initialize();
    const pm = engine.getManager('PageManager') as { getCurrentPageProvider(): ProviderLike | null } | null;
    provider = pm?.getCurrentPageProvider() ?? null;
    if (!provider) {
      console.error('✗ No page provider after engine start.');
      process.exit(1);
    }
  }

  const files = (await walk(dataDir)).sort();
  const failed: Array<{ title: string; error: string }> = [];
  const changes: PageChange[] = [];
  const stepCounts = new Map<string, number>();

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8');
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(raw);
    } catch {
      continue; // unparseable frontmatter is a page problem, not this migration's
    }
    const result = runFixes(parsed.content, options);
    if (!result.changes.length) continue;
    const data = parsed.data as Record<string, unknown>;
    if (provider) {
      const title = String(data['title'] ?? '');
      try {
        if (!title) throw new Error('page has no title');
        await provider.savePage(title, result.content, { ...data, editor: 'system' }, { preserveLastModified: true });
      } catch (err) {
        failed.push({ title: title || file, error: err instanceof Error ? err.message : String(err) });
        continue;
      }
    }
    for (const c of result.changes) stepCounts.set(c.step, (stepCounts.get(c.step) ?? 0) + 1);
    changes.push({
      title: String(data['title'] ?? path.basename(file, '.md')),
      file: path.relative(dataDir, file),
      author: String(data['author'] ?? ''),
      isPrivate: data['private'] === true || file.includes(`${path.sep}private${path.sep}`),
      steps: result.changes.map((c) => c.step),
      samples: samples(parsed.content.replace(/\r/g, ''), result.content.replace(/\r/g, ''))
    });
  }

  const link = (title: string): string =>
    baseUrl ? `[${title.replace(/([[\]])/g, '\\$1')}](${baseUrl}${encodeURIComponent(title)})` : title;
  const privateOthers = changes.filter((c) => c.isPrivate && c.author && c.author !== 'jim' && c.author !== 'system');

  const out: string[] = [
    `# Markdown fixes: ${apply ? 'applied' : 'dry run'}`,
    '',
    `Corpus: \`${dataDir}\`. Generated ${new Date().toISOString()}. ${apply ? 'Pages were saved as one version each by system, keeping lastModified.' : 'Nothing was written.'}`,
    '',
    `- Pages scanned: ${files.length}`,
    `- Steps: ${stepIds.join(', ')}`,
    `- Pages ${apply ? 'changed' : 'that would change'}: ${changes.length}`,
    ...stepIds.map((id) => `  - ${id}: ${stepCounts.get(id) ?? 0}`),
    ...(apply ? [`- Pages that failed: ${failed.length}`] : []),
    `- Private pages of other users among them: ${privateOthers.length}`,
    '',
    ...FIX_STEPS.filter((st) => stepIds.includes(st.id)).map((st) => `- ${st.id}: ${st.summary}.`),
    '',
    '## Pages',
    ''
  ];
  for (const c of changes) {
    out.push(`- ${link(c.title)}: ${c.steps.join(', ')}${c.isPrivate ? ` (private, ${c.author || 'unknown'})` : ''}`);
    for (const s of c.samples) {
      out.push(`  - line ${s.line}: \`${s.before.replace(/`/g, "'")}\` → \`${s.after.replace(/`/g, "'")}\``);
    }
  }
  if (failed.length) {
    out.push('', '## Failed', '');
    for (const f of failed) out.push(`- ${link(f.title)}: ${f.error}`);
  }
  out.push('');

  await fs.ensureDir(path.dirname(reportPath));
  await fs.writeFile(reportPath, out.join('\n'), 'utf8');

  console.log(`Scanned ${files.length} pages: ${changes.length} ${apply ? 'changed' : 'would change'} (${stepIds.map((id) => `${id} ${stepCounts.get(id) ?? 0}`).join(', ')}); ${privateOthers.length} private pages of other users.${apply ? ` Failed: ${failed.length}.` : ''}`);
  console.log(`Report: ${reportPath}`);
  if (apply) process.exit(failed.length ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('fix-page-markdown.ts')) {
  main().catch((err: unknown) => {
    console.error('✗ fix-page-markdown failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
