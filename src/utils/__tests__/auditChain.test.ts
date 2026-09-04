/**
 * #1119 — audit records carry a sequence number and the hash of their
 * predecessor, so alteration, deletion and truncation are each detectable.
 *
 * The pure rules live here so the chain can be reasoned about without a
 * provider, a filesystem or an engine. `FileAuditProvider.ts:406` was a bare
 * `fs.appendFile` of JSONL — anything with filesystem access could alter or
 * delete a line and leave no trace, which is exactly the tamper scenario the
 * architecture note argues against.
 */
import { hashRecord, stampRecord, verifyChain, verifyLog, GENESIS_HASH, CHAIN_RESTART_EVENT } from '../auditChain';

const rec = (n: number) => ({ id: `e${n}`, eventType: 'page-edit', user: 'alice', timestamp: `2026-01-0${n}T00:00:00.000Z` });

/** Build a valid chain of n records. */
function chainOf(n: number) {
  const out: Record<string, unknown>[] = [];
  let prev = GENESIS_HASH;
  let seq = 0;
  for (let i = 1; i <= n; i++) {
    const stamped = stampRecord(rec(i), ++seq, prev);
    out.push(stamped);
    prev = stamped.hash as string;
  }
  return out;
}

describe('hashRecord()', () => {
  it('is stable for the same content', () => {
    expect(hashRecord(rec(1), 1, GENESIS_HASH)).toBe(hashRecord(rec(1), 1, GENESIS_HASH));
  });

  it('changes when any field changes', () => {
    const a = hashRecord(rec(1), 1, GENESIS_HASH);
    expect(hashRecord({ ...rec(1), user: 'mallory' }, 1, GENESIS_HASH)).not.toBe(a);
  });

  it('changes when the sequence changes, so records cannot be reordered', () => {
    expect(hashRecord(rec(1), 2, GENESIS_HASH)).not.toBe(hashRecord(rec(1), 1, GENESIS_HASH));
  });

  it('changes when the predecessor changes, which is what makes it a chain', () => {
    expect(hashRecord(rec(1), 1, 'other')).not.toBe(hashRecord(rec(1), 1, GENESIS_HASH));
  });

  it('ignores key order, so re-serialisation does not break verification', () => {
    const a = hashRecord({ x: 1, y: 2 }, 1, GENESIS_HASH);
    const b = hashRecord({ y: 2, x: 1 }, 1, GENESIS_HASH);
    expect(a).toBe(b);
  });

  it('does not hash a hash field that is already present', () => {
    // Otherwise re-hashing a stamped record could never reproduce its own hash.
    const stamped = stampRecord(rec(1), 1, GENESIS_HASH);
    expect(hashRecord(stamped, 1, GENESIS_HASH)).toBe(stamped.hash);
  });
});

describe('verifyChain()', () => {
  it('accepts an intact chain', () => {
    expect(verifyChain(chainOf(5))).toEqual({ ok: true, checked: 5 });
  });

  it('accepts an empty log', () => {
    expect(verifyChain([])).toEqual({ ok: true, checked: 0 });
  });

  it('names the record whose content was altered', () => {
    const c = chainOf(5);
    (c[2] as { user: string }).user = 'mallory';
    const r = verifyChain(c);
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(3);
    expect(r.reason).toMatch(/hash/i);
  });

  it('detects a deleted record as a sequence gap', () => {
    const c = chainOf(5);
    c.splice(2, 1);
    const r = verifyChain(c);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/gap|sequence/i);
  });

  it('detects truncation when told what the head should be', () => {
    // Removing records from the END breaks no link, so the chain alone cannot
    // see it. An anchored head is what makes truncation detectable.
    const c = chainOf(5);
    const head = c[4].hash as string;
    const truncated = c.slice(0, 3);
    expect(verifyChain(truncated).ok).toBe(true);
    expect(verifyChain(truncated, { expectedHead: head }).ok).toBe(false);
  });

  it('detects a re-linked record, so a forged chain is not accepted', () => {
    // Alter a record and re-hash it — the link to its SUCCESSOR still breaks.
    const c = chainOf(5);
    (c[1] as { user: string }).user = 'mallory';
    c[1].hash = hashRecord(c[1], c[1].seq, c[1].prevHash);
    const r = verifyChain(c);
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(3);
  });

  it('rejects a first record that does not start from genesis', () => {
    const c = chainOf(2);
    c[0].prevHash = 'somewhere-else';
    expect(verifyChain(c).ok).toBe(false);
  });

  it('reports an unstamped record rather than skipping it', () => {
    const c = chainOf(3);
    delete (c[1]).hash;
    const r = verifyChain(c);
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(2);
  });
});

describe('hashing survives a JSON round trip', () => {
  // Found by scripts/verify-audit-chain.ts against the real jimstest log on the
  // first run: every stamped record failed. canonical() rendered undefined as
  // null, but JSON.stringify DROPS undefined-valued keys when the record is
  // written — so the hash covered a field that did not reach disk, and no
  // chained record could ever verify. The chain has to be stable across the
  // serialisation the provider actually uses.
  it('a record with undefined fields verifies after being written and read back', () => {
    const withUndefined = { id: 'e1', user: 'alice', userId: undefined, sessionId: undefined };
    const stamped = stampRecord(withUndefined, 1, GENESIS_HASH);
    const roundTripped = JSON.parse(JSON.stringify(stamped)) as Record<string, unknown>;
    expect(verifyChain([roundTripped])).toEqual({ ok: true, checked: 1 });
  });

  it('an undefined field and an absent field hash identically', () => {
    expect(hashRecord({ a: 1, b: undefined }, 1, GENESIS_HASH))
      .toBe(hashRecord({ a: 1 }, 1, GENESIS_HASH));
  });

  it('an explicit null is still distinct from absent', () => {
    // JSON.stringify keeps null, so it must keep affecting the hash.
    expect(hashRecord({ a: 1, b: null }, 1, GENESIS_HASH))
      .not.toBe(hashRecord({ a: 1 }, 1, GENESIS_HASH));
  });

  it('nested undefined is dropped too', () => {
    expect(hashRecord({ c: { x: 1, y: undefined } }, 1, GENESIS_HASH))
      .toBe(hashRecord({ c: { x: 1 } }, 1, GENESIS_HASH));
  });
});

/**
 * #1124 — an explained break is not the same as tampering.
 *
 * The chain has one state for every kind of break: an attacker editing a line,
 * a bug writing an unverifiable record, a migration, a restore. All four look
 * identical, and once a break exists everything after it is unverifiable
 * forever — the verifier stops at the first one.
 *
 * jimstest is in that state now: 16 records written by the build that had the
 * #1119 hashing bug can never verify, so the live chain is permanently broken
 * at seq 1. The chain is behaving correctly; there was no honest way to move
 * on. A restart marker is that way — and because it lives IN the log, an
 * attacker who wants a clean chain has to write a record saying they broke it.
 */
describe('verifyLog() — explained breaks (#1124)', () => {
  const restart = (previousSeq: number | null, previousHash: string | null, reason = 'test') =>
    stampRecord(
      { eventType: CHAIN_RESTART_EVENT, id: 'r', metadata: { previousSeq, previousHash, reason, actor: 'operator' } },
      1,
      GENESIS_HASH
    );

  it('a single intact chain is one verified segment', () => {
    const r = verifyLog(chainOf(3));
    expect(r.ok).toBe(true);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].verdict.checked).toBe(3);
  });

  it('a broken chain followed by a restart marker verifies the new segment', () => {
    const broken = chainOf(3);
    (broken[1] as { user: string }).user = 'mallory';

    const marker = restart(3, broken[2].hash as string);
    let prev = marker.hash as string;
    const after = [marker];
    for (let i = 2; i <= 3; i++) {
      const s = stampRecord({ id: `n${i}`, user: 'alice' }, i, prev);
      after.push(s);
      prev = s.hash as string;
    }

    const r = verifyLog([...broken, ...after]);
    expect(r.segments).toHaveLength(2);
    expect(r.segments[0].verdict.ok).toBe(false);
    expect(r.segments[0].explained).toBe(true);
    expect(r.segments[1].verdict.ok).toBe(true);
  });

  it('a marker written under the retired name still starts a segment (#1201 regression)', () => {
    // Records on disk keep the name they were written with. The first verify
    // after the rename reported jimstest's log broken at seq 1, because the
    // marker on disk says `audit.chain-restart` and the recogniser had only the
    // new name. Sabotage: drop RETIRED_CHAIN_RESTART_EVENT from isRestart().
    const intact = chainOf(2);
    const oldMarker = stampRecord(
      { eventType: 'audit.chain-restart', id: 'r-old', metadata: { previousSeq: 2, previousHash: intact[1].hash, reason: 'pre-rename', actor: 'operator' } },
      1,
      GENESIS_HASH
    );
    const next = stampRecord({ id: 'n2', user: 'alice' }, 2, oldMarker.hash as string);

    const r = verifyLog([...intact, oldMarker, next]);
    expect(r.segments).toHaveLength(2);
    expect(r.segments[0].verdict.ok).toBe(true);
    expect(r.segments[1].restart).toBeDefined();
    expect(r.segments[1].verdict.ok).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('a break with NO restart marker is still unexplained', () => {
    // The whole guarantee: a marker is the only way to move on, so an attacker
    // must leave a record saying they broke it.
    const broken = chainOf(4);
    (broken[1] as { user: string }).user = 'mallory';
    const r = verifyLog(broken);
    expect(r.ok).toBe(false);
    expect(r.segments[0].explained).toBe(false);
  });

  it('a restart marker records what it abandoned', () => {
    const first = chainOf(2);
    const marker = restart(2, first[1].hash as string, 'records predate the #1119 fix');
    const r = verifyLog([...first, marker]);
    const meta = r.segments[1].restart?.metadata as Record<string, unknown>;
    expect(meta.previousSeq).toBe(2);
    expect(meta.previousHash).toBe(first[1].hash);
    expect(meta.reason).toMatch(/1119/);
  });

  it('a marker claiming the wrong previous head is itself a finding', () => {
    // Otherwise a restart could assert any history it liked.
    const first = chainOf(2);
    const marker = restart(2, 'not-the-real-head');
    const r = verifyLog([...first, marker]);
    expect(r.ok).toBe(false);
    expect(r.segments[1].mismatchedPrevious).toBe(true);
  });

  it('a marker with a null previous head is allowed and noted', () => {
    // When the abandoned chain is unreadable, admitting ignorance beats an
    // unverifiable claim about what came before.
    const marker = restart(null, null, 'previous log unreadable');
    const r = verifyLog([marker]);
    expect(r.ok).toBe(true);
    expect(r.segments[0].mismatchedPrevious).toBe(false);
  });

  it('counts segments so a log restarted repeatedly is visibly suspicious', () => {
    const a = chainOf(2);
    const m1 = restart(2, a[1].hash as string);
    const m2 = restart(1, m1.hash as string);
    const r = verifyLog([...a, m1, m2]);
    expect(r.segments).toHaveLength(3);
  });
});
