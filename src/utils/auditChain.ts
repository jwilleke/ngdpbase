/**
 * Tamper evidence for the audit log (#1119).
 *
 * `FileAuditProvider` appended JSON lines with no integrity mechanism, so
 * anything with filesystem access could alter or delete a record and leave no
 * trace. That is exactly the scenario `docs/planning/architecture-principles-typescript.md`
 * argues against — *"an attacker who owns the machine can rewrite a local audit
 * log and erase what they did"* — and an audit log that cannot demonstrate its
 * own integrity fails every assessment framework that asks for one.
 *
 * Each record carries a monotonic `seq` and the `hash` of its predecessor, so:
 *
 * - altering a record breaks every link after it — __detectable__
 * - deleting a record leaves a sequence gap — __detectable__
 * - truncating the tail breaks no link, and is detectable only against an
 *   externally held head — which is why `verifyChain` accepts one
 *
 * These are pure functions on purpose. The chain has to be verifiable by
 * something other than the code that wrote it, or the verification is a
 * circular argument.
 */
import { AUDIT_EVENT } from './auditEventNames.js';
import { createHash } from 'crypto';

/** `prevHash` of the first record in a chain. */
export const GENESIS_HASH = 'genesis';

/** Fields the base stamps, excluded when computing a record's own hash. */
const STAMPED_FIELDS = ['hash'];

/**
 * Canonical JSON: keys sorted at every level.
 *
 * Without this, a record re-serialised in a different key order would hash
 * differently and read as tampering. The verifier must survive the log being
 * parsed and re-written by any conforming implementation.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([k]) => !STAMPED_FIELDS.includes(k))
    // JSON.stringify DROPS undefined-valued keys, so a record hashed with them
    // present could never verify after being written and read back. Matching
    // that here is what makes the chain survive its own serialisation — the
    // first run of scripts/verify-audit-chain.ts against a real log failed on
    // exactly this.
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

/**
 * Hash a record in its position in the chain.
 *
 * `seq` and `prevHash` are part of the input, not just the payload — otherwise
 * records could be reordered, or a record moved to a different predecessor,
 * without breaking anything.
 */
export function hashRecord(record: Record<string, unknown>, seq: number, prevHash: string): string {
  return createHash('sha256')
    .update(`${seq}\n${prevHash}\n${canonical(record)}`)
    .digest('hex');
}

/** Add `seq`, `prevHash` and `hash` to a record. Returns a new object. */
export function stampRecord(
  record: Record<string, unknown>,
  seq: number,
  prevHash: string
): Record<string, unknown> {
  const staged = { ...record, seq, prevHash };
  return { ...staged, hash: hashRecord(staged, seq, prevHash) };
}

/** Outcome of verifying a chain. `brokenAt` is the 1-based position, not the seq. */
export interface ChainVerdict {
  ok: boolean;
  checked: number;
  brokenAt?: number;
  reason?: string;
}

/**
 * Walk a chain in order and report the first break.
 *
 * @param records - Audit records, oldest first
 * @param options.expectedHead - Hash the last record must have. Supplying it is
 *   the only way to detect truncation: removing records from the end breaks no
 *   link, so the chain alone cannot see it.
 */
export function verifyChain(
  records: readonly Record<string, unknown>[],
  options: { expectedHead?: string } = {}
): ChainVerdict {
  let prev = GENESIS_HASH;
  let lastSeq: number | null = null;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const position = i + 1;
    const seq = record.seq;

    if (typeof seq !== 'number' || typeof record.hash !== 'string') {
      return { ok: false, checked: i, brokenAt: position, reason: 'record is not stamped (missing seq or hash)' };
    }
    // Sequence before prevHash: a deleted record breaks BOTH, and
    // "sequence gap: 2 followed by 4" tells an investigator what happened,
    // where a hash mismatch only says something is wrong.
    if (lastSeq !== null && seq !== lastSeq + 1) {
      return { ok: false, checked: i, brokenAt: position, reason: `sequence gap: ${lastSeq} followed by ${seq}` };
    }
    if (record.prevHash !== prev) {
      return { ok: false, checked: i, brokenAt: position, reason: `prevHash does not match the previous record (expected ${prev})` };
    }
    if (hashRecord(record, seq, record.prevHash) !== record.hash) {
      return { ok: false, checked: i, brokenAt: position, reason: 'hash does not match the record contents' };
    }

    prev = record.hash;
    lastSeq = seq;
  }

  if (options.expectedHead !== undefined && prev !== options.expectedHead) {
    return {
      ok: false,
      checked: records.length,
      reason: `chain head is ${prev}, expected ${options.expectedHead} — records were removed from the end`
    };
  }

  return { ok: true, checked: records.length };
}

/** Event type of a record that declares a deliberate chain discontinuity (#1124). */
export const CHAIN_RESTART_EVENT = AUDIT_EVENT.AUDIT_CHAIN_RESTART;

/** One contiguous chain within a log. */
export interface ChainSegment {
  /** Index of the segment's first record in the input. */
  startIndex: number;
  verdict: ChainVerdict;
  /** The restart marker that begins this segment, if it was started by one. */
  restart?: Record<string, unknown>;
  /** True when a break at the END of this segment is followed by a restart marker. */
  explained: boolean;
  /** True when this segment's marker names a previous head that does not match. */
  mismatchedPrevious: boolean;
}

export interface LogVerdict {
  ok: boolean;
  segments: ChainSegment[];
}

/** Is this a chain-restart marker? */
function isRestart(record: Record<string, unknown>): boolean {
  return record.eventType === CHAIN_RESTART_EVENT && record.seq === 1 && record.prevHash === GENESIS_HASH;
}

/**
 * Verify a log that may contain deliberate discontinuities (#1124).
 *
 * `verifyChain` answers "is this one chain intact", which is the right question
 * for a chain and the wrong one for a log that has legitimately restarted — a
 * migration, a restore, or a bug that wrote unverifiable records. Without this,
 * one bad record leaves a log unverifiable forever and the only ways forward
 * are dishonest: edit the log, delete it, or ignore the verifier.
 *
 * A break is __explained__ only when the very next record is a restart marker.
 * That is what keeps the marker from being an escape hatch: an attacker who
 * wants a clean chain must write a record saying they broke it, which is a
 * confession rather than a cover-up.
 *
 * The marker's claimed `previousHash` is checked against the head it actually
 * follows. A marker asserting a history that did not happen is itself a
 * finding — otherwise a restart could claim anything.
 */
export function verifyLog(records: readonly Record<string, unknown>[]): LogVerdict {
  const segments: ChainSegment[] = [];
  let start = 0;

  while (start < records.length) {
    let end = start + 1;
    while (end < records.length && !isRestart(records[end])) end++;

    const slice = records.slice(start, end);
    const marker = isRestart(slice[0]) ? slice[0] : undefined;
    const verdict = verifyChain(slice);

    // A marker may name the head it abandoned. Null is legitimate — when the
    // previous chain is unreadable, admitting ignorance beats an unverifiable
    // claim about what came before.
    let mismatchedPrevious = false;
    if (marker && start > 0) {
      const claimed = (marker.metadata as Record<string, unknown> | undefined)?.previousHash;
      if (claimed !== null && claimed !== undefined) {
        mismatchedPrevious = claimed !== records[start - 1].hash;
      }
    }

    segments.push({
      startIndex: start,
      verdict,
      restart: marker,
      // Explained by whatever follows, filled in below once we know.
      explained: false,
      mismatchedPrevious
    });
    start = end;
  }

  // A segment's break is explained when the NEXT segment opens with a marker.
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i + 1].restart) segments[i].explained = true;
  }

  const ok = segments.every((s) => (s.verdict.ok || s.explained) && !s.mismatchedPrevious);
  return { ok, segments };
}
