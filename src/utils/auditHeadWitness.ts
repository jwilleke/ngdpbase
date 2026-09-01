/**
 * Off-box witness for the audit chain head (#1138).
 *
 * The chain detects alteration and deletion, and __cannot detect truncation of
 * the tail__: removing records from the end breaks no link. That is also the
 * attack an intruder actually wants — remove the record of what they just did.
 * Everything before their session verifies perfectly, and the log ends looking
 * like a clean shutdown.
 *
 * It cannot be fixed locally, for the reason #1119 made the chain functions
 * pure: an attacker who owns the machine owns anything the machine wrote
 * locally, including a head stored beside the log. __The head has to leave the
 * box, or it is not evidence.__
 *
 * Three decisions from docs/security-posture.md shape what this does and does
 * not do:
 *
 * - __D13__ — deployment methodology does not influence the design. This
 *   publishes a head to a configured destination and takes no view on what that
 *   destination is. Whether it is genuinely off-box is the operator's decision
 *   and the operator's to state.
 * - __D21__ — report facts, not a claim. There is deliberately no `offBox:
 *   true` produced here. Nothing on this machine can verify that a path leaves
 *   it, and asserting so would be the `durable` defect (#1148) repeated: a
 *   boolean derived from something that does not establish it.
 * - __D20__ — no scoring. A verdict says what is observably true of the records
 *   and the witness, and stops there.
 */

/** What is published: one sequence number and one hash. Nothing else. */
export interface ChainWitness {
  seq: number;
  hash: string;
  /** Which instance the head belongs to, so one store can hold several. */
  instance: string;
  publishedAt: string;
}

/** The minimum of a stored record this assessment needs. */
export interface ChainRecord {
  seq?: number;
  hash?: string;
}

export type WitnessVerdict =
  /** The log is consistent with the witness. */
  | 'intact'
  /** The witness is ahead of the log: records were removed from the end. */
  | 'truncated'
  /** The witnessed sequence is present with a different hash, or absent. */
  | 'altered'
  /** No witness. NOT the same statement as "intact". */
  | 'unknown';

export interface WitnessAssessment {
  verdict: WitnessVerdict;
  /** How many records are missing from the end. Only meaningful when truncated. */
  missing?: number;
  reason?: string;
}

export interface BuildWitnessInput {
  seq: number;
  hash: string;
  instance: string;
  at: Date;
}

/**
 * Build the record to publish.
 *
 * The head is one hash and one sequence number. Publishing more would put
 * audit CONTENT wherever the witness lives, which is a different and much
 * larger trust decision than publishing a fingerprint of it.
 */
export function buildWitness(input: BuildWitnessInput): ChainWitness {
  return {
    seq: input.seq,
    hash: input.hash,
    instance: input.instance,
    publishedAt: input.at.toISOString()
  };
}

/**
 * Is it time to publish again?
 *
 * The gap between publications is the window an attacker can truncate within,
 * which makes the interval the actual security parameter — worth setting
 * explicitly rather than inheriting.
 *
 * A zero or negative interval publishes every time rather than never: a
 * misconfigured interval must fail toward more evidence, not toward silently
 * disabling the witness.
 */
export function shouldPublish(
  lastPublishedAtMs: number | null,
  nowMs: number,
  intervalMs: number
): boolean {
  if (lastPublishedAtMs === null) return true;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return true;
  return nowMs - lastPublishedAtMs >= intervalMs;
}

/**
 * Compare a published head against the records now on disk.
 *
 * The verdicts are kept distinct because an assessor needs the difference:
 * truncation says records were removed, alteration says one was rewritten, and
 * reporting both as "broken" loses what they would act on.
 *
 * `unknown` is never reported as `intact`. "Nothing is witnessing this log" and
 * "this log is intact" are different statements, and deriving the second from
 * the first is exactly the claim #1148 removed elsewhere.
 */
export function assessWitness(
  witness: ChainWitness | { seq: number; hash: string } | null,
  records: readonly ChainRecord[]
): WitnessAssessment {
  if (!witness) {
    return {
      verdict: 'unknown',
      reason: 'No published head to compare against, so truncation cannot be detected.'
    };
  }

  const highest = records.reduce<number>(
    (max, r) => (typeof r.seq === 'number' && r.seq > max ? r.seq : max),
    0
  );

  if (witness.seq > highest) {
    const missing = witness.seq - highest;
    return {
      verdict: 'truncated',
      missing,
      reason:
        `The published head is at sequence ${witness.seq} but the log ends at ${highest} — ` +
        `${missing} record(s) were removed from the end. The remaining records still verify ` +
        'against each other, which is why only the published head can see this.'
    };
  }

  const witnessed = records.find((r) => r.seq === witness.seq);
  if (!witnessed) {
    return {
      verdict: 'altered',
      reason: `Sequence ${witness.seq} was published but is absent from the log.`
    };
  }
  if (witnessed.hash !== witness.hash) {
    return {
      verdict: 'altered',
      reason:
        `Sequence ${witness.seq} has hash ${String(witnessed.hash)} but was published as ` +
        `${witness.hash} — the record was rewritten after it was witnessed.`
    };
  }

  return { verdict: 'intact' };
}
