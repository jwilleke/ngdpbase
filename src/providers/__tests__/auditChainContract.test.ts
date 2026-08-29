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
const event = (n: number) => ({ id: `e${n}`, eventType: 'page.edit', user: 'alice' }) as never;

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
    expect(p.getGuarantees()).toMatchObject({ tamperEvident: false, durable: false });
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
