/**
 * #1148 — the audit report claimed durability nothing delivered.
 *
 * `getGuarantees()` returned `durable: this.chainEnabled()`, and
 * `chainEnabled()` is unconditionally true, so every storing provider claimed
 * durability. `FileAuditProvider` queues records in memory, flushes on a timer
 * or at a queue bound, and appends without fsync — so an unclean exit lost
 * everything in the window while the instance reported `durable: true`.
 *
 * Durability is not something a single node can promise anyway: it means
 * write, fsync, then acknowledge, and even that trusts a controller cache.
 * So the report states what is MEASURABLE and the reader draws the
 * conclusion — see D21 in docs/security-posture.md.
 */
vi.unmock('../BaseAuditProvider');
vi.unmock('../FileAuditProvider');
vi.unmock('../NullAuditProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import BaseAuditProvider from '../BaseAuditProvider';
import FileAuditProvider from '../FileAuditProvider';
import NullAuditProvider from '../NullAuditProvider';

type Rec = Record<string, unknown>;

/** A storing provider that says nothing about its durability. */
class SilentProvider extends BaseAuditProvider {
  initialize(): Promise<void> { this.initialized = true; return Promise.resolve(); }
  writeEvent(record: Rec): Promise<string> { return Promise.resolve(String(record.id ?? '')); }
  searchAuditLogs(): Promise<never> { throw new Error('n/a'); }
  getAuditStats(): Promise<never> { throw new Error('n/a'); }
  exportAuditLogs(): Promise<never> { throw new Error('n/a'); }
  flush(): Promise<void> { return Promise.resolve(); }
  cleanup(): Promise<void> { return Promise.resolve(); }
  isHealthy(): Promise<boolean> { return Promise.resolve(true); }
  close(): Promise<void> { return Promise.resolve(); }
}

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-durability-'));
});

afterEach(async () => {
  // Only the temp directory this test created. Never a data directory.
  await fs.remove(dir);
});

function fileProvider(overrides: Record<string, unknown> = {}) {
  const config: Record<string, unknown> = {
    'ngdpbase.audit.provider.file.logdirectory': dir,
    'ngdpbase.audit.flushinterval': 30000,
    'ngdpbase.audit.maxqueuesize': 1000,
    ...overrides
  };
  const engine = {
    getManager: (name: string) => (name === 'ConfigurationManager'
      ? {
        getProperty: (k: string, d: unknown) => (k in config ? config[k] : d),
        getResolvedDataPath: () => dir
      }
      : null)
  } as never;
  return new FileAuditProvider(engine);
}

describe('#1148 — audit durability is reported, not asserted', () => {
  test('no provider exposes a durable boolean any more', () => {
    const reports = [
      new SilentProvider({}).getGuarantees(),
      new NullAuditProvider({}).getGuarantees(),
      fileProvider().getGuarantees()
    ];
    for (const report of reports) {
      expect(report).not.toHaveProperty('durable');
    }
  });

  test('a provider that has not stated its durability claims nothing', () => {
    // Silence rather than a default claim: a subclass that buffers and forgets
    // to say so must not inherit an assertion that it writes immediately.
    expect(new SilentProvider({}).getGuarantees().durability).toBeNull();
  });

  test('the inert provider stores nothing, so durability does not apply', () => {
    expect(new NullAuditProvider({}).getGuarantees().durability).toBeNull();
  });

  test('the file provider reports the window in which records can be lost', async () => {
    const provider = fileProvider();
    await provider.initialize();
    const durability = provider.getGuarantees().durability;
    expect(durability).not.toBeNull();
    // The facts an operator needs: how long a record may sit in memory, how
    // many may be held, and whether a write is flushed to disk before it is
    // reported as stored.
    expect(durability?.bufferedForMs).toBe(30000);
    expect(durability?.bufferedRecords).toBe(1000);
    expect(durability?.fsync).toBe(false);
    await provider.close();
  });

  test('the reported buffering follows configuration rather than a constant', async () => {
    const provider = fileProvider({
      'ngdpbase.audit.flushinterval': 500,
      'ngdpbase.audit.maxqueuesize': 5
    });
    await provider.initialize();
    expect(provider.getGuarantees().durability?.bufferedForMs).toBe(500);
    expect(provider.getGuarantees().durability?.bufferedRecords).toBe(5);
    await provider.close();
  });

  test('tamper evidence is still reported, and is separate from durability', () => {
    // The original defect was deriving durability from chainEnabled(). The two
    // are unrelated properties and must not move together.
    const report = new SilentProvider({}).getGuarantees();
    expect(report.tamperEvident).toBe(true);
    expect(report.durability).toBeNull();
  });
});
