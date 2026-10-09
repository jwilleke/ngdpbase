/**
 * Where scheduled jobs keep what must survive a restart (#1714, epic #1611):
 * each job's last slot done, its next slot and its current run, a capped run
 * history, a run's checkpoint, and the lock that lets exactly one server run a
 * slot.
 *
 * Two backends, one contract (`__tests__/jobStateContract.ts` runs against
 * both):
 *   - `file` — JSON in FAST_STORAGE, written atomically; a lock is a file
 *     created exclusively;
 *   - `sqlite` — tables in the application database (DatabaseManager), changed
 *     in transactions; a lock is a row taken by a conditional write.
 *
 * `selectJobStateBackend` reads `ngdpbase.jobs.state.provider`: `auto` picks
 * `sqlite` when the application database is open, else `file`. Switching
 * backends carries nothing across: the new one starts empty, next slots are
 * recomputed and missed slots are not caught up.
 *
 * @module providers/jobState
 */

/** One run of a job. Times are ISO 8601 instants. */
export interface JobRunRecord {
  runId: string;
  /** The slot this run is for; null for a run someone started by hand. */
  slot: string | null;
  startedAt: string;
  /** 1 for the first try; a run resumed after a restart counts up. */
  attempt: number;
  /** `skipped`: a slot the scheduler passed over, by its catch-up or overlap rule (#1715). */
  status: 'running' | 'completed' | 'failed' | 'interrupted' | 'skipped';
  completedAt?: string;
  error?: string;
  /** A failed attempt with attempts left: when it is tried again (#1716). */
  retryAt?: string;
}

export interface JobState {
  jobId: string;
  lastSlotDone: string | null;
  /** The first slot not yet handled: run, skipped or failed (#1715). */
  nextSlot: string | null;
  current: JobRunRecord | null;
  /**
   * The schedule the slots were computed from (`rrule|dtstart|timeZone`), so a
   * rule changed while the server was down is seen at the next start: slots
   * are recomputed from then, and nothing is caught up for the old rule
   * (#1715). Null for state written before the rule was kept.
   */
  rule: string | null;
}

export interface JobStateLimits {
  /** Runs kept per job (`ngdpbase.jobs.history-limit`). Default 50. */
  historyLimit?: number;
  /** Largest checkpoint accepted, in bytes of JSON. Default 256 KiB. */
  checkpointMaxBytes?: number;
}

export const DEFAULT_HISTORY_LIMIT = 50;
export const DEFAULT_CHECKPOINT_MAX_BYTES = 256 * 1024;

export interface JobStateProvider {
  readonly backend: 'file' | 'sqlite';
  getState(jobId: string): Promise<JobState | null>;
  putState(state: JobState): Promise<void>;
  /** Add or replace a run in the job's history, keeping the newest `historyLimit`. */
  recordRun(jobId: string, run: JobRunRecord): Promise<void>;
  /** The job's runs, newest first. */
  listRuns(jobId: string): Promise<JobRunRecord[]>;
  /** Throws when the JSON is larger than `checkpointMaxBytes`. */
  saveCheckpoint(jobId: string, runId: string, data: unknown): Promise<void>;
  loadCheckpoint(jobId: string, runId: string): Promise<unknown>;
  clearCheckpoint(jobId: string, runId: string): Promise<void>;
  /**
   * Take the lock for one slot, or steal it when its holder let it expire.
   * True for exactly one caller among any that contend.
   */
  takeLock(jobId: string, slot: string, owner: string, ttlMs: number): Promise<boolean>;
  /** Extend a lock this owner holds. False when it no longer holds it. */
  renewLock(jobId: string, slot: string, owner: string, ttlMs: number): Promise<boolean>;
  /** Give up a lock this owner holds; a lock held by another owner is left alone. */
  releaseLock(jobId: string, slot: string, owner: string): Promise<void>;
  close?(): void;
}

/** A job id names files and rows: dotted, lowercase, digits and dashes (`my-addon.daily-close`). */
const JOB_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export function assertJobId(jobId: string): void {
  if (!JOB_ID.test(jobId)) throw new Error(`Job id "${jobId}" must be lowercase letters and digits, joined by single dots or dashes`);
}

/** A slot as a compact UTC stamp, safe in a file name: `20261008T060000Z`. */
export function slotKey(slot: string): string {
  const t = Date.parse(slot);
  if (Number.isNaN(t)) throw new Error(`Slot "${slot}" is not an ISO 8601 instant`);
  return new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** The JSON a checkpoint is stored as, refused when larger than the cap. */
export function checkpointJson(data: unknown, maxBytes: number): string {
  const json = JSON.stringify(data ?? null);
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > maxBytes) throw new Error(`Checkpoint is ${bytes} bytes; the limit is ${maxBytes}`);
  return json;
}

/**
 * Which backend `ngdpbase.jobs.state.provider` names. `auto` (the default)
 * picks `sqlite` when the application database is open. `sqlite` with no
 * database open is an error naming the key to set.
 */
export function selectJobStateBackend(configured: unknown, databaseEnabled: boolean): 'file' | 'sqlite' {
  const value = typeof configured === 'string' ? configured.toLowerCase() : 'auto';
  if (value === 'auto') return databaseEnabled ? 'sqlite' : 'file';
  if (value === 'file') return 'file';
  if (value === 'sqlite') {
    if (!databaseEnabled) throw new Error("ngdpbase.jobs.state.provider is 'sqlite' but no application database is open — set ngdpbase.database.provider to 'sqlite', or use 'file' or 'auto' (#1714)");
    return 'sqlite';
  }
  throw new Error(`ngdpbase.jobs.state.provider '${value}' is not one of auto, file, sqlite (#1714)`);
}
