#!/usr/bin/env tsx
/**
 * Bullet clean-up across a page store (#1325, #1271 S1): JSPWiki `**` bullets
 * become Markdown nested bullets, and every `*` / `+` bullet marker becomes `-`.
 *
 * By default a DRY RUN: reads page files, never writes them, and produces a
 * report of every page and line that would change.
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
 * The conversions are `convertJspwikiBullets` (src/utils/jspwikiBullets.ts) and
 * `normalizeBulletMarkers` (src/utils/bulletMarkers.ts), applied in that order.
 * Both are idempotent, so pages already converted are skipped. The first is
 * the one the on-save rewrite will use, so a migration and a later save cannot
 * disagree.
 *
 * Usage:
 *   npx tsx scripts/migrate-jspwiki-bullets.ts --data /path/to/pages \
 *     [--report private/jspwiki-bullets-dry-run.md] [--base-url https://host/view/]
 *   npx tsx scripts/migrate-jspwiki-bullets.ts --data /path/to/pages --apply
 *
 * `--apply` boots the engine from the same `.env` the server uses, so `--data`
 * must be that instance's page directory; the script checks they match.
 *
 * Current pages only: `versions/` and `deleted/` are skipped.
 */

import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import { convertJspwikiBullets } from '../src/utils/jspwikiBullets.js';
import { normalizeBulletMarkers } from '../src/utils/bulletMarkers.js';

/** `**` bullets first, then markers: the second step sees the first's output. */
function convertPage(content: string): { content: string; changed: number; lines: number[] } {
  const a = convertJspwikiBullets(content);
  const b = normalizeBulletMarkers(a.content);
  const lines = [...new Set([...a.lines, ...b.lines])].sort((x, y) => x - y);
  return { content: b.content, changed: lines.length, lines };
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
  changed: number;
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
  const dataDir = get('--data');
  if (!dataDir || !(await fs.pathExists(dataDir))) {
    console.error('✗ --data <page store directory> is required and must exist');
    process.exit(1);
  }
  const reportPath = get('--report') ?? 'private/jspwiki-bullets-dry-run.md';
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
  let totalLines = 0;

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8');
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(raw);
    } catch {
      continue; // unparseable frontmatter is a page problem, not this migration's
    }
    const result = convertPage(parsed.content);
    if (!result.changed) continue;
    const before = parsed.content.split('\n');
    const after = result.content.split('\n');
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
    totalLines += result.changed;
    changes.push({
      title: String(data['title'] ?? path.basename(file, '.md')),
      file: path.relative(dataDir, file),
      author: String(data['author'] ?? ''),
      isPrivate: data['private'] === true || file.includes(`${path.sep}private${path.sep}`),
      changed: result.changed,
      samples: result.lines.slice(0, 3).map((n) => ({
        line: n,
        before: before[n - 1].replace(/\r$/, ''),
        after: after[n - 1].replace(/\r$/, '')
      }))
    });
  }

  const link = (title: string): string =>
    baseUrl ? `[${title.replace(/([[\]])/g, '\\$1')}](${baseUrl}${encodeURIComponent(title)})` : title;
  const privateOthers = changes.filter((c) => c.isPrivate && c.author && c.author !== 'jim' && c.author !== 'system');

  const out: string[] = [
    apply ? '# Bullet clean-up: applied' : '# Bullet clean-up: dry run',
    '',
    `Corpus: \`${dataDir}\`. Generated ${new Date().toISOString()}. ${apply ? 'Pages were saved as one version each by system, keeping lastModified.' : 'Nothing was written.'}`,
    '',
    `- Pages scanned: ${files.length}`,
    `- Pages ${apply ? 'changed' : 'that would change'}: ${changes.length}`,
    `- Lines ${apply ? 'changed' : 'that would change'}: ${totalLines}`,
    ...(apply ? [`- Pages that failed: ${failed.length}`] : []),
    `- Private pages of other users among them: ${privateOthers.length}`,
    '',
    'Each `** item` line becomes `  - item` (`*** item` becomes `    - item`), and each `* item` or `+ item` becomes `- item` at the same indent. Nothing else on the page changes.',
    '',
    '## Pages',
    ''
  ];
  for (const c of changes) {
    out.push(`- ${link(c.title)}: ${c.changed} line${c.changed === 1 ? '' : 's'}${c.isPrivate ? ` (private, ${c.author || 'unknown'})` : ''}`);
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

  console.log(`Scanned ${files.length} pages: ${changes.length} ${apply ? 'changed' : 'would change'} (${totalLines} lines); ${privateOthers.length} private pages of other users.${apply ? ` Failed: ${failed.length}.` : ''}`);
  console.log(`Report: ${reportPath}`);
  if (apply) process.exit(failed.length ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('migrate-jspwiki-bullets.ts')) {
  main().catch((err: unknown) => {
    console.error('✗ migrate-jspwiki-bullets failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
