/**
 * The store door routes — #1414 (epic #1382).
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import WikiRoutes from '../WikiRoutes';
import { privateUserKeysPath, storeMetaPath } from '../../utils/privateStorePath';
import { clearUnlockedPrivateStores, dekFor, kekFor } from '../../utils/privateStoreUnlock';
import { clearPendingWords } from '../../utils/privateStoreDoor';

type Res = {
  render: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
};

const newRes = (): Res => {
  const res = { render: vi.fn(), redirect: vi.fn(), set: vi.fn(), send: vi.fn() } as unknown as Res;
  res.status = vi.fn(() => res);
  return res;
};

describe('store door routes (#1414)', () => {
  let testDir: string;
  let pagesDir: string;
  let audit: { logAuditEvent: ReturnType<typeof vi.fn>; flushAuditQueue: ReturnType<typeof vi.fn> };
  let routes: WikiRoutes;
  let renderError: ReturnType<typeof vi.spyOn>;
  const subject = { username: 'molly', roles: ['Authenticated'], isAuthenticated: true, privateStoreHandle: 'h1' };

  const config: Record<string, unknown> = {
    'ngdpbase.stores.default.owner': 'admin',
    'ngdpbase.stores.default.encrypt': false,
    'ngdpbase.stores.vault.owner': 'admin',
    'ngdpbase.stores.vault.encrypt': true,
    'ngdpbase.stores.yourphr.owner': 'yourphr',
    'ngdpbase.stores.yourphr.encrypt': false,
    'ngdpbase.stores.recovery.confirmretries': 1
  };
  /** #1414 step 2: where the addon owning `yourphr` stands. */
  let ownerState: string;

  const req = (kind: string, body: Record<string, unknown> = {}, userContext: Record<string, unknown> = subject) =>
    ({ params: { kind }, body: { _csrf: 't', ...body }, userContext, ip: '203.0.113.7', session: {} }) as never;

  const renderedStep = (res: Res) => (res.render.mock.calls.at(-1)?.[1] as { step?: string } | undefined)?.step;
  const renderedWords = (res: Res) => (res.render.mock.calls.at(-1)?.[1] as { words?: string[] } | undefined)?.words ?? [];

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-door-routes-'));
    ownerState = 'loaded';
    pagesDir = path.join(testDir, 'pages');
    audit = { logAuditEvent: vi.fn(async () => 'id'), flushAuditQueue: vi.fn(async () => {}) };
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (key: string, def: unknown) => (key in config ? config[key] : def),
        getResolvedDataPath: () => pagesDir
      },
      AuditManager: audit,
      AddonsManager: { storeOwnerState: () => ownerState },
      AuthManager: { authenticate: vi.fn(async (_m: string, c: { password: string }) => ({ success: c.password === 'right-pw' })) }
    };
    routes = new WikiRoutes({ getManager: (name: string) => managers[name] ?? null });
    vi.spyOn(routes, 'createWikiContext').mockImplementation(() => ({ hasPermission: async () => true }) as never);
    vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({ csrfToken: 't' });
    // Private helpers: the sign-in throttle and the failed-attempt record are the login form's, tested there.
    const internals = routes as unknown as { getLoginThrottle: () => unknown; auditAuthentication: () => Promise<void> };
    vi.spyOn(internals, 'getLoginThrottle').mockReturnValue(null);
    vi.spyOn(internals, 'auditAuthentication').mockResolvedValue(undefined);
    renderError = vi.spyOn(routes, 'renderError').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    clearPendingWords();
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  test('a request without a password sign-in (no store handle) is refused', async () => {
    const res = newRes();
    await routes.storeDoorEnter(req('default', {}, { ...subject, privateStoreHandle: undefined }), res);
    expect(renderError).toHaveBeenCalledWith(expect.anything(), expect.anything(), 403, 'Password sign-in needed', expect.any(String));
    expect(await fs.pathExists(storeMetaPath(pagesDir, 'molly', 'default'))).toBe(false);
  });

  test('policy decides, not a role name: an admin whom no policy grants store-create is refused at every door route', async () => {
    const asked: string[] = [];
    const admin = { ...subject, roles: ['admin', 'Authenticated'] };
    vi.mocked(routes.createWikiContext).mockImplementation(() => ({
      userContext: admin,
      hasPermission: async (permission: string) => { asked.push(permission); return false; }
    }) as never);

    for (const route of ['storeDoorPage', 'storeDoorEnter', 'storeDoorConfirmPage', 'storeDoorConfirm'] as const) {
      const res = newRes();
      await routes[route](req('default', {}, admin), res);
      expect(renderError).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 403, 'Access Denied', expect.stringContaining('store-create'));
      expect(res.render).not.toHaveBeenCalled();
    }
    expect(asked).toEqual(['store-create', 'store-create', 'store-create', 'store-create']);
    expect(audit.logAuditEvent).not.toHaveBeenCalled();
    expect(await fs.pathExists(storeMetaPath(pagesDir, 'molly', 'default'))).toBe(false);
  });

  test('an anonymous caller refused by policy is sent to sign in, and nothing is created', async () => {
    const anonymous = { username: 'Anonymous', roles: ['Anonymous', 'All'], isAuthenticated: false };
    vi.mocked(routes.createWikiContext).mockImplementation(() => ({
      userContext: anonymous,
      hasPermission: async () => false
    }) as never);
    const res = newRes();
    await routes.storeDoorEnter({ ...(req('default', {}, anonymous) as object), originalUrl: '/stores/default' }, res);

    expect(res.redirect).toHaveBeenCalledWith('/login?redirect=%2Fstores%2Fdefault');
    expect(audit.logAuditEvent).not.toHaveBeenCalled();
    expect(await fs.pathExists(storeMetaPath(pagesDir, 'Anonymous', 'default'))).toBe(false);
  });

  test.each([
    ['failed', 'unavailable'],
    ['disabled', 'disabled'],
    ['absent', 'not-installed']
  ])('an addon\'s kind whose owner is %s: the door is shut (503, %s) and nothing is created', async (state, reason) => {
    ownerState = state;
    const shown = newRes();
    const entered = newRes();
    await routes.storeDoorPage(req('yourphr'), shown);
    await routes.storeDoorEnter(req('yourphr'), entered);

    for (const res of [shown, entered]) {
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.render.mock.calls.at(-1)?.[1]).toMatchObject({ step: 'closed', closedReason: reason });
    }
    expect(await fs.pathExists(storeMetaPath(pagesDir, 'molly', 'yourphr'))).toBe(false);
    expect(audit.logAuditEvent).not.toHaveBeenCalled();
  });
  test('an addon\'s kind whose owner is loaded opens as any other', async () => {
    const res = newRes();
    await routes.storeDoorEnter(req('yourphr'), res);

    expect(await fs.readJson(storeMetaPath(pagesDir, 'molly', 'yourphr'))).toMatchObject({ kind: 'yourphr', encrypt: false });
  });

  test('an unknown kind is a 404', async () => {
    await routes.storeDoorPage(req('nosuch'), newRes());
    expect(renderError).toHaveBeenCalledWith(expect.anything(), expect.anything(), 404, 'Not Found', expect.any(String));
  });

  test('an unencrypted kind is recorded, then created', async () => {
    const res = newRes();
    await routes.storeDoorEnter(req('default'), res);

    expect(await fs.readJson(storeMetaPath(pagesDir, 'molly', 'default'))).toMatchObject({ kind: 'default', encrypt: false });
    expect(audit.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'store-create',
      user: 'molly',
      metadata: expect.objectContaining({ store: 'default', encrypt: false, keyCreated: false })
    }));
    expect(res.redirect).toHaveBeenCalledWith('/my/private');
  });

  test('when the record cannot be written, nothing is created (refuse on failure)', async () => {
    audit.logAuditEvent.mockRejectedValue(new Error('disk full'));
    await routes.storeDoorEnter(req('default'), newRes());

    expect(await fs.pathExists(storeMetaPath(pagesDir, 'molly', 'default'))).toBe(false);
    expect(renderError).toHaveBeenCalledWith(expect.anything(), expect.anything(), 500, 'Error', expect.stringMatching(/Nothing was saved/));
  });

  test('sealed kind, no key yet: password, words once, confirm, then keys and store written and unlocked', async () => {
    let res = newRes();
    await routes.storeDoorEnter(req('vault', { password: 'wrong' }), res);
    expect(renderedStep(res)).toBe('intro-sealed');
    expect(await fs.pathExists(privateUserKeysPath(pagesDir, 'molly'))).toBe(false);

    res = newRes();
    await routes.storeDoorEnter(req('vault', { password: 'right-pw' }), res);
    expect(renderedStep(res)).toBe('words');
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    const words = renderedWords(res);
    expect(words).toHaveLength(12);
    // Nothing exists until the words come back.
    expect(await fs.pathExists(privateUserKeysPath(pagesDir, 'molly'))).toBe(false);
    expect(await fs.pathExists(storeMetaPath(pagesDir, 'molly', 'vault'))).toBe(false);

    res = newRes();
    await routes.storeDoorConfirmPage(req('vault'), res);
    expect(renderedStep(res)).toBe('confirm');
    expect(renderedWords(res)).toEqual([]);

    res = newRes();
    const typed = Object.fromEntries(words.map((w, i) => [`word${i + 1}`, w]));
    await routes.storeDoorConfirm(req('vault', typed), res);
    expect(renderedStep(res)).toBe('done');

    expect(await fs.pathExists(privateUserKeysPath(pagesDir, 'molly'))).toBe(true);
    expect(await fs.readJson(storeMetaPath(pagesDir, 'molly', 'vault'))).toMatchObject({ kind: 'vault', encrypt: true });
    expect(audit.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'store-create',
      metadata: expect.objectContaining({ store: 'vault', encrypt: true, keyCreated: true })
    }));
    // The record never carries the words.
    expect(JSON.stringify(audit.logAuditEvent.mock.calls)).not.toContain(words[0] + ' ' + words[1]);
    // This session can now read and write the new store.
    expect(kekFor(subject as never)).toBeDefined();
    expect(dekFor(subject as never, 'molly', 'vault')).toBeDefined();
  });

  test('a miss shows a NEW set; out of attempts, nothing was created', async () => {
    let res = newRes();
    await routes.storeDoorEnter(req('vault', { password: 'right-pw' }), res);
    const first = renderedWords(res);

    const wrong = Object.fromEntries(first.map((_, i) => [`word${i + 1}`, 'nope']));
    res = newRes();
    await routes.storeDoorConfirm(req('vault', wrong), res);
    expect(renderedStep(res)).toBe('words');
    expect(renderedWords(res)).not.toEqual(first);

    res = newRes();
    await routes.storeDoorConfirm(req('vault', Object.fromEntries(first.map((w, i) => [`word${i + 1}`, w]))), res);
    expect(renderedStep(res)).toBe('exhausted');
    expect(await fs.pathExists(privateUserKeysPath(pagesDir, 'molly'))).toBe(false);
    expect(await fs.pathExists(storeMetaPath(pagesDir, 'molly', 'vault'))).toBe(false);
    expect(audit.logAuditEvent).not.toHaveBeenCalled();
  });
});
