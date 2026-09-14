#!/usr/bin/env tsx
/**
 * Give pages that have no `author` one (#1354).
 *
 * The author is a page's creator. Imports left most pages without one, and an
 * edit used to fill it in with whoever edited — the editor, not the creator.
 * Edits no longer do that; this sets the author the operator names on the
 * pages that still have none.
 *
 * By default a DRY RUN: reads page files, writes nothing, and reports every
 * page that would get an author.
 *
 * With `--apply` it saves each of those pages through the page store — the
 * only way that keeps version history and the page index right: content
 * unchanged, one new version per page, editor `system`, and the page's own
 * `lastModified` kept, so Recent Changes is not flooded. It refuses to run
 * while the server is up (two processes writing one page store corrupt the
 * index), so stop it first and start it after.
 *
 * Private pages (`private/<user>/`) are never changed: they belong to the user
 * whose folder they are in, whatever `--author` says. The report lists any
 * that have no author.
 *
 * Usage:
 *   npx tsx scripts/backfill-page-author.ts --data /path/to/pages --author jim
 *   npx tsx scripts/backfill-page-author.ts --data /path/to/pages --author jim --apply
 *
 * Current pages only: `versions/` and `deleted/` are skipped.
 */
import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';

/** Does this page need an author? Only a shared page with none at all. */
export function needsAuthor(data: Record<string, unknown>, relPath: string): 'yes' | 'no' | 'private' {
  const author = data['author'];
  if (typeof author === 'string' && author.trim() !== '') return 'no';
  const isPrivate = relPath.split(/[\\/]/)[0] === 'private' || data['private'] === true;
  return isPrivate ? 'private' : 'yes';
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
  const author = get('--author')?.trim();
  if (!dataDir || !(await fs.pathExists(dataDir))) {
    console.error('✗ --data <page store directory> is required and must exist');
    process.exit(1);
  }
  if (!author) {
    console.error('✗ --author <username> is required — the author to give pages that have none');
    process.exit(1);
  }
  const reportPath = get('--report') ?? `private/author-backfill-${apply ? 'applied' : 'dry-run'}.md`;

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
  const changed: string[] = [];
  const privateNoAuthor: string[] = [];
  const failed: Array<{ title: string; error: string }> = [];

  for (const file of files) {
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(await fs.readFile(file, 'utf8'));
    } catch {
      continue; // unparseable frontmatter is a page problem, not this migration's
    }
    const data = parsed.data as Record<string, unknown>;
    const title = String(data['title'] ?? '');
    const verdict = needsAuthor(data, path.relative(dataDir, file));
    if (verdict === 'no') continue;
    if (verdict === 'private') {
      privateNoAuthor.push(title || path.relative(dataDir, file));
      continue;
    }
    if (provider) {
      try {
        if (!title) throw new Error('page has no title');
        await provider.savePage(title, parsed.content, { ...data, author, editor: 'system' }, { preserveLastModified: true });
      } catch (err) {
        failed.push({ title: title || file, error: err instanceof Error ? err.message : String(err) });
        continue;
      }
    }
    changed.push(title || path.relative(dataDir, file));
  }

  const out: string[] = [
    `# Page author backfill: ${apply ? 'applied' : 'dry run'}`,
    '',
    `Corpus: \`${dataDir}\`. Author: \`${author}\`. Generated ${new Date().toISOString()}. ${apply ? 'Pages were saved as one version each by system, content unchanged, keeping lastModified.' : 'Nothing was written.'}`,
    '',
    `- Pages scanned: ${files.length}`,
    `- Pages ${apply ? 'given' : 'that would get'} author \`${author}\`: ${changed.length}`,
    ...(apply ? [`- Pages that failed: ${failed.length}`] : []),
    `- Private pages with no author (left alone): ${privateNoAuthor.length}`,
    '',
    '## Pages',
    '',
    ...changed.map((t) => `- ${t}`)
  ];
  if (privateNoAuthor.length) out.push('', '## Private pages with no author', '', ...privateNoAuthor.map((t) => `- ${t}`));
  if (failed.length) out.push('', '## Failed', '', ...failed.map((f) => `- ${f.title}: ${f.error}`));
  out.push('');

  await fs.ensureDir(path.dirname(reportPath));
  await fs.writeFile(reportPath, out.join('\n'), 'utf8');

  console.log(`Scanned ${files.length} pages: ${changed.length} ${apply ? 'given' : 'would get'} author ${author}; ${privateNoAuthor.length} private pages with no author left alone.${apply ? ` Failed: ${failed.length}.` : ''}`);
  console.log(`Report: ${reportPath}`);
  if (apply) process.exit(failed.length ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('backfill-page-author.ts')) {
  main().catch((err: unknown) => {
    console.error('✗ backfill-page-author failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
