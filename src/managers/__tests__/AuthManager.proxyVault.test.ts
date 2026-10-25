/**
 * Proxy access, slice 5 (#1762): encrypted vaults through a wrapped key copy.
 *
 * Each person has a key pair, its private half wrapped under their own vault
 * key. A grant the owner makes with `vault-proxy` while their store is
 * unlocked seals a copy of their vault key to the proxy's public key; the
 * proxy, acting for the owner with their own store unlocked, opens it, and
 * the owner's encrypted vaults open through `dekFor`. Keys are wiped when the
 * session stops acting under that grant, however it stops.
 *
 * Real stores and a real FileCredentialsProvider, in a per-test temp
 * directory; the decision points are stand-ins holding a fixed table. Every
 * password is generated at run time.
 *
 * Sabotaged once each (then restored): both locked-store refusals in
 * sealVaultCopy (each alone is covered by the other) — the "only while
 * unlocked" test went red; the grant id match in copyFor (removed) — the
 * "another proxy" test went red; the actor check in copyFor (removed) — the
 * same test went red; dropKeyCopy in switchActingFor (removed) — the
 * switch-back test went red; dropKeyCopiesOfGrant in endProxyGrant (removed)
 * — the revoke test went red; dropKeyCopy on a dead grant in
 * subjectActingFor (removed) — the expiry test went red; both proxy refusals
 * (grantProxy's and vaultGrantBlocked's viaProxy test) — the re-delegation
 * test went red. The actor check in openKeyCopy, removed alone, stays green:
 * the copy is sealed to jim, so another person's key cannot open it anyway.
 * #2047: the job-context refusal in copyFor, removed alone, sent the
 * "a job context still naming the handle" assertion red (the handle drop in
 * jobContextFromRequest covers the other one).
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import AuthManager, { PROXY_ACCESS_ENABLED_KEY } from '../AuthManager';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';
import { TEST_PRIVATE_STORE_KDF, createEncryptedStore, createUserKeys, unwrapDek } from '../../utils/privateStoreCrypto';
import { privateUserKeysPath, storeMetaPath } from '../../utils/privateStorePath';
import {
  clearUnlockedPrivateStores,
  dekFor,
  heldKeyCopy,
  lockPrivateStores,
  openKeyCopy,
  unlockPrivateStoresWithPassword,
  unlockedStoreIdsFor
} from '../../utils/privateStoreUnlock';
import { isLockbox, type Lockbox } from '../../utils/shareLockbox';
import { jobContextFromRequest } from '../../context/JobContext';
import logger from '../../utils/logger';
import type { PermissionSubject } from '../UserManager';

// Generated per run: no literal after a key-shaped name.
const credentialsKey = randomBytes(32).toString('hex');

const HOLDS: Record<string, string[]> = {
  mom: ['proxy-grant', 'page-read', 'vault-proxy'],
  jim: ['proxy-grant', 'page-read', 'vault-proxy'],
  cat: ['proxy-grant', 'page-read', 'vault-proxy'],
  admin: ['proxy-grant', 'user-edit', 'page-read', 'vault-proxy']
};
const IP = '192.0.2.1';
const SIGN_IN = { provider: 'password', factors: [], aal: 1, amr: ['pwd'], acr: 'aal1', at: '2026-10-14T00:00:00.000Z' };
const STORE = 'default';

const subject = (username: string, over: Partial<PermissionSubject> = {}): PermissionSubject =>
  ({ username, roles: [`role-of-${username}`], isAuthenticated: true, ipAddress: IP, ...over });
const handleOf = (username: string): string => `h-${username}`;
/** The session's own subject, as app.ts builds it: with its key-bag handle. */
const selfOf = (username: string): PermissionSubject => subject(username, { signIn: SIGN_IN as never, aalCap: 1, privateStoreHandle: handleOf(username) });
const requestFor = (username: string, session: Record<string, unknown> = {}): Request =>
  ({ session: { username, isAuthenticated: true, signIn: SIGN_IN, privateStoreHandle: handleOf(username), ...session }, ip: IP, get: () => undefined }) as unknown as Request;

interface Enrolled { password: string; kek: Buffer; dek: Buffer }

describe('AuthManager — encrypted vaults through a wrapped key copy, slice 5 (#1762)', () => {
  let dir: string;
  let pagesDir: string;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];
  let audited: Array<Record<string, unknown>>;
  let logged: string[];
  let am: AuthManager;
  const people: Record<string, Enrolled> = {};

  /** A person with an encrypted `default` vault, as the store door leaves them. */
  async function enrol(username: string, opts: { withoutKeyPair?: boolean } = {}): Promise<Enrolled> {
    const password = randomBytes(12).toString('hex');
    const created = await createUserKeys(password, { kdf: TEST_PRIVATE_STORE_KDF });
    const envelope = { ...created.envelope };
    if (opts.withoutKeyPair) delete envelope.personKey;
    const store = createEncryptedStore(created.kek);
    fs.mkdirSync(path.dirname(storeMetaPath(pagesDir, username, STORE)), { recursive: true });
    fs.writeFileSync(privateUserKeysPath(pagesDir, username), JSON.stringify(envelope));
    fs.writeFileSync(storeMetaPath(pagesDir, username, STORE), JSON.stringify(store));
    people[username] = { password, kek: created.kek, dek: unwrapDek(created.kek, store) };
    return people[username];
  }

  const unlock = (username: string) => unlockPrivateStoresWithPassword({ handle: handleOf(username), username, password: people[username].password, pagesDirectory: pagesDir });
  const credentials = () => (am as unknown as { credentials: { get(id: string): { secret: string } | null } }).credentials;
  /** The sealed copy in the grant's row, as stored: unchecked here, so each test says what it expects of it. */
  const keyCopyOf = (grantId: string): unknown => {
    const row = credentials().get(grantId);
    return row ? (JSON.parse(row.secret) as { keyCopy?: unknown }).keyCopy : undefined;
  };
  const grantMomToJim = (permissions = ['page-read', 'vault-proxy'], extra: { expiresAt?: string } = {}) =>
    am.grantProxy(selfOf('mom'), { owner: 'mom', proxy: 'jim', permissions, ...extra });
  /** Jim's subject while acting for mom under `grantId`, as the session middleware builds it. */
  const actingAs = async (grantId: string, req: Request = requestFor('jim', { actingFor: grantId })) => am.subjectActingFor(req, selfOf('jim'));

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxyvault-'));
    pagesDir = path.join(dir, 'pages');
    fs.mkdirSync(pagesDir);
    process.env[CREDENTIALS_KEY_ENV] = credentialsKey;
    clearUnlockedPrivateStores();
    audited = [];
    logged = [];
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => { logged.push(args.map(a => (a instanceof Error ? a.message : JSON.stringify(a) ?? String(a))).join(' ')); return logger; }) as never);
    }
    const holds = (s: PermissionSubject, action: string): boolean => (HOLDS[s.username] ?? []).includes(action);
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k === PROXY_ACCESS_ENABLED_KEY ? true
          : k === 'ngdpbase.permissions.definitions' ? { 'page-read': {}, 'vault-proxy': {}, 'proxy-grant': {} } : d),
        getCustomProperty: () => undefined,
        // Every store this test opens lives in the temp directory, never a live data tree.
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? path.join(dir, 'credentials.json')
          : k === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir : path.join(dir, path.basename(d))),
        isBaseUrlExplicit: () => true,
        getBaseURL: () => 'https://site.example.com'
      },
      PolicyDecisionPoint: {
        holds: (s: PermissionSubject, a: string) => Promise.resolve(holds(s, a)),
        permits: (s: PermissionSubject, a: string) => Promise.resolve(holds(s, a))
      },
      PolicyInformationPoint: {
        subjectFor: (u: string) => Promise.resolve(HOLDS[u] ? subject(u, { ipAddress: undefined }) : null)
      },
      UserManager: { getUser: () => Promise.resolve(undefined), hasPassword: () => Promise.resolve(true), deleteUserSessions: () => Promise.resolve() },
      AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audited.push(e); return Promise.resolve('evt'); }, flushAuditQueue: () => Promise.resolve() }
    };
    am = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
    await am.initialize();
    await enrol('mom');
    await enrol('jim');
  });

  afterEach(() => {
    clearUnlockedPrivateStores();
    vi.restoreAllMocks();
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('the copy is made only while the owner\'s store is unlocked, with vault-proxy, to a proxy who has a key pair', async () => {
    // Locked: refused in plain words, and nothing is recorded or stored.
    expect(await am.vaultGrantBlocked(selfOf('mom'), 'mom')).toMatch(/Unlock your private store first/);
    await expect(grantMomToJim()).rejects.toThrow(/Unlock your private store first/);
    expect(await am.listProxyGrants(selfOf('mom'), { asOwner: 'mom' })).toEqual([]);

    await unlock('mom');
    expect(await am.vaultGrantBlocked(selfOf('mom'), 'mom')).toBeNull();

    // No vault-proxy: no copy.
    const plain = await grantMomToJim(['page-read']);
    expect(plain.vault).toBe('none');
    expect(keyCopyOf(plain.id)).toBeUndefined();

    // A proxy with no key pair yet: refused, with what to do about it.
    await enrol('cat', { withoutKeyPair: true });
    await expect(am.grantProxy(selfOf('mom'), { owner: 'mom', proxy: 'cat', permissions: ['vault-proxy'] }))
      .rejects.toThrow(/cat cannot be given access to your encrypted vaults yet/);

    const given = await grantMomToJim();
    expect(given.vault).toBe('copy');
    expect(isLockbox(keyCopyOf(given.id))).toBe(true);
    // The copy stays in the row: never on the grant as listed or recorded.
    expect(JSON.stringify(given)).not.toContain('keyCopy');
    expect(JSON.stringify(audited)).not.toContain('keyCopy');
    expect(audited.find(e => e.eventType === 'proxy-grant' && e.resource === given.id)).toEqual(expect.objectContaining({ metadata: expect.objectContaining({ vault: 'copy' }) }));
  });

  test('an owner with no encrypted store needs nothing unlocked: the grant opens only unencrypted vaults, with no copy', async () => {
    const view = await am.grantProxy(selfOf('cat'), { owner: 'cat', proxy: 'jim', permissions: ['vault-proxy'] });
    expect(view.vault).toBe('none');
    expect(keyCopyOf(view.id)).toBeUndefined();
  });

  test('acting for the owner with their own store unlocked, the proxy opens the owner\'s encrypted vault; recorded naming both people', async () => {
    await unlock('mom');
    const grant = await grantMomToJim();
    lockPrivateStores(handleOf('mom'));
    await unlock('jim');

    // Not acting: jim's own subject reaches nothing of mom's.
    expect(dekFor(selfOf('jim'), 'mom', STORE)).toBeUndefined();

    const acting = await actingAs(grant.id);
    expect(acting.viaProxy).toEqual(expect.objectContaining({ grantId: grant.id, actor: 'jim', keyHandle: handleOf('jim') }));
    expect(Buffer.compare(dekFor(acting, 'mom', STORE) as Buffer, people.mom.dek)).toBe(0);
    expect(unlockedStoreIdsFor(acting)).toEqual([STORE]);
    // Only mom's: the copy never opens jim's own, nor anyone else's.
    expect(dekFor(acting, 'jim', STORE)).toBeUndefined();
    expect(audited.filter(e => e.eventType === 'proxy-switch' && e.reason === 'vault-opened'))
      .toEqual([expect.objectContaining({ user: 'mom', actor: 'jim', resource: grant.id })]);

    // Opened once: the next request reuses it and records nothing more.
    await actingAs(grant.id);
    expect(audited.filter(e => e.reason === 'vault-opened')).toHaveLength(1);
  });

  test('the proxy\'s own store locked: no copy is opened and the owner\'s vault stays shut', async () => {
    await unlock('mom');
    const grant = await grantMomToJim();
    const acting = await actingAs(grant.id);
    expect(acting.viaProxy).not.toHaveProperty('keyHandle');
    expect(dekFor(acting, 'mom', STORE)).toBeUndefined();
  });

  test('switching back wipes the owner\'s keys', async () => {
    await unlock('mom');
    const grant = await grantMomToJim();
    await unlock('jim');
    const req = requestFor('jim');
    expect(await am.switchActingFor(req, grant.id)).toBe(true);
    const acting = await actingAs(grant.id, req);
    expect(dekFor(acting, 'mom', STORE)).toBeDefined();

    expect(await am.switchActingFor(req, null)).toBe(true);
    expect(heldKeyCopy(handleOf('jim'))).toBeUndefined();
    // Even a subject built before the switch reaches nothing now.
    expect(dekFor(acting, 'mom', STORE)).toBeUndefined();
    // jim's own keys stay.
    expect(dekFor(selfOf('jim'), 'jim', STORE)).toBeDefined();
  });

  test('revoking deletes the copy and wipes every session that opened it', async () => {
    await unlock('mom');
    const grant = await grantMomToJim();
    await unlock('jim');
    const acting = await actingAs(grant.id);
    expect(dekFor(acting, 'mom', STORE)).toBeDefined();

    expect(await am.revokeProxy(selfOf('mom'), grant.id)).toBe(true);
    expect(credentials().get(grant.id)).toBeNull();
    expect(dekFor(acting, 'mom', STORE)).toBeUndefined();
  });

  test('a grant past its end date: the next request drops back and wipes the keys', async () => {
    await unlock('mom');
    const grant = await grantMomToJim(['page-read', 'vault-proxy'], { expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await unlock('jim');
    const acting = await actingAs(grant.id);
    expect(dekFor(acting, 'mom', STORE)).toBeDefined();

    const later = Date.now() + 120_000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    const req = requestFor('jim', { actingFor: grant.id });
    expect(await am.subjectActingFor(req, selfOf('jim'))).toEqual(selfOf('jim'));
    expect(dekFor(acting, 'mom', STORE)).toBeUndefined();
  });

  test('signing out (the session\'s keys locked) wipes the copy with them', async () => {
    await unlock('mom');
    const grant = await grantMomToJim();
    await unlock('jim');
    const acting = await actingAs(grant.id);
    lockPrivateStores(handleOf('jim'));
    expect(dekFor(acting, 'mom', STORE)).toBeUndefined();
  });

  test('an administrator\'s grant never carries vault access, nor does a proxy\'s made for the owner', async () => {
    await unlock('mom');
    await expect(am.grantProxy(subject('admin'), { owner: 'mom', proxy: 'jim', permissions: ['vault-proxy'] })).rejects.toThrow(/never include access to their vaults/);
    const byAdmin = await am.grantProxy(subject('admin'), { owner: 'mom', proxy: 'jim', permissions: ['page-read'] });
    expect(byAdmin.vault).toBe('never');
    expect(keyCopyOf(byAdmin.id)).toBeUndefined();
    expect(await am.vaultGrantBlocked(subject('admin'), 'mom')).toMatch(/Only mom can/);

    // Re-delegation: jim acting for mom under a grant that lets him give access.
    const redelegating = await grantMomToJim(['proxy-grant', 'page-read']);
    const jimForMom = await actingAs(redelegating.id);
    await expect(am.grantProxy(jimForMom, { owner: 'mom', proxy: 'cat', permissions: ['vault-proxy'] })).rejects.toThrow(/Only mom can give access to their vaults/);
    expect((await am.proxyGrantOptions(jimForMom, 'mom')).map(o => o.name)).not.toContain('vault-proxy');
    // mom's own form offers it.
    expect((await am.proxyGrantOptions(selfOf('mom'), 'mom')).map(o => o.name)).toContain('vault-proxy');
  });

  test('another proxy cannot open someone else\'s copy', async () => {
    await enrol('cat');
    await unlock('mom');
    const grant = await grantMomToJim();
    await unlock('cat');
    const copy = keyCopyOf(grant.id) as Lockbox;

    // cat's own key cannot open a copy sealed to jim.
    expect(await openKeyCopy({ handle: handleOf('cat'), actor: 'cat', grantId: grant.id, owner: 'mom', copy, pagesDirectory: pagesDir })).toBe(false);
    // Nor can cat open it as jim, through a bag that is not jim's.
    expect(await openKeyCopy({ handle: handleOf('cat'), actor: 'jim', grantId: grant.id, owner: 'mom', copy, pagesDirectory: pagesDir })).toBe(false);

    // A claim pointing at jim's opened copy, from anyone but jim, reaches nothing.
    await unlock('jim');
    await actingAs(grant.id);
    const forged = subject('mom', { viaProxy: { kind: 'proxy', grantId: grant.id, actor: 'cat', scopes: ['vault-proxy'], keyHandle: handleOf('jim') } });
    expect(dekFor(forged, 'mom', STORE)).toBeUndefined();
    // Nor under another grant id, nor without vault-proxy in the claim.
    const otherGrant = subject('mom', { viaProxy: { kind: 'proxy', grantId: 'another-grant', actor: 'jim', scopes: ['vault-proxy'], keyHandle: handleOf('jim') } });
    expect(dekFor(otherGrant, 'mom', STORE)).toBeUndefined();
    const noVault = subject('mom', { viaProxy: { kind: 'proxy', grantId: grant.id, actor: 'jim', scopes: ['page-read'], keyHandle: handleOf('jim') } });
    expect(dekFor(noVault, 'mom', STORE)).toBeUndefined();
  });

  test('key material is never logged or recorded', async () => {
    await unlock('mom');
    const grant = await grantMomToJim();
    await unlock('jim');
    const acting = await actingAs(grant.id);
    expect(dekFor(acting, 'mom', STORE)).toBeDefined();
    await am.switchActingFor(requestFor('jim', { actingFor: grant.id }), null);
    await am.revokeProxy(selfOf('mom'), grant.id);

    const out = JSON.stringify(audited) + logged.join('\n');
    for (const who of ['mom', 'jim']) {
      for (const key of [people[who].kek, people[who].dek]) {
        expect(out).not.toContain(key.toString('base64'));
        expect(out).not.toContain(key.toString('base64url'));
        expect(out).not.toContain(key.toString('hex'));
      }
    }
    const envelope = JSON.parse(fs.readFileSync(privateUserKeysPath(pagesDir, 'jim'), 'utf8')) as { personKey: { privateWrap: { ct: string } } };
    expect(out).not.toContain(envelope.personKey.privateWrap.ct);
  });

  test('a job enqueued by the proxy reaches no key copy (#2047)', async () => {
    await unlock('mom');
    const grant = await grantMomToJim();
    await unlock('jim');
    const acting = await actingAs(grant.id);
    // The request opens mom's vault through the copy...
    expect(dekFor(acting, 'mom', STORE)).toBeDefined();

    // ...the job it enqueues does not: the handle is not in its context.
    const job = jobContextFromRequest(acting);
    expect(job.viaProxy).toEqual(expect.objectContaining({ grantId: grant.id, actor: 'jim' }));
    expect(job.viaProxy).not.toHaveProperty('keyHandle');
    expect(dekFor(job, 'mom', STORE)).toBeUndefined();
    expect(unlockedStoreIdsFor(job)).toEqual([]);

    // A job context that still names the handle (built by hand) is refused as well.
    const byHand = { ...job, viaProxy: { ...acting.viaProxy!, keyHandle: handleOf('jim') } };
    expect(dekFor(byHand, 'mom', STORE)).toBeUndefined();
    expect(unlockedStoreIdsFor(byHand)).toEqual([]);

    // The request itself still holds its copy.
    expect(dekFor(acting, 'mom', STORE)).toBeDefined();
  });
});
