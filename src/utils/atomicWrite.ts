/**
 * atomicWrite — never leave a half-written file behind (#1062).
 *
 * `fs.writeFile` over a live path truncates it first, so a crash, container
 * kill, OOM, disk-full, or power loss part-way through leaves the file
 * truncated: not the old content, not the new content. The page index and the
 * version manifest already guarded against this with temp-then-rename; page
 * content and version snapshots did not.
 *
 * That gap mattered more than it looks. #1061's argument for refusing a stale
 * save is that the losing edit survives in version history — which is only true
 * while the history files themselves are intact. A truncated snapshot corrupts
 * the recovery path that the rest of the durability story leans on.
 *
 * ## What this guarantees, and what it does not
 *
 * `rename(2)` within a filesystem is atomic: a reader sees either the whole old
 * file or the whole new one, never a mixture. Writing to a sibling temp file
 * first means the live path is never in a partial state.
 *
 * Deliberately stated rather than implied:
 *
 * - **Same directory, always.** A rename across filesystems is not atomic — it
 *   degrades to copy-then-unlink. Putting the temp file beside the target keeps
 *   it on the same device by construction, including when the pages directory
 *   is a mount of its own.
 * - **fsync is OFF by default, deliberately.** Measured on this repo's storage:
 *   0.13 ms/write plain, 8.62 ms/write with fsync — 65x, or about +150 seconds
 *   across a full 18,000-page index rebuild.
 *
 *   What that cost buys is narrow. The failure this issue is about is a
 *   *process* death — deploy, OOM, node eviction — and there the kernel still
 *   flushes the page cache, so temp-then-rename alone leaves the file whole.
 *   fsync only adds protection against power loss, kernel panic, or a host
 *   crash, which the storage layer under a PV normally handles.
 *
 *   Callers that genuinely need it pass `{ fsync: true }`. Defaulting it on
 *   would have made every bulk operation dramatically slower to buy a
 *   guarantee against a failure mode this deployment does not face.
 * - **This is not a lock.** Two writers still race; the loser's content is
 *   simply overwritten whole rather than interleaved. Concurrency is #1061's
 *   problem, not this one.
 */
import fs from 'fs-extra';
import { open, type FileHandle } from 'fs/promises';
import path from 'path';
import logger from './logger.js';

/** Counter making concurrent temp names unique within a process. */
let sequence = 0;

/**
 * Write `data` to `filePath` so that the path is never observed partially
 * written.
 *
 * The temp file carries the pid and a per-process counter so two writers — or
 * two processes sharing a volume — cannot collide on it and corrupt each
 * other's staging file.
 *
 * @param filePath - final destination
 * @param data     - contents to write
 * @param encoding - defaults to utf8
 * @param options.fsync - also flush to the device. Off by default; see the file
 *   header for why, and for the measured cost.
 */
export async function writeFileAtomic(
  filePath: string,
  data: string | Buffer,
  encoding: BufferEncoding = 'utf8',
  options: { fsync?: boolean } = {}
): Promise<void> {
  const dir = path.dirname(filePath);
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.tmp.${process.pid}.${++sequence}`
  );

  let handle: FileHandle | undefined;
  try {
    await fs.ensureDir(dir);
    handle = await open(tempPath, 'w');
    await handle.write(typeof data === 'string' ? Buffer.from(data, encoding) : data);
    if (options.fsync) {
      // Only when the caller asks: see the cost note in the file header.
      await handle.sync();
    }
    await handle.close();
    handle = undefined;

    await fs.rename(tempPath, filePath);
    if (options.fsync) await fsyncDirectory(dir);
  } catch (err) {
    if (handle) {
      await handle.close().catch(() => { /* already failing; keep the original error */ });
    }
    // Leaving the temp file behind would accumulate junk beside real pages and,
    // being dot-prefixed, would be invisible in most listings.
    await fs.remove(tempPath).catch(() => { /* best effort */ });
    throw err;
  }
}

/**
 * Flush the directory entry so the rename survives a power loss.
 *
 * Best-effort on purpose: not every platform or filesystem permits opening a
 * directory for fsync, and a page save must not fail because of it. A failure
 * here narrows the guarantee to "no partial file" without weakening it.
 */
async function fsyncDirectory(dir: string): Promise<void> {
  let dirHandle: FileHandle | undefined;
  try {
    dirHandle = await open(dir, 'r');
    await dirHandle.sync();
  } catch (err) {
    logger.debug(`[atomicWrite] Directory fsync skipped for ${dir}: ${String(err)}`);
  } finally {
    await dirHandle?.close().catch(() => { /* best effort */ });
  }
}

export default writeFileAtomic;
