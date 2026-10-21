/**
 * #1937: closing an account ends its sessions in the live session store — the
 * store express-session reads — not only in the user provider's own list, and
 * the startup sweep ends sessions whose account is gone, turned off or another
 * of the same name. Each end goes through endSession: audited with its reason.
 *
 * Runs against the real session-file-store, the default store, in a temporary
 * folder this test makes and removes.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import session from 'express-session';
import sessionFileStore from 'session-file-store';
import UserManager from '../UserManager';
import SessionStatsManager from '../SessionStatsManager';
import { unlockPrivateStores, getUnlockedKek, clearUnlockedPrivateStores } from '../../utils/privateStoreUnlock';

const FileStore = sessionFileStore(session);
const CREATED = '2026-10-01T10:00:00.000Z';

describe('#1937 UserManager ends closed accounts\' sessions in the live store', () => {
  let dir: string;
  let store: InstanceType<typeof FileStore>;
  let accounts: Record<string, Record<string, unknown>>;
  let audit: { logAuthentication: ReturnType<typeof vi.fn> };
  let um: UserManager;

  const put = (sid: string, data: Record<string, unknown>) => new Promise<void>((resolve, reject) =>
    store.set(sid, { cookie: { maxAge: 60_000, expires: new Date(Date.now() + 60_000) }, ...data } as never, (e: unknown) => (e ? reject(e instanceof Error ? e : new Error(String(e))) : resolve())));
  const has = (sid: string) => new Promise<boolean>((resolve) => store.get(sid, (_e: unknown, s: unknown) => resolve(Boolean(s))));
  const signedIn = (username: string, over: Record<string, unknown> = {}) =>
    ({ username, isAuthenticated: true, accountCreatedAt: CREATED, sessionGeneration: 0, signedInAt: Date.parse(CREATED) + 1000, ...over });

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1937-'));
    store = new FileStore({ path: dir, logFn: () => undefined, retries: 0 });
    accounts = {};
    audit = { logAuthentication: vi.fn(() => Promise.resolve()) };
    const stats = new SessionStatsManager({});
    stats.attachStore(store);
    const managers: Record<string, unknown> = { SessionStatsManager: stats, AuditManager: audit };
    um = new UserManager({ getManager: (n: string) => managers[n] ?? null });
    (um as unknown as { provider: unknown }).provider = { getUser: (u: string) => Promise.resolve(accounts[u] ?? null) };
    await put('ann-1', signedIn('ann', { privateStoreHandle: 'h-ann' }));
    await put('ann-2', signedIn('ann'));
    await put('bob-1', signedIn('bob'));
    await put('anon', { csrfToken: 't' });
  });

  afterEach(() => {
    clearUnlockedPrivateStores();
    // Only this test's temporary folder — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test.each(['account-deleted', 'account-disabled'] as const)('deleteUserSessions(%s) removes every session of the account from the store, audited, others untouched', async (reason) => {
    unlockPrivateStores('h-ann', 'ann', Buffer.alloc(32, 3));
    expect(await um.deleteUserSessions('ann', reason, { ipAddress: '203.0.113.9' })).toBe(2);
    expect(await has('ann-1')).toBe(false);
    expect(await has('ann-2')).toBe(false);
    expect(await has('bob-1')).toBe(true);
    expect(await has('anon')).toBe(true);
    expect(getUnlockedKek('h-ann')).toBeUndefined();
    expect(audit.logAuthentication).toHaveBeenCalledTimes(2);
    expect(audit.logAuthentication).toHaveBeenCalledWith(expect.objectContaining({ username: 'ann', ipAddress: '203.0.113.9', loginMethod: 'session' }), 'logout', reason);
  });

  test('endStaleSessions ends deleted, disabled and same-name-reused accounts\' sessions and keeps live ones', async () => {
    accounts.bob = { username: 'bob', createdAt: CREATED, isActive: true };
    await put('gone', signedIn('gone'));
    accounts.off = { username: 'off', createdAt: CREATED, isActive: false };
    await put('off-1', signedIn('off'));
    // The name was freed and taken by a new account after this session signed in.
    accounts.reused = { username: 'reused', createdAt: '2026-10-21T09:00:00.000Z', isActive: true };
    await put('reused-1', signedIn('reused'));
    // ann has no account: both her sessions go too.
    expect(await um.endStaleSessions()).toBe(5);
    expect(await has('bob-1')).toBe(true);
    expect(await has('anon')).toBe(true);
    for (const sid of ['ann-1', 'ann-2', 'gone', 'off-1', 'reused-1']) expect(await has(sid)).toBe(false);
    const reasons = audit.logAuthentication.mock.calls.map(c => `${(c[0] as { username: string }).username}:${String(c[2])}`).sort();
    expect(reasons).toEqual(['ann:account-deleted', 'ann:account-deleted', 'gone:account-deleted', 'off:account-disabled', 'reused:account-deleted']);
  });

  test('without a session store nothing is ended and nothing throws', async () => {
    const bare = new UserManager({ getManager: () => null });
    expect(await bare.deleteUserSessions('ann', 'account-deleted')).toBe(0);
  });
});
