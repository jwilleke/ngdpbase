/**
 * Process lifecycle as audit events (#1149).
 *
 * Nothing recorded that an instance started or stopped, so an unclean exit was
 * undetectable from the log. That matters because of #1148: on an unclean exit
 * the buffered audit records are lost, the chain resumes from the last WRITTEN
 * record at boot, verification passes, and nothing shows anything is absent.
 * The log does not lie about the records it holds — it simply cannot say that
 * records are missing.
 *
 * A `system.start` with no `system.shutdown` before it says exactly that. It
 * cannot recover the lost records; it marks the window in which records may be
 * absent, which is the difference between an audit trail with a known gap and
 * one that quietly appears complete.
 */

import type { AuditEvent, AuditSeverity } from './auditEvents.js';

/** What the previous run's ending can be established to be. */
export type PreviousRun =
  /** A shutdown was recorded after the last start. */
  | 'clean'
  /** A start was recorded with no shutdown after it. Records may be missing. */
  | 'unclean'
  /** No start on record — a first boot, or history beyond the log. */
  | 'none'
  /** The records present cannot establish an ordering. */
  | 'unknown';

/** The minimum of a stored record this assessment needs. */
export interface LifecycleRecord {
  timestamp?: string;
}

function parsed(record: LifecycleRecord | null): number | null {
  if (!record?.timestamp) return null;
  const ms = Date.parse(record.timestamp);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Decide how the previous run ended, from the latest record of each phase.
 *
 * Deliberately conservative in three places, because the whole value of this
 * is that it does not overclaim:
 *
 * - No start on record is `none`, not `unclean`. A first boot must not accuse
 *   itself, or every new instance cries wolf and the signal stops being read.
 * - A shutdown with no start is `unknown`, not `clean`. That is only reachable
 *   through a truncated or rotated log, and concluding "clean" from half the
 *   evidence is the failure this exists to prevent.
 * - Equal timestamps are `unclean`. Same-millisecond records cannot establish
 *   ordering, so the shutdown did not *demonstrably* follow the start.
 */
export function assessPreviousRun(
  lastStart: LifecycleRecord | null,
  lastShutdown: LifecycleRecord | null
): PreviousRun {
  const startedAt = parsed(lastStart);
  const stoppedAt = parsed(lastShutdown);

  if (lastStart && startedAt === null) return 'unknown';
  if (lastShutdown && stoppedAt === null) return 'unknown';

  if (startedAt === null) return stoppedAt === null ? 'none' : 'unknown';
  if (stoppedAt === null) return 'unclean';

  return stoppedAt > startedAt ? 'clean' : 'unclean';
}

export interface LifecycleEventInput {
  phase: 'start' | 'shutdown';
  /** The running version, so a restart is distinguishable from an upgrade. */
  version: string;
  pid: number;
  /** Required on a start, meaningless on a shutdown. */
  previousRun?: PreviousRun;
  /**
   * The transport the instance actually bound (#1153).
   *
   * "This instance is serving HTTP" is a security fact, and the log had no
   * record of it — only the version and pid.
   */
  scheme?: 'http' | 'https';
}

/**
 * Build the audit event for a process starting or stopping.
 *
 * `previousRun` appears on a start only, following the rule `page.rename` and
 * `token.mint` already use: a field present on every event is useless as a
 * filter. A shutdown is a statement about itself and makes no claim about the
 * past.
 */
export function buildLifecycleAuditEvent(input: LifecycleEventInput): AuditEvent {
  const { phase, version, pid, previousRun, scheme } = input;
  const unclean = phase === 'start' && previousRun === 'unclean';

  const metadata: Record<string, unknown> = { version, pid };
  if (scheme) metadata.scheme = scheme;
  if (phase === 'start') {
    metadata.previousRun = previousRun ?? 'unknown';
    // The load-bearing field. #1148 means an unclean exit loses whatever was
    // buffered, and this is the only place the log can say so.
    metadata.recordsMayBeMissing = unclean;
  }

  // A boot following a crash is what a reader scanning by severity is looking
  // for; an ordinary restart is not.
  const severity: AuditSeverity = unclean ? 'high' : 'low';

  return {
    eventType: phase === 'start' ? 'system.start' : 'system.shutdown',
    user: 'system',
    ipAddress: undefined,
    action: phase === 'start' ? 'system.start' : 'system.shutdown',
    result: 'success',
    severity,
    metadata
  };
}
