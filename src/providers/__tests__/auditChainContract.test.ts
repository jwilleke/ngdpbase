/**
 * #1119 — integrity is a property of the CONTRACT, not of one provider.
 *
 * Stamped inside FileAuditProvider it would protect that provider only, and
 * whether an instance were tamper-evident would depend on which storage
 * backend was configured. "It depends on your backend" is not an answer that
 * survives an assessment.
 *
 * So the base stamps and the subclass only stores. These tests use a fake
 * subclass rather than a real provider, because what is being tested is the
 * contract every provider inherits.
 */
vi.unmock('../BaseAuditProvider');

import BaseAuditProvider from '../BaseAuditProvider';
import { verifyChain, GENESIS_HASH } from '../../utils/auditChain';

type Rec = Record<string, unknown>;

/** A subclass that only stores — exactly what the contract asks of it. */
class MemoryProvider extends BaseAuditProvider {
  written: Rec[] = [];
  resumeFrom: { seq: number; hash: string } | null = null;

  initialize(): Promise<void> { this.initialized = true; return Promise.resolve(); }
  writeEvent(record: Rec): Promise<string> { this.written.push(record); return Promise.resolve(String(record.id ?? '')); }
  protected override loadChainHead(): Promise<{ seq: number; hash: string } | null> { return Promise.resolve(this.resumeFrom); }
  searchAuditLogs(): Promise<never> { throw new Error('n/a'); }
  getAuditStats(): Promise<never> { throw new Error('n/a'); }
  exportAuditLogs(): Promise<never> { throw new Error('n/a'); }
  flush(): Promise<void> { return Promise.resolve(); }
  cleanup(): Promise<void> { return Promise.resolve(); }
  isHealthy(): Promise<boolean> { return Promise.resolve(true); }
  close(): Promise<void> { return Promise.resolve(); }
}

/** A subclass that opts out, as NullAuditProvider does. */
class UnchainedProvider extends MemoryProvider {
  protected override chainEnabled(): boolean { return false; }
}

const engine = { getManager: vi.fn(() => null) } as never;
const event = (n: number) => ({ id: `e${n}`, eventType: 'page-edit', user: 'alice' }) as never;

describe('#1119 the base stamps, the subclass only stores', () => {
  it('a subclass that implements only storage still produces a verifiable chain', async () => {
    const p = new MemoryProvider(engine);
    for (let i = 1; i <= 4; i++) await p.logAuditEvent(event(i));
    expect(verifyChain(p.written)).toEqual({ ok: true, checked: 4 });
  });

  it('the subclass never sees an un-stamped record', async () => {
    const p = new MemoryProvider(engine);
    await p.logAuditEvent(event(1));
    expect(p.written[0]).toMatchObject({ seq: 1, prevHash: GENESIS_HASH });
    expect(typeof p.written[0].hash).toBe('string');
  });

  it('the first record starts from genesis', async () => {
    const p = new MemoryProvider(engine);
    await p.logAuditEvent(event(1));
    expect(p.written[0].prevHash).toBe(GENESIS_HASH);
  });

  it('resumes from stored state, so a restart is not a chain break', async () => {
    // Without this the sequence restarts at 1 on every boot and a verifier
    // could not tell a restart from a deletion.
    const first = new MemoryProvider(engine);
    for (let i = 1; i <= 3; i++) await first.logAuditEvent(event(i));
    const head = first.written[2];

    const second = new MemoryProvider(engine);
    second.resumeFrom = { seq: head.seq as number, hash: head.hash as string };
    await second.logAuditEvent(event(4));

    expect(second.written[0]).toMatchObject({ seq: 4, prevHash: head.hash });
    expect(verifyChain([...first.written, ...second.written])).toEqual({ ok: true, checked: 4 });
  });

  it('a provider that cannot resume starts a fresh chain rather than a broken one', async () => {
    const p = new MemoryProvider(engine);
    p.resumeFrom = null;
    await p.logAuditEvent(event(1));
    expect(p.written[0]).toMatchObject({ seq: 1, prevHash: GENESIS_HASH });
  });

  it('an unchained provider stores nothing extra and claims no guarantees', async () => {
    const p = new UnchainedProvider(engine);
    await p.logAuditEvent(event(1));
    expect(p.written[0].seq).toBeUndefined();
    // #1148: `durable` is gone. Chaining made records' alteration detectable
    // and never had anything to do with surviving a crash, so deriving one
    // from the other claimed durability no provider delivered.
    expect(p.getGuarantees()).toMatchObject({ tamperEvident: false, durability: null });
  });

  it('a storing provider reports tamper evidence without having to say so', async () => {
    // The guarantee follows from the contract, so a fifth provider gets it
    // right by default rather than by remembering.
    expect(new MemoryProvider(engine).getGuarantees()).toMatchObject({ tamperEvident: true });
  });

  it('tampering with a stored record is detectable after the fact', async () => {
    const p = new MemoryProvider(engine);
    for (let i = 1; i <= 3; i++) await p.logAuditEvent(event(i));
    (p.written[1] as { user: string }).user = 'mallory';
    const v = verifyChain(p.written);
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(2);
  });
});

/**
 * #1124 — restarting a chain is an operator action that leaves a record.
 */
describe('#1124 chain restart', () => {
  it('writes a marker that begins a new chain', async () => {
    const p = new MemoryProvider(engine);
    for (let i = 1; i <= 3; i++) await p.logAuditEvent(event(i));
    const abandoned = p.written[2].hash as string;

    await p.restartChain('records predate the #1119 fix', 'jim');

    const marker = p.written[3];
    expect(marker.eventType).toBe('audit-chain-restart');
    expect(marker.seq).toBe(1);
    expect(marker.prevHash).toBe(GENESIS_HASH);
    expect((marker.metadata as Record<string, unknown>).previousHash).toBe(abandoned);
  });

  it('subsequent records continue from the marker', async () => {
    const p = new MemoryProvider(engine);
    await p.logAuditEvent(event(1));
    await p.restartChain('why', 'jim');
    await p.logAuditEvent(event(2));
    expect(p.written[2].seq).toBe(2);
    expect(p.written[2].prevHash).toBe(p.written[1].hash);
  });

  it('refuses without a reason, because an unexplained restart is a finding', async () => {
    const p = new MemoryProvider(engine);
    await expect(p.restartChain('   ', 'jim')).rejects.toThrow(/reason/i);
  });

  it('refuses on a provider that does not chain', async () => {
    const p = new UnchainedProvider(engine);
    await expect(p.restartChain('why', 'jim')).rejects.toThrow(/does not chain/i);
  });

  it('a marker that cannot be written leaves the head where it was (#1202)', async () => {
    // The marker is the action, and it is critical: it cannot half-complete.
    // Before #1202 the head moved BEFORE the write, so a failed marker left
    // the process chaining from a hash that never landed. Sabotage: move the
    // two head assignments back above `writeEvent` and this goes red.
    class FailingOnce extends MemoryProvider {
      failNext = false;
      override writeEvent(record: Rec): Promise<string> {
        if (this.failNext) { this.failNext = false; return Promise.reject(new Error('disk full')); }
        return super.writeEvent(record);
      }
    }
    const p = new FailingOnce(engine);
    await p.logAuditEvent(event(1));
    const head = p.written[0].hash as string;

    p.failNext = true;
    await expect(p.restartChain('why', 'jim')).rejects.toThrow(/disk full/);

    await p.logAuditEvent(event(2));
    expect(p.written).toHaveLength(2);
    expect(p.written[1].seq).toBe(2);
    expect(p.written[1].prevHash).toBe(head);
  });

  it('records a null previous head rather than inventing one', async () => {
    // When the abandoned chain cannot be read, admitting ignorance beats an
    // unverifiable claim about what came before.
    const p = new MemoryProvider(engine);
    p.resumeFrom = null;
    await p.restartChain('previous log unreadable', 'jim');
    expect((p.written[0].metadata as Record<string, unknown>).previousHash).toBeNull();
  });
});
