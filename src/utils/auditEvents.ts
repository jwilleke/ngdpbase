/**
 * Audit event builders for content mutations (#1080).
 *
 * `AuditManager` was already mature — file provider with rotation, 90-day
 * retention, search, stats, export, and an admin UI — but almost nothing
 * called it. Outside the manager the only `logAuditEvent` call sites were
 * `page-delete`, admin raw-edit, two session operations, and share
 * issue/revoke. Ordinary page create, edit, and rename, and every attachment
 * upload and delete, produced no audit record at all.
 *
 * That left "who changed this page, when, and through what?" answerable only
 * from a version manifest: per-page, not queryable across pages, and present
 * only when the deployment runs `versioningfileprovider` (the shipped default
 * is `filesystemprovider`, which keeps no versions). There was no way to ask
 * "everything this agent token wrote last Tuesday" — which is exactly the
 * question agent tokens (#946) make worth asking, since a token writes
 * unattended and the version manifest records only a username.
 *
 * These are pure builders so the event *shape* can be tested without an
 * engine, a request, or a manager. The shape is the contract: `#1082` reads
 * `page-rename`'s `fromPageName`/`pageName` pair to resolve a link that
 * points at a page's former title, so those two fields are load-bearing
 * rather than descriptive.
 */

import logger from './logger.js';
import { isCriticalEventType } from './auditRegistry.js';
import { AUDIT_EVENT, type AuditEventName } from './auditEventNames.js';

/** Agent-token identity attached to a request that authenticated with one. */
export interface AuditViaToken {
  id?: string;
  name?: string;
}

/** The subset of `AuditManager` these helpers need. */
export interface AuditEventSink {
  logAuditEvent?: (event: Record<string, unknown>) => Promise<string>;
  /**
   * Force queued records to storage (#1121).
   *
   * Named for the method AuditManager actually has. An earlier draft called it
   * `flush`, which nothing implements — so every critical event would have
   * refused in production while the tests passed. Third time this exact
   * mismatch has bitten in this issue chain.
   *
   * Optional because not every sink batches, but a sink WITHOUT it cannot
   * promise durability, so a critical event refuses rather than reporting a
   * guarantee the system does not have.
   */
  flushAuditQueue?: () => Promise<void>;
}

export type AuditSeverity = 'low' | 'medium' | 'high';

export interface AuditEvent {
  eventType: AuditEventName;
  user: string;
  ipAddress: string | undefined;
  action: string;
  result: 'success';
  severity: AuditSeverity;
  metadata: Record<string, unknown>;
}

/**
 * `link-rewrite` is a machine write, not a human one (#1094): when a page is
 * renamed, the referring pages have their `[Old Title]` links rewritten. It is
 * a distinct op so a reader of the history can tell why a page they did not
 * edit changed, and so those writes can be excluded from "who is editing what"
 * queries without having to guess from the content.
 */
export type PageMutationOp = 'create' | 'edit' | 'rename' | 'link-rewrite';
export type AttachmentOp = 'upload' | 'delete';
export type TokenOp = 'mint' | 'revoke';

// #1201: the builders look the name up rather than interpolating it, so the
// compiler — not a grep — knows which names each family can produce.
const PAGE_EVENT: Record<PageMutationOp, AuditEventName> = {
  create: AUDIT_EVENT.PAGE_CREATE,
  edit: AUDIT_EVENT.PAGE_EDIT,
  rename: AUDIT_EVENT.PAGE_RENAME,
  'link-rewrite': AUDIT_EVENT.PAGE_LINK_REWRITE
};
const ASSET_EVENT: Record<AttachmentOp, AuditEventName> = {
  upload: AUDIT_EVENT.ASSET_UPLOAD,
  delete: AUDIT_EVENT.ASSET_DELETE
};
const TOKEN_EVENT: Record<TokenOp, AuditEventName> = {
  mint: AUDIT_EVENT.TOKEN_MINT,
  revoke: AUDIT_EVENT.TOKEN_REVOKE
};

interface CommonInput {
  username: string | undefined;
  ipAddress: string | undefined;
  viaToken?: AuditViaToken | null;
}

export interface PageMutationInput extends CommonInput {
  op: PageMutationOp;
  pageName: string;
  uuid: string | null | undefined;
  /** Previous title. Only meaningful for `rename`; ignored otherwise. */
  fromPageName?: string | null;
  /**
   * The rename that caused a `link-rewrite`. Ignored for every other op — the
   * page being rewritten did not itself change title, so `fromPageName` would
   * be the wrong field to carry it.
   */
  rewriteOf?: { from: string; to: string } | null;
}

export interface TokenInput extends CommonInput {
  op: TokenOp;
  /** Token id — the handle every later question about this credential uses. */
  id: string;
  /** Whose token it is, which is not always who acted: an admin may revoke. */
  owner: string;
  /** Operator-supplied label. Optional; a token need not be named. */
  name?: string | null;
  /** Only meaningful for `mint`; ignored otherwise. */
  scopes?: readonly string[];
  /** Only meaningful for `mint`; ignored otherwise. */
  expiresAt?: string;
  /** Only meaningful for `revoke`; ignored otherwise. */
  revokedBy?: string;
}

export interface AttachmentInput extends CommonInput {
  op: AttachmentOp;
  attachmentId: string;
  filename: string;
  pageName?: string | null;
  sizeBytes?: number | null;
}

/**
 * Token identity as metadata. Always present as explicit nulls for a human
 * write so a query can filter on the field existing rather than having to
 * treat "absent" and "not a token" as the same thing.
 */
function tokenMetadata(viaToken: AuditViaToken | null | undefined): Record<string, unknown> {
  return {
    viaTokenId: viaToken?.id ?? null,
    viaTokenName: viaToken?.name ?? null
  };
}

/**
 * Build the audit event for a page create, edit, rename, or link rewrite.
 *
 * `result` is always `success`: these are recorded *after* the write lands,
 * unlike `page-delete`, which logs `attempted` before unlinking so that a
 * crash mid-delete still leaves a trace. A create or edit has the page file
 * and its version history as its own record, so recording the attempt buys
 * nothing the file does not already say.
 */
export function buildPageMutationAuditEvent(input: PageMutationInput): AuditEvent {
  const { op, username, ipAddress, pageName, uuid, fromPageName, rewriteOf, viaToken } = input;

  const metadata: Record<string, unknown> = {
    pageName,
    uuid: uuid ?? null,
    ...tokenMetadata(viaToken)
  };

  // Only a rename has a previous title. Emitting `fromPageName: null` on
  // every edit would make the field useless as a filter for #1082.
  if (op === 'rename' && fromPageName) {
    metadata.fromPageName = fromPageName;
  }

  // Which rename this rewrite belongs to. Emitted only for `link-rewrite`, for
  // the same reason: a field present on every event is useless as a filter.
  if (op === 'link-rewrite' && rewriteOf) {
    metadata.rewriteFrom = rewriteOf.from;
    metadata.rewriteTo = rewriteOf.to;
  }

  return {
    eventType: PAGE_EVENT[op],
    user: username ?? 'unknown',
    ipAddress,
    action: `page-${op}`,
    result: 'success',
    // A token write is worth surfacing above ordinary editing traffic, but an
    // edit is not a delete — `page-delete` reserves `high` for tokens.
    severity: viaToken ? 'medium' : 'low',
    metadata
  };
}

export interface PageViewInput extends CommonInput {
  pageName: string;
  uuid: string | null | undefined;
}

/**
 * Build the audit event for a page view (#1129).
 *
 * Emission is a deployment posture: the route emits only when
 * `ngdpbase.audit.read-events` is on. Off (the default), a wiki does not drown
 * its log in reads; on, a records-style deployment gets the access accounting
 * — who looked at what — that read auditing exists for.
 */
export function buildPageViewAuditEvent(input: PageViewInput): AuditEvent {
  const { username, ipAddress, pageName, uuid, viaToken } = input;
  return {
    eventType: AUDIT_EVENT.PAGE_READ,
    user: username ?? 'unknown',
    ipAddress,
    action: 'page-read',
    result: 'success',
    // Same convention as the mutations: an unattended (token-driven) read is
    // the one a reviewer is scanning for.
    severity: viaToken ? 'medium' : 'low',
    metadata: {
      pageName,
      uuid: uuid ?? null,
      ...tokenMetadata(viaToken)
    }
  };
}

/**
 * Build the audit event for an attachment upload or delete.
 *
 * A delete outranks an upload because it is the one that loses data, and a
 * token-driven delete matches `page-delete`'s `high` for the same reason:
 * unattended destruction is the case someone reviewing the log is looking for.
 */
export function buildAttachmentAuditEvent(input: AttachmentInput): AuditEvent {
  const { op, username, ipAddress, attachmentId, filename, pageName, sizeBytes, viaToken } = input;

  const metadata: Record<string, unknown> = {
    attachmentId,
    filename,
    ...tokenMetadata(viaToken)
  };
  if (pageName) metadata.pageName = pageName;
  if (typeof sizeBytes === 'number') metadata.sizeBytes = sizeBytes;

  const severity: AuditSeverity = op === 'delete'
    ? (viaToken ? 'high' : 'medium')
    : (viaToken ? 'medium' : 'low');

  return {
    eventType: ASSET_EVENT[op],
    user: username ?? 'unknown',
    ipAddress,
    action: `asset-${op}`,
    result: 'success',
    severity,
    metadata
  };
}

/**
 * Send an event to the audit sink, best-effort.
 *
 * Never throws and never rejects. By the time this runs the mutation it
 * describes has already committed, so surfacing a logging failure would turn
 * a successful save into an error response and invite a destructive retry.
 * A missing or unconfigured `AuditManager` is a no-op for the same reason.
 */
/**
 * Audit writes that were attempted and lost (#1109).
 *
 * Every audit write here is fire-and-forget with a caught error, deliberately:
 * losing the log is bad, but refusing a page save or a token mint because the
 * log failed is worse. The consequence is that a request can land its write and
 * lose its audit entry — a page edited with no history, or a credential minted
 * with no record it exists.
 *
 * That trade is defensible. What is not is leaving its only trace in a
 * `logger.warn` nobody reads: an accepted risk nobody can see is
 * indistinguishable from an unnoticed bug. So the drops are counted, the last
 * one is described, and the count is surfaced where an operator already looks.
 */
export interface AuditDropStats {
  /** Audit writes attempted and lost since boot. */
  dropped: number;
  /** `eventType` of the most recent loss, or null. */
  lastEventType: string | null;
  /** Message of the most recent failure, or null. */
  lastError: string | null;
  /** ISO timestamp of the most recent loss, or null. */
  lastAt: string | null;
}

const dropStats: AuditDropStats = { dropped: 0, lastEventType: null, lastError: null, lastAt: null };

/** Audit writes lost since boot. Read-only snapshot. */
export function getAuditDropStats(): AuditDropStats {
  return { ...dropStats };
}

/** Reset the counter. For tests; nothing in the running app calls this. */
export function resetAuditDropStats(): void {
  dropStats.dropped = 0;
  dropStats.lastEventType = null;
  dropStats.lastError = null;
  dropStats.lastAt = null;
}

/**
 * Loud on the first loss, then at each power of ten.
 *
 * One line per dropped event would bury the signal in the noise of whatever
 * outage caused it — and the first loss is the one that matters, because it is
 * the moment the log stopped being complete.
 */
function shouldShout(count: number): boolean {
  if (count === 1) return true;
  let threshold = 10;
  while (threshold <= count) {
    if (threshold === count) return true;
    threshold *= 10;
  }
  return false;
}

/**
 * Record an audit event, honouring its tier (#1121).
 *
 * __Standard__ events are fire-and-forget with a caught error, per the #1109
 * decision: losing the log is bad, but refusing a page save because the log
 * failed is worse.
 *
 * __Critical__ events reverse that. The record IS the evidence — a credential
 * minted with nothing saying it exists is the case this exists for — so the
 * write is flushed to storage and a failure REJECTS, letting the caller
 * abandon the action. "Durable before the action completes" is not satisfied by
 * a queue that flushes on a timer, because the process can die in between.
 */
export async function recordAuditEvent(
  sink: AuditEventSink | null | undefined,
  event: AuditEvent,
  onError?: (err: unknown) => void
): Promise<void> {
  // An absent sink is a configuration state, not a failure. Counting it would
  // make the number meaningless on any instance that never enabled auditing —
  // and it must not turn every critical action into an error either, since
  // auditing being off is already visible through #1118's posture.
  if (!sink?.logAuditEvent) return;

  const critical = isCriticalEventType(event.eventType);

  if (critical && !sink.flushAuditQueue) {
    const message =
      `Audit sink cannot guarantee durability for ${event.eventType}, which is declared critical. ` +
      'The action was refused rather than completed without a record.';
    logger.error(`[audit] ${message}`);
    throw new Error(message);
  }

  try {
    await sink.logAuditEvent(event as unknown as Record<string, unknown>);
    if (critical) await sink.flushAuditQueue?.();
  } catch (err) {
    dropStats.dropped += 1;
    dropStats.lastEventType = event.eventType;
    dropStats.lastError = err instanceof Error ? err.message : String(err);
    dropStats.lastAt = new Date().toISOString();
    if (shouldShout(dropStats.dropped)) {
      logger.error(
        `[audit] ${dropStats.dropped} audit event(s) lost since boot — latest ${event.eventType}: ${dropStats.lastError}. ` +
        'The write itself succeeded; only its audit record was lost.'
      );
    }
    onError?.(err);

    // A critical event's failure is the caller's problem: it must be able to
    // abandon the action rather than complete it unrecorded.
    if (critical) {
      throw new Error(
        `Audit write failed for ${event.eventType}, which is declared critical: ${dropStats.lastError}`
      );
    }
  }
}

/**
 * Build the audit event for an agent token mint or revoke (#1111).
 *
 * Before this, the token store was the only record that a credential had ever
 * existed — and `purgeExpired()` claimed otherwise in a comment ("Audit is
 * unaffected") while nothing emitted anything. That made `retention-days`
 * load-bearing by accident: hash-bearing records were kept a month past
 * usefulness purely so somebody could answer "what could this token do, and
 * who stopped it?" With the lifecycle audited, the store can keep only what it
 * needs to authenticate.
 *
 * Emitted from the manager rather than the route, unlike `page.*`. A page
 * mutation logged at the HTTP layer misses an internal caller and that is
 * survivable; an unaudited mint is a credential nobody knows exists.
 *
 * `scopes` and `expiresAt` appear on a mint only, and `revokedBy` on a revoke
 * only — the same rule `page-rename` follows for `fromPageName`. A field
 * present on every event is useless as a filter.
 */
export function buildTokenAuditEvent(input: TokenInput): AuditEvent {
  const { op, username, ipAddress, id, owner, name, scopes, expiresAt, revokedBy, viaToken } = input;

  const metadata: Record<string, unknown> = {
    id,
    owner,
    name: name ?? null,
    ...tokenMetadata(viaToken)
  };

  if (op === 'mint') {
    metadata.scopes = [...(scopes ?? [])];
    metadata.expiresAt = expiresAt;
  }

  if (op === 'revoke' && revokedBy) {
    metadata.revokedBy = revokedBy;
  }

  return {
    eventType: TOKEN_EVENT[op],
    user: username ?? 'unknown',
    ipAddress,
    action: `token-${op}`,
    result: 'success',
    // Every credential event outranks ordinary content traffic: a token acts
    // unattended, so its creation and its revocation are what a reader of the
    // log is looking for. A token minted BY a token is higher still — that is
    // delegation widening on its own, and the case worth surfacing loudest.
    severity: viaToken ? 'high' : 'medium',
    metadata
  };
}
