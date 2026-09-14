#!/usr/bin/env tsx
/**
 * Move page version histories out of the required-pages source folder (#1375).
 *
 * Before #1371, saving a `system` or `documentation` page recorded
 * `location: required-pages` and wrote its version history into
 * `<required-pages>/versions/<uuid>/` — on a dev install the git working tree,
 * on Docker the image. The live page file was always in the instance's pages
 * directory. This moves each history to where it belongs,
 * `<pages>/versions/<uuid>/`, and corrects the page-index entry to `pages`.
 *
 * Histories that cannot simply move are archived, never deleted:
 * - conflict: the pages directory already has a history for that UUID (a page
 *   renamed or re-seeded, so two separate lines of history) — the one in the
 *   pages directory is the one the application shows and stays;
 * - orphan: no page with that UUID exists on the instance, live or deleted.
 * Both go to `<pages>/versions-archive/<uuid>/`.
 *
 * Page files (`*.md`) in the required-pages folder are never touched.
 *
 * By default a DRY RUN: reads only, prints the plan, writes a report. With
 * `--apply` it moves the directories and updates `page-index.json`; it refuses
 * while the server is running (two processes writing the page store corrupt
 * the index). Run Admin → Rebuild Pages afterwards to confirm the index.
 *
 * Usage:
 *   npx tsx scripts/repair-required-pages-history.ts \
 *     --required ./required-pages --pages /path/to/data/pages --index /path/to/page-index.json [--apply]
 */
import fs from 'fs-extra';
import path from 'path';

export type RepairAction = 'move' | 'archive-conflict' | 'archive-orphan';

export interface RepairItem {
  uuid: string;
  title: string;
  action: RepairAction;
  from: string;
  to: string;
}

interface IndexShape {
  pages: Record<string, { title?: string; location?: string }>;
  deletedPages?: Record<string, { title?: string }>;
}

/**
 * Decide what happens to each history under `<required>/versions/`. Reads the
 * file system and the index; writes nothing.
 */
export async function planRepair(requiredDir: string, pagesDir: string, index: IndexShape): Promise<RepairItem[]> {
  const versionsDir = path.join(requiredDir, 'versions');
  if (!(await fs.pathExists(versionsDir))) return [];
  const items: RepairItem[] = [];
  for (const uuid of (await fs.readdir(versionsDir)).sort()) {
    const from = path.join(versionsDir, uuid);
    if (!(await fs.stat(from)).isDirectory()) continue;
    let title = index.pages[uuid]?.title ?? index.deletedPages?.[uuid]?.title ?? '';
    if (!title) {
      try {
        title = String((await fs.readJson(path.join(from, 'manifest.json')) as { pageName?: string }).pageName ?? '');
      } catch { /* no manifest */ }
    }
    const dest = path.join(pagesDir, 'versions', uuid);
    const archive = path.join(pagesDir, 'versions-archive', uuid);
    const pageExists = Boolean(index.pages[uuid] || index.deletedPages?.[uuid])
      || await fs.pathExists(path.join(pagesDir, `${uuid}.md`));
    if (await fs.pathExists(dest)) {
      items.push({ uuid, title, action: 'archive-conflict', from, to: archive });
    } else if (pageExists) {
      items.push({ uuid, title, action: 'move', from, to: dest });
    } else {
      items.push({ uuid, title, action: 'archive-orphan', from, to: archive });
    }
  }
  return items;
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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const apply = argv.includes('--apply');
  const requiredDir = get('--required');
  const pagesDir = get('--pages');
  const indexPath = get('--index');
  for (const [flag, value] of [['--required', requiredDir], ['--pages', pagesDir], ['--index', indexPath]] as const) {
    if (!value || !(await fs.pathExists(value))) {
      console.error(`✗ ${flag} is required and must exist`);
      process.exit(1);
    }
  }
  if (apply) {
    const pid = serverRunning();
    if (pid) {
      console.error(`✗ The server is running (PID ${pid}). Stop it first — ./server.sh stop <env> — then re-run.`);
      process.exit(1);
    }
  }

  const index = await fs.readJson(indexPath!) as IndexShape & Record<string, unknown>;
  const plan = await planRepair(requiredDir!, pagesDir!, index);
  const count = (a: RepairAction): number => plan.filter((p) => p.action === a).length;
  const failed: Array<{ uuid: string; error: string }> = [];
  let indexChanged = 0;

  if (apply) {
    for (const item of plan) {
      try {
        if (await fs.pathExists(item.to)) throw new Error(`${item.to} already exists`);
        await fs.ensureDir(path.dirname(item.to));
        await fs.move(item.from, item.to);
        if (item.action === 'move' && index.pages[item.uuid]?.location === 'required-pages') {
          index.pages[item.uuid].location = 'pages';
          indexChanged++;
        }
      } catch (err) {
        failed.push({ uuid: item.uuid, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (indexChanged) {
      (index as { lastUpdated?: string }).lastUpdated = new Date().toISOString();
      const tmp = `${indexPath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(index, null, 2), 'utf8');
      await fs.move(tmp, indexPath!, { overwrite: true });
    }
  }

  const reportPath = get('--report') ?? `private/required-pages-history-${apply ? 'applied' : 'dry-run'}.md`;
  const line = (p: RepairItem): string => `- ${p.title || '(no title)'} \`${p.uuid}\``;
  const out = [
    `# Required-pages history repair: ${apply ? 'applied' : 'dry run'}`,
    '',
    `Source: \`${requiredDir}/versions\`. Pages: \`${pagesDir}\`. Generated ${new Date().toISOString()}. ${apply ? '' : 'Nothing was written.'}`,
    '',
    `- Move into \`${pagesDir}/versions\`: ${count('move')}`,
    `- Archive (a history already in the pages directory): ${count('archive-conflict')}`,
    `- Archive (no page with that UUID on this instance): ${count('archive-orphan')}`,
    ...(apply ? [`- Index entries corrected to \`pages\`: ${indexChanged}`, `- Failed: ${failed.length}`] : []),
    '',
    '## Archive — history already in the pages directory',
    '',
    ...plan.filter((p) => p.action === 'archive-conflict').map(line),
    '',
    '## Archive — no page on this instance',
    '',
    ...plan.filter((p) => p.action === 'archive-orphan').map(line),
    '',
    '## Move',
    '',
    ...plan.filter((p) => p.action === 'move').map(line),
    ...(failed.length ? ['', '## Failed', '', ...failed.map((f) => `- \`${f.uuid}\`: ${f.error}`)] : []),
    ''
  ];
  await fs.ensureDir(path.dirname(reportPath));
  await fs.writeFile(reportPath, out.join('\n'), 'utf8');
  console.log(`${plan.length} histories: ${count('move')} move, ${count('archive-conflict')} archive (conflict), ${count('archive-orphan')} archive (orphan).${apply ? ` Index corrected: ${indexChanged}. Failed: ${failed.length}.` : ' Dry run — nothing written.'}`);
  console.log(`Report: ${reportPath}`);
  if (apply) process.exit(failed.length ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('repair-required-pages-history.ts')) {
  main().catch((err: unknown) => {
    console.error('✗ repair-required-pages-history failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
