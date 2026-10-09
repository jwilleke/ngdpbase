/**
 * Scheduled-job state as files in FAST_STORAGE (#1714). See `jobState.ts`.
 *
 *   <root>/state/<jobId>.json              last slot done, next slot, current run
 *   <root>/runs/<jobId>.json               run history, newest first, capped
 *   <root>/checkpoints/<jobId>/<runId>.json
 *   <root>/locks/<jobId>@<slot>.lock       { owner, expiresAt }
 *
 * Every write is atomic and flushed (temp file, fsync, rename), so a crash
 * mid-write leaves the previous file whole. A lock is created exclusively:
 * of any servers racing for a slot, the one whose create lands wins. An
 * expired lock is stolen by renaming it aside and creating a fresh one; the
 * rename succeeds for one stealer only. Renewal is the holder's job, well
 * inside the lock's lifetime, so a live holder is never stolen from.
 *
 * Refuses to start on NFS or SMB: exclusive create and rename are what the
 * locks rest on, and network filesystems do not promise them across clients.
 *
 * @module providers/FileJobStateProvider
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import { writeFileAtomic } from '../utils/atomicWrite.js';
import { networkFilesystemAt, type StatFsLike } from './sqliteLocation.js';
import {
  assertJobId, checkpointJson, slotKey,
  DEFAULT_CHECKPOINT_MAX_BYTES, DEFAULT_HISTORY_LIMIT,
  type JobRunRecord, type JobState, type JobStateLimits, type JobStateProvider
} from './jobState.js';

interface LockFile { owner: string; expiresAt: number }

export interface FileJobStateOptions extends JobStateLimits {
  /** For tests: the filesystem probe and platform behind the network-filesystem refusal. */
  statfs?: (p: string) => StatFsLike;
  platform?: string;
  /** For tests: the clock. */
  now?: () => number;
}

class FileJobStateProvider implements JobStateProvider {
  readonly backend = 'file' as const;
  private readonly historyLimit: number;
  private readonly checkpointMaxBytes: number;
  private readonly now: () => number;
  /** One read-modify-write at a time per file, within this process. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly root: string, options: FileJobStateOptions = {}) {
    const network = networkFilesystemAt(root, options.statfs, options.platform);
    if (network) {
      throw new Error(
        `refusing to start: scheduled-job state ${root} would live on ${network.name} (${network.probe}). ` +
        'Its locks rely on exclusive create and atomic rename, which network filesystems do not guarantee across servers. ' +
        'Put FAST_STORAGE on local disk, or keep job state in the application database (ngdpbase.jobs.state.provider: sqlite) (#1714).'
      );
    }
    this.historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    this.checkpointMaxBytes = options.checkpointMaxBytes ?? DEFAULT_CHECKPOINT_MAX_BYTES;
    this.now = options.now ?? Date.now;
  }

  private file(kind: 'state' | 'runs', jobId: string): string {
    assertJobId(jobId);
    return path.join(this.root, kind, `${jobId}.json`);
  }

  private checkpointFile(jobId: string, runId: string): string {
    assertJobId(jobId);
    if (!/^[A-Za-z0-9-]+$/.test(runId)) throw new Error(`Run id "${runId}" must be letters, digits and dashes`);
    return path.join(this.root, 'checkpoints', jobId, `${runId}.json`);
  }

  private lockFile(jobId: string, slot: string): string {
    assertJobId(jobId);
    return path.join(this.root, 'locks', `${jobId}@${slotKey(slot)}.lock`);
  }

  private async readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  private write(file: string, value: unknown): Promise<void> {
    return writeFileAtomic(file, JSON.stringify(value), 'utf8', { fsync: true });
  }

  /** Run `task` after every earlier task on the same file has settled. */
  private serial<T>(file: string, task: () => Promise<T>): Promise<T> {
    const before = this.queues.get(file) ?? Promise.resolve();
    const run = before.then(task, task);
    const settled = run.then(() => undefined, () => undefined);
    this.queues.set(file, settled);
    void settled.then(() => { if (this.queues.get(file) === settled) this.queues.delete(file); });
    return run;
  }

  async getState(jobId: string): Promise<JobState | null> {
    const state = await this.readJson<JobState>(this.file('state', jobId));
    return state ? { ...state, rule: state.rule ?? null } : null;
  }

  async putState(state: JobState): Promise<void> {
    const file = this.file('state', state.jobId);
    await this.serial(file, () => this.write(file, state));
  }

  async recordRun(jobId: string, run: JobRunRecord): Promise<void> {
    const file = this.file('runs', jobId);
    await this.serial(file, async () => {
      const runs = (await this.readJson<JobRunRecord[]>(file)) ?? [];
      const rest = runs.filter((r) => r.runId !== run.runId);
      await this.write(file, [run, ...rest].slice(0, this.historyLimit));
    });
  }

  async listRuns(jobId: string): Promise<JobRunRecord[]> {
    return (await this.readJson<JobRunRecord[]>(this.file('runs', jobId))) ?? [];
  }

  async saveCheckpoint(jobId: string, runId: string, data: unknown): Promise<void> {
    const json = checkpointJson(data, this.checkpointMaxBytes);
    await writeFileAtomic(this.checkpointFile(jobId, runId), json, 'utf8', { fsync: true });
  }

  async loadCheckpoint(jobId: string, runId: string): Promise<unknown> {
    return this.readJson<unknown>(this.checkpointFile(jobId, runId));
  }

  async clearCheckpoint(jobId: string, runId: string): Promise<void> {
    await fs.remove(this.checkpointFile(jobId, runId));
  }

  private async createLock(file: string, owner: string, ttlMs: number): Promise<boolean> {
    try {
      await writeFileAtomic(file, JSON.stringify({ owner, expiresAt: this.now() + ttlMs } satisfies LockFile), 'utf8', { exclusive: true, fsync: true });
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw err;
    }
  }

  async takeLock(jobId: string, slot: string, owner: string, ttlMs: number): Promise<boolean> {
    const file = this.lockFile(jobId, slot);
    if (await this.createLock(file, owner, ttlMs)) return true;

    const held = await this.readJson<LockFile>(file).catch(() => null);
    if (held && held.owner === owner) return this.renewLock(jobId, slot, owner, ttlMs);
    if (held && held.expiresAt > this.now()) return false;

    // Expired (or unreadable): move it aside. One stealer's rename succeeds;
    // the rest find nothing to move and fall through to the exclusive create.
    const aside = `${file}.stale-${randomUUID()}`;
    try {
      await fs.rename(file, aside);
      const moved = await this.readJson<LockFile>(aside).catch(() => null);
      if (moved && moved.expiresAt > this.now()) {
        // A live lock taken since we looked: put it back, never over another.
        await fs.link(aside, file).catch(() => { /* someone holds the name now; theirs stands */ });
        await fs.remove(aside);
        return false;
      }
      await fs.remove(aside);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    return this.createLock(file, owner, ttlMs);
  }

  async renewLock(jobId: string, slot: string, owner: string, ttlMs: number): Promise<boolean> {
    const file = this.lockFile(jobId, slot);
    const held = await this.readJson<LockFile>(file).catch(() => null);
    if (!held || held.owner !== owner) return false;
    await this.write(file, { owner, expiresAt: this.now() + ttlMs } satisfies LockFile);
    return true;
  }

  async releaseLock(jobId: string, slot: string, owner: string): Promise<void> {
    const file = this.lockFile(jobId, slot);
    const held = await this.readJson<LockFile>(file).catch(() => null);
    if (held && held.owner === owner) await fs.remove(file);
  }
}

export default FileJobStateProvider;
