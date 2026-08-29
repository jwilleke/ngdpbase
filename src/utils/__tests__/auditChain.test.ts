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
import { hashRecord, stampRecord, verifyChain, GENESIS_HASH } from '../auditChain';

const rec = (n: number) => ({ id: `e${n}`, eventType: 'page.edit', user: 'alice', timestamp: `2026-01-0${n}T00:00:00.000Z` });

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
