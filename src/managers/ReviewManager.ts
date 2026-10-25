/**
 * ReviewManager — the one core way to review requests (#2072).
 *
 * An add-on (or a form set to need review) files a request through this door,
 * naming the permission whose holders may decide it and the handler that
 * carries it out. The holders are notified, see their open requests on one
 * screen (`/reviews`), and approve or reject. On approval this manager calls
 * the filing add-on's handler with the decider's context; the request is
 * approved only when the handler says it is done (complete-or-not): a handler
 * that fails leaves it open, with the reason recorded and shown.
 *
 * It owns one thing, the requests, and asks for everything else:
 *
 * - __Who decides__ is the PDP's: a request names a permission, never a role,
 *   and every list and decision asks the PDP with the caller's context.
 * - __Who to tell__ is `PolicyDecisionPoint.usersHolding(permission)`; nobody
 *   holding it is logged only (an empty target list means every user).
 * - __The work__ is the add-on's handler, registered under the add-on's own
 *   prefix through `host.registerReviewHandler`.
 *
 * Requests are kept in core's application database (`review_requests`), and
 * only while it is encrypted: a request's summary and details can be personal
 * (a new owner's name and email), and the storage guide keeps anything
 * personal in an encrypted database only. Without one the door is closed and
 * says why; nothing is ever written in the clear.
 *
 * The handler runs in the decider's request, awaited, not as a background job:
 * the reviewer is told at once whether the work was done, and a failure is
 * theirs to see and retry. A handler does I/O (create an account, send an
 * invitation), never CPU-heavy work, so the request is not stalled.
 */
import { randomUUID } from 'node:crypto';
import BaseManager from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type { ActorContext } from '../context/ActorContext.js';
import { actorOf } from '../context/ActorContext.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { AUDIT_EVENT, type AuditEventName } from '../utils/auditEventNames.js';
import { isGrantable } from '../utils/permissionCatalog.js';
import { KeyedSerial } from '../utils/keyedSerial.js';
import type { Decision } from '../types/Policy.js';
import type {
  ReviewDecision, ReviewHandler, ReviewHandlerResult, ReviewRequest, ReviewRequestInput, ReviewStatus
} from '../types/Review.js';

export type { ReviewDecision, ReviewHandler, ReviewHandlerResult, ReviewRequest, ReviewRequestInput, ReviewStatus };

/** Defaults for the `ngdpbase.reviews.*` keys, stated once (the shipped config carries the same). */
const DEFAULT_RETENTION_DAYS = 365;
const DEFAULT_LIST_LIMIT = 200;
const DEFAULT_DETAILS_MAX_BYTES = 65536;

/** `<slug>.<name>`: an add-on's own prefix, then a name. */
const PREFIXED_ID = /^([a-z0-9][a-z0-9-]*)\.([a-z0-9][a-z0-9.-]*)$/;

/** The longest subject, summary and note kept, in characters. Fixed: they are labels, not content. */
const SUBJECT_MAX = 200;
const SUMMARY_MAX = 500;
const NOTE_MAX = 2000;

/** The door said no: the caller may not decide (or see) this request. `decision` is the PDP's answer. */
export class ReviewRefusedError extends Error {
  override readonly name = 'ReviewRefusedError';
  constructor(public readonly permission: string, public readonly decision: Decision) {
    super(`Refused: '${permission}' is required to decide this request`);
  }
}

/** Requests cannot be kept on this site right now; the message says why and how to fix it. */
export class ReviewsUnavailableError extends Error {
  override readonly name = 'ReviewsUnavailableError';
}

/** A request that is not open any more (decided already, or by someone else just now). */
export class ReviewNotOpenError extends Error {
  override readonly name = 'ReviewNotOpenError';
}

/** What was filed is not a valid request; the message says what is wrong. */
export class ReviewInputError extends Error {
  override readonly name = 'ReviewInputError';
}

/** The handler did not carry out an approved request; it stays open with `reason`. */
export class ReviewHandlerFailedError extends Error {
  override readonly name = 'ReviewHandlerFailedError';
  constructor(public readonly request: ReviewRequest, public readonly reason: string) {
    super(`The request was not carried out: ${reason}`);
  }
}

interface Statement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
interface Handle {
  prepare(sql: string): Statement;
}

interface DatabaseDoor {
  isEnabled(): boolean;
  isEncrypted(): boolean;
  getHandle<H>(): H;
  getUnavailableReason?(): string | null;
}

interface Decider {
  decide(subject: ActorContext, request: { action: string }): Promise<Decision>;
  permits(subject: ActorContext, action: string): Promise<boolean>;
  usersHolding(action: string): Promise<string[] | null>;
}

interface ConfigReader {
  getProperty(key: string, fallback: unknown): unknown;
}

interface Notifier {
  createNotification(n: { type: 'system'; level: 'info' | 'warning'; title: string; message: string; targetUsers: string[] }): Promise<unknown>;
}

interface Row {
  id: string; kind: string; handler_id: string; decide_permission: string; subject: string; summary: string;
  details: string; status: ReviewStatus; filed_at: string; filed_by: string; decided_at: string | null;
  decided_by: string | null; note: string | null; outcome: string | null; failed_at: string | null; failure: string | null;
}

function fromRow(row: Row): ReviewRequest {
  return {
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    summary: row.summary,
    details: JSON.parse(row.details) as ReviewRequest['details'],
    decidePermission: row.decide_permission,
    handlerId: row.handler_id,
    status: row.status,
    filedAt: row.filed_at,
    filedBy: row.filed_by,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    note: row.note,
    outcome: row.outcome,
    failedAt: row.failed_at,
    failure: row.failure
  };
}

/** A short, single-line text, or the reason it is not one. */
function label(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.trim() === '') throw new ReviewInputError(`A request needs a ${field}`);
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

function messageOf(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.trim() || 'The add-on gave no reason';
}

class ReviewManager extends BaseManager {
  readonly description = 'Requests for review: filed by add-ons, decided by the holders of a permission, carried out by the add-on (#2072)';

  private db: Handle | null = null;
  /** Why the door is closed, in plain words for an administrator; null while it is open. */
  private unavailable: string | null = 'ReviewManager has not started';
  /** Handler id → its add-on and the function. */
  private readonly handlers = new Map<string, { owner: string; run: ReviewHandler }>();
  /** One decision at a time per request, so two reviewers cannot both run its handler (#2015). */
  private readonly serial = new KeyedSerial();

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);
    const database = this.engine.getManager<DatabaseDoor>('DatabaseManager');
    if (!database?.isEnabled()) {
      this.unavailable = 'Requests for review are kept in the application database, which is not open on this site. ' +
        "Set ngdpbase.database.provider to 'sqlite' and NGDPBASE_DATABASE_KEY in <FAST_STORAGE>/.env, then restart.";
      this.markDisabled(this.unavailable);
      logger.info(`[ReviewManager] off: ${this.unavailable}`);
      return;
    }
    if (!database.isEncrypted()) {
      this.unavailable = 'Requests for review can hold personal details, and the application database is not encrypted, so none are kept. ' +
        'Set NGDPBASE_DATABASE_KEY in <FAST_STORAGE>/.env and restart; an existing unencrypted database must be moved under the key first (a backup and restore).';
      this.markNeedsAttention(this.unavailable);
      logger.warn(`[ReviewManager] ${this.unavailable}`);
      return;
    }
    this.db = database.getHandle<Handle>();
    this.unavailable = null;
    const removed = this.removeExpired();
    logger.info(`📝 ReviewManager initialized (application database${removed > 0 ? `; ${removed} decided request(s) past retention removed` : ''})`);
  }

  /** Why requests cannot be filed or decided on this site, or null when they can. */
  getUnavailableReason(): string | null {
    return this.unavailable;
  }

  // ── Handlers ───────────────────────────────────────────────────────────

  /**
   * Register the handler that carries out an approved request (#2072). Core
   * calls this for an add-on through `host.registerReviewHandler`, which binds
   * `owner` to the add-on's slug: the id must be `<owner>.<name>`, so one
   * add-on can never register, or replace, another's. Registering the same id
   * again (a restart of the add-on) replaces it.
   */
  registerHandler(owner: string, handlerId: string, run: ReviewHandler): void {
    const match = PREFIXED_ID.exec(String(handlerId));
    if (!match || match[1] !== owner) {
      throw new Error(`Add-on '${owner}' may register only its own review handlers ('${owner}.<name>'); '${String(handlerId)}' is not one of them`);
    }
    if (typeof run !== 'function') throw new Error(`Review handler '${handlerId}' is not a function`);
    this.handlers.set(handlerId, { owner, run });
    logger.info(`[ReviewManager] handler registered: ${handlerId}`);
  }

  /** Forget an add-on's handlers (it was turned off): its open requests then fail to approve, saying so. */
  unregisterHandlers(owner: string): void {
    for (const [id, h] of this.handlers) if (h.owner === owner) this.handlers.delete(id);
  }

  // ── The door ───────────────────────────────────────────────────────────

  /**
   * File a request. `ctx` is whoever the request is filed for (a public
   * form's anonymous visitor included); filing asks no permission, because
   * only add-on code reaches this, and an add-on files only for a handler it
   * registered. Holders of `decidePermission` are told, without waiting.
   *
   * @throws ReviewInputError when the request is malformed: a kind or handler
   *   outside the handler's add-on, an unknown or ungrantable permission, no
   *   subject or summary, or details too large
   * @throws ReviewsUnavailableError when requests cannot be kept here
   */
  async fileRequest(ctx: ActorContext, input: ReviewRequestInput): Promise<ReviewRequest> {
    if (!ctx) throw new ReviewInputError('A request is filed with the context of whoever it is for');
    const db = this.open();
    const handler = this.handlers.get(String(input?.handlerId));
    if (!handler) throw new ReviewInputError(`No review handler '${String(input?.handlerId)}' is registered`);
    const kind = PREFIXED_ID.exec(String(input.kind));
    if (!kind || kind[1] !== handler.owner) {
      throw new ReviewInputError(`A request's kind starts with its add-on's slug ('${handler.owner}.<kind>'); '${String(input.kind)}' does not`);
    }
    const permission = String(input.decidePermission ?? '');
    const definitions = this.settings().getProperty('ngdpbase.permissions.definitions', {}) as Record<string, unknown>;
    if (!permission || !Object.prototype.hasOwnProperty.call(definitions, permission) || !isGrantable(definitions[permission])) {
      throw new ReviewInputError(`'${permission}' is not a permission this site grants, so nobody could decide the request`);
    }
    const details = input.details ?? {};
    if (typeof details !== 'object' || Array.isArray(details)) throw new ReviewInputError('A request\'s details are label and value pairs');
    const detailsJson = JSON.stringify(details);
    const maxBytes = this.number('ngdpbase.reviews.details-max-bytes', DEFAULT_DETAILS_MAX_BYTES);
    if (Buffer.byteLength(detailsJson, 'utf8') > maxBytes) {
      throw new ReviewInputError(`A request's details are larger than ${maxBytes} bytes (ngdpbase.reviews.details-max-bytes)`);
    }

    const who = actorOf(ctx);
    const request: ReviewRequest = {
      id: randomUUID(),
      kind: input.kind,
      subject: label(input.subject, 'subject', SUBJECT_MAX),
      summary: label(input.summary, 'summary', SUMMARY_MAX),
      details: JSON.parse(detailsJson) as ReviewRequest['details'],
      decidePermission: permission,
      handlerId: input.handlerId,
      status: 'open',
      filedAt: new Date().toISOString(),
      // The anonymous subject is spelt 'Anonymous' (#1436): one spelling here, for the screen.
      filedBy: who.user && who.user.toLowerCase() !== 'anonymous' ? who.user : 'anonymous',
      decidedAt: null, decidedBy: null, note: null, outcome: null, failedAt: null, failure: null
    };
    this.removeExpired();
    db.prepare(`INSERT INTO review_requests (id, kind, handler_id, decide_permission, subject, summary, details, status, filed_at, filed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`)
      .run(request.id, request.kind, request.handlerId, permission, request.subject, request.summary, detailsJson, request.filedAt, request.filedBy);
    await this.record(AUDIT_EVENT.REVIEW_FILED, ctx, request, 'review-file');
    void this.notifyDeciders(request);
    return request;
  }

  /**
   * The open requests `ctx` may decide, oldest first: each asked of the PDP
   * by its permission, with the caller's context, never a role. At most
   * `ngdpbase.reviews.list-limit` of them.
   */
  async listOpen(ctx: ActorContext): Promise<ReviewRequest[]> {
    if (!ctx) return [];
    const db = this.open();
    const rows = db.prepare("SELECT * FROM review_requests WHERE status = 'open' ORDER BY filed_at ASC, id ASC").all() as Row[];
    const pdp = this.decider();
    if (!pdp) return [];
    const mayDecide = new Map<string, boolean>();
    const limit = this.number('ngdpbase.reviews.list-limit', DEFAULT_LIST_LIMIT);
    const out: ReviewRequest[] = [];
    for (const row of rows) {
      let allowed = mayDecide.get(row.decide_permission);
      if (allowed === undefined) {
        allowed = await pdp.permits(ctx, row.decide_permission);
        mayDecide.set(row.decide_permission, allowed);
      }
      if (allowed) out.push(fromRow(row));
      if (out.length >= limit) break;
    }
    return out;
  }

  /**
   * One request, when `ctx` may decide it (open or decided); null when there
   * is no such request.
   *
   * @throws ReviewRefusedError when the caller does not hold its permission
   */
  async get(ctx: ActorContext, id: string): Promise<ReviewRequest | null> {
    const row = this.open().prepare('SELECT * FROM review_requests WHERE id = ?').get(String(id)) as Row | undefined;
    if (!row) return null;
    await this.requireDecider(ctx, row.decide_permission);
    return fromRow(row);
  }

  /**
   * Approve or reject an open request, as `ctx`.
   *
   * - Reject: the request is marked rejected with the note; no handler runs.
   * - Approve: the add-on's handler runs with `ctx`. When it returns, the
   *   request is approved with the handler's summary. When it throws (or is
   *   not registered), the request stays open with the reason and the time,
   *   and {@link ReviewHandlerFailedError} is thrown so the reviewer sees it.
   *
   * @throws ReviewRefusedError when `ctx` may not decide it (hand to `enforceDeny`)
   * @throws ReviewNotOpenError when it is decided already, or does not exist
   */
  async decide(ctx: ActorContext, id: string, decision: ReviewDecision, note?: string): Promise<ReviewRequest> {
    if (decision !== 'approve' && decision !== 'reject') throw new ReviewInputError(`A decision is 'approve' or 'reject', not '${String(decision)}'`);
    const db = this.open();
    const cleanNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, NOTE_MAX) : null;
    return this.serial.run(String(id), async () => {
      const row = db.prepare('SELECT * FROM review_requests WHERE id = ?').get(String(id)) as Row | undefined;
      if (!row) throw new ReviewNotOpenError('There is no such request');
      await this.requireDecider(ctx, row.decide_permission);
      if (row.status !== 'open') throw new ReviewNotOpenError(`This request was ${row.status} already`);
      const request = fromRow(row);
      const decidedBy = actorOf(ctx).user;
      const now = new Date().toISOString();

      if (decision === 'reject') {
        db.prepare("UPDATE review_requests SET status = 'rejected', decided_at = ?, decided_by = ?, note = ? WHERE id = ? AND status = 'open'")
          .run(now, decidedBy, cleanNote, request.id);
        const rejected = { ...request, status: 'rejected' as const, decidedAt: now, decidedBy, note: cleanNote };
        await this.record(AUDIT_EVENT.REVIEW_REJECTED, ctx, rejected, 'review-reject');
        return rejected;
      }

      let result: ReviewHandlerResult;
      try {
        const handler = this.handlers.get(request.handlerId);
        if (!handler) throw new Error('The add-on that carries out this request is not running on this site; turn it on and approve again');
        result = await handler.run(request, ctx);
      } catch (err) {
        const reason = messageOf(err).slice(0, SUMMARY_MAX);
        db.prepare("UPDATE review_requests SET failed_at = ?, failure = ? WHERE id = ? AND status = 'open'").run(now, reason, request.id);
        const failed = { ...request, failedAt: now, failure: reason };
        logger.error(`[ReviewManager] request ${request.id} (${request.kind}) approved by ${decidedBy}, but its handler ${request.handlerId} failed; it stays open: ${reason}`);
        // The reason is the add-on's own words and may name someone: kept on the request, not in the audit.
        await this.record(AUDIT_EVENT.REVIEW_FAILED, ctx, failed, 'review-approve', 'failure');
        throw new ReviewHandlerFailedError(failed, reason);
      }
      const outcome = typeof result?.summary === 'string' && result.summary.trim() ? result.summary.trim().slice(0, SUMMARY_MAX) : 'Done';
      db.prepare(`UPDATE review_requests SET status = 'approved', decided_at = ?, decided_by = ?, note = ?, outcome = ?, failed_at = NULL, failure = NULL
        WHERE id = ? AND status = 'open'`).run(now, decidedBy, cleanNote, outcome, request.id);
      const approved = { ...request, status: 'approved' as const, decidedAt: now, decidedBy, note: cleanNote, outcome, failedAt: null, failure: null };
      await this.record(AUDIT_EVENT.REVIEW_APPROVED, ctx, approved, 'review-approve');
      return approved;
    });
  }

  // ── Inside ─────────────────────────────────────────────────────────────

  private open(): Handle {
    if (!this.db) throw new ReviewsUnavailableError(this.unavailable ?? 'Requests for review are not available on this site');
    return this.db;
  }

  private settings(): ConfigReader {
    return this.engine.getManager<ConfigReader>('ConfigurationManager') ?? { getProperty: (_k: string, d: unknown) => d };
  }

  private decider(): Decider | null {
    return this.engine.getManager<Decider>('PolicyDecisionPoint') ?? null;
  }

  /** A whole number of 0 or more from the configuration, or the default. */
  private number(key: string, fallback: number): number {
    const value = Number(this.settings().getProperty(key, fallback));
    return Number.isInteger(value) && value >= 0 ? value : fallback;
  }

  /** Throws {@link ReviewRefusedError} unless `ctx` may decide a request with this permission. No context or no PDP refuses. */
  private async requireDecider(ctx: ActorContext, permission: string): Promise<void> {
    const pdp = this.decider();
    if (!ctx || !pdp) throw new ReviewRefusedError(permission, { permit: false, applicable: false, reason: ctx ? 'no_decision_point' : 'no_context' });
    const decision = await pdp.decide(ctx, { action: permission });
    if (!decision.permit) throw new ReviewRefusedError(permission, decision);
  }

  /** Remove decided requests older than `ngdpbase.reviews.retention-days` (0 keeps them). One indexed delete. */
  private removeExpired(): number {
    if (!this.db) return 0;
    const days = this.number('ngdpbase.reviews.retention-days', DEFAULT_RETENTION_DAYS);
    if (days === 0) return 0;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    return this.db.prepare("DELETE FROM review_requests WHERE status != 'open' AND decided_at < ?").run(cutoff).changes;
  }

  /** Tell the holders of the request's permission. Never throws: a notice that cannot be sent is logged. */
  private async notifyDeciders(request: ReviewRequest): Promise<void> {
    try {
      const holders = (await this.decider()?.usersHolding(request.decidePermission)) ?? [];
      if (holders.length === 0) {
        // An empty target list means every user, so nobody to tell is log-only.
        logger.warn(`[ReviewManager] nobody holds '${request.decidePermission}', so nobody was told about request ${request.id} (${request.kind})`);
        return;
      }
      const notifications = this.engine.getManager<Notifier>('NotificationManager');
      if (!notifications) {
        logger.warn(`[ReviewManager] no NotificationManager; request ${request.id} (${request.kind}) is on /reviews only`);
        return;
      }
      await notifications.createNotification({
        type: 'system',
        level: 'info',
        title: `A request is waiting for review: ${request.subject}`,
        message: `${request.summary}. Approve or reject it on the Reviews page (/reviews).`,
        targetUsers: holders
      });
    } catch (err) {
      logger.warn(`[ReviewManager] could not notify the holders of '${request.decidePermission}' about request ${request.id}: ${messageOf(err)}`);
    }
  }

  /** The audit record: who, which request, its kind, handler and permission — names, never the summary, details or note. */
  private async record(
    eventType: AuditEventName, ctx: ActorContext, request: ReviewRequest, action: string,
    result: 'success' | 'failure' = 'success'
  ): Promise<void> {
    const who = actorOf(ctx);
    await recordAuditEvent(this.engine.getManager<AuditEventSink>('AuditManager'), {
      eventType,
      ...who,
      action,
      result,
      severity: result === 'failure' ? 'medium' : 'low',
      resource: request.id,
      resourceType: 'review-request',
      metadata: { ...who.metadata, kind: request.kind, handlerId: request.handlerId, decidePermission: request.decidePermission, status: request.status }
    });
  }
}

export default ReviewManager;
