/**
 * Audit event builders for content mutations (#1080).
 *
 * `AuditManager` was already mature — file provider with rotation, 90-day
 * retention, search, stats, export, and an admin UI — but almost nothing
 * called it. Outside the manager the only `logAuditEvent` call sites were
 * `page.delete`, admin raw-edit, two session operations, and share
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
 * `page.rename`'s `fromPageName`/`pageName` pair to resolve a link that
 * points at a page's former title, so those two fields are load-bearing
 * rather than descriptive.
 */

/** Agent-token identity attached to a request that authenticated with one. */
export interface AuditViaToken {
  id?: string;
  name?: string;
}

/** The subset of `AuditManager` these helpers need. */
export interface AuditEventSink {
  logAuditEvent?: (event: Record<string, unknown>) => Promise<string>;
}

export type AuditSeverity = 'low' | 'medium' | 'high';

export interface AuditEvent {
  eventType: string;
  user: string;
  ipAddress: string | undefined;
  action: string;
  result: 'success';
  severity: AuditSeverity;
  metadata: Record<string, unknown>;
}

export type PageMutationOp = 'create' | 'edit' | 'rename';
export type AttachmentOp = 'upload' | 'delete';

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
 * Build the audit event for a page create, edit, or rename.
 *
 * `result` is always `success`: these are recorded *after* the write lands,
 * unlike `page.delete`, which logs `attempted` before unlinking so that a
 * crash mid-delete still leaves a trace. A create or edit has the page file
 * and its version history as its own record, so recording the attempt buys
 * nothing the file does not already say.
 */
export function buildPageMutationAuditEvent(input: PageMutationInput): AuditEvent {
  const { op, username, ipAddress, pageName, uuid, fromPageName, viaToken } = input;

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

  return {
    eventType: `page.${op}`,
    user: username ?? 'unknown',
    ipAddress,
    action: `page-${op}`,
    result: 'success',
    // A token write is worth surfacing above ordinary editing traffic, but an
    // edit is not a delete — `page.delete` reserves `high` for tokens.
    severity: viaToken ? 'medium' : 'low',
    metadata
  };
}

/**
 * Build the audit event for an attachment upload or delete.
 *
 * A delete outranks an upload because it is the one that loses data, and a
 * token-driven delete matches `page.delete`'s `high` for the same reason:
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
    eventType: `attachment.${op}`,
    user: username ?? 'unknown',
    ipAddress,
    action: `attachment-${op}`,
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
export async function recordAuditEvent(
  sink: AuditEventSink | null | undefined,
  event: AuditEvent,
  onError?: (err: unknown) => void
): Promise<void> {
  if (!sink?.logAuditEvent) return;
  try {
    await sink.logAuditEvent(event as unknown as Record<string, unknown>);
  } catch (err) {
    onError?.(err);
  }
}
