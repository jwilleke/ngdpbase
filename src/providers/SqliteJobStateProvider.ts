/**
 * Scheduled-job state in the application database (#1714). See `jobState.ts`.
 *
 * Uses the one connection `DatabaseManager.getHandle()` hands out — never a
 * database file of its own — so it is encrypted when the database is
 * (SQLCipher, `NGDPBASE_DATABASE_KEY`). The tables come from the core
 * migration ledger (`databaseMigrations.ts`, 20261008180000).
 *
 * A lock is a row in `job_leases`, taken by one conditional write: insert it,
 * or overwrite it only when it has expired or already belongs to the caller.
 * SQLite runs that statement as one unit, so of any servers racing for a slot
 * exactly one sees its row change.
 *
 * @module providers/SqliteJobStateProvider
 */

import type Database from 'better-sqlite3-multiple-ciphers';
import {
  assertJobId, checkpointJson,
  DEFAULT_CHECKPOINT_MAX_BYTES, DEFAULT_HISTORY_LIMIT,
  type JobRunRecord, type JobState, type JobStateLimits, type JobStateProvider
} from './jobState.js';

type Handle = InstanceType<typeof Database>;

export interface SqliteJobStateOptions extends JobStateLimits {
  /** For tests: the clock. */
  now?: () => number;
}

class SqliteJobStateProvider implements JobStateProvider {
  readonly backend = 'sqlite' as const;
  private readonly historyLimit: number;
  private readonly checkpointMaxBytes: number;
  private readonly now: () => number;

  constructor(private readonly db: Handle, options: SqliteJobStateOptions = {}) {
    this.historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    this.checkpointMaxBytes = options.checkpointMaxBytes ?? DEFAULT_CHECKPOINT_MAX_BYTES;
    this.now = options.now ?? Date.now;
  }

  async getState(jobId: string): Promise<JobState | null> {
    assertJobId(jobId);
    const row = this.db.prepare('SELECT last_slot_done, next_slot, current_run FROM job_state WHERE job_id = ?').get(jobId) as
      { last_slot_done: string | null; next_slot: string | null; current_run: string | null } | undefined;
    if (!row) return null;
    return {
      jobId,
      lastSlotDone: row.last_slot_done,
      nextSlot: row.next_slot,
      current: row.current_run ? JSON.parse(row.current_run) as JobRunRecord : null
    };
  }

  async putState(state: JobState): Promise<void> {
    assertJobId(state.jobId);
    this.db.prepare(`INSERT INTO job_state (job_id, last_slot_done, next_slot, current_run, updated_at)
      VALUES (@jobId, @last, @next, @current, @at)
      ON CONFLICT (job_id) DO UPDATE SET last_slot_done = excluded.last_slot_done, next_slot = excluded.next_slot,
        current_run = excluded.current_run, updated_at = excluded.updated_at`).run({
      jobId: state.jobId,
      last: state.lastSlotDone,
      next: state.nextSlot,
      current: state.current ? JSON.stringify(state.current) : null,
      at: new Date(this.now()).toISOString()
    });
  }

  async recordRun(jobId: string, run: JobRunRecord): Promise<void> {
    assertJobId(jobId);
    this.db.transaction(() => {
      this.db.prepare(`INSERT INTO job_runs (run_id, job_id, started_at, record) VALUES (?, ?, ?, ?)
        ON CONFLICT (run_id) DO UPDATE SET record = excluded.record, started_at = excluded.started_at`)
        .run(run.runId, jobId, run.startedAt, JSON.stringify(run));
      this.db.prepare(`DELETE FROM job_runs WHERE job_id = ? AND run_id NOT IN (
        SELECT run_id FROM job_runs WHERE job_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?)`)
        .run(jobId, jobId, this.historyLimit);
    })();
  }

  async listRuns(jobId: string): Promise<JobRunRecord[]> {
    assertJobId(jobId);
    const rows = this.db.prepare('SELECT record FROM job_runs WHERE job_id = ? ORDER BY started_at DESC, rowid DESC').all(jobId) as Array<{ record: string }>;
    return rows.map((r) => JSON.parse(r.record) as JobRunRecord);
  }

  async saveCheckpoint(jobId: string, runId: string, data: unknown): Promise<void> {
    assertJobId(jobId);
    const json = checkpointJson(data, this.checkpointMaxBytes);
    this.db.prepare(`INSERT INTO job_checkpoints (job_id, run_id, data, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (job_id, run_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .run(jobId, runId, json, new Date(this.now()).toISOString());
  }

  async loadCheckpoint(jobId: string, runId: string): Promise<unknown> {
    assertJobId(jobId);
    const row = this.db.prepare('SELECT data FROM job_checkpoints WHERE job_id = ? AND run_id = ?').get(jobId, runId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  async clearCheckpoint(jobId: string, runId: string): Promise<void> {
    assertJobId(jobId);
    this.db.prepare('DELETE FROM job_checkpoints WHERE job_id = ? AND run_id = ?').run(jobId, runId);
  }

  async takeLock(jobId: string, slot: string, owner: string, ttlMs: number): Promise<boolean> {
    assertJobId(jobId);
    const now = this.now();
    const result = this.db.prepare(`INSERT INTO job_leases (job_id, slot, owner, expires_at) VALUES (@jobId, @slot, @owner, @expires)
      ON CONFLICT (job_id, slot) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
      WHERE job_leases.expires_at <= @now OR job_leases.owner = @owner`)
      .run({ jobId, slot, owner, expires: now + ttlMs, now });
    return result.changes === 1;
  }

  async renewLock(jobId: string, slot: string, owner: string, ttlMs: number): Promise<boolean> {
    assertJobId(jobId);
    const result = this.db.prepare('UPDATE job_leases SET expires_at = ? WHERE job_id = ? AND slot = ? AND owner = ?')
      .run(this.now() + ttlMs, jobId, slot, owner);
    return result.changes === 1;
  }

  async releaseLock(jobId: string, slot: string, owner: string): Promise<void> {
    assertJobId(jobId);
    this.db.prepare('DELETE FROM job_leases WHERE job_id = ? AND slot = ? AND owner = ?').run(jobId, slot, owner);
  }
}

export default SqliteJobStateProvider;
