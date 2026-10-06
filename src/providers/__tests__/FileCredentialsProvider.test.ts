/**
 * #1524 — the signed credentials store. Works in its own temp directory and
 * removes only that.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import FileCredentialsProvider from '../FileCredentialsProvider';
import type { CredentialRecord, RejectedCredential } from '../BaseCredentialsProvider';

const KEY = 'test-credentials-key-not-a-secret';
const row = (over: Partial<CredentialRecord> = {}): CredentialRecord => ({
  id: 'c1', username: 'molly', kind: 'passkey', subject: 'cred-id-1', secret: 'public-key', label: 'Phone',
  createdAt: '2026-10-02T12:00:00.000Z', ...over
});

describe('FileCredentialsProvider (#1524)', () => {
  let dir: string;
  let file: string;
  const opened = async (key = KEY): Promise<{ store: FileCredentialsProvider; rejected: RejectedCredential[] }> => {
    const rejected: RejectedCredential[] = [];
    const store = new FileCredentialsProvider(file, key);
    await store.initialize(r => rejected.push(...r));
    return { store, rejected };
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1524-'));
    file = path.join(dir, 'users', 'credentials.json');
  });

  afterEach(() => {
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('no file is an empty store; a key is required', async () => {
    const { store, rejected } = await opened();
    expect(store.list('molly')).toEqual([]);
    expect(rejected).toEqual([]);
    expect(() => new FileCredentialsProvider(file, '')).toThrow(/NGDPBASE_CREDENTIALS_KEY/);
  });

  test('rows survive a reload, signed, oldest first', async () => {
    const { store } = await opened();
    await store.add(row({ id: 'c2', subject: 's2', createdAt: '2026-10-02T13:00:00.000Z' }));
    await store.add(row());
    const { store: again, rejected } = await opened();
    expect(again.list('molly').map(r => r.id)).toEqual(['c1', 'c2']);
    expect(rejected).toEqual([]);
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8')) as { rows: Array<{ sig?: string }> };
    expect(onDisk.rows.every(r => typeof r.sig === 'string' && r.sig.length > 0)).toBe(true);
  });

  test('the file is owner-only (0600) in an owner-only directory (0700)', async () => {
    const { store } = await opened();
    await store.add(row());
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
  });

  test('a second row with the same kind and subject is refused', async () => {
    const { store } = await opened();
    await store.add(row());
    await expect(store.add(row({ id: 'c9' }))).rejects.toThrow(/already enrolled/);
  });

  test('remove and touch', async () => {
    const { store } = await opened();
    await store.add(row());
    await store.touch('c1', '2026-10-02T14:00:00.000Z');
    expect(store.get('c1')?.lastUsedAt).toBe('2026-10-02T14:00:00.000Z');
    expect(await store.remove('c1')).toBe(true);
    expect(await store.remove('c1')).toBe(false);
  });

  test('a row edited on disk is rejected, reported, and never returned', async () => {
    const { store } = await opened();
    await store.add(row());
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8')) as { rows: Array<Record<string, unknown>> };
    onDisk.rows[0].username = 'mallory';
    fs.writeFileSync(file, JSON.stringify(onDisk));
    const { store: again, rejected } = await opened();
    expect(again.list('mallory')).toEqual([]);
    expect(again.get('c1')).toBeNull();
    expect(rejected).toEqual([{ row: expect.objectContaining({ id: 'c1', username: 'mallory' }), reason: 'bad-signature' }]);
  });

  test('a planted row — unsigned, or signed with another key — is rejected', async () => {
    const { store } = await opened();
    await store.add(row());
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8')) as { rows: Array<Record<string, unknown>> };
    onDisk.rows.push({ ...row({ id: 'planted', subject: 'attacker' }) });
    fs.writeFileSync(file, JSON.stringify(onDisk));
    const foreign = new FileCredentialsProvider(path.join(dir, 'other.json'), 'another-key');
    await foreign.initialize(() => undefined);
    await foreign.add(row({ id: 'forged', subject: 'forged' }));
    const forged = (JSON.parse(fs.readFileSync(path.join(dir, 'other.json'), 'utf8')) as { rows: unknown[] }).rows[0];
    onDisk.rows.push(forged as Record<string, unknown>);
    fs.writeFileSync(file, JSON.stringify(onDisk));

    const { store: again, rejected } = await opened();
    expect(again.list('molly').map(r => r.id)).toEqual(['c1']);
    expect(rejected.map(r => [r.row.id, r.reason])).toEqual([['planted', 'unsigned'], ['forged', 'bad-signature']]);
  });

  test('opened with the wrong key, every row is rejected', async () => {
    const { store } = await opened();
    await store.add(row());
    const { store: again, rejected } = await opened('wrong-key');
    expect(again.list('molly')).toEqual([]);
    expect(rejected).toHaveLength(1);
  });

  test('a malformed row is rejected', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ version: 1, rows: [{ id: 'x', kind: 'password', sig: 'y' }] }));
    const { rejected } = await opened();
    expect(rejected[0].reason).toBe('malformed');
  });

  describe('#1633 a lost key costs no data', () => {
    test('rows that fail verification survive the next write unchanged', async () => {
      const first = await opened();
      await first.store.add(row());
      const before = JSON.parse(fs.readFileSync(file, 'utf8')).rows[0];

      // The key changed: the row is quarantined, and an enrolment writes the file.
      const rotated = await opened('a-new-key');
      expect(rotated.rejected.map(r => r.reason)).toEqual(['bad-signature']);
      await rotated.store.add(row({ id: 'c2', subject: 'cred-id-2', label: 'Laptop' }));

      const rows = JSON.parse(fs.readFileSync(file, 'utf8')).rows;
      expect(rows).toContainEqual(before);
      expect(rotated.store.quarantined()).toHaveLength(1);
      expect(rotated.store.get('c1')).toBeNull();
    });

    test('retrustQuarantined re-signs well-formed rows under the current key', async () => {
      const first = await opened();
      await first.store.add(row());
      const rotated = await opened('a-new-key');
      const trusted = await rotated.store.retrustQuarantined();
      expect(trusted.map(r => r.id)).toEqual(['c1']);
      expect(rotated.store.quarantined()).toEqual([]);

      const reopened = await opened('a-new-key');
      expect(reopened.rejected).toEqual([]);
      expect(reopened.store.get('c1')?.label).toBe('Phone');
    });

    test('malformed rows and duplicates of a trusted credential stay quarantined', async () => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ version: 1, rows: [{ id: 'bad' }] }));
      const opened1 = await opened();
      await opened1.store.add(row({ id: 'c9', subject: 'dup' }));
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      raw.rows.push({ ...row({ id: 'c10', subject: 'dup' }), sig: 'forged' });
      fs.writeFileSync(file, JSON.stringify(raw));

      const again = await opened();
      expect(await again.store.retrustQuarantined()).toEqual([]);
      expect(again.store.quarantined().map(r => r.reason).sort()).toEqual(['bad-signature', 'malformed']);
    });
  });
});
