/**
 * AgentTokenManager — user-delegated agent API tokens (#946).
 *
 * Uses a per-test temp directory. Nothing here touches the live data dir.
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import AgentTokenManager from '../AgentTokenManager';

let tmpDir: string;

function makeEngine(overrides: Record<string, unknown> = {}) {
  return {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') {
        return {
          getProperty: (key: string, dflt: unknown) => (key in overrides ? overrides[key] : dflt),
          getResolvedDataPath: () => tmpDir
        };
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
});

afterEach(async () => {
  // Only ever removes this test's own temp dir.
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('AgentTokenManager (#946)', () => {
  describe('mint', () => {
    test('returns a prefixed cleartext token and a record without the hash', async () => {
      const m = await makeManager();
      const { token, record } = await m.mint('jim', 'claude-laptop', ['page-ingest']);

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
      const a = await m.mint('jim', 'a', ['page-ingest']);
      const b = await m.mint('jim', 'b', ['page-ingest']);
      expect(a.token).not.toBe(b.token);
      expect(a.record.id).not.toBe(b.record.id);
    });

    test('the cleartext token is never written to disk', async () => {
      const m = await makeManager();
      const { token } = await m.mint('jim', 'claude-laptop', ['page-ingest']);
      const onDisk = await fs.readFile(path.join(tmpDir, 'agent-tokens.json'), 'utf8');
      expect(onDisk).not.toContain(token);
      expect(onDisk).toContain('sha256:');
    });

    test('rejects an unscoped token rather than treating it as unrestricted', async () => {
      const m = await makeManager();
      await expect(m.mint('jim', 'x', [])).rejects.toThrow(/scope/i);
    });

    test('refuses admin-* scopes outright', async () => {
      const m = await makeManager();
      await expect(m.mint('jim', 'x', ['page-ingest', 'admin-system'])).rejects.toThrow(/admin/i);
      await expect(m.mint('jim', 'x', ['admin-roles'])).rejects.toThrow(/admin/i);
    });

    test('requires a name', async () => {
      const m = await makeManager();
      await expect(m.mint('jim', '   ', ['page-ingest'])).rejects.toThrow(/name/i);
    });

    test('rejects a TTL above the configured maximum', async () => {
      const m = await makeManager();
      await expect(m.mint('jim', 'x', ['page-ingest'], 48)).rejects.toThrow(/maximum/i);
    });

    test('honours a raised max-ttl-hours', async () => {
      const m = await makeManager({ 'ngdpbase.auth.agent-token.max-ttl-hours': 72 });
      const { record } = await m.mint('jim', 'x', ['page-ingest'], 48);
      expect(record.expiresAt).toBeTruthy();
    });

    test('enforces the per-user live-token cap', async () => {
      const m = await makeManager({ 'ngdpbase.auth.agent-token.max-per-user': 2 });
      await m.mint('jim', 'a', ['page-ingest']);
      await m.mint('jim', 'b', ['page-ingest']);
      await expect(m.mint('jim', 'c', ['page-ingest'])).rejects.toThrow(/limit/i);
      // Another user is unaffected.
      await expect(m.mint('molly', 'a', ['page-ingest'])).resolves.toBeTruthy();
    });

    test('a revoked token frees a slot under the cap', async () => {
      const m = await makeManager({ 'ngdpbase.auth.agent-token.max-per-user': 1 });
      const first = await m.mint('jim', 'a', ['page-ingest']);
      await expect(m.mint('jim', 'b', ['page-ingest'])).rejects.toThrow(/limit/i);
      await m.revoke(first.record.id, 'jim');
      await expect(m.mint('jim', 'b', ['page-ingest'])).resolves.toBeTruthy();
    });
  });

  describe('verify', () => {
    test('accepts a freshly minted token and returns the owner', async () => {
      const m = await makeManager();
      const { token } = await m.mint('jim', 'claude-laptop', ['page-ingest']);
      const record = await m.verify(token);
      expect(record?.owner).toBe('jim');
      expect(record?.scopes).toEqual(['page-create', 'page-edit']);
    });

    test('rejects an unknown token', async () => {
      const m = await makeManager();
      await m.mint('jim', 'x', ['page-ingest']);
      expect(await m.verify('ngdp_at_totallyMadeUpValue')).toBeNull();
    });

    test('rejects a value without the prefix', async () => {
      const m = await makeManager();
      const { token } = await m.mint('jim', 'x', ['page-ingest']);
      expect(await m.verify(token.replace('ngdp_at_', ''))).toBeNull();
    });

    test('rejects an expired token', async () => {
      const m = await makeManager();
      const { token } = await m.mint('jim', 'x', ['page-ingest'], 1);
      const twoHoursLater = Date.now() + 2 * 3_600_000;
      expect(await m.verify(token, twoHoursLater)).toBeNull();
    });

    test('rejects a revoked token immediately', async () => {
      const m = await makeManager();
      const { token, record } = await m.mint('jim', 'x', ['page-ingest']);
      expect(await m.verify(token)).not.toBeNull();
      await m.revoke(record.id, 'jim');
      expect(await m.verify(token)).toBeNull();
    });

    test('stamps lastUsedAt', async () => {
      const m = await makeManager();
      const { token, record } = await m.mint('jim', 'x', ['page-ingest']);
      expect(m.getById(record.id)?.lastUsedAt).toBeNull();
      await m.verify(token);
      expect(m.getById(record.id)?.lastUsedAt).not.toBeNull();
    });

    test('does not store roles on the token — only the owner reference', async () => {
      // Permissions must resolve live from the user record; a snapshot here
      // would let a demoted user keep their old authority via an old token.
      const m = await makeManager();
      const { record } = await m.mint('jim', 'x', ['page-ingest']);
      expect(Object.keys(record)).not.toContain('roles');
      const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, 'agent-tokens.json'), 'utf8'));
      expect(JSON.stringify(onDisk)).not.toContain('"roles"');
    });
  });

  describe('listing and revocation', () => {
    test('listForOwner returns only that owner\'s live tokens', async () => {
      const m = await makeManager();
      await m.mint('jim', 'a', ['page-ingest']);
      await m.mint('molly', 'b', ['page-ingest']);
      expect(m.listForOwner('jim')).toHaveLength(1);
      expect(m.listForOwner('molly')).toHaveLength(1);
      expect(m.listForOwner('nobody')).toHaveLength(0);
    });

    test('listAll spans users, for admin oversight', async () => {
      const m = await makeManager();
      await m.mint('jim', 'a', ['page-ingest']);
      await m.mint('molly', 'b', ['page-ingest']);
      expect(m.listAll()).toHaveLength(2);
    });

    test('listings never include the hash', async () => {
      const m = await makeManager();
      await m.mint('jim', 'a', ['page-ingest']);
      for (const t of m.listAll()) {
        expect((t as Record<string, unknown>).hash).toBeUndefined();
      }
    });

    test('revoked and expired tokens drop out of listings', async () => {
      const m = await makeManager();
      const a = await m.mint('jim', 'a', ['page-ingest']);
      await m.mint('jim', 'b', ['page-ingest'], 1);
      await m.revoke(a.record.id, 'jim');
      expect(m.listForOwner('jim')).toHaveLength(1);
      expect(m.listForOwner('jim', Date.now() + 2 * 3_600_000)).toHaveLength(0);
    });

    test('revoke records who did it', async () => {
      const m = await makeManager();
      const { record } = await m.mint('jim', 'a', ['page-ingest']);
      await m.revoke(record.id, 'admin');
      const after = m.getById(record.id);
      expect(after?.revokedBy).toBe('admin');
      expect(after?.revokedAt).not.toBeNull();
    });

    test('revoking twice is reported as a no-op', async () => {
      const m = await makeManager();
      const { record } = await m.mint('jim', 'a', ['page-ingest']);
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
      const { token } = await m1.mint('jim', 'a', ['page-ingest']);

      const m2 = await makeManager();
      expect(await m2.verify(token)).not.toBeNull();
    });

    test('purge drops dead records past the retention window but keeps live ones', async () => {
      const m = await makeManager({ 'ngdpbase.auth.agent-token.retention-days': 30 });
      await m.mint('jim', 'live', ['page-ingest']);
      await m.mint('jim', 'expiring', ['page-ingest'], 1);

      const wellPastRetention = Date.now() + 40 * 86_400_000;
      const purged = await m.purgeExpired(wellPastRetention);
      expect(purged).toBe(2); // both are long dead by then
      expect(m.listAll(wellPastRetention)).toHaveLength(0);
    });

    test('purge leaves recently-expired records alone', async () => {
      const m = await makeManager();
      await m.mint('jim', 'a', ['page-ingest'], 1);
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
    const { record } = await m.mint('jim', 'x', ['page-ingest']);
    expect(record.scopes).toEqual(['page-create', 'page-edit']);
  });

  test('explicit action names pass through unchanged', async () => {
    const m = await makeManager();
    const { record } = await m.mint('jim', 'x', ['page-read', 'page-edit']);
    expect(record.scopes).toEqual(['page-read', 'page-edit']);
  });

  test('expansion de-duplicates', async () => {
    const m = await makeManager();
    const { record } = await m.mint('jim', 'x', ['page-ingest', 'page-edit']);
    expect(record.scopes).toEqual(['page-create', 'page-edit']);
  });

  test('an alias cannot smuggle in an admin scope', async () => {
    const m = await makeManager();
    await expect(m.mint('jim', 'x', ['page-ingest', 'admin-system'])).rejects.toThrow(/admin/i);
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
      const { token } = await m.mint('jim', 'a', ['page-ingest']);
      const before = (await fs.readdir(tmpDir)).length;

      for (let i = 0; i < 25; i++) expect(await m.verify(token)).not.toBeNull();

      // The original wrote a fresh hash-bearing backup copy per millisecond of
      // traffic, into the token directory, forever.
      expect((await fs.readdir(tmpDir)).length).toBe(before);
    });

    test('a buffered lastUsedAt is visible immediately and durable after a flush', async () => {
      const m = await makeManager();
      const { token, record } = await m.mint('jim', 'a', ['page-ingest']);
      await m.verify(token);

      expect(m.getById(record.id)?.lastUsedAt).not.toBeNull();
      expect(await m.flushLastUsed()).toBe(1);

      const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, 'agent-tokens.json'), 'utf8'));
      expect(onDisk[record.id].lastUsedAt).not.toBeNull();
    });

    test('shutdown flushes a pending stamp rather than losing it', async () => {
      const m = await makeManager();
      const { token, record } = await m.mint('jim', 'a', ['page-ingest']);
      await m.verify(token);
      await m.shutdown();

      const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, 'agent-tokens.json'), 'utf8'));
      expect(onDisk[record.id].lastUsedAt).not.toBeNull();
    });

    test('snapshots are taken on structural change and stay bounded', async () => {
      const m = await makeManager({ 'ngdpbase.auth.agent-token.backup-keep': 2 });
      for (let i = 0; i < 6; i++) await m.mint('jim', `t${i}`, ['page-ingest'], 1, Date.now() + i);
      // Exactly the bound, not merely under it: five structural changes after
      // the first (which has no prior file to copy), pruned to backup-keep.
      // The original collided on Date.now() milliseconds, so its snapshots
      // overwrote each other and stayed few BY ACCIDENT rather than by policy.
      expect((await backupsIn()).length).toBe(2);
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
      await m.mint('jim', 'fresh', ['page-ingest']);
      const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, 'agent-tokens.json'), 'utf8'));
      expect(onDisk.tok_broken).toBeTruthy();
    });

    test('an unparseable expiresAt is treated as expired by verify and by listings alike', async () => {
      const m = await makeManager();
      const { token, record } = await m.mint('jim', 'a', ['page-ingest']);
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
      const { token } = await m.mint('jim', 'a', ['page-ingest']);
      const record = await m.verify(token);
      expect((record as unknown as Record<string, unknown>).hash).toBeUndefined();
    });

    test('widening the scopes of a returned record cannot widen the token', async () => {
      // AgentTokenAuthProvider puts these scopes into req.userContext, where
      // ACLManager reads them as the permission ceiling. Sharing the stored
      // array let anything downstream grant itself admin in place.
      const m = await makeManager();
      const { token, record } = await m.mint('jim', 'a', ['page-edit']);

      const seen = await m.verify(token);
      seen!.scopes.push('admin-system');

      expect(m.getById(record.id)?.scopes).toEqual(['page-edit']);
      expect((await m.verify(token))!.scopes).toEqual(['page-edit']);
    });

    test('listings hand out their own arrays too', async () => {
      const m = await makeManager();
      const { record } = await m.mint('jim', 'a', ['page-edit']);
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
        await expect(m.mint('jim', 'x', [evil])).resolves.toBeTruthy();
      }
    });

    test('a non-string scope is refused at the mint rather than stored', async () => {
      const m = await makeManager();
      // Parsed from a body, which is how a non-string scope actually arrives.
      const fromRequestBody = JSON.parse('{"scopes":[42]}') as { scopes: string[] };
      await expect(m.mint('jim', 'x', fromRequestBody.scopes)).rejects.toThrow(/non-empty string/i);
      await expect(m.mint('jim', 'x', ['  '])).rejects.toThrow(/non-empty string/i);
    });
  });

  describe('limits cannot be disabled by a typo', () => {
    test('a non-numeric max-ttl-hours falls back to the default instead of removing the cap', async () => {
      // Number('24h') is NaN, and `ttl > NaN` is false — so the original let a
      // config typo silently mint tokens of any length.
      const m = await makeManager({ 'ngdpbase.auth.agent-token.max-ttl-hours': '24h' });
      await expect(m.mint('jim', 'x', ['page-ingest'], 24 * 365)).rejects.toThrow(/maximum/i);
    });

    test('a negative max-per-user falls back rather than locking everyone out', async () => {
      const m = await makeManager({ 'ngdpbase.auth.agent-token.max-per-user': -1 });
      await expect(m.mint('jim', 'x', ['page-ingest'])).resolves.toBeTruthy();
    });
  });

  describe('durability', () => {
    test('concurrent writes leave a store that still parses', async () => {
      const m = await makeManager({ 'ngdpbase.auth.agent-token.max-per-user': 50 });
      await Promise.all(
        Array.from({ length: 20 }, (_, i) => m.mint('jim', `concurrent-${i}`, ['page-ingest']))
      );
      const onDisk = JSON.parse(await fs.readFile(path.join(tmpDir, 'agent-tokens.json'), 'utf8'));
      expect(Object.keys(onDisk)).toHaveLength(20);
    });
  });

  describe('backup', () => {
    test('carries no hashes and says plainly that it cannot restore', async () => {
      const m = await makeManager();
      await m.mint('jim', 'a', ['page-ingest']);
      const result = await m.backup();
      const data = result.data as { restorable: boolean; count: number; tokens: unknown[] };

      expect(data.restorable).toBe(false);
      expect(data.count).toBe(1);
      expect(JSON.stringify(data)).not.toContain('sha256:');
    });
  });
});
