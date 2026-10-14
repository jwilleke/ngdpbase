/**
 * Proxy access, slice 4 (#1762): choosing whom to act for — the slice that
 * turns it on.
 *
 * The session's choice is `session.actingFor` (a grant id), set and cleared
 * only by AuthManager.switchActingFor. The request subject is built by
 * AuthManager.subjectActingFor, the one helper the session middleware calls,
 * and re-checked against the live grant on every request. The store is a
 * real FileCredentialsProvider in a per-test temp directory; the policy
 * decision point is a stand-in holding a fixed table.
 *
 * Sabotaged once each (then restored): the grant-names-this-person check in
 * subjectActingFor (removed) — the "someone else's grant" test went red; clearing
 * `actingFor` on a dead grant (removed) — the revoked mid-session test went
 * red; the bearer check in sessionPerson (removed) — the
 * token test went red; the enabled check (liveProxyGrant always on) — the
 * disabled test went red; the CSRF middleware (left out of the app) — the CSRF
 * test went red; the `delete session.actingFor` in endSession (removed) — the
 * sign-out test went red; the completeSignIn offer (removed) — the sign-in
 * test went red.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import express, { type Request } from 'express';
import AuthManager, { ACTING_FOR_PATH, PROXY_ACCESS_ENABLED_KEY } from '../AuthManager';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';
import { csrfMiddleware } from '../../middleware/csrf';
import { endSession } from '../../utils/sessionEnd';
import { actorOf } from '../../context/ActorContext';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
import type { PermissionSubject } from '../UserManager';

// Generated per run: no literal after a key-shaped name.
const credentialsKey = randomBytes(32).toString('hex');

/** What each account holds. */
const HOLDS: Record<string, string[]> = {
  mom: ['proxy-grant', 'page-read', 'page-edit', 'vault-proxy'],
  jim: ['proxy-grant', 'page-read'],
  cat: ['proxy-grant', 'page-read']
};
const IP = '192.0.2.1';
const SIGN_IN = { provider: 'password', factors: [], aal: 1, amr: ['pwd'], acr: 'aal1', at: '2026-10-14T00:00:00.000Z' };

const subject = (username: string, over: Partial<PermissionSubject> = {}): PermissionSubject =>
  ({ username, roles: [`role-of-${username}`], isAuthenticated: true, ipAddress: IP, ...over });

type Session = Record<string, unknown>;
/** A signed-in interactive request for `username`, its session as the middleware sees it. */
const requestFor = (username: string, session: Session = {}, over: Record<string, unknown> = {}): Request =>
  ({ session: { username, isAuthenticated: true, signIn: SIGN_IN, ...session }, ip: IP, get: () => undefined, ...over }) as unknown as Request;
/** The session's own subject, as app.ts builds it before asking subjectActingFor. */
const selfOf = (username: string): PermissionSubject => subject(username, { signIn: SIGN_IN as never, aalCap: 1, privateStoreHandle: 'h-own' });

describe('AuthManager — acting for someone, slice 4 (#1762)', () => {
  let dir: string;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];
  let enabled: boolean;
  let audited: Array<Record<string, unknown>>;
  let am: AuthManager;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'actingfor-'));
    process.env[CREDENTIALS_KEY_ENV] = credentialsKey;
    enabled = true;
    audited = [];
    const holds = (s: PermissionSubject, action: string): boolean => (HOLDS[s.username] ?? []).includes(action);
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k === PROXY_ACCESS_ENABLED_KEY ? enabled : d),
        getCustomProperty: () => undefined,
        // Every store this test opens lives in the temp directory, never a live data tree.
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? path.join(dir, 'credentials.json') : d),
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
      UserManager: {
        getUser: () => Promise.resolve(undefined),
        hasPassword: () => Promise.resolve(true),
        deleteUserSessions: () => Promise.resolve()
      },
      AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audited.push(e); return Promise.resolve('evt'); }, flushAuditQueue: () => Promise.resolve() }
    };
    am = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
    await am.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const grantMomToJim = (permissions = ['page-read']) => am.grantProxy(subject('mom'), { owner: 'mom', proxy: 'jim', permissions });
  const switches = () => audited.filter(e => e.eventType === 'proxy-switch');

  test('switch on, then back: the subject is the person represented, viaProxy names the actor; each switch is recorded with both people', async () => {
    const grant = await grantMomToJim(['page-read', 'page-edit']);
    const req = requestFor('jim');

    expect(am.actingForChoices(req)).toEqual(expect.objectContaining({ self: 'jim', actingFor: null, grants: [expect.objectContaining({ id: grant.id, owner: 'mom' })] }));
    expect(await am.subjectActingFor(req, selfOf('jim'))).toEqual(selfOf('jim'));

    expect(await am.switchActingFor(req, grant.id)).toBe(true);
    expect(req.session.actingFor).toBe(grant.id);
    const acted = await am.subjectActingFor(req, selfOf('jim'));
    expect(acted).toEqual(expect.objectContaining({
      username: 'mom', roles: ['role-of-mom'], isAuthenticated: true, ipAddress: IP,
      // The actor's sign-in: step-up asks the actor's own fresh sign-in.
      signIn: SIGN_IN, aalCap: 1,
      viaProxy: { kind: 'proxy', grantId: grant.id, actor: 'jim', scopes: ['page-read', 'page-edit'] }
    }));
    // The session's key bag is the actor's own; the represented person's subject carries none.
    expect(acted).not.toHaveProperty('privateStoreHandle');
    expect(switches()).toEqual([expect.objectContaining({ user: 'mom', actor: 'jim', resource: grant.id, reason: 'chosen' })]);

    expect(await am.switchActingFor(req, null)).toBe(true);
    expect(req.session.actingFor).toBeUndefined();
    expect(await am.subjectActingFor(req, selfOf('jim'))).toEqual(selfOf('jim'));
    expect(switches()[1]).toEqual(expect.objectContaining({ user: 'mom', actor: 'jim', reason: 'switched-back' }));
  });

  test('a row for something done while acting names both people', async () => {
    const grant = await grantMomToJim();
    const req = requestFor('jim', { actingFor: grant.id });
    expect(actorOf(await am.subjectActingFor(req, selfOf('jim')))).toEqual({
      user: 'mom', actor: 'jim', ipAddress: IP, metadata: { origin: 'request', delegated: 'proxy', proxyGrantId: grant.id }
    });
  });

  test('a grant revoked mid-session drops the session back to the person, clears the choice, and is recorded', async () => {
    const grant = await grantMomToJim();
    const req = requestFor('jim', { actingFor: grant.id });
    expect((await am.subjectActingFor(req, selfOf('jim'))).username).toBe('mom');

    await am.revokeProxy(subject('mom'), grant.id);
    expect(await am.subjectActingFor(req, selfOf('jim'))).toEqual(selfOf('jim'));
    expect(req.session.actingFor).toBeUndefined();
    // The grant record is gone, so the row names the signed-in person alone.
    expect(switches()).toEqual([expect.objectContaining({ user: 'jim', resource: grant.id, reason: 'grant-ended' })]);
  });

  test('a grant past its end date mid-session drops it too', async () => {
    const now = Date.now();
    const grant = await am.grantProxy(subject('mom'), { owner: 'mom', proxy: 'jim', permissions: ['page-read'], expiresAt: new Date(now + 60_000).toISOString() });
    const req = requestFor('jim', { actingFor: grant.id });
    vi.spyOn(Date, 'now').mockReturnValue(now + 120_000);
    expect(await am.subjectActingFor(req, selfOf('jim'))).toEqual(selfOf('jim'));
    expect(switches()).toEqual([expect.objectContaining({ user: 'mom', actor: 'jim', reason: 'grant-ended' })]);
  });

  test('someone else\'s grant is never acted on, chosen or carried', async () => {
    const grant = await grantMomToJim();
    expect(await am.switchActingFor(requestFor('cat'), grant.id)).toBe(false);
    // A session that somehow names it (planted, or left from another account) is dropped.
    const req = requestFor('cat', { actingFor: grant.id });
    expect(await am.subjectActingFor(req, selfOf('cat'))).toEqual(selfOf('cat'));
    expect(req.session.actingFor).toBeUndefined();
    expect(await am.switchActingFor(requestFor('jim'), 'no-such-grant')).toBe(false);
  });

  test('agent-token and app requests can never act for anyone', async () => {
    const grant = await grantMomToJim();
    // A bearer request (token or app) cannot choose, even carrying a session cookie.
    const bearer = requestFor('jim', {}, { bearerAuth: true });
    expect(await am.switchActingFor(bearer, grant.id)).toBe(false);
    expect(bearer.session.actingFor).toBeUndefined();
    expect(am.actingForChoices(bearer)).toBeNull();
    // A subject that arrived with a token is never turned into a proxy subject.
    const req = requestFor('jim', { actingFor: grant.id });
    const tokenSelf = { ...selfOf('jim'), viaToken: { id: 't1', name: 'cli', scopes: ['page-read'] } };
    expect(await am.subjectActingFor(req, tokenSelf)).toEqual(tokenSelf);
  });

  test('with proxy access off the choice is ignored and cleared, and there is no choice page', async () => {
    const grant = await grantMomToJim();
    const req = requestFor('jim', { actingFor: grant.id });
    enabled = false;
    expect(await am.subjectActingFor(req, selfOf('jim'))).toEqual(selfOf('jim'));
    expect(req.session.actingFor).toBeUndefined();
    expect(switches()).toEqual([expect.objectContaining({ user: 'mom', actor: 'jim', reason: 'proxy-access-off' })]);
    expect(am.actingForChoices(requestFor('jim'))).toBeNull();
    expect(await am.switchActingFor(requestFor('jim'), grant.id)).toBe(false);
  });

  test('the private-store door still asks for vault-proxy on the subject built here', async () => {
    const plain = await grantMomToJim(['page-read']);
    const withVault = await grantMomToJim(['page-read', 'vault-proxy']);
    const without = await am.subjectActingFor(requestFor('jim', { actingFor: plain.id }), selfOf('jim'));
    const within = await am.subjectActingFor(requestFor('jim', { actingFor: withVault.id }), selfOf('jim'));
    expect(mayActInPrivateContainer(without, 'mom')).toBe(false);
    expect(mayActInPrivateContainer(within, 'mom')).toBe(true);
  });

  test('a sign-in by someone holding a grant is offered the choice first; one without is not', async () => {
    await grantMomToJim();
    const done = await am.completeSignIn(requestFor('jim', { isAuthenticated: false }), { success: true, username: 'jim', provider: 'password' }, { method: 'password', returnTo: '/view/Recipes' });
    expect(done.next).toBe(`${ACTING_FOR_PATH}?returnTo=${encodeURIComponent('/view/Recipes')}`);
    const fresh = requestFor('cat', { isAuthenticated: false, actingFor: 'left-over' });
    expect(await am.completeSignIn(fresh, { success: true, username: 'cat', provider: 'password' }, { method: 'password' })).toEqual({});
    enabled = false;
    expect(await am.completeSignIn(requestFor('jim', { isAuthenticated: false }), { success: true, username: 'jim', provider: 'password' }, { method: 'password' })).toEqual({});
  });

  test('ending the session ends the choice', async () => {
    const grant = await grantMomToJim();
    const session = { username: 'jim', actingFor: grant.id };
    endSession({ getManager: () => null }, session, 'logout', { ipAddress: IP });
    expect(session).not.toHaveProperty('actingFor');
  });

  test('the switch is a CSRF-guarded form post: without the token it never reaches the door', async () => {
    const grant = await grantMomToJim();
    const session: Session = { username: 'jim', isAuthenticated: true, csrfToken: 'tok-for-this-test' };
    const app = express();
    app.use((req, _res, next) => { (req as unknown as { session: Session }).session = session; next(); });
    app.use(express.urlencoded({ extended: false }));
    app.use(csrfMiddleware);
    app.post(ACTING_FOR_PATH, (req, res) => {
      void am.switchActingFor(req, typeof req.body.grant === 'string' && req.body.grant ? req.body.grant : null).then(ok => res.json({ ok }));
    });
    const server = app.listen(0);
    try {
      const port = (server.address() as { port: number }).port;
      const post = (body: string) => fetch(`http://127.0.0.1:${port}${ACTING_FOR_PATH}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
      expect((await post(`grant=${grant.id}`)).status).toBe(403);
      expect(session.actingFor).toBeUndefined();
      const ok = await post(`grant=${grant.id}&_csrf=tok-for-this-test`);
      expect(await ok.json()).toEqual({ ok: true });
      expect(session.actingFor).toBe(grant.id);
    } finally {
      server.close();
    }
  });
});
