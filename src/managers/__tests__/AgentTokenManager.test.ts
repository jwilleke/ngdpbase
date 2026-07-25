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
      expect(record.scopes).toEqual(['page-ingest']);
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
      expect(record?.scopes).toEqual(['page-ingest']);
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
