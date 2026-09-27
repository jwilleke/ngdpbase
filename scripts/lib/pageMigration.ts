/**
 * What every page-store migration script shares (#1341, #1353): refusing to
 * write while the server runs, walking the current page files, telling a
 * private page from a public one, and the one write a migration makes —
 * through PageManager's door, as the system principal, keeping the page's
 * `lastModified`.
 *
 * Used by `scripts/fix-page-markdown.ts` and
 * `scripts/strip-stray-frontmatter.ts`.
 */
import fs from 'fs-extra';
import path from 'path';

/** The server's PID lock (src/app.ts). A live PID means the server is up. */
export function serverRunning(): number | null {
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

/** Every current page file under `dir`: `versions/` and `deleted/` are skipped. */
export async function pageFiles(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'versions' || entry.name === 'deleted') continue;
      await pageFiles(full, out);
    } else if (entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Whether a page is private: a store path, or `private: true`. A migration
 * never writes one. A store page is written with its owner's keys under its
 * store path, which a migration run does not have, and saving it by its bare
 * title would publish it (#1341).
 */
export function isPrivatePageFile(dataDir: string, file: string, data: Record<string, unknown>): boolean {
  return data['private'] === true || path.relative(dataDir, file).split(path.sep).includes('private');
}

/** The one page write a migration makes. */
export type SaveThroughDoor = (title: string, content: string, metadata: Record<string, unknown>) => Promise<void>;

/**
 * Boot the engine for `--apply` and hand back the write, after refusing to
 * run while the server is up (two processes writing one page store corrupt
 * the index) or when `dataDir` is not this instance's page store. Exits the
 * process on either refusal.
 *
 * The write goes through PageManager, so it is validated, versioned, audited
 * and reconciles the search index, link graph and rendered cache (#1341); it
 * is made by the system principal and keeps the page's `lastModified`.
 */
export async function openSaveThroughDoor(dataDir: string, reason: string): Promise<SaveThroughDoor> {
  const pid = serverRunning();
  if (pid) {
    console.error(`✗ The server is running (PID ${pid}). Stop it first — ./server.sh stop <env> — then re-run.`);
    process.exit(1);
  }
  await import('../../src/bootstrap-env.js');
  const expected = path.resolve(process.env.SLOW_STORAGE ?? '', 'pages');
  if (path.resolve(dataDir) !== expected) {
    console.error(`✗ --data ${dataDir} is not this instance's page store (${expected}). --apply writes through the engine, which uses .env.`);
    process.exit(1);
  }
  const { default: WikiEngine } = await import('../../src/WikiEngine.js');
  const engine = new WikiEngine();
  await engine.initialize();
  const { systemContext } = await import('../../src/context/bootActions.js');
  const pm = engine.getManager<import('../../src/managers/PageManager.js').default>('PageManager');
  if (!pm) {
    console.error('✗ No PageManager after engine start.');
    process.exit(1);
  }
  const ctx = systemContext(engine, reason);
  return async (title, content, metadata) => {
    await pm.savePage(title, content, metadata, ctx, { preserveLastModified: true });
  };
}
