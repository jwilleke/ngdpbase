/**
 * #1524 — AuthManager is the door to the credentials store: who may act on
 * whose credentials, the last-way-in rule, secrets never shown, and the
 * security alert for a row that does not verify. A real FileCredentialsProvider
 * in a temp directory; the temp directory is all that is removed.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AuthManager from '../AuthManager';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';

const KEY = 'test-credentials-key-not-a-secret';
const subject = (username: string, isAuthenticated = true) => ({ username, roles: ['reader'], isAuthenticated }) as never;
const PASSKEY = { kind: 'passkey' as const, subject: 'cred-1', secret: 'public-key', label: 'Phone' };

describe('AuthManager credentials (#1524)', () => {
  let dir: string;
  let file: string;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];
  let audit: Array<Record<string, unknown>>;
  let notices: Array<Record<string, unknown>>;
  let users: Record<string, { password?: string; isExternal?: boolean }>;

  const started = async (granted: Record<string, string[]> = { molly: ['account-security'], admin: ['account-security', 'user-edit'] }, opts: { staleSignIn?: boolean } = {}) => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (_k: string, d: unknown) => d,
        getCustomProperty: () => undefined,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? file : d),
        isBaseUrlExplicit: () => true,
        getBaseURL: () => 'https://wiki.example.com'
      },
      // `holds` is policy only; `permits` adds the fresh-sign-in rule (#1635), so a
      // stale sign-in is refused by `permits` and still holds the permission.
      PolicyDecisionPoint: {
        permits: (s: { username: string }, action: string) => Promise.resolve(!opts.staleSignIn && (granted[s.username] ?? []).includes(action)),
        holds: (s: { username: string }, action: string) => Promise.resolve((granted[s.username] ?? []).includes(action))
      },
      // The real contract: getUser() never returns the password (it is stripped),
      // and hasPassword() is the door that sees it. The earlier mock returned
      // the password from getUser(), so the last-way-in rule passed here while
      // refusing every real account (#1524).
      UserManager: {
        getUser: (u: string) => Promise.resolve(users[u] ? { ...users[u], password: undefined } : null),
        hasPassword: (u: string) => Promise.resolve(Boolean(users[u] && !users[u].isExternal && users[u].password))
      },
      AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audit.push(e); return Promise.resolve('evt'); } },
      NotificationManager: { addNotification: (n: Record<string, unknown>) => { notices.push(n); return Promise.resolve('n1'); } }
    };
    const manager = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    return manager;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1524-am-'));
    file = path.join(dir, 'users', 'credentials.json');
    process.env[CREDENTIALS_KEY_ENV] = KEY;
    audit = [];
    notices = [];
    users = { molly: { password: 'scrypt$x' }, sam: { password: '' , isExternal: true } };
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a person enrols and lists their own; the secret is never shown', async () => {
    const am = await started();
    const id = await am.addCredential(subject('molly'), 'molly', PASSKEY);
    const listed = await am.listCredentials(subject('molly'), 'molly');
    expect(listed).toEqual([expect.objectContaining({ id, kind: 'passkey', label: 'Phone' })]);
    expect(listed[0]).not.toHaveProperty('secret');
    expect(audit).toContainEqual(expect.objectContaining({ eventType: 'user-edit', action: 'credential-add', user: 'molly', resource: 'molly' }));
  });

  test('#1738: a stale sign-in still lists its own passkeys; changing them needs a fresh one', async () => {
    const fresh = await started();
    await fresh.addCredential(subject('molly'), 'molly', PASSKEY);
    const stale = await started(undefined, { staleSignIn: true });
    expect(await stale.listCredentials(subject('molly'), 'molly')).toHaveLength(1);
    await expect(stale.addCredential(subject('molly'), 'molly', PASSKEY)).rejects.toThrow(/Permission denied/);
    await expect(stale.listCredentials(subject('bob'), 'molly')).rejects.toThrow(/Permission denied/);
  });

  test('someone else’s credentials need user-edit', async () => {
    const am = await started();
    await am.addCredential(subject('molly'), 'molly', PASSKEY);
    await expect(am.listCredentials(subject('bob'), 'molly')).rejects.toThrow(/Permission denied/);
    expect(await am.listCredentials(subject('admin'), 'molly')).toHaveLength(1);
  });

  test('a signed-out caller is refused, whatever the PDP would say', async () => {
    const am = await started({ anonymous: ['account-security'] });
    await expect(am.listCredentials(subject('anonymous', false), 'anonymous')).rejects.toThrow(/Permission denied/);
  });

  test('a passkey can be removed while the password remains', async () => {
    const am = await started();
    const id = await am.addCredential(subject('molly'), 'molly', PASSKEY);
    expect(await am.removeCredential(subject('molly'), 'molly', id)).toBe(true);
    expect(audit).toContainEqual(expect.objectContaining({ action: 'credential-remove' }));
  });

  test('a credential can be renamed by its owner; the name is required and audited', async () => {
    const am = await started();
    const id = await am.addCredential(subject('molly'), 'molly', PASSKEY);
    expect(await am.renameCredential(subject('molly'), 'molly', id, '  Chrome   on Mac ')).toBe(true);
    expect((await am.listCredentials(subject('molly'), 'molly'))[0].label).toBe('Chrome on Mac');
    expect(audit).toContainEqual(expect.objectContaining({ action: 'credential-rename', resource: 'molly' }));
    await expect(am.renameCredential(subject('molly'), 'molly', id, '   ')).rejects.toThrow(/Give it a name/);
    await expect(am.renameCredential(subject('sam'), 'molly', id, 'Mine now')).rejects.toThrow(/Permission denied/);
    expect(await am.renameCredential(subject('molly'), 'molly', 'no-such-id', 'X')).toBe(false);
  });

  test('a renamed row is re-signed: reopening the store accepts it, with no security alert', async () => {
    const am = await started();
    const id = await am.addCredential(subject('molly'), 'molly', PASSKEY);
    await am.renameCredential(subject('molly'), 'molly', id, 'Android phone');
    const reopened = await started();
    expect((await reopened.listCredentials(subject('molly'), 'molly')).map((c) => c.label)).toEqual(['Android phone']);
    expect(audit.filter((e) => e.eventType === 'security-event')).toEqual([]);
  });

  test('the last way in cannot be removed: no password and no other passkey or email', async () => {
    const am = await started({ sam: ['account-security'] });
    const only = await am.addCredential(subject('sam'), 'sam', { ...PASSKEY, subject: 'sam-key' });
    await expect(am.removeCredential(subject('sam'), 'sam', only)).rejects.toThrow(/last way into the account/);
    const second = await am.addCredential(subject('sam'), 'sam', { kind: 'email', subject: 'sam@example.com', secret: '', label: 'Email' });
    expect(await am.removeCredential(subject('sam'), 'sam', only)).toBe(true);
    await expect(am.removeCredential(subject('sam'), 'sam', second)).rejects.toThrow(/last way into the account/);
  });

  test('a TOTP seed is not a way in, so it never counts for the last-way-in rule', async () => {
    const am = await started({ sam: ['account-security'] });
    await am.addCredential(subject('sam'), 'sam', { kind: 'totp', subject: 'sam-totp', secret: 'enc', label: 'App' });
    const key = await am.addCredential(subject('sam'), 'sam', { ...PASSKEY, subject: 'sam-key' });
    await expect(am.removeCredential(subject('sam'), 'sam', key)).rejects.toThrow(/last way into the account/);
  });

  test('a planted row is ignored AND raised: security event, escalating notice, AuthManager degraded', async () => {
    const am = await started();
    await am.addCredential(subject('molly'), 'molly', PASSKEY);
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8')) as { rows: Array<Record<string, unknown>> };
    onDisk.rows.push({ id: 'planted', username: 'molly', kind: 'passkey', subject: 'attacker', secret: 'k', label: 'x', createdAt: '2026-10-02T00:00:00.000Z' });
    fs.writeFileSync(file, JSON.stringify(onDisk));
    audit = [];

    const again = await started();
    expect((await again.listCredentials(subject('molly'), 'molly')).map(c => c.id)).not.toContain('planted');
    expect(audit).toContainEqual(expect.objectContaining({ eventType: 'security-event', action: 'credential-rejected', severity: 'high', result: 'deny' }));
    expect(notices).toContainEqual(expect.objectContaining({ level: 'error', title: expect.stringMatching(/Security alert/) }));
    expect(again.getManagerStatus()).toEqual(expect.objectContaining({ state: 'degraded', configKey: 'ngdpbase.auth.credentials.file' }));
  });

  test('without the key the store stays closed and the manager says so', async () => {
    delete process.env[CREDENTIALS_KEY_ENV];
    const am = await started();
    expect(am.getManagerStatus()).toEqual(expect.objectContaining({ state: 'degraded', configKey: CREDENTIALS_KEY_ENV }));
    await expect(am.listCredentials(subject('molly'), 'molly')).rejects.toThrow(/not available/);
  });
});

describe('credentialLabel (operator, 2026-10-04)', () => {
  test('tidies whitespace, caps the length, refuses empty', async () => {
    const { credentialLabel, CREDENTIAL_LABEL_MAX } = await import('../AuthManager');
    expect(credentialLabel('  Chrome \n on   Mac ')).toBe('Chrome on Mac');
    expect(credentialLabel('x'.repeat(80))).toHaveLength(CREDENTIAL_LABEL_MAX);
    expect(() => credentialLabel('   ')).toThrow(/Give it a name/);
    expect(() => credentialLabel(undefined)).toThrow(/Give it a name/);
  });
});
