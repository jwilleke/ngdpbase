import { randomUUID } from 'crypto';
import BaseManager from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import { describeJobContext, type JobContext } from '../context/JobContext.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';

/**
 * Callback supplied to job run functions so they can push live progress
 * messages that the client can display while polling.
 */
export type ReportProgress = (message: string) => void;

/**
 * A job type that can be registered with the BackgroundJobManager.
 */
export interface JobDefinition {
  /** Unique job type ID, e.g. 'pages.reindex' */
  id: string;
  /** Human-readable name shown in UI and notifications */
  displayName: string;
  /**
   * The work to perform. Resolves with a JobResult.
   *
   * __`ctx` is mandatory (#631).__ Without it the actor this manager captured
   * at `enqueue` reached the audit record and stopped there: `job.started`
   * named who asked for a reindex while the reindex itself ran as nobody. That
   * is the exact shape P1 in docs/security-posture.md warns about — a
   * parameter that cannot carry provenance guarantees provenance is lost — and
   * it was true of this signature for the whole first version of #631.
   *
   * A handler that needs to make a permission decision or write a record uses
   * this; one that does neither still receives it, because a handler which can
   * quietly grow into taking an action must not be able to do so anonymously.
   */
  run: (reportProgress: ReportProgress, ctx: JobContext) => Promise<JobResult>;
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

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);
    logger.info('BackgroundJobManager initialized');
  }

  /**
   * Register a job type. Called at startup by managers and plugins.
   */
  registerJob(def: JobDefinition): void {
    if (this.jobs.has(def.id)) {
      logger.warn(`[BackgroundJobManager] Job '${def.id}' already registered — overwriting`);
    }
    this.jobs.set(def.id, def);
    logger.debug(`[BackgroundJobManager] Registered job: ${def.id} (${def.displayName})`);
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
   * or `jobContextFromSystem(userManager.systemPrincipalName(), reason)` when
   * nothing did (#631: the principal is a name from .env, never a constant).
   *
   * @throws Error if jobId is not registered
   */
  async enqueue(jobId: string, requestedBy: JobContext): Promise<string> {
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

    // Fire and forget — caller polls via getStatus()
    void this.executeJob(def, run);

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

  private async executeJob(def: JobDefinition, run: JobRun): Promise<void> {
    run.status = 'running';
    const startMs = Date.now();
    logger.info(
      `[BackgroundJobManager] job.started { jobId: "${def.id}", runId: "${run.runId}", ` +
      `displayName: "${def.displayName}", requestedBy: "${describeJobContext(run.requestedBy)}" }`
    );
    await this.recordJobEvent(run, 'started');

    const reportProgress: ReportProgress = (message: string) => {
      run.progress = message;
    };

    try {
      const result = await def.run(reportProgress, run.requestedBy);
      const durationMs = Date.now() - startMs;
      run.completedAt = new Date();
      run.result = result;
      run.progress = undefined;

      if (result.success) {
        run.status = 'completed';
        logger.info(`[BackgroundJobManager] job.completed { jobId: "${def.id}", runId: "${run.runId}", durationMs: ${durationMs}, summary: "${result.summary ?? ''}" }`);
        await this.recordJobEvent(run, 'completed', result.summary);
        await this.sendNotification('info', `${def.displayName} complete`, result.summary ?? 'Job completed successfully');
      } else {
        run.status = 'failed';
        logger.warn(`[BackgroundJobManager] job.failed { jobId: "${def.id}", runId: "${run.runId}", durationMs: ${durationMs}, error: "${result.error ?? ''}" }`);
        await this.recordJobEvent(run, 'failed', result.error);
        await this.sendNotification('error', `${def.displayName} failed`, result.error ?? 'Job failed');
      }
    } catch (err: unknown) {
      const durationMs = Date.now() - startMs;
      const message = err instanceof Error ? err.message : String(err);
      run.status = 'failed';
      run.result = { success: false, error: message };
      run.completedAt = new Date();
      logger.error(`[BackgroundJobManager] job.failed { jobId: "${def.id}", runId: "${run.runId}", durationMs: ${durationMs} }`, err);
      await this.sendNotification('error', `${def.displayName} failed`, message);
    } finally {
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
   * `standard` tier deliberately. A reindex must not be refused because its
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
      eventType: `job.${outcome}`,
      user: by.username,
      ipAddress: undefined,
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

  async shutdown(): Promise<void> {
    const active = this.getActiveJobs();
    if (active.length > 0) {
      logger.warn(`[BackgroundJobManager] Shutting down with ${active.length} job(s) still active`);
    }
    await super.shutdown();
  }
}

export default BackgroundJobManager;
