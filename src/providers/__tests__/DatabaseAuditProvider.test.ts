/**
 * #1537 — the audit log in the application database: the hash chain on every
 * row, retention by checkpoint, a `refuse` event written in order with the
 * queue, `continue` events buffered, the guarantees reported, and the entries
 * about one person.
 *
 * Every assertion about storage reads the database file through a separate
 * connection or `readAuditChain`, never the provider's memory. Every test
 * works in its own temp directory and removes only that.
 */
vi.unmock('../BaseAuditProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import SqliteDatabaseProvider, { type SqliteHandle } from '../SqliteDatabaseProvider';
import DATABASE_MIGRATIONS from '../databaseMigrations';
import DatabaseAuditProvider, { readAuditChain } from '../DatabaseAuditProvider';
import { verifyLog } from '../../utils/auditChain';
import { recordIsAbout } from '../BaseAuditProvider';
import logger from '../../utils/logger';

const NEVER = 10 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

let dir: string;
let file: string;
let database: SqliteDatabaseProvider;

interface Harness {
  provider: DatabaseAuditProvider;
  maintenance: ReturnType<typeof vi.fn>;
}

function makeProvider(overrides: Record<string, unknown> = {}, door: { encrypted?: boolean; enabled?: boolean; unavailable?: string | null } = {}): Harness {
  const config: Record<string, unknown> = {
    'ngdpbase.audit.flushinterval': NEVER,
    'ngdpbase.audit.maxqueuesize': 1000,
    'ngdpbase.audit.retentiondays': 90,
    ...overrides
  };
  const maintenance = vi.fn();
  const engine = {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') return { getProperty: (k: string, d: unknown) => (k in config ? config[k] : d) };
      if (name === 'DatabaseManager') {
        return {
          isEnabled: () => door.enabled ?? true,
          isEncrypted: () => door.encrypted ?? false,
          getUnavailableReason: () => door.unavailable ?? null,
          getHandle: () => database.handle
        };
      }
      if (name === 'BackgroundJobManager') return { registerMaintenance: maintenance };
      if (name === 'PolicyInformationPoint') return { systemPrincipalName: () => 'svc-ngdpbase' };
      return null;
    }
  } as never;
  return { provider: new DatabaseAuditProvider(engine), maintenance };
}

const event = (eventType: string, extra: Record<string, unknown> = {}) => ({
  eventType, user: 'jim', action: eventType, result: 'success', severity: 'low', ...extra
}) as never;

/** What is stored now, through a connection of its own. */
function stored(): { records: Record<string, unknown>[]; start: { seq: number; hash: string } | null } {
  return SqliteDatabaseProvider.readOnce(file, '', readAuditChain);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1537-'));
  file = path.join(dir, 'app.db');
  database = new SqliteDatabaseProvider(file, '', DATABASE_MIGRATIONS);
});

afterEach(() => {
  vi.useRealTimers();
  database.close();
  // Only the per-test temp directory — never a live data tree.
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('initialize', () => {
  test('refuses without an open application database, naming the key to set', async () => {
    await expect(makeProvider({}, { enabled: false }).provider.initialize()).rejects.toThrow(/ngdpbase\.database\.provider/);
  });

  test('refuses while the application database is unavailable, with its reason', async () => {
    await expect(makeProvider({}, { unavailable: 'wrong key' }).provider.initialize()).rejects.toThrow(/wrong key/);
  });

  test('registers retention as a maintenance job', async () => {
    const { provider, maintenance } = makeProvider();
    await provider.initialize();
    expect(maintenance).toHaveBeenCalledWith(expect.objectContaining({ id: 'audit.database-retention' }));
    await provider.close();
  });
});

describe('the hash chain (#1119 contract)', () => {
  test('every row is stamped, and the stored chain verifies', async () => {
    const { provider } = makeProvider();
    await provider.initialize();
    for (let i = 0; i < 5; i++) await provider.logAuditEvent(event('page-edit', { resource: `P${i}` }));
    await provider.flush();

    const { records, start } = stored();
    expect(start).toBeNull();
    expect(records.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(verifyLog(records).ok).toBe(true);
    await provider.close();
  });

  test('an edited row breaks verification', async () => {
    const { provider } = makeProvider();
    await provider.initialize();
    for (let i = 0; i < 3; i++) await provider.logAuditEvent(event('page-edit'));
    await provider.close();

    const row = database.handle.prepare('SELECT row_id, record FROM audit_events WHERE seq = 2').get() as { row_id: number; record: string };
    const edited = { ...JSON.parse(row.record) as Record<string, unknown>, user: 'mallory' };
    database.handle.prepare('UPDATE audit_events SET record = ? WHERE row_id = ?').run(JSON.stringify(edited), row.row_id);

    const verdict = verifyLog(stored().records);
    expect(verdict.ok).toBe(false);
    expect(verdict.segments[0].verdict.reason).toMatch(/hash does not match/);
  });

  test('a deleted row is a sequence gap', async () => {
    const { provider } = makeProvider();
    await provider.initialize();
    for (let i = 0; i < 4; i++) await provider.logAuditEvent(event('page-edit'));
    await provider.close();
    database.handle.prepare('DELETE FROM audit_events WHERE seq = 2').run();
    expect(verifyLog(stored().records).segments[0].verdict.reason).toMatch(/sequence gap/);
  });

  test('a new provider on the same database continues the chain rather than restarting it', async () => {
    const first = makeProvider().provider;
    await first.initialize();
    await first.logAuditEvent(event('page-edit'));
    await first.logAuditEvent(event('page-edit'));
    await first.close();

    const second = makeProvider().provider;
    await second.initialize();
    await second.logAuditEvent(event('page-edit'));
    await second.close();

    const { records } = stored();
    expect(records.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(verifyLog(records).ok).toBe(true);
  });
});

describe('writes: continue is buffered, refuse is written in order', () => {
  test('a continue event waits in memory until the flush', async () => {
    const { provider } = makeProvider();
    await provider.initialize();
    await provider.logAuditEvent(event('page-edit'));
    expect(stored().records).toHaveLength(0);
    await provider.flush();
    expect(stored().records).toHaveLength(1);
    await provider.close();
  });

  test('the queue is written in one go when it reaches maxqueuesize', async () => {
    const { provider } = makeProvider({ 'ngdpbase.audit.maxqueuesize': 3 });
    await provider.initialize();
    await provider.logAuditEvent(event('page-edit'));
    await provider.logAuditEvent(event('page-edit'));
    expect(stored().records).toHaveLength(0);
    await provider.logAuditEvent(event('page-edit'));
    expect(stored().records.map((r) => r.seq)).toEqual([1, 2, 3]);
    await provider.close();
  });

  test('the flush interval writes the queue', async () => {
    vi.useFakeTimers();
    const { provider } = makeProvider({ 'ngdpbase.audit.flushinterval': 1000 });
    await provider.initialize();
    await provider.logAuditEvent(event('page-edit'));
    expect(stored().records).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(stored().records).toHaveLength(1);
    await provider.close();
  });

  // Sabotaged once (#1537): with writeEvent's refuse branch disabled, this test,
  // the next one and the witness test went red.
  test('a refuse event writes the queue and itself before it returns, in chain order', async () => {
    const { provider } = makeProvider();
    await provider.initialize();
    await provider.logAuditEvent(event('page-edit'));
    await provider.logAuditEvent(event('page-edit'));
    expect(stored().records).toHaveLength(0);
    await provider.logAuditEvent(event('token-mint'));

    const { records } = stored();
    expect(records.map((r) => [r.seq, r.eventType])).toEqual([[1, 'page-edit'], [2, 'page-edit'], [3, 'token-mint']]);
    expect(verifyLog(records).ok).toBe(true);
    await provider.close();
  });

  test('a refuse event that cannot be written rejects, and nothing queued is lost', async () => {
    const { provider } = makeProvider();
    await provider.initialize();
    await provider.logAuditEvent(event('page-edit'));
    // Sabotage: the table is gone, so the transaction fails.
    database.handle.exec('ALTER TABLE audit_events RENAME TO audit_events_away');
    await expect(provider.logAuditEvent(event('token-mint'))).rejects.toThrow();
    database.handle.exec('ALTER TABLE audit_events_away RENAME TO audit_events');

    await provider.flush();
    const { records } = stored();
    expect(records.map((r) => r.eventType)).toEqual(['page-edit', 'token-mint']);
    expect(verifyLog(records).ok).toBe(true);
    await provider.close();
  });
});

describe('retention by checkpoint', () => {
  test('removes the rows past the window in one transaction with a checkpoint, and the rest verifies from it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { provider } = makeProvider({ 'ngdpbase.audit.retentiondays': 30 });
    await provider.initialize();
    for (let i = 0; i < 3; i++) await provider.logAuditEvent(event('page-edit'));
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'));
    for (let i = 0; i < 2; i++) await provider.logAuditEvent(event('page-edit'));
    await provider.flush();
    const before = stored().records;

    await provider.cleanup();
    await provider.flush();

    const { records, start } = stored();
    expect(start).toEqual({ seq: 3, hash: before[2].hash });
    const checkpoint = database.handle.prepare('SELECT * FROM audit_checkpoints').all() as Array<Record<string, unknown>>;
    expect(checkpoint).toHaveLength(1);
    expect(checkpoint[0]).toMatchObject({ seq: 3, removed: 3, retention_days: 30 });

    // The two kept, then the purge record.
    expect(records.map((r) => r.seq)).toEqual([4, 5, 6]);
    expect(verifyLog(records, start ? { start } : {}).ok).toBe(true);
    // From genesis it does not verify: retention removed its beginning.
    expect(verifyLog(records).ok).toBe(false);

    const purge = records[2];
    expect(purge).toMatchObject({ eventType: 'security-event', action: 'audit-archive-purge', user: 'svc-ngdpbase', severity: 'high' });
    expect(purge.metadata).toMatchObject({ origin: 'schedule', removed: 3, checkpointSeq: 3, retentionDays: 30 });
    await provider.close();
  });

  test('a chain pruned to nothing continues from the checkpoint after a restart', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const first = makeProvider({ 'ngdpbase.audit.retentiondays': 30 }).provider;
    await first.initialize();
    for (let i = 0; i < 2; i++) await first.logAuditEvent(event('page-edit'));
    await first.close();
    const head = stored().records[1];
    database.handle.exec('DELETE FROM audit_events');
    database.handle.prepare(`INSERT INTO audit_checkpoints (through_row, seq, hash, removed, cutoff, retention_days, created_at)
      VALUES (2, 2, ?, 2, '2026-01-01', 30, '2026-01-01')`).run(head.hash);

    const second = makeProvider({ 'ngdpbase.audit.retentiondays': 0 }).provider;
    await second.initialize();
    await second.logAuditEvent(event('page-edit'));
    await second.close();

    const { records, start } = stored();
    expect(records.map((r) => r.seq)).toEqual([3]);
    expect(verifyLog(records, start ? { start } : {}).ok).toBe(true);
  });

  test('nothing past the window: no row removed, no checkpoint, nothing recorded', async () => {
    const { provider } = makeProvider();
    await provider.initialize();
    await provider.logAuditEvent(event('page-edit'));
    await provider.flush();
    await provider.cleanup();
    await provider.flush();
    expect(stored().records).toHaveLength(1);
    expect(database.handle.prepare('SELECT COUNT(*) AS n FROM audit_checkpoints').get()).toEqual({ n: 0 });
    await provider.close();
  });
});

describe('guarantees', () => {
  test('an unencrypted database is reported and warned, never refused', async () => {
    vi.mocked(logger.warn).mockClear();
    const { provider } = makeProvider({}, { encrypted: false });
    await provider.initialize();
    expect(provider.getGuarantees()).toMatchObject({ tamperEvident: true, queryable: true, encryptedAtRest: false, headWitness: null });
    expect(vi.mocked(logger.warn).mock.calls.some(([m]) => /not encrypted/.test(String(m)))).toBe(true);
    expect(await provider.isHealthy()).toBe(true);
    await provider.close();
  });

  test('an encrypted database is reported as encrypted at rest, without the warning', async () => {
    vi.mocked(logger.warn).mockClear();
    const { provider } = makeProvider({}, { encrypted: true });
    await provider.initialize();
    expect(provider.getGuarantees().encryptedAtRest).toBe(true);
    expect(vi.mocked(logger.warn).mock.calls.some(([m]) => /not encrypted/.test(String(m)))).toBe(false);
    await provider.close();
  });

  test('durability states what is buffered and which events are committed first', async () => {
    const { provider } = makeProvider({ 'ngdpbase.audit.flushinterval': 5000, 'ngdpbase.audit.maxqueuesize': 7 });
    await provider.initialize();
    const durability = provider.getDurability();
    expect(durability).toMatchObject({ bufferedForMs: 5000, bufferedRecords: 7, fsync: false });
    expect(durability?.fsyncedClasses).toContain('token-mint');
    await provider.close();
  });

  test('the head witness is published after the write, and reported', async () => {
    const witness = path.join(dir, 'witness', 'head.jsonl');
    const { provider } = makeProvider({ 'ngdpbase.audit.chain-witness.destination': witness });
    await provider.initialize();
    await provider.logAuditEvent(event('token-mint'));
    const published = JSON.parse(fs.readFileSync(witness, 'utf8').trim()) as { seq: number; hash: string };
    expect(published).toMatchObject({ seq: 1, hash: stored().records[0].hash });
    expect(provider.getGuarantees().headWitness).toMatchObject({ destination: witness, lastSeq: 1 });
    await provider.close();
  });

  test('the health check fails when the tables are gone', async () => {
    const { provider } = makeProvider();
    await provider.initialize();
    database.handle.exec('DROP TABLE audit_checkpoints');
    expect(await provider.isHealthy()).toBe(false);
    await provider.close();
  });
});

describe('queries', () => {
  async function seeded(overrides: Record<string, unknown> = {}): Promise<DatabaseAuditProvider> {
    const { provider } = makeProvider(overrides);
    await provider.initialize();
    await provider.logAuditEvent(event('page-edit', { user: 'jim', resource: 'A' }));
    await provider.logAuditEvent(event('page-delete', { user: 'ann', resource: 'B', severity: 'high' }));
    // Ann acting for mom under a proxy grant: mom is the user, ann the actor.
    await provider.logAuditEvent(event('page-read', { user: 'mom', actor: 'ann', resource: 'C' }));
    // An admin revoking jim's token: the owner is jim.
    await provider.logAuditEvent(event('token-revoke', { user: 'admin', metadata: { owner: 'jim' } }));
    await provider.logAuditEvent(event('page-edit', { user: 'bob', resource: 'D' }));
    return provider;
  }

  test('search filters by the indexed fields, newest first, a page at a time', async () => {
    const provider = await seeded();
    const byUser = await provider.searchAuditLogs({ user: 'ann' });
    expect(byUser.results.map((r) => r.eventType)).toEqual(['page-delete']);
    expect((await provider.searchAuditLogs({ actor: 'ann' })).total).toBe(1);
    expect((await provider.searchAuditLogs({ eventType: 'page-edit' })).total).toBe(2);
    expect((await provider.searchAuditLogs({ resource: 'D' })).results[0]).toMatchObject({ user: 'bob' });

    const page = await provider.searchAuditLogs({}, { limit: 2, offset: 1, sortBy: 'seq' });
    expect(page).toMatchObject({ total: 5, limit: 2, offset: 1, hasMore: true });
    expect(page.results.map((r) => (r as unknown as { seq: number }).seq)).toEqual([4, 3]);
    await provider.close();
  });

  test('a page is never larger than max-results', async () => {
    const provider = await seeded({ 'ngdpbase.audit.provider.database.max-results': 2 });
    const page = await provider.searchAuditLogs({}, { limit: 1000 });
    expect(page.results).toHaveLength(2);
    expect(page.limit).toBe(2);
    await provider.close();
  });

  test('stats are counted in the database', async () => {
    const provider = await seeded();
    const stats = await provider.getAuditStats();
    expect(stats).toMatchObject({ totalEvents: 5, securityIncidents: 1 });
    expect(stats.eventsByType).toMatchObject({ 'page-edit': 2, 'page-delete': 1 });
    expect(stats.eventsByUser).toMatchObject({ jim: 1, ann: 1, mom: 1 });
    expect(stats.recentActivity).toHaveLength(5);
    await provider.close();
  });

  test('export is the stored records', async () => {
    const provider = await seeded();
    const exported = JSON.parse(await provider.exportAuditLogs({ user: 'bob' }, 'json')) as Array<Record<string, unknown>>;
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({ user: 'bob', seq: 5 });
    await provider.close();
  });

  test('the entries about a person: as the user, as the actor, or as the owner — and nobody else\'s', async () => {
    const provider = await seeded();
    const jim = await provider.searchEntriesAbout('jim');
    expect(jim.results.map((r) => r.eventType).sort()).toEqual(['page-edit', 'token-revoke']);
    const ann = await provider.searchEntriesAbout('ann');
    expect(ann.results.map((r) => r.eventType).sort()).toEqual(['page-delete', 'page-read']);
    const mom = await provider.searchEntriesAbout('mom');
    expect(mom.results.map((r) => r.eventType)).toEqual(['page-read']);
    expect((await provider.searchEntriesAbout('nobody')).total).toBe(0);

    const paged = await provider.searchEntriesAbout('jim', { limit: 1 });
    expect(paged).toMatchObject({ total: 2, limit: 1, hasMore: true });
    await provider.close();
  });

  test('the owner is matched by identity @id on new rows and by username on old ones, none rewritten (#2041)', async () => {
    const provider = await seeded();
    // A row written from #2041 on names jim's resource by his identity @id.
    await provider.logAuditEvent(event('token-mint', { user: 'admin', metadata: { owner: 'urn:uuid:jim-1' } }));
    // Sabotage check: dropping the `OR owner = ?` for ownerId leaves token-mint out.
    const jim = await provider.searchEntriesAbout('jim', { ownerId: 'urn:uuid:jim-1' });
    expect(jim.results.map((r) => r.eventType).sort()).toEqual(['page-edit', 'token-mint', 'token-revoke']);
    // The older row keeps its username owner: read back exactly as written.
    const old = (await provider.searchAuditLogs({ eventType: 'token-revoke' })).results[0] as unknown as { metadata: { owner: string } };
    expect(old.metadata.owner).toBe('jim');
    // Without the @id only the username rows match.
    expect((await provider.searchEntriesAbout('jim')).results.map((r) => r.eventType).sort()).toEqual(['page-edit', 'token-revoke']);
    await provider.close();
  });

  test('a row naming the owner by @id lists by the username beside it once the account (and its @id) is gone', async () => {
    const provider = await seeded();
    await provider.logAuditEvent(event('token-mint', { user: 'admin', metadata: { owner: 'urn:uuid:gone-1', ownerUser: 'gone' } }));
    // The account is deleted: no @id to pass. Sabotage check: dropping `OR owner_user = ?` leaves this empty.
    const rows = await provider.searchEntriesAbout('gone');
    expect(rows.results.map((r) => r.eventType)).toEqual(['token-mint']);
    await provider.close();
  });
});

describe('recordIsAbout (#1537, #2041)', () => {
  test('a row is about a user by username, actor, owner username or owner @id', () => {
    expect(recordIsAbout({ user: 'jim' }, 'jim')).toBe(true);
    expect(recordIsAbout({ user: 'x', actor: 'jim' }, 'jim')).toBe(true);
    expect(recordIsAbout({ user: 'x', metadata: { owner: 'jim' } }, 'jim', 'urn:uuid:jim-1')).toBe(true);
    // Sabotage check: without the ownerId clause in recordIsAbout this is false.
    expect(recordIsAbout({ user: 'x', metadata: { owner: 'urn:uuid:jim-1' } }, 'jim', 'urn:uuid:jim-1')).toBe(true);
    expect(recordIsAbout({ user: 'x', metadata: { owner: 'urn:uuid:ann-1' } }, 'jim', 'urn:uuid:jim-1')).toBe(false);
    expect(recordIsAbout({ user: 'x', metadata: { owner: 'urn:uuid:jim-1' } }, 'jim')).toBe(false);
    // The username beside the @id: listed with no @id, as for a deleted account.
    // Sabotage check: without the recordOwnerUser clause this is false.
    expect(recordIsAbout({ user: 'x', metadata: { owner: 'urn:uuid:jim-1', ownerUser: 'jim' } }, 'jim')).toBe(true);
  });
});
