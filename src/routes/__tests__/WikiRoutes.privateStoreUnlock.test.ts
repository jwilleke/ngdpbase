/**
 * The password prompt for a locked private store — #1448 (epic #1382).
 *
 * After a restart the session cookie survives but the unwrapped key does not.
 * These pin the unlock door's security properties: it is a password check with
 * login's throttle, it only ever unlocks the caller's own store, it cannot be
 * turned into an open redirect, and it tells an anonymous visitor nothing.
 *
 * Uses its own mkdtemp directory and removes only that.
 */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import WikiRoutes from '../WikiRoutes';
import { TEST_PRIVATE_STORE_KDF, createUserKeys } from '../../utils/privateStoreCrypto';
import { privateUserKeysPath } from '../../utils/privateStorePath';
import { clearUnlockedPrivateStores, hasUnlockedKey } from '../../utils/privateStoreUnlock';

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

describe('private store unlock door (#1448)', () => {
  let testDir: string;
  let pagesDir: string;
  let routes: WikiRoutes;
  let authenticate: ReturnType<typeof vi.fn>;
  let auditAuthentication: ReturnType<typeof vi.fn>;
  let throttle: { check: ReturnType<typeof vi.fn>; recordFailure: ReturnType<typeof vi.fn> } | null;
  let adoptUserPageCatalog: ReturnType<typeof vi.fn>;
  let migratePrivateLinks: ReturnType<typeof vi.fn>;

  /** The restart case: the session still names a key-bag handle, the bag is empty. */
  const owner = { username: 'molly', roles: ['reader'], isAuthenticated: true, privateStoreHandle: 'h1' };

  const req = (opts: {
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
    userContext?: Record<string, unknown>;
    session?: Record<string, unknown>;
  } = {}) =>
    ({
      body: { _csrf: 't', ...(opts.body ?? {}) },
      query: opts.query ?? {},
      userContext: opts.userContext ?? owner,
      session: opts.session ?? { privateStoreHandle: 'h1' },
      ip: '203.0.113.7'
    }) as never;

  async function giveMollyKeys(): Promise<void> {
    const { envelope } = createUserKeys('right-pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const keysPath = privateUserKeysPath(pagesDir, 'molly');
    await fs.ensureDir(path.dirname(keysPath));
    await fs.writeJson(keysPath, envelope);
  }

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-unlock-routes-'));
    pagesDir = path.join(testDir, 'pages');
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
    authenticate = vi.fn(async (_m: string, c: { password: string }) => ({ success: c.password === 'right-pw' }));
    adoptUserPageCatalog = vi.fn(async () => 0);
    migratePrivateLinks = vi.fn(async () => 0);
    throttle = null;
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (_key: string, def: unknown) => def,
        getResolvedDataPath: () => pagesDir
      },
      AuditManager: { logAuditEvent: vi.fn(async () => 'id'), flushAuditQueue: vi.fn(async () => {}) },
      AuthManager: { authenticate },
      // #1456: an unlock moves the owner's sealed pages into their stores' own indexes.
      PolicyInformationPoint: {
        subjectFor: vi.fn(async (username: string) => ({ username, roles: ['Authenticated'], isAuthenticated: true }))
      },
      PageManager: { adoptUserPageCatalog, migratePrivateLinks }
    };
    routes = new WikiRoutes({ getManager: (name: string) => managers[name] ?? null });
    vi.spyOn(routes, 'createWikiContext').mockImplementation(() => ({ hasPermission: async () => true }) as never);
    vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({ csrfToken: 't' });
    const internals = routes as unknown as { getLoginThrottle: () => unknown; auditAuthentication: () => Promise<void> };
    vi.spyOn(internals, 'getLoginThrottle').mockImplementation(() => throttle);
    auditAuthentication = vi.fn(async () => undefined);
    vi.spyOn(internals, 'auditAuthentication').mockImplementation(auditAuthentication);
    vi.spyOn(routes, 'renderError').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  test('a locked owner is shown the password prompt, carrying where they were going', async () => {
    await giveMollyKeys();
    const res = newRes();
    await routes.privateStoreUnlockPage(req({ query: { next: '/view/Journal' } }), res);
    expect(res.render).toHaveBeenCalledWith('private-store-unlock', expect.objectContaining({ next: '/view/Journal' }));
  });

  test('the right password unlocks the store and returns to the page', async () => {
    await giveMollyKeys();
    const res = newRes();
    await routes.privateStoreUnlock(req({ body: { password: 'right-pw', next: '/view/Journal' } }), res);
    expect(res.redirect).toHaveBeenCalledWith('/view/Journal');
    // The session's existing handle was reused — the restart case.
    expect(hasUnlockedKey({ privateStoreHandle: 'h1' })).toBe(true);
    expect(auditAuthentication).toHaveBeenCalledWith(expect.anything(), 'molly', 'success', 'private store unlocked');
    // The owner's sealed pages are adopted as the owner, through the unlocked session.
    expect(adoptUserPageCatalog).toHaveBeenCalledWith(expect.objectContaining({ username: 'molly', privateStoreHandle: 'h1' }));
    // #1457: and their links are migrated here, for the same reason — an
    // encrypted store cannot be read by the boot pass, only by its owner.
    expect(migratePrivateLinks).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'molly', privateStoreHandle: 'h1' }),
      'molly'
    );
  });

  test('a wrong password leaves it locked and says so', async () => {
    await giveMollyKeys();
    const res = newRes();
    await routes.privateStoreUnlock(req({ body: { password: 'wrong', next: '/view/Journal' } }), res);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.render).toHaveBeenCalledWith('private-store-unlock', expect.objectContaining({ error: 'That password is not correct.' }));
    expect(hasUnlockedKey({ privateStoreHandle: 'h1' })).toBe(false);
  });

  test('login\'s throttle applies — a blocked caller is refused even with the right password', async () => {
    // An unlock prompt IS a password check; an unthrottled one would be a way
    // to guess passwords around the sign-in form's limits.
    await giveMollyKeys();
    throttle = { check: vi.fn(() => ({ blocked: true })), recordFailure: vi.fn() };
    const res = newRes();
    await routes.privateStoreUnlock(req({ body: { password: 'right-pw', next: '/' } }), res);
    expect(authenticate).not.toHaveBeenCalled();
    expect(hasUnlockedKey({ privateStoreHandle: 'h1' })).toBe(false);
  });

  test('a failed attempt is recorded against the throttle', async () => {
    await giveMollyKeys();
    throttle = { check: vi.fn(() => ({ blocked: false })), recordFailure: vi.fn() };
    await routes.privateStoreUnlock(req({ body: { password: 'wrong', next: '/' } }), newRes());
    expect(throttle.recordFailure).toHaveBeenCalled();
  });

  test.each([
    ['//evil.example/phish'],
    ['https://evil.example/'],
    ['/\\evil.example'],
    ['javascript:alert(1)']
  ])('an off-site return address %s is refused — it is not an open redirect', async (next) => {
    await giveMollyKeys();
    const res = newRes();
    await routes.privateStoreUnlock(req({ body: { password: 'right-pw', next } }), res);
    const target = res.redirect.mock.calls.at(-1)?.[0] as string;
    expect(target.startsWith('/')).toBe(true);
    expect(target.startsWith('//')).toBe(false);
    expect(target).not.toContain('evil');
  });

  test('a session signed in without a password gets a fresh handle, and the password unlocks it', async () => {
    await giveMollyKeys();
    const session: Record<string, unknown> = {};
    const res = newRes();
    await routes.privateStoreUnlock(
      req({ body: { password: 'right-pw', next: '/' }, userContext: { ...owner, privateStoreHandle: undefined }, session }),
      res
    );
    expect(typeof session.privateStoreHandle).toBe('string');
    expect(hasUnlockedKey({ privateStoreHandle: session.privateStoreHandle })).toBe(true);
  });

  test('a user with no encrypted store is sent straight back — nothing to unlock', async () => {
    const res = newRes();
    await routes.privateStoreUnlockPage(req({ query: { next: '/view/Home' } }), res);
    expect(res.redirect).toHaveBeenCalledWith('/view/Home');
    expect(res.render).not.toHaveBeenCalled();
  });

  test('an anonymous visitor is sent back and no password is ever checked', async () => {
    await giveMollyKeys();
    const anonymous = { username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false };
    const res = newRes();
    await routes.privateStoreUnlock(req({ body: { password: 'right-pw', next: '/' }, userContext: anonymous, session: {} }), res);
    expect(res.redirect).toHaveBeenCalledWith('/');
    expect(authenticate).not.toHaveBeenCalled();
  });

  test('one user cannot unlock another\'s store — only the subject\'s own keys are read', async () => {
    // molly has a store; root (no keys) submits molly's password. There is
    // nothing of root's to unlock, so it is refused before any check, and
    // molly's store stays locked.
    await giveMollyKeys();
    const root = { username: 'root', roles: ['admin'], isAuthenticated: true, privateStoreHandle: 'h2' };
    const res = newRes();
    await routes.privateStoreUnlock(req({ body: { password: 'right-pw', next: '/' }, userContext: root, session: { privateStoreHandle: 'h2' } }), res);
    expect(authenticate).not.toHaveBeenCalled();
    expect(hasUnlockedKey({ privateStoreHandle: 'h2' })).toBe(false);
    expect(hasUnlockedKey({ privateStoreHandle: 'h1' })).toBe(false);
  });
});
