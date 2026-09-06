/**
 * AgentTokenManager — user-delegated agent API tokens (#946).
 *
 * Uses a per-test temp directory. Nothing here touches the live data dir.
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import AgentTokenManager from '../AgentTokenManager';
import type { PermissionSubject } from '../UserManager';

let tmpDir: string;

/** A session-backed owner (#1178): mint takes the subject, not a username. */
function subject(username: string): PermissionSubject {
  return { username, roles: ['editor'], isAuthenticated: true };
}

/**
 * The permissions the mock UserManager grants. Every scope by default; a test
 * that wants a refusal names the scopes the owner lacks.
 */
let lackingScopes: string[] = [];

function makeEngine(overrides: Record<string, unknown> = {}) {
  return {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') {
        return {
          getProperty: (key: string, dflt: unknown) => (key in overrides ? overrides[key] : dflt),
          getResolvedDataPath: () => tmpDir
        };
      }
      if (name === 'UserManager' && !overrides.__noUserManager) {
        return { hasPermission: async (_s: PermissionSubject, action: string) => !lackingScopes.includes(action) };
      }
      return null;
    }
  } as never;
}

async function makeManager(overrides: Record<string, unknown> = {}): Promise<AgentTokenManager> {
  const m = new AgentTokenManager(makeEngine(overrides));
  await m.initialize();
  return m;
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-agent-tokens-'));
  lackingScopes = [];
});

describe('#1178 — a token carries only what its owner holds', () => {
  test('mints when the owner holds every effective scope', async () => {
    const m = await makeManager();
    const { record } = await m.mint(subject('jim'), 'ok', ['page-ingest']);
    expect(record.scopes).toEqual(['page-create', 'page-edit']);
  });

  test('refuses a scope the owner lacks, naming it', async () => {
    lackingScopes = ['page-delete'];
    const m = await makeManager();
    await expect(m.mint(subject('jim'), 'bad', ['page-edit', 'page-delete']))
      .rejects.toThrow(/You do not hold page-delete/);
    expect(m.listForOwner('jim')).toHaveLength(0);
  });

  test('checks the expanded scopes, so an alias cannot smuggle one in', async () => {
    lackingScopes = ['page-create'];
    const m = await makeManager();
    await expect(m.mint(subject('jim'), 'alias', ['page-ingest'])).rejects.toThrow(/You do not hold page-create/);
  });

  test('names every missing scope, in the order requested', async () => {
    lackingScopes = ['page-delete', 'page-rename'];
    const m = await makeManager();
    await expect(m.mint(subject('jim'), 'two', ['page-delete', 'page-edit', 'page-rename']))
      .rejects.toThrow(/You do not hold page-delete, page-rename/);
  });

  test('with no UserManager there is no answer, and no answer is a refusal', async () => {
    const m = await makeManager({ __noUserManager: true });
    await expect(m.mint(subject('jim'), 'x', ['page-edit'])).rejects.toThrow(/cannot be verified/);
  });

  test('admin-* and token-mint are refused before policy is even asked', async () => {
    const m = await makeManager();
    await expect(m.mint(subject('jim'), 'x', ['admin-system'])).rejects.toThrow(/admin scopes/);
    await expect(m.mint(subject('jim'), 'x', ['token-mint'])).rejects.toThrow(/never mints/);
  });
});

afterEach(async () => {
  // Only ever removes this test's own temp dir.
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('AgentTokenManager (#946)', () => {
  describe('mint', () => {
    test('returns a prefixed cleartext token and a record without the hash', async () => {
      const m = await makeManager();
      const { token, record } = await m.mint(subject('jim'), 'claude-laptop', ['page-ingest']);

      expect(token.startsWith('ngdp_at_')).toBe(true);
      expect(token.length).toBeGreaterThan(40);
      expect(record.owner).toBe('jim');
      expect(record.name).toBe('claude-laptop');
      // 'page-ingest' is an alias — stored expanded to real action names.
      expect(record.scopes).toEqual(['page-create', 'page-edit']);
      expect((record as Record<string, unknown>).hash).toBeUndefined();
      expect(record.prefix.startsWith('ngdp_at_')).toBe(true);
    });

    test('two mints never collide', async () => {
      const m = await makeManager();
      const a = await m.mint(subject('jim'), 'a', ['page-ingest']);
      const b = await m.mint(subject('jim'), 'b', ['page-ingest']);
      expect(a.token).not.toBe(b.token);
      expect(a.record.id).not.toBe(b.record.id);
    });

    test('the cleartext token is never written to disk', async () => {
      const m = await makeManager();
      const { token } = await m.mint(subject('jim'), 'claude-laptop', ['page-ingest']);
      const onDisk = await fs.readFile(path.join(tmpDir, 'agent-tokens.json'), 'utf8');
      expect(onDisk).not.toContain(token);
      expect(onDisk).toContain('sha256:');
    });

    test('rejects an unscoped token rather than treating it as unrestricted', async () => {
      const m = await makeManager();
      await expect(m.mint(subject('jim'), 'x', [])).rejects.toThrow(/scope/i);
    });

    test('refuses token-mint as a scope — a token never mints a token (#1198)', async () => {
      const m = await makeManager();
      await expect(m.mint(subject('jim'), 'x', ['page-ingest', 'token-mint'])).rejects.toThrow(/never mints/);
    });

    test('refuses admin-* scopes outright', async () => {
      const m = await makeManager();
      await expect(m.mint(subject('jim'), 'x', ['page-ingest', 'admin-system'])).rejects.toThrow(/admin/i);
      await expect(m.mint(subject('jim'), 'x', ['admin-roles'])).rejects.toThrow(/admin/i);
    });

    test('requires a name', async () => {
      const m = await makeManager();
      await expect(m.mint(subject('jim'), '   ', ['page-ingest'])).rejects.toThrow(/name/i);
    });

    test('rejects a TTL above the configured maximum', async () => {
      const m = await makeManager();
      await expect(m.mint(subject('jim'), 'x', ['page-ingest'], 48)).rejects.toThrow(/maximum/i);
    });

    test('honours a raised max-ttl-hours', async () => {
      const m = await makeManager({ 'ngdpbase.auth.agent-token.max-ttl-hours': 72 });
      const { record } = await m.mint(subject('jim'), 'x', ['page-ingest'], 48);
      expect(record.expiresAt).toBeTruthy();
    });

    test('enforces the per-user live-token cap', async () => {
      const m = await makeManager({ 'ngdpbase.auth.agent-token.max-per-user': 2 });
      await m.mint(subject('jim'), 'a', ['page-ingest']);
      await m.mint(subject('jim'), 'b', ['page-ingest']);
      await expect(m.mint(subject('jim'), 'c', ['page-ingest'])).rejects.toThrow(/limit/i);
      // Another user is unaffected.
      await expect(m.mint(subject('molly'), 'a', ['page-ingest'])).resolves.toBeTruthy();
    });

    test('a revoked token frees a slot under the cap', async () => {
      const m = await makeManager({ 'ngdpbase.auth.agent-token.max-per-user': 1 });
      const first = await m.mint(subject('jim'), 'a', ['page-ingest']);
      await expect(m.mint(subject('jim'), 'b', ['page-ingest'])).rejects.toThrow(/limit/i);
      await m.revoke(first.record.id, 'jim');
      await expect(m.mint(subject('jim'), 'b', ['page-ingest'])).resolves.toBeTruthy();
    });
  });

  describe('verify', () => {
    test('accepts a freshly minted token and returns the owner', async () => {
      const m = await makeManager();
      const { token } = await m.mint(subject('jim'), 'claude-laptop', ['page-ingest']);
      const record = await m.verify(token);
      expect(record?.owner).toBe('jim');
      expect(record?.scopes).toEqual(['page-create', 'page-edit']);
    });

    test('rejects an unknown token', async () => {
      const m = await makeManager();
      await m.mint(subject('jim'), 'x', ['page-ingest']);
      expect(await m.verify('ngdp_at_totallyMadeUpValue')).toBeNull();
    });

    test('rejects a value without the prefix', async () => {
      const m = await makeManager();
      const { token } = await m.mint(subject('jim'), 'x', ['page-ingest']);
      expect(await m.verify(token.replace('ngdp_at_', ''))).toBeNull();
    });

    test('rejects an expired token', async () => {
      const m = await makeManager();
      const { token } = await m.mint(subject('jim'), 'x', ['page-ingest'], 1);
      const twoHoursLater = Date.now() + 2 * 3_600_000;
      expect(await m.verify(token, twoHoursLater)).toBeNull();
    });

    test('rejects a revoked token immediately', async () => {
      const m = await makeManager();
      const { token, record } = await m.mint(subject('jim'), 'x', ['page-ingest']);
      expect(await m.verify(token)).not.toBeNull();
      await m.revoke(record.id, 'jim');
      expect(await m.verify(token)).toBeNull();
    });

    test('stamps lastUsedAt', async () => {
      const m = await makeManager();
      const { token, record } = await m.mint(subject('jim'), 'x', ['page-ingest']);
      expect(m.getById(record.id)?.lastUsedAt).toBeNull();
      await m.verify(token);
      expect(m.getById(record.id)?.lastUsedAt).not.toBeNull();
    });

    test('does not store roles on the token — only the owner reference', async () => {
      // Permissions must resolve live from the user record; a snapshot here
      // would let a demoted user keep their old authority via an old token.
      const m = await makeManager();
      const { record } = await m.mint(subject('jim'), 'x', ['page-ingest']);
      expect(Object.keys(record)).not.toContain('roles');
      const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, 'agent-tokens.json'), 'utf8'));
      expect(JSON.stringify(onDisk)).not.toContain('"roles"');
    });
  });

  describe('listing and revocation', () => {
    test('listForOwner returns only that owner\'s live tokens', async () => {
      const m = await makeManager();
      await m.mint(subject('jim'), 'a', ['page-ingest']);
      await m.mint(subject('molly'), 'b', ['page-ingest']);
      expect(m.listForOwner('jim')).toHaveLength(1);
      expect(m.listForOwner('molly')).toHaveLength(1);
      expect(m.listForOwner('nobody')).toHaveLength(0);
    });

    test('listAll spans users, for admin oversight', async () => {
      const m = await makeManager();
      await m.mint(subject('jim'), 'a', ['page-ingest']);
      await m.mint(subject('molly'), 'b', ['page-ingest']);
      expect(m.listAll()).toHaveLength(2);
    });

    test('listings never include the hash', async () => {
      const m = await makeManager();
      await m.mint(subject('jim'), 'a', ['page-ingest']);
      for (const t of m.listAll()) {
        expect((t as Record<string, unknown>).hash).toBeUndefined();
      }
    });

    test('revoked and expired tokens drop out of listings', async () => {
      const m = await makeManager();
      const a = await m.mint(subject('jim'), 'a', ['page-ingest']);
      await m.mint(subject('jim'), 'b', ['page-ingest'], 1);
      await m.revoke(a.record.id, 'jim');
      expect(m.listForOwner('jim')).toHaveLength(1);
      expect(m.listForOwner('jim', Date.now() + 2 * 3_600_000)).toHaveLength(0);
    });

    test('revoke records who did it', async () => {
      const m = await makeManager();
      const { record } = await m.mint(subject('jim'), 'a', ['page-ingest']);
      await m.revoke(record.id, 'admin');
      const after = m.getById(record.id);
      expect(after?.revokedBy).toBe('admin');
      expect(after?.revokedAt).not.toBeNull();
    });

    test('revoking twice is reported as a no-op', async () => {
      const m = await makeManager();
      const { record } = await m.mint(subject('jim'), 'a', ['page-ingest']);
      expect(await m.revoke(record.id, 'jim')).toBe(true);
      expect(await m.revoke(record.id, 'jim')).toBe(false);
    });

    test('revoking an unknown id is false, not an error', async () => {
      const m = await makeManager();
      expect(await m.revoke('tok_nope', 'jim')).toBe(false);
    });
  });

  describe('persistence and retention', () => {
    test('tokens survive a restart', async () => {
      const m1 = await makeManager();
      const { token } = await m1.mint(subject('jim'), 'a', ['page-ingest']);

      const m2 = await makeManager();
      expect(await m2.verify(token)).not.toBeNull();
    });

    test('purge drops dead records past the retention window but keeps live ones', async () => {
      const m = await makeManager({ 'ngdpbase.auth.agent-token.retention-days': 30 });
      await m.mint(subject('jim'), 'live', ['page-ingest']);
      await m.mint(subject('jim'), 'expiring', ['page-ingest'], 1);

      const wellPastRetention = Date.now() + 40 * 86_400_000;
      const purged = await m.purgeExpired(wellPastRetention);
      expect(purged).toBe(2); // both are long dead by then
      expect(m.listAll(wellPastRetention)).toHaveLength(0);
    });

    test('purge leaves recently-expired records alone', async () => {
      const m = await makeManager();
      await m.mint(subject('jim'), 'a', ['page-ingest'], 1);
      const justAfterExpiry = Date.now() + 2 * 3_600_000;
      expect(await m.purgeExpired(justAfterExpiry)).toBe(0);
    });
  });
});

describe('scope aliases (#946 — found by live testing)', () => {
  test('page-ingest expands to the real action names', async () => {
    // Scopes are compared against action names by both permission paths.
    // `page-ingest` is not an action, so an unexpanded value matched nothing
    // and every ingest was denied — caught only against a running server.
    const m = await makeManager();
    const { record } = await m.mint(subject('jim'), 'x', ['page-ingest']);
    expect(record.scopes).toEqual(['page-create', 'page-edit']);
  });

  test('explicit action names pass through unchanged', async () => {
    const m = await makeManager();
    const { record } = await m.mint(subject('jim'), 'x', ['page-read', 'page-edit']);
    expect(record.scopes).toEqual(['page-read', 'page-edit']);
  });

  test('expansion de-duplicates', async () => {
    const m = await makeManager();
    const { record } = await m.mint(subject('jim'), 'x', ['page-ingest', 'page-edit']);
    expect(record.scopes).toEqual(['page-create', 'page-edit']);
  });

  test('an alias cannot smuggle in an admin scope', async () => {
    const m = await makeManager();
    await expect(m.mint(subject('jim'), 'x', ['page-ingest', 'admin-system'])).rejects.toThrow(/admin/i);
  });
});

/**
 * The seven defects found reviewing this manager, plus the config hole found
 * while fixing them (#1108).
 *
 * Each test below failed against the original implementation. They are grouped
 * by the rule in the class header that the defect broke, because the individual
 * bugs are less useful to remember than the rules are.
 */
describe('AgentTokenManager hardening (#1108)', () => {
  const backupsIn = async (): Promise<string[]> =>
    (await fs.readdir(tmpDir)).filter(f => f.includes('.backup-'));

  describe('rule 1 — the read path does no disk IO', () => {
    test('verify() writes nothing, however many times it is called', async () => {
      const m = await makeManager();
      const { token } = await m.mint(subject('jim'), 'a', ['page-ingest']);
      const before = (await fs.readdir(tmpDir)).length;

      for (let i = 0; i < 25; i++) expect(await m.verify(token)).not.toBeNull();

      // The original wrote a fresh hash-bearing backup copy per millisecond of
      // traffic, into the token directory, forever.
      expect((await fs.readdir(tmpDir)).length).toBe(before);
    });

    test('a buffered lastUsedAt is visible immediately and durable after a flush', async () => {
      const m = await makeManager();
      const { token, record } = await m.mint(subject('jim'), 'a', ['page-ingest']);
      await m.verify(token);

      expect(m.getById(record.id)?.lastUsedAt).not.toBeNull();
      expect(await m.flushLastUsed()).toBe(1);

      const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, 'agent-tokens.json'), 'utf8'));
      expect(onDisk[record.id].lastUsedAt).not.toBeNull();
    });

    test('shutdown flushes a pending stamp rather than losing it', async () => {
      const m = await makeManager();
      const { token, record } = await m.mint(subject('jim'), 'a', ['page-ingest']);
      await m.verify(token);
      await m.shutdown();

      const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, 'agent-tokens.json'), 'utf8'));
      expect(onDisk[record.id].lastUsedAt).not.toBeNull();
    });

    test('a structural change writes no snapshot either (#1110)', async () => {
      // aed2e42a bounded the snapshot to `backup-keep`; #1110 removed it. The
      // read path was never the whole problem — a copy of a credential store is
      // a liability whichever path writes it, and restoring one un-revokes
      // tokens somebody deliberately killed.
      const m = await makeManager();
      for (let i = 0; i < 6; i++) await m.mint(subject('jim'), `t${i}`, ['page-ingest'], 1, Date.now() + i);
      expect(await backupsIn()).toEqual([]);
    });
  });

  describe('rule 2 — an unreadable date means expired, everywhere', () => {
    /** Write a store by hand, the way corruption or a bad migration would. */
    async function seedStore(record: Record<string, unknown>): Promise<void> {
      await fs.writeFile(
        path.join(tmpDir, 'agent-tokens.json'),
        JSON.stringify({ [record.id as string]: record }, null, 2),
        'utf8'
      );
    }

    test('a record with no expiresAt does not authenticate — and is not invisible', async () => {
      // The original accepted this forever in verify() while hiding it from
      // every listing, including the admin one: an immortal token nobody could
      // see to revoke.
      const token = 'ngdp_at_handwritten-value-for-this-test';
      const hash = `sha256:${require('crypto').createHash('sha256').update(token).digest('hex')}`;
      await seedStore({
        id: 'tok_broken', owner: 'jim', name: 'broken', hash, prefix: 'ngdp_at_hand',
        scopes: ['page-edit'], createdAt: new Date().toISOString(),
        lastUsedAt: null, revokedAt: null, revokedBy: null
        // expiresAt deliberately absent
      });

      const m = await makeManager();
      expect(await m.verify(token)).toBeNull();
      expect(m.listAll()).toHaveLength(0);
    });

    test('a malformed record is quarantined, not silently deleted', async () => {
      await seedStore({ id: 'tok_broken', owner: 'jim', name: 'broken', hash: 'not-a-hash' });
      const m = await makeManager();

      // It authenticates nothing and lists nowhere...
      expect(m.listAll()).toHaveLength(0);
      expect(m.getById('tok_broken')).toBeNull();

      // ...but a later save must not destroy the evidence of corruption.
      await m.mint(subject('jim'), 'fresh', ['page-ingest']);
      const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, 'agent-tokens.json'), 'utf8'));
      expect(onDisk.tok_broken).toBeTruthy();
    });

    test('an unparseable expiresAt is treated as expired by verify and by listings alike', async () => {
      const m = await makeManager();
      const { token, record } = await m.mint(subject('jim'), 'a', ['page-ingest']);
      // Reach in and break the date the way a bad edit would.
      const stored = (m as unknown as { tokens: Map<string, { expiresAt: string }> }).tokens.get(record.id);
      if (!stored) throw new Error('expected the minted record to be in the store');
      stored.expiresAt = 'soon';

      expect(await m.verify(token)).toBeNull();
      expect(m.listAll()).toHaveLength(0);
    });
  });

  describe('rule 3 — nothing hands out a live reference to a stored record', () => {
    test('verify() returns no hash', async () => {
      const m = await makeManager();
      const { token } = await m.mint(subject('jim'), 'a', ['page-ingest']);
      const record = await m.verify(token);
      expect((record as unknown as Record<string, unknown>).hash).toBeUndefined();
    });

    test('widening the scopes of a returned record cannot widen the token', async () => {
      // AgentTokenAuthProvider puts these scopes into req.userContext, where
      // ACLManager reads them as the permission ceiling. Sharing the stored
      // array let anything downstream grant itself admin in place.
      const m = await makeManager();
      const { token, record } = await m.mint(subject('jim'), 'a', ['page-edit']);

      const seen = await m.verify(token);
      seen!.scopes.push('admin-system');

      expect(m.getById(record.id)?.scopes).toEqual(['page-edit']);
      expect((await m.verify(token))!.scopes).toEqual(['page-edit']);
    });

    test('listings hand out their own arrays too', async () => {
      const m = await makeManager();
      const { record } = await m.mint(subject('jim'), 'a', ['page-edit']);
      m.listAll()[0]!.scopes.push('admin-system');
      expect(m.getById(record.id)?.scopes).toEqual(['page-edit']);
    });
  });

  describe('scope input is validated rather than trusted', () => {
    test('an inherited object key is a clean error, not a TypeError', async () => {
      // `SCOPE_ALIASES['constructor']` used to resolve off Object.prototype and
      // throw "function is not iterable" — a 500 from a user-supplied string.
      const m = await makeManager();
      for (const evil of ['constructor', '__proto__', 'toString']) {
        await expect(m.mint(subject('jim'), 'x', [evil])).resolves.toBeTruthy();
      }
    });

    test('a non-string scope is refused at the mint rather than stored', async () => {
      const m = await makeManager();
      // Parsed from a body, which is how a non-string scope actually arrives.
      const fromRequestBody = JSON.parse('{"scopes":[42]}') as { scopes: string[] };
      await expect(m.mint(subject('jim'), 'x', fromRequestBody.scopes)).rejects.toThrow(/non-empty string/i);
      await expect(m.mint(subject('jim'), 'x', ['  '])).rejects.toThrow(/non-empty string/i);
    });
  });

  describe('limits cannot be disabled by a typo', () => {
    test('a non-numeric max-ttl-hours falls back to the default instead of removing the cap', async () => {
      // Number('24h') is NaN, and `ttl > NaN` is false — so the original let a
      // config typo silently mint tokens of any length.
      const m = await makeManager({ 'ngdpbase.auth.agent-token.max-ttl-hours': '24h' });
      await expect(m.mint(subject('jim'), 'x', ['page-ingest'], 24 * 365)).rejects.toThrow(/maximum/i);
    });

    test('a negative max-per-user falls back rather than locking everyone out', async () => {
      const m = await makeManager({ 'ngdpbase.auth.agent-token.max-per-user': -1 });
      await expect(m.mint(subject('jim'), 'x', ['page-ingest'])).resolves.toBeTruthy();
    });
  });

  describe('durability', () => {
    test('concurrent writes leave a store that still parses', async () => {
      const m = await makeManager({ 'ngdpbase.auth.agent-token.max-per-user': 50 });
      await Promise.all(
        Array.from({ length: 20 }, (_, i) => m.mint(subject('jim'), `concurrent-${i}`, ['page-ingest']))
      );
      const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, 'agent-tokens.json'), 'utf8'));
      expect(Object.keys(onDisk)).toHaveLength(20);
    });
  });

  describe('backup', () => {
    test('carries no hashes and says plainly that it cannot restore', async () => {
      const m = await makeManager();
      await m.mint(subject('jim'), 'a', ['page-ingest']);
      const result = await m.backup();
      const data = result.data as { restorable: boolean; count: number; tokens: unknown[] };

      expect(data.restorable).toBe(false);
      expect(data.count).toBe(1);
      expect(JSON.stringify(data)).not.toContain('sha256:');
    });
  });
});

/**
 * #1110 — three defects found reviewing aed2e42a, plus removal of the store
 * snapshot.
 *
 * The snapshot existed to survive a torn write. aed2e42a replaced plain
 * writeFile with writeFileAtomic, which removes that failure — what remained
 * was a full copy of every token hash beside the live store, defended as
 * insurance against this class deleting a record it should not have. That does
 * not hold up: restoring un-revokes tokens someone deliberately killed, tokens
 * are short-lived so re-minting is trivial, and backup() excludes hashes on the
 * stated grounds that a backup must not carry material checkable against a
 * presented token — while the snapshot wrote exactly that, unencrypted, beside
 * the original.
 */
describe('#1110 no snapshots, and a failed write does not poison the queue', () => {
  const KEY = 'ngdpbase.auth.agent-token';

  test('a mutation writes no backup file beside the store', async () => {
    const mgr = await makeManager();
    const { record } = await mgr.mint(subject('alice'), 'probe', ['page-read']);
    await mgr.revoke(record.id, 'alice');
    await mgr.purgeExpired();

    expect(await fs.readdir(tmpDir)).toEqual(['agent-tokens.json']);
  });

  test('a failed write does not stop the next write from succeeding', async () => {
    // The bug: `this.writeQueue = this.writeQueue.then(fn)` supplies only a
    // fulfilled handler, so one rejection leaves the stored chain permanently
    // rejected — every later persist reports the STALE error without ever
    // attempting a write. Real fault injection rather than a mock: the point is
    // that the queue recovers from a genuine rejection.
    const mgr = await makeManager();
    await fs.chmod(tmpDir, 0o500);
    await expect(mgr.mint(subject('alice'), 'doomed', ['page-read'])).rejects.toThrow();

    await fs.chmod(tmpDir, 0o700);
    await expect(mgr.mint(subject('alice'), 'later', ['page-read'])).resolves.toBeDefined();

    const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, 'agent-tokens.json'), 'utf8'));
    const names = Object.values(onDisk).map((r) => (r as { name: string }).name);
    expect(names).toContain('later');
  });

  test('shutdown waits for an in-flight write', async () => {
    // A revoke whose write has not landed is lost if shutdown returns before it
    // does: app.ts awaits engine.shutdown() and then exits, so the token is
    // live again after restart.
    const mgr = await makeManager();
    const { record } = await mgr.mint(subject('alice'), 'doomed', ['page-read']);
    void mgr.revoke(record.id, 'alice');
    await mgr.shutdown();

    const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, 'agent-tokens.json'), 'utf8'));
    expect(onDisk[record.id].revokedAt).not.toBeNull();
  });

  test('zero is a legal value for count-style settings', async () => {
    // `n <= 0` fell back for every key and logged "is not a positive number",
    // which is wrong where zero is meaningful: retention-days: 0 means purge as
    // soon as dead, max-per-user: 0 means allow none.
    const mgr = await makeManager({ [`${KEY}.retention-days`]: 0, [`${KEY}.max-per-user`]: 0 });
    expect((mgr as unknown as { tokenConfig: Record<string, number> }).tokenConfig)
      .toMatchObject({ retentionDays: 0, maxPerUser: 0 });
  });

  test('zero is still refused for interval and TTL settings', async () => {
    // A zero TTL mints a token already expired; a zero interval is a busy loop.
    const mgr = await makeManager({
      [`${KEY}.default-ttl-hours`]: 0,
      [`${KEY}.max-ttl-hours`]: 0,
      [`${KEY}.sweep-interval-seconds`]: 0
    });
    const cfg = (mgr as unknown as { tokenConfig: Record<string, number> }).tokenConfig;
    expect(cfg.defaultTtlHours).toBeGreaterThan(0);
    expect(cfg.maxTtlHours).toBeGreaterThan(0);
    expect(cfg.sweepIntervalSeconds).toBeGreaterThan(0);
  });

  test('retention-days: 0 purges a revoked record on the next sweep', async () => {
    const mgr = await makeManager({ [`${KEY}.retention-days`]: 0 });
    const { record } = await mgr.mint(subject('alice'), 'probe', ['page-read']);
    await mgr.revoke(record.id, 'alice');
    expect(await mgr.purgeExpired()).toBe(1);
    expect(mgr.listAll()).toHaveLength(0);
  });
});

/**
 * #1111 — the credential store was the only record a token ever existed.
 * Nothing emitted audit events, while `purgeExpired()`'s comment claimed
 * "Audit is unaffected". Emitted from the MANAGER, not the route: a page
 * mutation logged at the HTTP layer misses an internal caller and that is
 * survivable, but an unaudited mint is a credential nobody knows exists.
 */
describe('#1111 the token lifecycle is audited', () => {
  const KEY = 'ngdpbase.auth.agent-token';

  function withAudit(overrides: Record<string, unknown> = {}) {
    const events: Array<Record<string, unknown>> = [];
    const logAuditEvent = vi.fn(async (e: Record<string, unknown>) => { events.push(e); return 'id'; });
    const engine = {
      getManager: (name: string) => {
        if (name === 'ConfigurationManager') {
          return {
            getProperty: (key: string, dflt: unknown) => (key in overrides ? overrides[key] : dflt),
            getResolvedDataPath: () => tmpDir
          };
        }
        // #1121: token-mint and token-revoke are CRITICAL, so the sink must be
        // able to flush or the write is refused rather than silently unrecorded.
        if (name === 'AuditManager') return { logAuditEvent, flushAuditQueue: async () => {} };
        if (name === 'UserManager') return { hasPermission: async () => true };
        return null;
      }
    } as never;
    return { engine, events, logAuditEvent };
  }

  test('a mint is audited with the scopes and expiry it was granted', async () => {
    const { engine, events } = withAudit();
    const m = new AgentTokenManager(engine);
    await m.initialize();
    const { record } = await m.mint(subject('alice'), 'ci', ['page-read']);

    const minted = events.filter((e) => e.eventType === 'token-mint');
    expect(minted).toHaveLength(1);
    expect(minted[0].metadata).toMatchObject({
      id: record.id, owner: 'alice', name: 'ci', scopes: ['page-read']
    });
  });

  test('a revoke is audited with who did it', async () => {
    const { engine, events } = withAudit();
    const m = new AgentTokenManager(engine);
    await m.initialize();
    const { record } = await m.mint(subject('alice'), 'ci', ['page-read']);
    await m.revoke(record.id, 'admin');

    const revoked = events.filter((e) => e.eventType === 'token-revoke');
    expect(revoked).toHaveLength(1);
    expect(revoked[0].metadata).toMatchObject({ id: record.id, owner: 'alice', revokedBy: 'admin' });
  });

  test('a revoke that finds nothing to revoke emits nothing', async () => {
    const { engine, events } = withAudit();
    const m = new AgentTokenManager(engine);
    await m.initialize();
    expect(await m.revoke('tok_missing', 'admin')).toBe(false);
    expect(events.filter((e) => e.eventType === 'token-revoke')).toHaveLength(0);
  });

  test('a failing audit sink FAILS the mint (#1121 reverses #1111)', async () => {
    // #1111 asserted the opposite — "the credential is the product; the log is
    // a record of it" — and that reasoning is right for a page edit and wrong
    // for a credential. An unrecorded mint is a live token nobody knows exists,
    // which is worse than a mint that visibly failed and can be retried.
    //
    // token-mint is declared CRITICAL in the #1120 registry, and the audit is
    // written before the token is persisted, so a refusal leaves nothing behind.
    const engine = {
      getManager: (name: string) => {
        if (name === 'ConfigurationManager') {
          return { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: () => tmpDir };
        }
        if (name === 'AuditManager') return { logAuditEvent: async () => { throw new Error('sink down'); }, flushAuditQueue: async () => {} };
        if (name === 'UserManager') return { hasPermission: async () => true };
        return null;
      }
    } as never;
    const m = new AgentTokenManager(engine);
    await m.initialize();
    await expect(m.mint(subject('alice'), 'ci', ['page-read'])).rejects.toThrow(/on-failure: refuse/i);

    // And nothing was left behind — the point of auditing before persisting.
    expect(m.listAll()).toHaveLength(0);
  });

  test('no audit manager at all is not an error', async () => {
    const m = await makeManager();
    await expect(m.mint(subject('alice'), 'ci', ['page-read'])).resolves.toBeDefined();
  });

  test('backup carries dead records, not just live ones', async () => {
    // The comment claimed to preserve "the audit trail of what existed" while
    // shipping listAll(), which filters to live. A token revoked an hour before
    // the backup — the case incident response wants — was absent.
    const m = await makeManager();
    const { record } = await m.mint(subject('alice'), 'ci', ['page-read']);
    await m.revoke(record.id, 'alice');

    const data = (await m.backup()).data as { restorable: boolean; tokens: Array<{ id: string }> };
    expect(data.restorable).toBe(false);
    expect(data.tokens.map((t) => t.id)).toContain(record.id);
  });

  test('backup never carries hashes', async () => {
    const m = await makeManager();
    await m.mint(subject('alice'), 'ci', ['page-read']);
    const data = (await m.backup()).data as { tokens: Array<Record<string, unknown>> };
    expect(JSON.stringify(data)).not.toContain('hash');
    expect(data.tokens.every((t) => !('hash' in t))).toBe(true);
  });

  test('restore refuses rather than silently doing nothing', async () => {
    // It inherited BaseManager's no-op default, so `restorable: false` was
    // honoured by accident. If someone later writes a restore from that
    // payload, records return with NO hash.
    const m = await makeManager();
    await expect(m.restore((await m.backup()))).rejects.toThrow(/restor/i);
  });

  test('retention-days: 0 leaves nothing behind once the lifecycle is audited', async () => {
    const m = await makeManager({ [`${KEY}.retention-days`]: 0 });
    const { record } = await m.mint(subject('alice'), 'ci', ['page-read']);
    await m.revoke(record.id, 'alice');
    await m.purgeExpired();
    expect(m.listAll()).toHaveLength(0);
  });
});
