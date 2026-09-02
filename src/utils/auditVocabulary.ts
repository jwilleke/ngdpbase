/**
 * The audit event vocabulary — one convention, written down (#1115).
 *
 * Before this file the vocabulary existed in three places that disagreed:
 * `docs/managers/AuditManager.md` listed 19 event types of which 14 were never
 * emitted, the emitters used two incompatible naming conventions side by side,
 * and the admin audit page offered a filter dropdown of four options, three of
 * which matched zero records in a 2,687-record log. An operator filtering for a
 * documented type got nothing back and could not tell that from "nothing
 * happened".
 *
 * The convention is `{target}.{action}`, mirroring the permission registry's
 * `{target}-{action}` (see auditRegistry.ts). Dotted, so a prefix means
 * something: `page.` is everything that happened to pages, `token.` is
 * everything a credential did. The bare snake_case forms — `access_decision`,
 * `policy_evaluation`, `authentication`, `security_event`, `share_access`,
 * `share_create` — did not support that and are retired.
 *
 * Retired names are not forgotten. Records already on disk keep the name they
 * were written with, so {@link canonicalEventTypeOf} maps them forward on read
 * and history stays filterable under the new vocabulary. Some of that mapping
 * is result-aware: a legacy `authentication` record is a success, a failure or
 * a logout depending on its `result`, and flattening all three to one name
 * would lose exactly the distinction an operator is filtering for.
 */

/** What an event type is for, and how loud it is by default. */
export interface AuditEventTypeSpec {
  /** One line. Shown in the docs table and the admin filter. */
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  /**
   * false when nothing emits this yet. An aspirational entry is allowed — it is
   * a declared intent with an issue behind it — but it must say so, because an
   * entry that silently describes nothing is the bug this file exists to stop.
   */
  emitted: boolean;
  /** Why it is not emitted yet. Required when `emitted` is false. */
  note?: string;
}

/**
 * The complete vocabulary. This is the contract: an event type not listed here
 * must not be emitted, and a type listed here as `emitted: true` must have an
 * emitter. auditVocabulary.test.ts fails CI on either divergence.
 */
export const AUDIT_EVENT_TYPES: Record<string, AuditEventTypeSpec> = {
  // ── pages ────────────────────────────────────────────────────────────────
  'page.create':        { description: 'Page created', severity: 'low', emitted: true },
  'page.edit':          { description: 'Page edited', severity: 'low', emitted: true },
  'page.rename':        { description: 'Page renamed', severity: 'low', emitted: true },
  'page.delete':        { description: 'Page deleted', severity: 'medium', emitted: true },
  'page.view':          { description: 'Page viewed — emitted only when ngdpbase.audit.read-events is on (#1129)', severity: 'low', emitted: true },
  'page.link-rewrite':  { description: 'Inbound links rewritten after a rename', severity: 'low', emitted: true },

  // ── attachments ──────────────────────────────────────────────────────────
  'attachment.upload':  { description: 'File uploaded', severity: 'low', emitted: true },
  'attachment.delete':  { description: 'File deleted', severity: 'medium', emitted: true },

  // ── agent tokens ─────────────────────────────────────────────────────────
  'token.mint':         { description: 'Agent token minted', severity: 'medium', emitted: true },
  'token.revoke':       { description: 'Agent token revoked', severity: 'medium', emitted: true },

  // ── authentication ───────────────────────────────────────────────────────
  'authentication.success': { description: 'Sign-in succeeded', severity: 'low', emitted: true },
  'authentication.failed':  { description: 'Sign-in failed', severity: 'medium', emitted: true },
  'authentication.logout':  { description: 'User signed out', severity: 'low', emitted: true },

  // ── authorization ────────────────────────────────────────────────────────
  //
  // Only the deny half is recorded. An allow fires on every page view, which is
  // read-volume — the same reason auditRegistry exempts `page-read` — and #334
  // was filed about exactly that flood. A denial is rare and is the half a
  // security assessment asks about.
  'authorization.deny':  { description: 'Access denied', severity: 'medium', emitted: true },
  // Has an emitter (AuditManager.logAccessDecision) but nothing reaches it
  // today: ACLManager deliberately records denials only. Listed because the
  // emitter exists and history may contain it — not as an aspiration.
  'authorization.allow': { description: 'Access granted', severity: 'low', emitted: true },
  'policy.evaluate':    { description: 'Security policy evaluated', severity: 'low', emitted: true },

  // ── security ─────────────────────────────────────────────────────────────
  //
  // One type carrying the specific kind in `metadata.securityEventType`
  // (SECURITY_FILTER_VIOLATION, login_throttled, …) rather than a type per
  // kind. The set of kinds is open — filters and addons add to it — and a
  // vocabulary that must be edited before a new violation can be reported
  // would be edited late or not at all.
  'security.event':     { description: 'Security violation detected', severity: 'high', emitted: true },

  // ── sharing ──────────────────────────────────────────────────────────────
  'share.create':       { description: 'Share link created', severity: 'medium', emitted: true },
  'share.access':       { description: 'Share link used', severity: 'low', emitted: true },
  'share.revoke':       { description: 'Share link revoked', severity: 'medium', emitted: true },

  // ── process lifecycle ────────────────────────────────────────────────────
  //
  // #1149. The pair is the point: a `system.start` whose predecessor recorded
  // no `system.shutdown` is how the log states that the previous run died and
  // its buffered records may be missing (#1148). Neither is interesting alone.
  'system.start':       { description: 'Instance started — reports whether the previous run ended cleanly', severity: 'low', emitted: true },
  'system.shutdown':    { description: 'Instance shut down cleanly', severity: 'low', emitted: true },

  // ── configuration ────────────────────────────────────────────────────────
  //
  // #1150. One type for every key rather than a type per subsystem: the set of
  // keys is open, and a vocabulary that must be edited before a new setting
  // can be audited would be edited late or not at all — the same reasoning as
  // `security.event` above.
  'config.change':      { description: 'Configuration changed by an administrator', severity: 'medium', emitted: true },

  // ── subsystem state ──────────────────────────────────────────────────────
  //
  // #1155. One type carrying the manager and the new state, rather than a type
  // per manager: the set of managers is open, and a vocabulary that must be
  // edited before a new one can report itself would be edited late or not at
  // all. Same reasoning as `security.event`.
  'manager.state-change': { description: 'A manager changed state — degraded, disabled, failed or recovered', severity: 'medium', emitted: true },

  // ── security posture ─────────────────────────────────────────────────────
  //
  // #1156. Recorded at every start, and compared against the previous start.
  // A difference means the configuration changed while nothing was watching —
  // edited on disk, or while the process was stopped.
  'posture.recorded':   { description: 'Security posture at startup, compared against the previous start', severity: 'medium', emitted: true },
  // #631 — background work. `enqueue` carried no actor, so a reindex reached
  // this log with nobody attached. These carry the origin and the delegating
  // token, so "the system did this" and "alice's agent did this" differ.
  'job.started':   { description: 'A background job started, and who asked for it', severity: 'low', emitted: true },
  'job.completed': { description: 'A background job finished successfully', severity: 'low', emitted: true },
  'job.failed':    { description: 'A background job failed', severity: 'medium', emitted: true },


  // ── administration ───────────────────────────────────────────────────────
  'admin.page.raw-edit':             { description: 'Page edited through the admin raw editor', severity: 'medium', emitted: true },
  'admin.sessions.revoke':           { description: 'Session revoked by an admin', severity: 'medium', emitted: true },
  'admin.sessions.clear-anonymous':  { description: 'Anonymous sessions cleared', severity: 'low', emitted: true },

  // ── the audit trail describing itself ────────────────────────────────────
  'audit.chain-restart': { description: 'Hash chain restarted, with the reason', severity: 'high', emitted: true }
};

/** Every canonical event type, sorted. */
export function auditEventTypes(): string[] {
  return Object.keys(AUDIT_EVENT_TYPES).sort();
}

/** Types declared but not yet emitted, with the reason. */
export function unemittedEventTypes(): Array<{ eventType: string; note?: string }> {
  return Object.entries(AUDIT_EVENT_TYPES)
    .filter(([, spec]) => !spec.emitted)
    .map(([eventType, spec]) => ({ eventType, note: spec.note }));
}

/**
 * Retired names, and the canonical name a record written under one maps to.
 *
 * A function rather than a table where the answer depends on the record: a
 * legacy `authentication` row is a success, a failure or a logout, and only its
 * `result` says which.
 */
const LEGACY_RESOLVERS: Record<string, (record: { result?: unknown }) => string> = {
  security_event: () => 'security.event',
  share_access: () => 'share.access',
  share_create: () => 'share.create',
  share_revoke: () => 'share.revoke',
  policy_evaluation: () => 'policy.evaluate',
  access_decision: (r) => (r.result === 'deny' ? 'authorization.deny' : 'authorization.allow'),
  authentication: (r) =>
    r.result === 'failure' ? 'authentication.failed'
      : r.result === 'logout' ? 'authentication.logout'
        : 'authentication.success'
};

/** Retired names, for documentation and for widening a filter over history. */
export const LEGACY_EVENT_TYPES = Object.keys(LEGACY_RESOLVERS);

/**
 * The canonical event type for a record, mapping a retired name forward.
 *
 * Returns the record's own eventType unchanged when it is already canonical or
 * simply unknown — an unrecognised type is surfaced as itself rather than
 * hidden behind a guess, because silently renaming something we do not
 * understand is how a log stops being evidence.
 */
export function canonicalEventTypeOf(record: { eventType?: unknown; result?: unknown }): string {
  const raw = typeof record.eventType === 'string' ? record.eventType : '';
  const resolve = LEGACY_RESOLVERS[raw];
  return resolve ? resolve(record) : raw;
}

/**
 * The retired names whose records can canonicalise to `canonical`.
 *
 * Used to widen a filter: an operator asking for `authorization.deny` must also
 * get the pre-cutover `access_decision` rows that were denials, or the log
 * appears to begin on the day of the rename.
 *
 * `authorization.allow` appears here even though nothing emits it any more —
 * history may contain it, and history is the reason this map exists.
 */
export function legacyTypesFor(canonical: string): string[] {
  return LEGACY_EVENT_TYPES.filter((legacy) => {
    const resolve = LEGACY_RESOLVERS[legacy];
    return (
      resolve({ result: 'deny' }) === canonical ||
      resolve({ result: 'failure' }) === canonical ||
      resolve({ result: 'logout' }) === canonical ||
      resolve({ result: 'success' }) === canonical
    );
  });
}
