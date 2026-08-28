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
 * unlike `page.delete`, which logs `attempted` before unlinking so that a
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
 * only — the same rule `page.rename` follows for `fromPageName`. A field
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
    eventType: `token.${op}`,
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
