/**
 * The one deactivation step (#1765): disable and delete both go through
 * AuthManager.closeAccess. Disable ends sessions and leaves the rest to be
 * refused live; delete also revokes tokens, app grants and shares and removes
 * the account's credentials — a passkey row left behind would sign in to a new
 * account later created with the same username.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AuthManager from '../AuthManager';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';

const KEY = 'test-credentials-key-not-a-secret';
const subject = (username: string) => ({ username, roles: ['admin'], isAuthenticated: true }) as never;
const PASSKEY = { kind: 'passkey' as const, subject: 'cred-ann', secret: 'public-key', label: 'Phone' };

describe('AuthManager.closeAccess — the one deactivation step (#1765)', () => {
  let dir: string;
  let file: string;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];
  let calls: string[];

  const started = async () => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (_k: string, d: unknown) => d,
        getCustomProperty: () => undefined,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? file : d),
        isBaseUrlExplicit: () => true,
        getBaseURL: () => 'https://wiki.example.com'
      },
      PolicyDecisionPoint: { permits: () => Promise.resolve(true), holds: () => Promise.resolve(true) },
      UserManager: {
        getUser: () => Promise.resolve({ password: undefined }),
        hasPassword: () => Promise.resolve(true),
        deleteUserSessions: (u: string) => { calls.push(`sessions:${u}`); return Promise.resolve(); }
      },
      AgentTokenManager: {
        listForOwner: (o: string) => [{ id: `tok-${o}`, revokedAt: null }, { id: 'tok-old', revokedAt: '2026-01-01' }],
        // #1764: the revoke door re-reads the token to confirm it is the owner's and live.
        getById: (id: string) => ({ id, owner: 'ann', revokedAt: id === 'tok-old' ? '2026-01-01' : null }),
        revoke: (id: string, by: string) => { calls.push(`token:${id}:${by}`); return Promise.resolve(true); }
      },
      OidcManager: {
        listGrants: (u: string) => Promise.resolve([{ grantId: `grant-${u}` }]),
        revokeGrant: (u: string, g: string) => { calls.push(`grant:${u}:${g}`); return Promise.resolve(true); }
      },
      ShareManager: {
        list: (o?: string) => [{ id: `share-${o}`, revokedAt: null }],
        revoke: (id: string, by: string) => { calls.push(`share:${id}:${by}`); return Promise.resolve(true); }
      },
      AuditManager: { logAuditEvent: () => Promise.resolve('evt') }
    };
    const manager = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    return manager;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'closeaccess-'));
    file = path.join(dir, 'users', 'credentials.json');
    process.env[CREDENTIALS_KEY_ENV] = KEY;
    calls = [];
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('disable ends sessions only; credentials stay, so turning the account back on restores them', async () => {
    const am = await started();
    await am.addCredential(subject('admin'), 'ann', PASSKEY);
    await am.closeAccess('ann', 'disable', subject('admin'));
    expect(calls).toEqual(['sessions:ann']);
    expect(await am.listCredentials(subject('admin'), 'ann')).toHaveLength(1);
  });

  test('delete ends sessions, revokes live tokens, app grants and shares, and removes the credentials', async () => {
    const am = await started();
    await am.addCredential(subject('admin'), 'ann', PASSKEY);
    await am.closeAccess('ann', 'delete', subject('admin'));
    expect(calls).toEqual(['sessions:ann', 'token:tok-ann:admin', 'grant:ann:grant-ann', 'share:share-ann:admin']);
    expect(await am.listCredentials(subject('admin'), 'ann')).toEqual([]);
  });

  test('a passkey of a deleted account cannot sign in to a new account with the same username', async () => {
    const am = await started();
    await am.addCredential(subject('admin'), 'ann', PASSKEY);
    await am.closeAccess('ann', 'delete', subject('admin'));
    // The new "ann" is a different person; nothing of the old one may name her.
    await am.addCredential(subject('admin'), 'ann', { ...PASSKEY, subject: 'cred-new-ann', label: 'New phone' });
    const rows = await am.listCredentials(subject('admin'), 'ann');
    expect(rows.map(r => r.label)).toEqual(['New phone']);
  });

  test('one failing owner does not stop the rest', async () => {
    const am = await started();
    (am as unknown as { engine: { getManager(n: string): unknown } }).engine.getManager('AgentTokenManager');
    const managers = am as unknown as { engine: { getManager(n: string): { listForOwner?: unknown } } };
    const tokens = managers.engine.getManager('AgentTokenManager') as { listForOwner: () => never };
    tokens.listForOwner = () => { throw new Error('token store down'); };
    await am.closeAccess('ann', 'delete', subject('admin'));
    expect(calls).toEqual(['sessions:ann', 'grant:ann:grant-ann', 'share:share-ann:admin']);
  });
});
