/**
 * ReviewManager (#2072): requests filed by add-ons, decided by the holders of
 * a permission, carried out by the add-on's handler.
 *
 * The store is a real SQLCipher database (SqliteDatabaseProvider with the core
 * ledger) in a per-test mkdtemp folder, removed afterwards (never a data/
 * tree). The PDP, notifications, configuration and the audit sink are
 * stand-ins.
 *
 * Sabotaged once each (then restored), and the named test went red:
 * - listOpen's PDP check (pushed every row): "only a decider sees it";
 * - decide's requireDecider (skipped): "a non-decider cannot decide";
 * - the usersHolding target list (sent targetUsers: []): "tells the holders";
 * - the handler call passing a system context instead of ctx: "runs the handler with the decider's context";
 * - the failure write in decide (also set the status approved): "a failing handler leaves it open";
 * - the encryption check in initialize (opened an unencrypted database): "refuses an unencrypted database";
 * - registerHandler's owner check (removed): "only its own prefix";
 * - the KeyedSerial key in decide (a fresh key per call): "two approvals at once run the handler once";
 * - the audit record on approve (removed): "records filed and approved".
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import ReviewManager, {
  ReviewHandlerFailedError, ReviewInputError, ReviewNotOpenError, ReviewRefusedError, ReviewsUnavailableError
} from '../ReviewManager';
import SqliteDatabaseProvider from '../../providers/SqliteDatabaseProvider';
import DATABASE_MIGRATIONS from '../../providers/databaseMigrations';
import { buildAddonHost } from '../../utils/addonHost';
import type { ActorContext } from '../../context/ActorContext';

interface Subj { username: string; isAuthenticated: boolean; roles: string[]; ipAddress?: string }
const user = (username: string): ActorContext => ({ username, roles: ['reader'], isAuthenticated: true, ipAddress: '192.0.2.10' }) as never;
const anonymous: ActorContext = { username: 'anonymous', roles: ['anonymous'], isAuthenticated: false } as never;

const DEFINITIONS = {
  'user-create': { description: 'Create accounts' },
  'admin-system': { description: 'Run the site' },
  'job-failed': { description: 'A job failed', grantable: false }
};

describe('ReviewManager (#2072)', () => {
  let dir: string;
  // The provider's shape as this test uses it (the class's own type is not seen by lint from tests).
  let provider: { handle: { prepare(sql: string): { run(...a: unknown[]): unknown; get(...a: unknown[]): unknown; all(...a: unknown[]): unknown[] } }; storage(): { encrypted: boolean }; close(): Promise<void> | void } | null;
  let key: string;
  let grants: Record<string, Set<string>>;
  let notices: Array<{ title: string; message: string; targetUsers: string[] }>;
  let audited: Array<Record<string, unknown>>;
  let settings: Record<string, unknown>;
  let rm: ReviewManager;

  const managers = (): Record<string, unknown> => ({
    ConfigurationManager: { getProperty: (k: string, d: unknown) => (k in settings ? settings[k] : d) },
    DatabaseManager: {
      isEnabled: () => provider !== null,
      isEncrypted: () => provider?.storage().encrypted ?? false,
      getHandle: () => provider.handle
    },
    PolicyDecisionPoint: {
      decide: (s: Subj, r: { action: string }) => Promise.resolve(
        grants[s.username]?.has(r.action) ? { permit: true, applicable: true, reason: 'policy' } : { permit: false, applicable: true, reason: 'no_policy' }),
      permits: (s: Subj, a: string) => Promise.resolve(Boolean(grants[s.username]?.has(a))),
      usersHolding: (a: string) => Promise.resolve(Object.keys(grants).filter((u) => grants[u].has(a)))
    },
    NotificationManager: { createNotification: (n: { title: string; message: string; targetUsers: string[] }) => { notices.push(n); return Promise.resolve('n1'); } },
    AuditManager: {
      logAuditEvent: (e: Record<string, unknown>) => { audited.push(e); return Promise.resolve('evt'); },
      flushAuditQueue: () => Promise.resolve()
    }
  });

  const build = async (): Promise<ReviewManager> => {
    const all = managers();
    const manager = new ReviewManager({ getManager: (n: string) => all[n] ?? null });
    await manager.initialize();
    return manager;
  };

  const input = (over: Record<string, unknown> = {}): never => ({
    kind: 'accommodation.new-owner',
    subject: 'Unit 12B',
    summary: 'Add Pat Lee as an owner of unit 12B',
    details: { Name: 'Pat Lee', Email: 'pat-marker-7781@example.test' },
    decidePermission: 'user-create',
    handlerId: 'accommodation.new-owner',
    ...over
  }) as never;

  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reviews-2072-'));
    key = randomBytes(16).toString('hex');
    provider = new SqliteDatabaseProvider(path.join(dir, 'ngdpbase.db'), key, DATABASE_MIGRATIONS);
    grants = { dana: new Set(['user-create']), root: new Set(['admin-system']), ann: new Set() };
    notices = [];
    audited = [];
    settings = { 'ngdpbase.permissions.definitions': DEFINITIONS };
    rm = await build();
    rm.registerHandler('accommodation', 'accommodation.new-owner', () => Promise.resolve({ summary: 'Account created and invitation sent' }));
  });

  afterEach(async () => {
    await provider?.close();
    // Only this test's own mkdtemp folder.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('who sees and decides', () => {
    test('only a decider sees it in listOpen, and only a decider may get it', async () => {
      const filed = await rm.fileRequest(anonymous, input());
      expect((await rm.listOpen(user('dana'))).map((r) => r.id)).toEqual([filed.id]);
      expect(await rm.listOpen(user('ann'))).toEqual([]);
      expect(await rm.listOpen(user('root'))).toEqual([]); // admin-system is not user-create: a permission decides, not a role
      expect((await rm.get(user('dana'), filed.id))?.subject).toBe('Unit 12B');
      await expect(rm.get(user('ann'), filed.id)).rejects.toBeInstanceOf(ReviewRefusedError);
    });

    test('a non-decider cannot decide: refused, nothing changed, no handler run', async () => {
      const run = vi.fn(() => Promise.resolve({ summary: 'done' }));
      rm.registerHandler('accommodation', 'accommodation.new-owner', run);
      const filed = await rm.fileRequest(anonymous, input());
      await expect(rm.decide(user('ann'), filed.id, 'approve')).rejects.toBeInstanceOf(ReviewRefusedError);
      expect(run).not.toHaveBeenCalled();
      expect((await rm.get(user('dana'), filed.id))?.status).toBe('open');
    });

    test('a request names a permission the site grants, never an unknown or ungrantable one', async () => {
      await expect(rm.fileRequest(anonymous, input({ decidePermission: 'owner' }))).rejects.toBeInstanceOf(ReviewInputError);
      await expect(rm.fileRequest(anonymous, input({ decidePermission: 'job-failed' }))).rejects.toBeInstanceOf(ReviewInputError);
    });
  });

  test('a request from the anonymous subject (spelt Anonymous) is filed by "anonymous"', async () => {
    const filed = await rm.fileRequest({ username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false }, input());
    expect(filed.filedBy).toBe('anonymous');
  });

  describe('notifying', () => {
    test('tells the holders of the permission when it is filed', async () => {
      await rm.fileRequest(anonymous, input());
      await tick();
      expect(notices).toHaveLength(1);
      expect(notices[0].targetUsers).toEqual(['dana']);
      expect(notices[0].message).toContain('/reviews');
    });

    test('nobody holding it is log-only: no notice to everyone', async () => {
      grants = { ann: new Set() };
      await rm.fileRequest(anonymous, input());
      await tick();
      expect(notices).toEqual([]);
    });
  });

  describe('deciding', () => {
    test('approve runs the handler with the decider\'s context and records its summary', async () => {
      const seen: ActorContext[] = [];
      rm.registerHandler('accommodation', 'accommodation.new-owner', (_req, ctx) => { seen.push(ctx); return Promise.resolve({ summary: 'Account created and invitation sent' }); });
      const filed = await rm.fileRequest(anonymous, input());
      const dana = user('dana');
      const approved = await rm.decide(dana, filed.id, 'approve', 'Checked the deed');
      expect(seen).toEqual([dana]);
      expect(seen[0]).toBe(dana);
      expect(approved.status).toBe('approved');
      expect(approved.outcome).toBe('Account created and invitation sent');
      expect(approved.decidedBy).toBe('dana');
      expect(approved.note).toBe('Checked the deed');
      expect(await rm.listOpen(dana)).toEqual([]);
    });

    test('a failing handler leaves it open with the reason, and a later approval completes it', async () => {
      let fail = true;
      rm.registerHandler('accommodation', 'accommodation.new-owner', () =>
        (fail ? Promise.reject(new Error('Email is not working, so no invitation was sent')) : Promise.resolve({ summary: 'Invitation sent' })));
      const filed = await rm.fileRequest(anonymous, input());
      const err = await rm.decide(user('dana'), filed.id, 'approve').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ReviewHandlerFailedError);
      expect((err as ReviewHandlerFailedError).reason).toBe('Email is not working, so no invitation was sent');
      const open = (await rm.listOpen(user('dana')))[0];
      expect(open.status).toBe('open');
      expect(open.failure).toBe('Email is not working, so no invitation was sent');
      expect(open.failedAt).toEqual(expect.any(String));
      fail = false;
      const approved = await rm.decide(user('dana'), filed.id, 'approve');
      expect(approved.status).toBe('approved');
      expect(approved.failure).toBeNull();
    });

    test('an add-on that is not running leaves the request open, saying so', async () => {
      const filed = await rm.fileRequest(anonymous, input());
      rm.unregisterHandlers('accommodation');
      await expect(rm.decide(user('dana'), filed.id, 'approve')).rejects.toBeInstanceOf(ReviewHandlerFailedError);
      expect((await rm.get(user('dana'), filed.id))?.failure).toContain('not running');
    });

    test('reject runs no handler, closes it, and a second decision is refused', async () => {
      const run = vi.fn(() => Promise.resolve({ summary: 'done' }));
      rm.registerHandler('accommodation', 'accommodation.new-owner', run);
      const filed = await rm.fileRequest(anonymous, input());
      const rejected = await rm.decide(user('dana'), filed.id, 'reject', 'Not an owner');
      expect(rejected.status).toBe('rejected');
      expect(rejected.note).toBe('Not an owner');
      expect(run).not.toHaveBeenCalled();
      await expect(rm.decide(user('dana'), filed.id, 'approve')).rejects.toBeInstanceOf(ReviewNotOpenError);
      expect(run).not.toHaveBeenCalled();
    });

    test('two approvals at once run the handler once', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const run = vi.fn(async () => { await gate; return { summary: 'done' }; });
      rm.registerHandler('accommodation', 'accommodation.new-owner', run);
      const filed = await rm.fileRequest(anonymous, input());
      const first = rm.decide(user('dana'), filed.id, 'approve');
      const second = rm.decide(user('dana'), filed.id, 'approve').catch((e: unknown) => e);
      await tick();
      release();
      expect((await first).status).toBe('approved');
      expect(await second).toBeInstanceOf(ReviewNotOpenError);
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  describe('audit', () => {
    test('records filed, approved, rejected and failed, with names and never the summary, details or note', async () => {
      const a = await rm.fileRequest(user('ann'), input());
      await rm.decide(user('dana'), a.id, 'approve', 'secret-note-123');
      const b = await rm.fileRequest(user('ann'), input());
      await rm.decide(user('dana'), b.id, 'reject');
      rm.registerHandler('accommodation', 'accommodation.new-owner', () => Promise.reject(new Error('Pat Lee could not be reached')));
      const c = await rm.fileRequest(user('ann'), input());
      await rm.decide(user('dana'), c.id, 'approve').catch(() => undefined);

      expect(audited.map((e) => [e.eventType, e.user, e.resource])).toEqual([
        ['review-filed', 'ann', a.id],
        ['review-approved', 'dana', a.id],
        ['review-filed', 'ann', b.id],
        ['review-rejected', 'dana', b.id],
        ['review-filed', 'ann', c.id],
        ['review-failed', 'dana', c.id]
      ]);
      expect(audited[1].metadata).toMatchObject({ kind: 'accommodation.new-owner', handlerId: 'accommodation.new-owner', decidePermission: 'user-create' });
      expect(audited[5].result).toBe('failure');
      const text = JSON.stringify(audited);
      for (const value of ['Pat Lee', 'pat-marker-7781', 'Unit 12B', 'secret-note-123']) expect(text).not.toContain(value);
    });
  });

  describe('storage', () => {
    test('details are encrypted at rest: not in the file, and the file does not open without the key', async () => {
      await rm.fileRequest(anonymous, input());
      await provider.close();
      provider = null;
      const file = path.join(dir, 'ngdpbase.db');
      const bytes = Buffer.concat([file, `${file}-wal`].filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f)));
      expect(bytes.includes(Buffer.from('pat-marker-7781'))).toBe(false);
      expect(() => SqliteDatabaseProvider.readOnce(file, '', (db) => db.prepare('SELECT details FROM review_requests').all())).toThrow();
      const rows = SqliteDatabaseProvider.readOnce(file, key, (db) => db.prepare('SELECT details FROM review_requests').all()) as Array<{ details: string }>;
      expect(rows[0].details).toContain('pat-marker-7781');
    });

    test('refuses an unencrypted database: nothing is filed in the clear', async () => {
      await provider.close();
      provider = new SqliteDatabaseProvider(path.join(dir, 'plain.db'), '', DATABASE_MIGRATIONS);
      const plain = await build();
      expect(plain.getUnavailableReason()).toMatch(/not encrypted/);
      plain.registerHandler('accommodation', 'accommodation.new-owner', () => Promise.resolve({ summary: 'x' }));
      await expect(plain.fileRequest(anonymous, input())).rejects.toBeInstanceOf(ReviewsUnavailableError);
      const count = provider.handle.prepare('SELECT COUNT(*) AS n FROM review_requests').get() as { n: number };
      expect(count.n).toBe(0);
    });

    test('no application database: the door is closed and says why', async () => {
      await provider.close();
      provider = null;
      const none = await build();
      expect(none.getUnavailableReason()).toMatch(/ngdpbase\.database\.provider/);
      await expect(none.listOpen(user('dana'))).rejects.toBeInstanceOf(ReviewsUnavailableError);
    });

    test('a decided request past retention is removed; an open one is kept', async () => {
      const old = await rm.fileRequest(anonymous, input());
      await rm.decide(user('dana'), old.id, 'reject');
      const waiting = await rm.fileRequest(anonymous, input());
      provider.handle.prepare('UPDATE review_requests SET decided_at = ?, filed_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', old.id);
      provider.handle.prepare('UPDATE review_requests SET filed_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', waiting.id);
      settings['ngdpbase.reviews.retention-days'] = 30;
      await rm.fileRequest(anonymous, input());
      const ids = (provider.handle.prepare('SELECT id FROM review_requests').all() as Array<{ id: string }>).map((r) => r.id);
      expect(ids).not.toContain(old.id);
      expect(ids).toContain(waiting.id);
    });
  });

  describe('an add-on\'s own prefix', () => {
    test('registerHandler takes only the owner\'s prefix', () => {
      expect(() => rm.registerHandler('forms', 'accommodation.new-owner', () => Promise.resolve({ summary: 'x' }))).toThrow(/only its own review handlers/);
    });

    test('a kind outside the handler\'s add-on is refused', async () => {
      await expect(rm.fileRequest(anonymous, input({ kind: 'forms.submission' }))).rejects.toBeInstanceOf(ReviewInputError);
    });

    test('host.registerReviewHandler and host.reviews.fileRequest hold the add-on to its slug', async () => {
      const all = { ...managers(), ReviewManager: rm };
      const host = buildAddonHost('association', {}, undefined, { getManager: (n: string) => (all as Record<string, unknown>)[n] ?? null });
      expect(() => host.registerReviewHandler('accommodation.new-owner', () => Promise.resolve({ summary: 'x' }))).toThrow(/only its own review handlers/);
      await expect(host.reviews.fileRequest(anonymous, input())).rejects.toThrow(/may file only its own review requests/);
      host.registerReviewHandler('association.occupancy', () => Promise.resolve({ summary: 'Occupancy recorded' }));
      const filed = await host.reviews.fileRequest(anonymous, input({ kind: 'association.occupancy', handlerId: 'association.occupancy' }));
      expect((await host.reviews.decide(user('dana'), filed.id, 'approve')).outcome).toBe('Occupancy recorded');
    });
  });
});
