import { buildWitness, assessWitness, shouldPublish } from '../auditHeadWitness';

/**
 * #1138 — the chain detects alteration and deletion, but NOT truncation of the
 * tail: removing records from the end breaks no link.
 *
 * Truncation is also the attack an intruder actually wants — remove the record
 * of what they just did. Everything before their session verifies perfectly and
 * the log ends looking like a clean shutdown.
 *
 * It cannot be fixed locally, for the reason #1119 made the chain functions
 * pure: an attacker who owns the machine owns anything the machine wrote
 * locally, including a head stored beside the log. The head has to leave the
 * box, or it is not evidence.
 */
const rec = (seq: number, hash: string) => ({ seq, hash });

describe('#1138 — assessWitness', () => {
  test('a witness matching the last record is intact', () => {
    const v = assessWitness({ seq: 3, hash: 'h3' }, [rec(1, 'h1'), rec(2, 'h2'), rec(3, 'h3')]);
    expect(v.verdict).toBe('intact');
  });

  test('a witness AHEAD of the log is truncation — the case the chain cannot see', () => {
    // The whole point. The remaining records still verify against each other;
    // only something that remembered seq 3 can say seq 3 is missing.
    const v = assessWitness({ seq: 3, hash: 'h3' }, [rec(1, 'h1'), rec(2, 'h2')]);
    expect(v.verdict).toBe('truncated');
    expect(v.missing).toBe(1);
  });

  test('it reports HOW MANY records are missing, not just that some are', () => {
    const v = assessWitness({ seq: 10, hash: 'h10' }, [rec(1, 'h1')]);
    expect(v.missing).toBe(9);
  });

  test('a log that has grown since the witness is intact, not suspicious', () => {
    // The ordinary case between publications. Records after the witness are
    // simply newer than the last one published.
    const v = assessWitness({ seq: 2, hash: 'h2' }, [rec(1, 'h1'), rec(2, 'h2'), rec(3, 'h3')]);
    expect(v.verdict).toBe('intact');
  });

  test('a hash that differs at the witnessed seq is ALTERED, not truncated', () => {
    // Distinct failures deserve distinct verdicts: truncation says records were
    // removed, alteration says one was rewritten. Reporting both as "broken"
    // loses what an assessor needs.
    const v = assessWitness({ seq: 2, hash: 'h2' }, [rec(1, 'h1'), rec(2, 'DIFFERENT'), rec(3, 'h3')]);
    expect(v.verdict).toBe('altered');
  });

  test('a witnessed seq missing from the middle is altered, not intact', () => {
    const v = assessWitness({ seq: 2, hash: 'h2' }, [rec(1, 'h1'), rec(3, 'h3')]);
    expect(v.verdict).toBe('altered');
  });

  test('no witness is UNKNOWN, never intact', () => {
    // The distinction that keeps this honest: "nothing is witnessing this log"
    // is not the same statement as "this log is intact", and reporting the
    // second from the first is the claim #1148 removed elsewhere.
    expect(assessWitness(null, [rec(1, 'h1')]).verdict).toBe('unknown');
  });

  test('an empty log with a witness is truncation, not an empty log', () => {
    // Everything removed is the maximal case and must not read as "nothing has
    // happened yet".
    const v = assessWitness({ seq: 5, hash: 'h5' }, []);
    expect(v.verdict).toBe('truncated');
    expect(v.missing).toBe(5);
  });

  test('an empty log with no witness is unknown', () => {
    expect(assessWitness(null, []).verdict).toBe('unknown');
  });
});

describe('#1138 — shouldPublish', () => {
  const now = 1_000_000;

  test('publishes when nothing has been published yet', () => {
    expect(shouldPublish(null, now, 60_000)).toBe(true);
  });

  test('does not publish again within the interval', () => {
    expect(shouldPublish(now - 30_000, now, 60_000)).toBe(false);
  });

  test('publishes once the interval has passed', () => {
    expect(shouldPublish(now - 60_001, now, 60_000)).toBe(true);
  });

  test('a zero or negative interval publishes every time rather than never', () => {
    // A misconfigured interval must fail toward MORE evidence, not silently
    // disable the witness.
    expect(shouldPublish(now, now, 0)).toBe(true);
    expect(shouldPublish(now, now, -5)).toBe(true);
  });
});

describe('#1138 — buildWitness', () => {
  test('carries the sequence, the hash and when it was taken', () => {
    const w = buildWitness({ seq: 7, hash: 'abc', instance: 'jimstest', at: new Date('2026-09-01T10:00:00Z') });
    expect(w.seq).toBe(7);
    expect(w.hash).toBe('abc');
    expect(w.instance).toBe('jimstest');
    expect(w.publishedAt).toBe('2026-09-01T10:00:00.000Z');
  });

  test('carries no audit content — only the head', () => {
    // The head is one hash and one sequence number. Publishing more would put
    // audit content wherever the witness lives, which is a different and much
    // larger trust decision.
    const w = buildWitness({ seq: 7, hash: 'abc', instance: 'x', at: new Date() });
    expect(Object.keys(w).sort()).toEqual(['hash', 'instance', 'publishedAt', 'seq']);
  });
});
