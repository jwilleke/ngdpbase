import { randomUUID } from 'crypto';
import os from 'node:os';
import BaseManager from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import { describeJobContext, type JobContext } from '../context/JobContext.js';
import { scheduleContext } from '../context/bootActions.js';
import { parseSchedule, type Schedule, type ScheduleInput } from '../utils/schedule.js';
import { selectSlots, CATCH_UP_ALL_CAP, type CatchUp, type Overlap } from '../utils/jobSlots.js';
import { assertJobId, checkpointJson, selectJobStateBackend, type JobRunRecord, type JobState, type JobStateProvider } from '../providers/jobState.js';
import FileJobStateProvider from '../providers/FileJobStateProvider.js';
import SqliteJobStateProvider from '../providers/SqliteJobStateProvider.js';

/** A JobContext a JavaScript caller actually supplied: an object naming who and from where. */
function isUsableContext(value: unknown): value is JobContext {
  return typeof value === 'object' && value !== null
    && typeof (value as { username?: unknown }).username === 'string'
    && typeof (value as { origin?: unknown }).origin === 'string';
}
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { AUDIT_EVENT, type AuditEventName } from '../utils/auditEventNames.js';

const JOB_EVENT: Record<'started' | 'completed' | 'failed', AuditEventName> = {
  started: AUDIT_EVENT.JOB_STARTED,
  completed: AUDIT_EVENT.JOB_COMPLETED,
  failed: AUDIT_EVENT.JOB_FAILED
};

/** How often the scheduler looks for due slots (#1715). */
const TICK_MS = 15_000;
/** A slot that came due at most this long ago is on time, not missed. */
const ON_TIME_MS = 60_000;
/** A slot lock lasts this long, and its holder renews it well inside that. */
const LOCK_TTL_MS = 60_000;
const LOCK_RENEW_MS = 15_000;
/** A scheduled run's time limit when the job declares none (#1611 §3). */
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;
/** After a timeout's abort, how long the job has to stop before the run is failed anyway. */
const TIMEOUT_GRACE_MS = 5_000;
/** Attempts a scheduled slot gets before it is failed for good (#1716). */
const DEFAULT_MAX_ATTEMPTS = 3;
/** Wait before attempt 2, 3, 4 and later (#1611 §6). */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000];
/** At most one checkpoint write per run this often; the latest wins. */
const CHECKPOINT_THROTTLE_MS = 5_000;
/** `ngdpbase.jobs.max-checkpoint-bytes` when it is not set. */
const DEFAULT_CHECKPOINT_MAX_BYTES = 64 * 1024;
/** `ngdpbase.jobs.shutdown-grace-ms` when it is not set: how long running jobs get to stop at shutdown. */
const DEFAULT_SHUTDOWN_GRACE_MS = 5_000;
/** Who holds a slot lock: this host, this process, this start. */
const LOCK_OWNER = `${os.hostname()}:${process.pid}:${randomUUID()}`;

/**
 * Callback supplied to job run functions so they can push live progress
 * messages that the client can display while polling.
 */
export type ReportProgress = (message: string) => void;

/**
 * What a run is handed besides progress (#1715): who asked, as {@link JobContext}
 * — which stays flat and serialisable, so it is extended rather than changed —
 * and what only a running job needs.
 */
export interface JobRunContext extends JobContext {
  /** Aborted when the run times out. A long job checks it and stops. */
  signal: AbortSignal;
  /** The slot this run is for (ISO instant); null for a run nobody scheduled. */
  slot: string | null;
  /**
   * Set when this run picks up a slot an earlier attempt did not finish
   * (#1716): which attempt this is, the last checkpoint that attempt saved
   * (null if none), and why it ended. Null on a first attempt.
   */
  resume: { attempt: number; checkpoint: unknown; reason: string } | null;
  /**
   * Save a bookmark the next attempt receives as `resume.checkpoint`, e.g.
   * `{ doneThrough: 311 }`. JSON only; larger than
   * `ngdpbase.jobs.max-checkpoint-bytes` throws. Written at most once every
   * 5 s, the latest winning; deleted when the run succeeds, kept when it fails.
   * Kept only for a persisted scheduled job; elsewhere it is checked and dropped.
   */
  checkpoint(data: unknown): void;
}

/** What a resumed attempt carries over from the one before. */
interface Resume {
  runId: string;
  attempt: number;
  reason: string;
}

/** A slot an administrator asked to run again (#1718): the run's id, and who asked. */
interface Rerun {
  runId: string;
  requestedBy: JobContext;
}

type DrainItem = { slot: Date; resume?: Resume; rerun?: Rerun };

/** Why an administrator's action on a job was refused (#1718); `status` is the HTTP answer. */
export class JobActionError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
    this.name = 'JobActionError';
  }
}

/** A scheduled job as the admin page shows it (#1718). */
export interface ScheduledJobView {
  id: string;
  displayName: string;
  /** The schedule in force, as written (a shorthand or an RRULE), and what it compiled to. */
  schedule: string;
  rrule: string;
  timeZone: string;
  catchUp: CatchUp;
  overlap: Overlap;
  maxAttempts: number;
  persist: boolean;
  /** False while `ngdpbase.jobs.<id>.enabled` is false: paused. */
  enabled: boolean;
  running: boolean;
  nextSlot: string | null;
  lastSlotDone: string | null;
  /** The run the state names as current: running, waiting for a retry, or interrupted. */
  current: JobRunRecord | null;
  /** History, newest first. A run with no slot was started by hand. */
  runs: JobRunRecord[];
}

/**
 * A job type that can be registered with the BackgroundJobManager.
 */
export interface JobDefinition {
  /** Unique job type ID, e.g. 'pages.reindex' */
  id: string;
  /** Human-readable name shown in UI and notifications */
  displayName: string;
  /**
   * When to run by itself (#1715): an RRULE, or a shorthand such as
   * `end-of-month 06:00` (see `utils/schedule.ts`). Without one the job runs
   * only when enqueued. `ngdpbase.jobs.<id>.schedule` overrides it, and
   * `ngdpbase.jobs.<id>.enabled: false` stops it.
   */
  schedule?: ScheduleInput;
  /** Slots missed while the server was down or the job idle: `none`, `latest` (default) or `all` (newest 12). */
  catchUp?: CatchUp;
  /** Slots that came due while the job was still running: `queue` (default, one waits) or `skip`. */
  overlap?: Overlap;
  /**
   * Milliseconds a run may take before it is aborted and failed. Scheduled
   * jobs default to one hour; `0` is no limit, and must be asked for.
   * `ngdpbase.jobs.max-timeout-ms` caps it when set. A job that is only ever
   * enqueued has no limit unless it declares one.
   */
  timeout?: number;
  /**
   * Keep slots, history and locks where a restart finds them (default `true`
   * for a scheduled job). `false` keeps them in memory: no catch-up after a
   * restart and no lock, so only for harmless maintenance ticks.
   */
  persist?: boolean;
  /**
   * Attempts a scheduled slot gets (default 3, #1716). A failed attempt — an
   * error, a timeout, a failure result, or the server stopping mid-run — is
   * tried again after 1, 5, then 15 minutes, with the same run id and slot.
   * After the last, the slot is failed and the next slot runs as usual.
   */
  maxAttempts?: number;
  /**
   * A routine maintenance tick (#1721): a success is neither audited nor
   * notified — an every-minute sweep would bury both — while a failure is
   * both, as for any job. Set by {@link BackgroundJobManager.registerMaintenance}.
   */
  routine?: boolean;
  /**
   * The work to perform. Resolves with a JobResult.
   *
   * __`ctx` is mandatory (#631).__ Without it the actor this manager captured
   * at `enqueue` reached the audit record and stopped there: `job-started`
   * named who asked for a reindex while the reindex itself ran as nobody. That
   * is the exact shape P1 in docs/security-posture.md warns about — a
   * parameter that cannot carry provenance guarantees provenance is lost — and
   * it was true of this signature for the whole first version of #631.
   *
   * A handler that needs to make a permission decision or write a record uses
   * this; one that does neither still receives it, because a handler which can
   * quietly grow into taking an action must not be able to do so anonymously.
   */
  run: (reportProgress: ReportProgress, ctx: JobRunContext) => Promise<JobResult>;
}

/** A registered job with a schedule, and what the scheduler knows about it. */
interface ScheduledJob {
  def: JobDefinition;
  /** The schedule as registered, before any configuration override. */
  registered: ScheduleInput;
  /** The schedule in force, and the configured text it came from. */
  schedule: Schedule;
  source: string;
  catchUp: CatchUp;
  overlap: Overlap;
  timeoutMs: number;
  persist: boolean;
  maxAttempts: number;
  /** For `persist: false`: the state, held here. */
  memoryState: JobState | null;
  /** Running or waiting to run the slots chosen at the last look. */
  draining: boolean;
  /** When the job's last run in this process ended. */
  busyUntil: Date | null;
  /** The configured override last refused, so it is reported once. */
  refusedOverride: string | null;
}

/**
 * Result returned by a completed job run.
 */
export interface JobResult {
  success: boolean;
  /** e.g. "Scanned 14 327 files, added 12, updated 3" */
  summary?: string;
  error?: string;
}

/**
 * State of a single job run instance.
 */
export interface JobRun {
  runId: string;
  jobId: string;
  displayName: string;
  /** Who asked for this work, and from where (#631). */
  requestedBy: JobContext;
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Live progress message set by the job via reportProgress(); cleared on completion */
  progress?: string;
  /** For a scheduled run: its slot, its attempt, and why the attempt before it ended (#1716). */
  slot?: string;
  attempt?: number;
  resumeReason?: string;
  /** Set at shutdown (#1717): the run was stopped to be handed to the next process, not failed. */
  interrupted?: boolean;
  startedAt: Date;
  completedAt?: Date;
  result?: JobResult;
}

/**
 * BackgroundJobManager — async long-running admin operations.
 *
 * Managers and plugins register job types at startup via registerJob().
 * Callers enqueue a job by ID; the job runs in the background and the
 * caller can poll getStatus(runId) for progress.
 *
 * Only one instance of a given jobId runs at a time — duplicate enqueue
 * returns the existing runId.
 *
 * On completion, a system notification is posted via NotificationManager.
 */
class BackgroundJobManager extends BaseManager {
  /** Registered job types, keyed by jobId */
  private jobs: Map<string, JobDefinition> = new Map();

  /** All run records (completed runs are kept for status polling) */
  private runs: Map<string, JobRun> = new Map();

  /** Maps jobId → runId for currently active (pending/running) runs */
  private activeByJobId: Map<string, string> = new Map();

  /** Jobs with a schedule (#1715), keyed by jobId. */
  private scheduled: Map<string, ScheduledJob> = new Map();
  private stateProvider: JobStateProvider | null;
  private readonly clock: () => Date;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  /** Scheduled runs in progress, so a caller can wait for them. */
  private drains: Set<Promise<void>> = new Set();
  /** Set once shutdown begins: no slot starts after it (#1717). */
  private stopping = false;
  private handedOff: Promise<void> | null = null;
  /** Each running job's abort, by run id. */
  private controllers: Map<string, AbortController> = new Map();
  /** For each running scheduled run: write it as interrupted and let go of its slot. */
  private handoffs: Map<string, () => Promise<void>> = new Map();

  /**
   * @param options - for tests: a state provider in place of the configured
   *   one, and the clock.
   */
  private readonly checkpointThrottleMs: number;

  constructor(engine: WikiEngine, options: { stateProvider?: JobStateProvider; now?: () => Date; checkpointThrottleMs?: number } = {}) {
    super(engine);
    this.stateProvider = options.stateProvider ?? null;
    this.clock = options.now ?? (() => new Date());
    this.checkpointThrottleMs = options.checkpointThrottleMs ?? CHECKPOINT_THROTTLE_MS;
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);
    // #1715: where scheduled jobs keep their slots. Opened here, after
    // DatabaseManager, so `auto` can see whether the application database is
    // open; a backend that cannot be used stops the server, naming the key.
    const configManager = this.configManager();
    if (!this.stateProvider && configManager) {
      const database = this.engine.getManager<{ isEnabled(): boolean; getHandle<H>(): H }>('DatabaseManager');
      const backend = selectJobStateBackend(configManager.getProperty('ngdpbase.jobs.state.provider', 'auto'), database?.isEnabled() ?? false);
      const limits = { historyLimit: Number(configManager.getProperty('ngdpbase.jobs.history-limit', 50)), checkpointMaxBytes: this.checkpointMaxBytes() };
      this.stateProvider = backend === 'sqlite' && database
        ? new SqliteJobStateProvider(database.getHandle(), limits)
        : new FileJobStateProvider(configManager.getResolvedDataPath('ngdpbase.jobs.state.dir', './data/jobs'), limits);
      logger.info(`BackgroundJobManager initialized (scheduled-job state: ${backend})`);
      return;
    }
    logger.info('BackgroundJobManager initialized');
  }

  private checkpointMaxBytes(): number {
    return Number(this.setting('ngdpbase.jobs.max-checkpoint-bytes', DEFAULT_CHECKPOINT_MAX_BYTES));
  }

  private configManager(): ConfigurationManager | null {
    return this.engine?.getManager?.<ConfigurationManager>('ConfigurationManager') ?? null;
  }

  private setting<T>(key: string, fallback: T): T {
    return (this.configManager()?.getProperty(key, fallback) ?? fallback) as T;
  }

  /**
   * Register a job type. Called at startup by managers and plugins.
   *
   * A job with a `schedule` is also scheduled (#1715). Its schedule, catch-up,
   * overlap and timeout are checked here, so a mistake is the author's error
   * at startup rather than a job that silently never runs.
   *
   * @throws Error naming what is wrong with a scheduled job's declaration
   */
  registerJob(def: JobDefinition): void {
    if (this.jobs.has(def.id)) {
      logger.warn(`[BackgroundJobManager] Job '${def.id}' already registered — overwriting`);
    }
    if (def.schedule !== undefined) {
      this.scheduled.set(def.id, this.compileScheduled(def));
    } else {
      this.scheduled.delete(def.id);
    }
    this.jobs.set(def.id, def);
    logger.debug(`[BackgroundJobManager] Registered job: ${def.id} (${def.displayName})`);
  }

  /**
   * A routine maintenance tick (#1721): work whose next run does the same
   * job, so a missed run costs nothing — a sweep, a retention purge, a folder
   * rescan. One declaration for all of them, in place of a hand-rolled
   * `setInterval`: it runs every `everyMs` (in whole minutes, at least one),
   * catches nothing up, keeps nothing across a restart, never overlaps
   * itself, and reports only failures. It is listed on Admin → Scheduled Jobs
   * like any job, and can be run, paused or rescheduled from there.
   *
   * `everyMs` 0 or less registers the job without a schedule: it stops
   * recurring, and can still be run by hand.
   */
  registerMaintenance(spec: { id: string; displayName: string; everyMs: number; run: (ctx: JobRunContext) => Promise<string | void> }): void {
    const def: JobDefinition = {
      id: spec.id,
      displayName: spec.displayName,
      routine: true,
      run: async (_progress, ctx) => {
        const summary = await spec.run(ctx);
        return { success: true, summary: summary ?? undefined };
      }
    };
    if (!(spec.everyMs > 0)) {
      this.registerJob(def);
      return;
    }
    const minutes = Math.max(1, Math.round(spec.everyMs / 60_000));
    if (minutes * 60_000 !== spec.everyMs) {
      logger.info(`[BackgroundJobManager] '${spec.id}' runs every ${minutes} minute(s): its ${spec.everyMs} ms interval, in whole minutes`);
    }
    this.registerJob({ ...def, schedule: `every ${minutes}m`, catchUp: 'none', overlap: 'skip', persist: false, maxAttempts: 1 });
  }

  private compileScheduled(def: JobDefinition): ScheduledJob {
    const where = `Scheduled job '${def.id}'`;
    const catchUp = def.catchUp ?? 'latest';
    const overlap = def.overlap ?? 'queue';
    const persist = def.persist ?? true;
    if (!['none', 'latest', 'all'].includes(catchUp)) throw new Error(`${where}: catchUp '${String(catchUp)}' is not one of none, latest, all`);
    if (!['queue', 'skip'].includes(overlap)) throw new Error(`${where}: overlap '${String(overlap)}' is not one of queue, skip`);
    if (persist) {
      assertJobId(def.id);
      if (!this.stateProvider) throw new Error(`${where}: persist is true but no scheduled-job state is open — register it after BackgroundJobManager has initialized`);
    }
    const timeoutMs = this.timeoutFor(def, DEFAULT_TIMEOUT_MS);
    const maxAttempts = def.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error(`${where}: maxAttempts must be a whole number, 1 or more`);
    const override = this.setting<unknown>(`ngdpbase.jobs.${def.id}.schedule`, null);
    const job: ScheduledJob = {
      def,
      registered: def.schedule as ScheduleInput,
      schedule: this.compile(def.schedule as ScheduleInput, where),
      source: sourceOf(def.schedule as ScheduleInput),
      catchUp, overlap, timeoutMs, persist, maxAttempts,
      memoryState: null,
      draining: false,
      busyUntil: null,
      refusedOverride: null
    };
    if (typeof override === 'string' && override.trim()) this.applyOverride(job, override);
    return job;
  }

  /** A run's time limit: the job's own, else `fallback`, capped by `ngdpbase.jobs.max-timeout-ms` when set. */
  private timeoutFor(def: JobDefinition, fallback: number): number {
    const declared = def.timeout ?? fallback;
    if (typeof declared !== 'number' || !Number.isFinite(declared) || declared < 0) {
      throw new Error(`Job '${def.id}': timeout must be milliseconds, 0 or more`);
    }
    const cap = Number(this.setting('ngdpbase.jobs.max-timeout-ms', 0));
    if (cap > 0 && (declared === 0 || declared > cap)) return cap;
    return declared;
  }

  private compile(input: ScheduleInput, where: string): Schedule {
    try {
      return parseSchedule(input, {
        defaultTimeZone: String(this.setting('ngdpbase.default.timezone', 'UTC')),
        minIntervalMs: Number(this.setting('ngdpbase.jobs.min-interval-ms', 60_000))
      });
    } catch (err) {
      throw new Error(`${where}: ${(err as Error).message}`, { cause: err });
    }
  }

  /**
   * `ngdpbase.jobs.<id>.schedule` in place of the registered schedule. One
   * that does not compile is refused, reported once, and the schedule in force
   * stays.
   */
  private applyOverride(job: ScheduledJob, text: string): void {
    if (text === job.source || text === job.refusedOverride) return;
    try {
      job.schedule = this.compile(text, `ngdpbase.jobs.${job.def.id}.schedule`);
      job.source = text;
      job.refusedOverride = null;
    } catch (err) {
      job.refusedOverride = text;
      logger.error(`[BackgroundJobManager] ${(err as Error).message} — keeping the schedule in force (${job.source})`);
    }
  }

  /** The configured schedule and switch, read each look so an admin change applies without a restart. */
  private refreshFromConfig(job: ScheduledJob): boolean {
    const override = this.setting<unknown>(`ngdpbase.jobs.${job.def.id}.schedule`, null);
    if (typeof override === 'string' && override.trim()) {
      this.applyOverride(job, override);
    } else if (job.source !== sourceOf(job.registered)) {
      job.schedule = this.compile(job.registered, `Scheduled job '${job.def.id}'`);
      job.source = sourceOf(job.registered);
    }
    return this.setting<unknown>(`ngdpbase.jobs.${job.def.id}.enabled`, true) !== false;
  }

  /**
   * Start looking for due slots (#1715). Called once the engine and its
   * add-ons are up, so a catch-up run never meets a manager still starting.
   */
  startScheduler(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, TICK_MS);
    this.timer.unref();
    void this.tick();
    logger.info(`[BackgroundJobManager] Scheduler started: ${this.scheduled.size} scheduled job(s)`);
  }

  /**
   * One look at every scheduled job: record the slots passed over, and start
   * the ones chosen. Public so tests can drive the clock.
   */
  async tick(): Promise<void> {
    if (this.ticking || this.stopping) return;
    this.ticking = true;
    try {
      for (const job of this.scheduled.values()) {
        try {
          await this.look(job);
        } catch (err) {
          logger.error(`[BackgroundJobManager] Scheduling '${job.def.id}' failed:`, err);
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  private async look(job: ScheduledJob): Promise<void> {
    if (!this.refreshFromConfig(job)) return;
    if (job.draining || this.activeByJobId.has(job.def.id)) return;

    const now = this.clock();
    const rule = ruleKey(job.schedule);
    const state = await this.loadState(job);

    if (!state || state.rule !== rule) {
      // A job seen for the first time starts from now. So does a changed
      // rule: nothing is caught up for the rule it replaced.
      if (state?.rule) await this.recordScheduleChange(job, state.rule, rule);
      await this.saveState(job, {
        jobId: job.def.id,
        lastSlotDone: state?.lastSlotDone ?? null,
        nextSlot: isoOrNull(job.schedule.nextSlot(now)),
        current: state?.current ?? null,
        rule
      });
      return;
    }
    if (state.current && await this.handleUnfinished(job, state, now)) return;
    if (!state.nextSlot || Date.parse(state.nextSlot) > now.getTime()) return;

    const due = job.schedule.slotsBetween(new Date(state.nextSlot), now);
    if (due.length === 0) {
      await this.saveState(job, { ...state, nextSlot: isoOrNull(job.schedule.nextSlot(now)) });
      return;
    }
    const { run, skip } = selectSlots({ due, now, busyUntil: job.busyUntil, onTimeMs: ON_TIME_MS, catchUp: job.catchUp, overlap: job.overlap });
    const after = isoOrNull(job.schedule.nextSlot(due[due.length - 1]));
    if (skip.length > 0) await this.recordSkipped(job, skip, run.length === 0 ? 'missed' : 'not chosen');

    if (run.length === 0) {
      await this.saveState(job, { ...state, nextSlot: after });
      return;
    }
    this.startDrain(job, run.map((slot) => ({ slot })), after);
  }

  /**
   * A run the state still names as current, which this process is not
   * running (#1716). True when it takes this look: it is held by another
   * server, waiting out its backoff, or being resumed now.
   */
  private async handleUnfinished(job: ScheduledJob, state: JobState, now: Date): Promise<boolean> {
    const current = state.current as JobRunRecord;
    if (!current.slot) return false;
    const provider = job.persist ? this.stateProvider : null;

    if (current.status === 'running') {
      // Its lock is still held: a live server is running it (a rolling update).
      if (provider && !(await provider.takeLock(job.def.id, current.slot, LOCK_OWNER, LOCK_TTL_MS))) return true;
      await provider?.releaseLock(job.def.id, current.slot, LOCK_OWNER);
      return this.afterFailedAttempt(job, current, 'the server stopped during the run', now);
    }
    if (current.status === 'interrupted') {
      // Handed off at shutdown (#1717): picked up at once, and not counted as an attempt.
      this.startDrain(job, [{ slot: new Date(current.slot), resume: { runId: current.runId, attempt: current.attempt, reason: 'interrupted' } }], null);
      return true;
    }
    if (current.status === 'failed' && current.retryAt) {
      if (Date.parse(current.retryAt) > now.getTime()) return true;
      this.startDrain(job, [{ slot: new Date(current.slot), resume: { runId: current.runId, attempt: current.attempt + 1, reason: current.error ?? 'failed' } }], null);
      return true;
    }
    return false;
  }

  /**
   * An attempt failed. With attempts left, the slot waits out its backoff and
   * is tried again (true: the job waits). After the last, the slot is failed
   * for good, audited, and the job goes on to its next slot (false).
   */
  private async afterFailedAttempt(job: ScheduledJob, record: JobRunRecord, error: string, now: Date): Promise<boolean> {
    const provider = job.persist ? this.stateProvider : null;
    const state = (await this.loadState(job)) ?? emptyState(job, ruleKey(job.schedule));
    const ended = { ...record, status: 'failed' as const, error, completedAt: record.completedAt ?? now.toISOString() };

    if (record.attempt < job.maxAttempts) {
      const wait = BACKOFF_MS[Math.min(record.attempt, BACKOFF_MS.length) - 1];
      const retrying: JobRunRecord = { ...ended, retryAt: new Date(now.getTime() + wait).toISOString() };
      await this.saveState(job, { ...state, current: retrying });
      await provider?.recordRun(job.def.id, retrying);
      logger.warn(`[BackgroundJobManager] '${job.def.id}' slot ${record.slot} attempt ${record.attempt} of ${job.maxAttempts} failed (${error}) — trying again at ${retrying.retryAt}`);
      return true;
    }

    const final: JobRunRecord = { ...ended, error: `${error} (attempt ${record.attempt} of ${job.maxAttempts}; not tried again)` };
    await this.saveState(job, { ...state, current: null, nextSlot: this.nextSlotAfter(job, state.nextSlot, record.slot) });
    await provider?.recordRun(job.def.id, final);
    logger.error(`[BackgroundJobManager] '${job.def.id}' slot ${record.slot} failed after ${record.attempt} attempt(s): ${error}`);
    await this.recordSchedulerEvent(job, AUDIT_EVENT.JOB_FAILED, 'job-failed', { runId: record.runId, slot: record.slot, attempt: record.attempt, maxAttempts: job.maxAttempts }, final.error as string, this.schedulerContext(job));
    return false;
  }

  /** The job's next slot once `slot` is handled: never earlier than the one already recorded. */
  private nextSlotAfter(job: ScheduledJob, recorded: string | null, slot: string | null): string | null {
    if (!slot) return recorded;
    if (recorded && Date.parse(recorded) > Date.parse(slot)) return recorded;
    return isoOrNull(job.schedule.nextSlot(new Date(slot)));
  }

  private startDrain(job: ScheduledJob, items: DrainItem[], after: string | null): void {
    if (this.stopping) return;
    job.draining = true;
    const drained: Promise<void> = this.drain(job, items, after).catch((err: unknown) => {
      logger.error(`[BackgroundJobManager] Scheduled job '${job.def.id}' stopped draining:`, err);
    }).finally(() => {
      job.draining = false;
      job.busyUntil = this.clock();
      this.drains.delete(drained);
    });
    this.drains.add(drained);
  }

  // ---------------------------------------------------------------------------
  // What an administrator sees and does (#1718). The routes check permission;
  // these refuse what would break the scheduler's own rules.
  // ---------------------------------------------------------------------------

  /** Every scheduled job, its state and its recent history. */
  async listScheduledJobs(): Promise<ScheduledJobView[]> {
    const views: ScheduledJobView[] = [];
    for (const job of this.scheduled.values()) {
      const enabled = this.refreshFromConfig(job);
      const state = await this.loadState(job);
      const runs = job.persist && this.stateProvider ? await this.stateProvider.listRuns(job.def.id) : [];
      views.push({
        id: job.def.id,
        displayName: job.def.displayName,
        schedule: job.source,
        rrule: job.schedule.rrule,
        timeZone: job.schedule.timeZone,
        catchUp: job.catchUp,
        overlap: job.overlap,
        maxAttempts: job.maxAttempts,
        persist: job.persist,
        enabled,
        running: job.draining || this.activeByJobId.has(job.def.id),
        nextSlot: state?.nextSlot ?? null,
        lastSlotDone: state?.lastSlotDone ?? null,
        current: state?.current ?? null,
        runs
      });
    }
    return views;
  }

  private scheduledOrThrow(jobId: string): ScheduledJob {
    const job = this.scheduled.get(jobId);
    if (!job) throw new JobActionError(`'${jobId}' is not a scheduled job`, 404);
    return job;
  }

  /** Refused while the job runs, waits for a retry, or the server is stopping: one run of a job at a time. */
  private async assertIdle(job: ScheduledJob): Promise<void> {
    if (this.stopping) throw new JobActionError('The server is shutting down', 409);
    if (job.draining || this.activeByJobId.has(job.def.id)) throw new JobActionError(`'${job.def.id}' is running`, 409);
    const current = (await this.loadState(job))?.current;
    if (current) throw new JobActionError(`'${job.def.id}' has an unfinished run (${current.status}${current.retryAt ? `, retry at ${current.retryAt}` : ''}) — retry it or let it finish first`, 409);
  }

  /**
   * Run a scheduled job now, outside its schedule (#1611 §9). As the person
   * who asked, with their permissions. It is no slot: it marks no slot done,
   * catches nothing up, and is not retried. Slots that come due while it runs
   * follow the job's overlap rule, as for any run. Returns the run id.
   */
  async runNow(jobId: string, requestedBy: JobContext): Promise<string> {
    const job = this.scheduledOrThrow(jobId);
    await this.assertIdle(job);
    const runId = randomUUID();
    const run: JobRun = { runId, jobId, displayName: job.def.displayName, requestedBy, status: 'pending', startedAt: this.clock() };
    this.runs.set(runId, run);
    this.activeByJobId.set(jobId, runId);
    const provider = job.persist ? this.stateProvider : null;
    const record: JobRunRecord = { runId, slot: null, startedAt: run.startedAt.toISOString(), attempt: 1, status: 'running' };
    await provider?.recordRun(jobId, record);

    job.draining = true;
    const maxBytes = this.checkpointMaxBytes();
    const done: Promise<void> = this.executeJob(job.def, run, {
      slot: null,
      timeoutMs: job.timeoutMs,
      resume: null,
      checkpoint: (data) => { checkpointJson(data, maxBytes); }
    }).then(async () => {
      await provider?.recordRun(jobId, {
        ...record,
        status: run.status === 'completed' ? 'completed' : 'failed',
        completedAt: (run.completedAt ?? this.clock()).toISOString(),
        ...(run.status === 'completed' ? {} : { error: run.result?.error ?? 'failed' })
      });
    }).catch((err: unknown) => {
      logger.error(`[BackgroundJobManager] '${jobId}' run now ${runId} failed outside its own handler:`, err);
    }).finally(() => {
      job.draining = false;
      job.busyUntil = this.clock();
      this.drains.delete(done);
    });
    this.drains.add(done);
    return runId;
  }

  /**
   * Run one slot again, under its own key (#1611 §9): one the scheduler
   * skipped, or one that failed for good. As the person who asked. Success
   * marks that slot done; the job's next slot does not move. Returns the run id.
   */
  async rerunSlot(jobId: string, slot: string, requestedBy: JobContext): Promise<string> {
    const job = this.scheduledOrThrow(jobId);
    const t = Date.parse(slot);
    if (Number.isNaN(t)) throw new JobActionError(`'${slot}' is not a slot`, 400);
    const slotIso = new Date(t).toISOString();
    await this.assertIdle(job);
    const runs = job.persist && this.stateProvider ? await this.stateProvider.listRuns(jobId) : [];
    const ofSlot = runs.filter((r) => r.slot === slotIso);
    if (ofSlot.length === 0) throw new JobActionError(`'${jobId}' has no record of slot ${slotIso}`, 404);
    if (ofSlot.some((r) => r.status === 'completed')) throw new JobActionError(`Slot ${slotIso} of '${jobId}' already completed`, 409);
    const runId = randomUUID();
    this.startDrain(job, [{ slot: new Date(t), rerun: { runId, requestedBy } }], null);
    return runId;
  }

  /**
   * Try a run that is waiting out its backoff now, rather than at its retry
   * time (#1611 §9). Counts as its next attempt, like any retry.
   */
  async retryNow(jobId: string, requestedBy: JobContext): Promise<void> {
    const job = this.scheduledOrThrow(jobId);
    if (job.draining || this.activeByJobId.has(jobId)) throw new JobActionError(`'${jobId}' is running`, 409);
    const state = await this.loadState(job);
    const current = state?.current;
    if (!state || !current || current.status !== 'failed' || !current.retryAt) {
      throw new JobActionError(`'${jobId}' has no run waiting for a retry`, 409);
    }
    await this.saveState(job, { ...state, current: { ...current, retryAt: this.clock().toISOString() } });
    await this.recordSchedulerEvent(job, AUDIT_EVENT.JOB_RETRY, 'job-retry', { runId: current.runId, slot: current.slot, attempt: current.attempt + 1 }, `retried now by ${requestedBy.username}`, requestedBy);
    void this.tick();
  }

  /** Resolves once every scheduled run started so far has finished. */
  async whenIdle(): Promise<void> {
    while (this.drains.size > 0) await Promise.all([...this.drains]);
  }

  /**
   * Run the chosen slots one at a time, oldest first. A slot that fails with
   * attempts left stops the drain: the job waits for its retry, and the slots
   * after it are looked at again once it is done. `after` is the next slot
   * once all are handled; null leaves it to each run.
   */
  private async drain(job: ScheduledJob, items: DrainItem[], after: string | null): Promise<void> {
    for (const { slot, resume, rerun } of items) {
      if (!resume && !rerun) {
        // Until a slot's run starts it is still the next one, so a restart finds it due.
        const state = await this.loadState(job);
        await this.saveState(job, { ...(state ?? emptyState(job, ruleKey(job.schedule))), nextSlot: slot.toISOString() });
      }
      if (this.stopping) return;
      if (await this.runSlot(job, slot, resume, rerun) === 'retry') return;
    }
    if (after === null) return;
    const state = await this.loadState(job);
    await this.saveState(job, { ...(state ?? emptyState(job, ruleKey(job.schedule))), nextSlot: after });
  }

  /** One attempt at one slot. `retry` when it failed with attempts left. */
  private async runSlot(job: ScheduledJob, slot: Date, resume?: Resume, rerun?: Rerun): Promise<'done' | 'retry' | 'held'> {
    // Shutdown began: the slot is left as the next one, and the next start runs it.
    if (this.stopping) return 'retry';
    const slotIso = slot.toISOString();
    const provider = job.persist ? this.stateProvider : null;
    if (provider && !(await provider.takeLock(job.def.id, slotIso, LOCK_OWNER, LOCK_TTL_MS))) {
      // Another server holds this slot (a rolling update): it runs and records it.
      logger.info(`[BackgroundJobManager] '${job.def.id}' slot ${slotIso} is held by another server — leaving it`);
      return 'held';
    }
    const heartbeat = provider
      ? setInterval(() => { void provider.renewLock(job.def.id, slotIso, LOCK_OWNER, LOCK_TTL_MS); }, LOCK_RENEW_MS)
      : null;
    heartbeat?.unref();

    // A slot an administrator reran runs as them (#1718); every other slot as the system principal.
    const requestedBy = rerun?.requestedBy
      ?? scheduleContext(this.engine, `${job.schedule.rrule} slot ${slotIso}${resume ? ` (attempt ${resume.attempt}, resumed: ${resume.reason})` : ''}`);
    const runId = rerun?.runId ?? resume?.runId ?? randomUUID();
    const attempt = resume?.attempt ?? 1;
    const run: JobRun = {
      runId, jobId: job.def.id, displayName: job.def.displayName, requestedBy, status: 'pending', startedAt: this.clock(),
      slot: slotIso, attempt, ...(resume ? { resumeReason: resume.reason } : {})
    };
    this.runs.set(runId, run);
    this.activeByJobId.set(job.def.id, runId);

    const record: JobRunRecord = { runId, slot: slotIso, startedAt: run.startedAt.toISOString(), attempt, status: 'running' };
    const before = await this.loadState(job);
    await this.saveState(job, { ...(before ?? emptyState(job, ruleKey(job.schedule))), current: record });
    await provider?.recordRun(job.def.id, record);

    const checkpoint = resume && provider ? await provider.loadCheckpoint(job.def.id, runId) : null;
    const writer = this.checkpointWriter(provider, job.def.id, runId);
    let outcome: 'done' | 'retry' = 'done';

    // #1717: the run as handed to the next process — its last checkpoint
    // written, marked interrupted (not an attempt), its slot let go. Called by
    // the run's own ending when shutdown stopped it, or by `handOff` for a job
    // that did not stop within the grace period. Whichever comes first writes.
    let settled = false;
    const handOffRun = async (): Promise<void> => {
      if (settled) return;
      settled = true;
      if (heartbeat) clearInterval(heartbeat);
      await writer.flush();
      const interrupted: JobRunRecord = { ...record, status: 'interrupted', completedAt: this.clock().toISOString() };
      const state = await this.loadState(job);
      await this.saveState(job, { ...(state ?? emptyState(job, ruleKey(job.schedule))), current: interrupted });
      await provider?.recordRun(job.def.id, interrupted);
      await provider?.releaseLock(job.def.id, slotIso, LOCK_OWNER);
      logger.info(`[BackgroundJobManager] '${job.def.id}' slot ${slotIso} handed off at shutdown (attempt ${attempt}); the next start resumes it`);
      await this.recordSchedulerEvent(job, AUDIT_EVENT.JOB_INTERRUPTED, 'job-interrupted', { runId, slot: slotIso, attempt }, `slot ${slotIso} interrupted by shutdown`, this.schedulerContext(job));
    };
    this.handoffs.set(runId, handOffRun);

    try {
      await this.executeJob(job.def, run, {
        slot: slotIso,
        timeoutMs: job.timeoutMs,
        resume: resume ? { attempt, checkpoint: checkpoint ?? null, reason: resume.reason } : null,
        checkpoint: writer.checkpoint
      });
    } finally {
      this.handoffs.delete(runId);
      if (settled || (run.interrupted && run.status !== 'completed')) {
        await handOffRun();
        outcome = 'retry';
      } else {
        settled = true;
        if (heartbeat) clearInterval(heartbeat);
        await writer.flush();
        const completedAt = (run.completedAt ?? this.clock()).toISOString();
        if (run.status === 'completed') {
          const after = await this.loadState(job);
          await this.saveState(job, {
            ...(after ?? emptyState(job, ruleKey(job.schedule))),
            current: null,
            // A rerun of an old slot does not move the last slot done backwards (#1718).
            lastSlotDone: after?.lastSlotDone && after.lastSlotDone > slotIso ? after.lastSlotDone : slotIso,
            nextSlot: this.nextSlotAfter(job, after?.nextSlot ?? null, slotIso)
          });
          await provider?.recordRun(job.def.id, { ...record, status: 'completed', completedAt });
          await provider?.clearCheckpoint(job.def.id, runId);
        } else if (await this.afterFailedAttempt(job, { ...record, completedAt }, run.result?.error ?? 'failed', this.clock())) {
          outcome = 'retry';
        }
        await provider?.releaseLock(job.def.id, slotIso, LOCK_OWNER);
      }
    }
    return outcome;
  }

  /**
   * A run's `ctx.checkpoint` (#1716). The size is checked at once, so an
   * oversize checkpoint throws to the job. Writes are at most one per
   * throttle interval, the latest winning, and `flush` writes what is still
   * waiting. Without a provider (not persisted) a checkpoint is checked and dropped.
   */
  private checkpointWriter(provider: JobStateProvider | null, jobId: string, runId: string): { checkpoint: (data: unknown) => void; flush: () => Promise<void> } {
    const maxBytes = this.checkpointMaxBytes();
    const throttleMs = this.checkpointThrottleMs;
    let pending: { data: unknown } | null = null;
    let lastWrite = 0;
    let timer: NodeJS.Timeout | null = null;
    let writing: Promise<void> = Promise.resolve();

    const write = (): void => {
      timer = null;
      if (!pending || !provider) return;
      const { data } = pending;
      pending = null;
      lastWrite = Date.now();
      writing = writing
        .then(() => provider.saveCheckpoint(jobId, runId, data))
        .catch((err: unknown) => { logger.warn(`[BackgroundJobManager] '${jobId}' checkpoint not saved:`, err); });
    };

    return {
      checkpoint: (data: unknown): void => {
        checkpointJson(data, maxBytes);
        if (!provider) return;
        pending = { data };
        if (timer) return;
        const wait = lastWrite + throttleMs - Date.now();
        if (wait <= 0) {
          write();
        } else {
          timer = setTimeout(write, wait);
          timer.unref();
        }
      },
      flush: async (): Promise<void> => {
        if (timer) {
          clearTimeout(timer);
          write();
        }
        await writing;
      }
    };
  }

  private async loadState(job: ScheduledJob): Promise<JobState | null> {
    if (!job.persist) return job.memoryState;
    return (this.stateProvider as JobStateProvider).getState(job.def.id);
  }

  private async saveState(job: ScheduledJob, state: JobState): Promise<void> {
    if (!job.persist) {
      job.memoryState = state;
      return;
    }
    await (this.stateProvider as JobStateProvider).putState(state);
  }

  /**
   * Slots passed over are recorded, never dropped: one audit event for the
   * lot, and the newest of them in the job's history (#1611 §2).
   */
  private async recordSkipped(job: ScheduledJob, slots: Date[], reason: 'missed' | 'not chosen'): Promise<void> {
    const provider = job.persist ? this.stateProvider : null;
    const now = this.clock().toISOString();
    for (const slot of slots.slice(-CATCH_UP_ALL_CAP)) {
      await provider?.recordRun(job.def.id, { runId: randomUUID(), slot: slot.toISOString(), startedAt: now, completedAt: now, attempt: 0, status: 'skipped' });
    }
    const detail = `${slots.length} slot(s) skipped (${reason}; catchUp ${job.catchUp}, overlap ${job.overlap}): ` +
      `${slots[0].toISOString()}${slots.length > 1 ? ` … ${slots[slots.length - 1].toISOString()}` : ''}`;
    logger.warn(`[BackgroundJobManager] '${job.def.id}' ${detail}`);
    await this.recordSchedulerEvent(job, AUDIT_EVENT.JOB_SKIPPED, 'job-skipped', {
      count: slots.length,
      first: slots[0].toISOString(),
      last: slots[slots.length - 1].toISOString(),
      reason,
      catchUp: job.catchUp,
      overlap: job.overlap
    }, detail, this.schedulerContext(job));
  }

  /** Who the scheduler acts as when nobody asked: the system principal, origin schedule. */
  private schedulerContext(job: ScheduledJob): JobContext {
    return scheduleContext(this.engine, job.schedule.rrule);
  }

  private async recordScheduleChange(job: ScheduledJob, from: string, to: string): Promise<void> {
    logger.info(`[BackgroundJobManager] '${job.def.id}' schedule changed: ${from} → ${to}; next slots counted from now, none caught up`);
    await this.recordSchedulerEvent(job, AUDIT_EVENT.JOB_SCHEDULE_CHANGE, 'job-schedule-change', { from, to }, `${from} → ${to}`, this.schedulerContext(job));
  }

  private async recordSchedulerEvent(
    job: ScheduledJob,
    eventType: AuditEventName,
    action: string,
    fields: Record<string, unknown>,
    detail: string,
    by: JobContext
  ): Promise<void> {
    const sink = this.engine?.getManager?.('AuditManager') as AuditEventSink | null;
    if (!sink) return;
    await recordAuditEvent(sink, {
      eventType,
      user: by.username,
      ipAddress: by.ipAddress,
      action,
      result: 'success',
      severity: 'low',
      metadata: { jobId: job.def.id, displayName: job.def.displayName, origin: by.origin, ...fields, detail }
    });
  }

  /**
   * Enqueue a job by ID. Returns the runId immediately.
   * If the job is already pending/running, returns the existing runId.
   *
   * __`requestedBy` is mandatory, and positional rather than an option (#631).__
   * This took a job id alone, so the identity of whoever triggered the work was
   * discarded here — the route logged the username on the line above and threw
   * it away on this one. Every defect this codebase has removed lately came
   * from forgetting being safe; an optional context would be that shape again,
   * and the first job added without one would go unattributed with nothing
   * going red. Omitting it is now a compile error.
   *
   * Build it with `jobContextFromRequest(req.userContext)` when a person asked,
   * or `jobContextFromSystem(pip.systemPrincipalName(), reason)` (the PolicyInformationPoint's) when
   * nothing did (#631: the principal is a name from .env, never a constant).
   *
   * @throws Error if jobId is not registered
   */
  async enqueue(jobId: string, requestedBy: JobContext): Promise<string> {
    // #1238: a caller with no usable context is refused — as a failed run
    // that says why, never as an exception the host dies of. The addon that
    // crash-looped geohazardwatch called the pre-#631 one-argument shape
    // from a setInterval; nothing at build time refuses that in JavaScript,
    // and the TypeError inside the fire-and-forget promise took the process
    // down every tick. "Fails closed" means the call is refused, not the pod.
    if (!isUsableContext(requestedBy)) {
      const runId = randomUUID();
      const detail = `enqueue('${jobId}') was called without a JobContext — since #631 the second argument is who asked ` +
        '(a JobContext: username, origin, requestedAt; build one with jobContextFromRequest / scheduleContext / systemContext). Refused.';
      logger.error(`[BackgroundJobManager] ${detail}\n${new Error('caller').stack ?? ''}`);
      const refused: JobRun = {
        runId,
        jobId,
        displayName: this.jobs.get(jobId)?.displayName ?? jobId,
        requestedBy: { username: 'unknown', origin: 'request', requestedAt: new Date().toISOString(), reason: 'refused: no context supplied' },
        status: 'failed',
        result: { success: false, error: detail },
        startedAt: new Date(),
        completedAt: new Date()
      };
      this.runs.set(runId, refused);
      return runId;
    }

    const existingRunId = this.activeByJobId.get(jobId);
    if (existingRunId) {
      const existing = this.runs.get(existingRunId);
      if (existing && (existing.status === 'pending' || existing.status === 'running')) {
        logger.info(
          `[BackgroundJobManager] Job '${jobId}' already active (${existingRunId}) — ` +
          `returning existing runId (also requested by ${describeJobContext(requestedBy)})`
        );
        return existingRunId;
      }
    }

    const def = this.jobs.get(jobId);
    if (!def) {
      throw new Error(`BackgroundJobManager: unknown job '${jobId}'`);
    }

    const runId = randomUUID();
    const run: JobRun = {
      runId,
      jobId,
      displayName: def.displayName,
      requestedBy,
      status: 'pending',
      startedAt: new Date()
    };
    this.runs.set(runId, run);
    this.activeByJobId.set(jobId, runId);

    // Fire and forget — caller polls via getStatus(). #1238: with a catch, so
    // nothing a job does can become an unhandled rejection in the host.
    // A job that is only ever enqueued has no time limit unless it declares one (#1715).
    const timeoutMs = def.timeout === undefined ? 0 : this.timeoutFor(def, 0);
    const maxBytes = this.checkpointMaxBytes();
    this.executeJob(def, run, { slot: null, timeoutMs, resume: null, checkpoint: (data) => { checkpointJson(data, maxBytes); } }).catch((err: unknown) => {
      run.status = 'failed';
      run.result = { success: false, error: err instanceof Error ? err.message : String(err) };
      run.completedAt = new Date();
      if (this.activeByJobId.get(jobId) === runId) this.activeByJobId.delete(jobId);
      logger.error(`[BackgroundJobManager] job '${jobId}' run ${runId} failed outside its own handler:`, err);
    });

    return runId;
  }

  /**
   * Get the current state of a run by runId.
   * Returns null if the runId is unknown.
   */
  getStatus(runId: string): JobRun | null {
    return this.runs.get(runId) ?? null;
  }

  /**
   * Get all currently pending or running jobs.
   */
  getActiveJobs(): JobRun[] {
    const active: JobRun[] = [];
    for (const runId of this.activeByJobId.values()) {
      const run = this.runs.get(runId);
      if (run) active.push(run);
    }
    return active;
  }

  /**
   * Get all registered job IDs.
   */
  getRegisteredJobIds(): string[] {
    return Array.from(this.jobs.keys());
  }

  private async executeJob(
    def: JobDefinition,
    run: JobRun,
    options: { slot: string | null; timeoutMs: number; resume: JobRunContext['resume']; checkpoint: JobRunContext['checkpoint'] }
  ): Promise<void> {
    run.status = 'running';
    const startMs = Date.now();
    const routine = def.routine === true;
    (routine ? logger.debug.bind(logger) : logger.info.bind(logger))(
      `[BackgroundJobManager] job-started { jobId: "${def.id}", runId: "${run.runId}", ` +
      `displayName: "${def.displayName}", requestedBy: "${describeJobContext(run.requestedBy)}" }`
    );
    if (!routine) await this.recordJobEvent(run, 'started');

    const reportProgress: ReportProgress = (message: string) => {
      run.progress = message;
    };

    const controller = new AbortController();
    this.controllers.set(run.runId, controller);
    // Shutdown began while this run was being set up: it is handed off, not run on.
    if (this.stopping) {
      if (this.handoffs.has(run.runId)) run.interrupted = true;
      controller.abort(new Error('the server is shutting down'));
    }
    const ctx: JobRunContext = {
      ...run.requestedBy,
      signal: controller.signal,
      slot: options.slot,
      resume: options.resume,
      checkpoint: options.checkpoint
    };

    try {
      const result = await runWithTimeout(def.run(reportProgress, ctx), controller, options.timeoutMs);
      const durationMs = Date.now() - startMs;
      run.completedAt = new Date();
      run.result = result;
      run.progress = undefined;

      if (result.success) {
        run.status = 'completed';
        (routine ? logger.debug.bind(logger) : logger.info.bind(logger))(`[BackgroundJobManager] job-completed { jobId: "${def.id}", runId: "${run.runId}", durationMs: ${durationMs}, summary: "${result.summary ?? ''}" }`);
        if (!routine) {
          await this.recordJobEvent(run, 'completed', result.summary);
          await this.sendNotification('info', `${def.displayName} complete`, result.summary ?? 'Job completed successfully');
        }
      } else {
        run.status = 'failed';
        // A run stopped for shutdown is handed off, not failed (#1717): its ending is recorded as interrupted.
        if (!run.interrupted) {
          logger.warn(`[BackgroundJobManager] job-failed { jobId: "${def.id}", runId: "${run.runId}", durationMs: ${durationMs}, error: "${result.error ?? ''}" }`);
          await this.recordJobEvent(run, 'failed', result.error);
          await this.sendNotification('error', `${def.displayName} failed`, result.error ?? 'Job failed');
        }
      }
    } catch (err: unknown) {
      const durationMs = Date.now() - startMs;
      const message = err instanceof Error ? err.message : String(err);
      run.status = 'failed';
      run.result = { success: false, error: message };
      run.completedAt = new Date();
      if (!run.interrupted) {
        logger.error(`[BackgroundJobManager] job-failed { jobId: "${def.id}", runId: "${run.runId}", durationMs: ${durationMs} }`, err);
        await this.recordJobEvent(run, 'failed', message);
        await this.sendNotification('error', `${def.displayName} failed`, message);
      }
    } finally {
      this.controllers.delete(run.runId);
      this.activeByJobId.delete(def.id);
    }
  }

  /**
   * Record who asked for this work, and how it ended (#631).
   *
   * Lazily resolved, following ConfigurationManager: AuditManager reads
   * configuration, so holding a reference would invert the boot order, and it
   * is absent during early boot — which `recordAuditEvent` already treats as a
   * configuration state rather than a failure.
   *
   * on-failure: continue deliberately. A reindex must not be refused because its
   * audit record could not be written; the drop is counted and surfaced by
   * `recordAuditEvent` rather than being fatal.
   */
  private async recordJobEvent(
    run: JobRun,
    outcome: 'started' | 'completed' | 'failed',
    detail?: string
  ): Promise<void> {
    const sink = this.engine?.getManager?.('AuditManager') as AuditEventSink | null;
    if (!sink) return;

    const by = run.requestedBy;
    await recordAuditEvent(sink, {
      eventType: JOB_EVENT[outcome],
      user: by.username,
      // #1667: the address the requesting call came from, when there was one.
      ipAddress: by.ipAddress,
      action: `job-${outcome}`,
      result: 'success',
      severity: outcome === 'failed' ? 'medium' : 'low',
      metadata: {
        jobId: run.jobId,
        runId: run.runId,
        displayName: run.displayName,
        // The provenance this issue exists for: who asked, from where, and
        // whether a delegated token was involved.
        origin: by.origin,
        requestedAt: by.requestedAt,
        reason: by.reason ?? null,
        viaTokenId: by.viaToken?.id ?? null,
        viaTokenName: by.viaToken?.name ?? null,
        // #1716: a scheduled run's slot and attempt, and for a resumed attempt why the one before ended.
        slot: run.slot ?? null,
        attempt: run.attempt ?? null,
        resumed: run.resumeReason ?? null,
        detail: detail ?? null
      }
    });
  }

  private async sendNotification(
    level: 'info' | 'warning' | 'error' | 'success',
    title: string,
    message: string
  ): Promise<void> {
    try {
      const notificationManager = this.engine.getManager<{ addNotification: (n: object) => Promise<string> }>('NotificationManager');
      if (notificationManager) {
        await notificationManager.addNotification({ type: 'system', title, message, level });
      }
    } catch (err) {
      logger.warn('[BackgroundJobManager] Failed to post notification:', err);
    }
  }

  /**
   * Hand running work to the next process (#1717, #1611 §7). No slot starts
   * after this. Every running job's `ctx.signal` is aborted, and the jobs get
   * `ngdpbase.jobs.shutdown-grace-ms` (default 5 s) to stop. A scheduled run
   * that did not finish is written as `interrupted` with its last checkpoint
   * and its slot lock released, so the next start resumes it at once, without
   * counting an attempt. A job that ignores the signal is handed off anyway
   * when the grace ends.
   *
   * Depends only on being called: the signal handlers in app.ts (SIGTERM,
   * SIGINT) reach it through `engine.shutdown()`, which calls it before any
   * other manager stops. A hard kill never gets here; its lock expires and the
   * resume counts as an attempt (#1716).
   */
  handOff(): Promise<void> {
    this.handedOff ??= this.runHandOff();
    return this.handedOff;
  }

  private async runHandOff(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.controllers.size === 0 && this.drains.size === 0) return;

    for (const runId of this.handoffs.keys()) {
      const run = this.runs.get(runId);
      if (run) run.interrupted = true;
    }
    logger.info(`[BackgroundJobManager] Shutting down: stopping ${this.controllers.size} running job(s)`);
    for (const controller of this.controllers.values()) controller.abort(new Error('the server is shutting down'));

    const graceMs = Number(this.setting('ngdpbase.jobs.shutdown-grace-ms', DEFAULT_SHUTDOWN_GRACE_MS));
    let graceTimer: NodeJS.Timeout | undefined;
    await Promise.race([
      this.whenIdle(),
      new Promise<void>((resolve) => { graceTimer = setTimeout(resolve, graceMs); })
    ]);
    clearTimeout(graceTimer);

    for (const handOffRun of [...this.handoffs.values()]) {
      try {
        await handOffRun();
      } catch (err) {
        logger.error('[BackgroundJobManager] Handing off a run failed; its lock will expire and the resume counts as an attempt:', err);
      }
    }
  }

  async shutdown(): Promise<void> {
    await this.handOff();
    const active = this.getActiveJobs();
    if (active.length > 0) {
      logger.warn(`[BackgroundJobManager] Shutting down with ${active.length} job(s) still active`);
    }
    await super.shutdown();
  }
}

/** The text a schedule was declared with, so a configured override can be compared to it. */
function sourceOf(input: ScheduleInput): string {
  return typeof input === 'string' ? input : JSON.stringify(input);
}

/** What `JobState.rule` holds: the compiled rule, its start and its zone. */
function ruleKey(schedule: Schedule): string {
  return `${schedule.rrule}|${schedule.dtstart}|${schedule.timeZone}`;
}

function isoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function emptyState(job: ScheduledJob, rule: string): JobState {
  return { jobId: job.def.id, lastSlotDone: null, nextSlot: null, current: null, rule };
}

/**
 * The run, with a time limit (#1611 §3). At the limit the job's signal is
 * aborted and it has {@link TIMEOUT_GRACE_MS} to stop; either way the run is
 * failed as timed out. `timeoutMs` 0 is no limit.
 */
function runWithTimeout<T>(work: Promise<T>, controller: AbortController, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) return work;
  return new Promise<T>((resolve, reject) => {
    let timedOut = false;
    const limit = setTimeout(() => {
      timedOut = true;
      const error = new Error(`timed out after ${timeoutMs} ms`);
      controller.abort(error);
      const grace = setTimeout(() => reject(error), TIMEOUT_GRACE_MS);
      const stopped = (): void => { clearTimeout(grace); reject(error); };
      work.then(stopped, stopped);
    }, timeoutMs);
    work.then(
      (value) => { if (!timedOut) { clearTimeout(limit); resolve(value); } },
      (err: unknown) => { if (!timedOut) { clearTimeout(limit); reject(err instanceof Error ? err : new Error(String(err))); } }
    );
  });
}

export default BackgroundJobManager;
