/**
 * The Shared folders screen under /admin (#2126, epic #1775 decision 8):
 * GET /admin/shared-folders lists the folders and who may read and file in
 * each; POST /admin/shared-folders makes one; POST
 * /admin/shared-folders/:folder/access sets who may read and file. Admins
 * only (`admin-system`); every create and access change is recorded.
 *
 * A real SharedFolderManager over a per-test mkdtemp folder (removed
 * afterwards, never a data/ tree) and a random server key; the configuration,
 * ConsentManager, the PDP and the audit sink are stand-ins.
 *
 * Sabotaged once each (then restored):
 * - the admin-system check in adminSharedFolderAccess (skipped): the
 *   non-admin test went red on the access route;
 * - the admin-system check in adminSharedFolders (skipped): the non-admin
 *   test went red on the screen.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import WikiRoutes from '../WikiRoutes';
import SharedFolderManager from '../../managers/SharedFolderManager';
import { SHARED_FOLDERS_KEY_ENV } from '../../utils/sharedFoldersKey';

type Res = {
  render: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};
const newRes = (): Res => {
  const res = { render: vi.fn(), redirect: vi.fn(), setHeader: vi.fn(), send: vi.fn(), json: vi.fn() } as unknown as Res;
  res.status = vi.fn(() => res);
  return res;
};

const ROLES = { admin: {}, editor: {}, reader: {}, 'vault-owner': {}, anonymous: {} };

describe('the Shared folders screen under /admin (#2126)', () => {
  let dir: string;
  let routes: WikiRoutes;
  let folders: SharedFolderManager;
  let audited: Array<Record<string, unknown>>;
  let custom: Record<string, unknown>;
  let setProperty: ReturnType<typeof vi.fn>;
  let renderError: ReturnType<typeof vi.fn>;
  /** The signed-in subject of each request: an admin unless a test says otherwise. */
  let subject: { username: string; roles: string[]; isAuthenticated: boolean };
  const savedKey = process.env[SHARED_FOLDERS_KEY_ENV];
  const ann = { username: 'ann', roles: ['admin'], isAuthenticated: true };
  const rita = { username: 'rita', roles: ['editor'], isAuthenticated: true };
  const isAdmin = (s: { roles: string[] }): boolean => s.roles.includes('admin');

  const req = (body: Record<string, unknown> = {}, params: Record<string, string> = {}, query: Record<string, string> = {}) => ({
    method: 'POST',
    originalUrl: '/admin/shared-folders',
    body: { _csrf: 't', ...body },
    params,
    query,
    userContext: subject,
    session: { csrfToken: 't', username: subject.username },
    protocol: 'https',
    headers: {},
    get: () => undefined
  }) as never;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-folders-admin-routes-'));
    process.env[SHARED_FOLDERS_KEY_ENV] = randomBytes(32).toString('base64');
    audited = [];
    custom = {};
    subject = ann;
    setProperty = vi.fn(async (k: string, v: unknown) => { if (v === undefined) delete custom[k]; else custom[k] = v; });
    const managers: Record<string, unknown> = {
      ConsentManager: { documents: vi.fn(async () => [{ id: 'w', version: '1' }]), pendingFor: vi.fn(async () => []) },
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k === 'ngdpbase.roles.definitions' ? ROLES : d),
        getCustomProperty: (k: string) => custom[k] ?? null,
        setProperty,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.shared-folders.storagedir' ? dir : k === 'ngdpbase.page.provider.filesystem.storagedir' ? path.join(dir, 'pages') : d)
      },
      PolicyDecisionPoint: {
        permits: async (s: { roles: string[] }, a: string) => a === 'admin-system' && isAdmin(s),
        policies: () => []
      },
      AuditManager: { logAuditEvent: vi.fn(async (e: Record<string, unknown>) => { audited.push(e); return 'id'; }), flushAuditQueue: vi.fn(async () => {}) }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null };
    folders = new SharedFolderManager(engine);
    await folders.initialize();
    managers.SharedFolderManager = folders;
    const { token, words } = await folders.prepareRecoveryWords(ann);
    await folders.saveRecoveryWords(ann, token, words.join(' '));
    await folders.createFolder(ann, 'finance');
    audited.length = 0;
    routes = new WikiRoutes(engine);
    vi.spyOn(routes, 'createWikiContext').mockImplementation(() => ({
      userContext: subject,
      hasPermission: async (p: string) => p === 'admin-system' && isAdmin(subject),
      holdsPermission: async () => false
    }) as never);
    vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({ csrfToken: 't' });
    renderError = vi.spyOn(routes, 'renderError').mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Only this test's own mkdtemp folder.
    fs.rmSync(dir, { recursive: true, force: true });
    if (savedKey === undefined) delete process.env[SHARED_FOLDERS_KEY_ENV]; else process.env[SHARED_FOLDERS_KEY_ENV] = savedKey;
  });

  describe('a non-admin is refused on every route; nothing is made, written or recorded', () => {
    const routesUnderTest: Array<[string, (r: WikiRoutes, res: Res) => Promise<unknown>]> = [
      ['GET /admin/shared-folders', (r, res) => r.adminSharedFolders(req(), res)],
      ['POST /admin/shared-folders', (r, res) => r.adminSharedFoldersMake(req({ name: 'payroll' }), res)],
      ['POST /admin/shared-folders/:folder/access', (r, res) => r.adminSharedFolderAccess(req({ read: ['editor'], file: 'editor' }, { folder: 'finance' }), res)]
    ];

    test.each(routesUnderTest)('%s, signed in without admin-system: 403', async (_name, call) => {
      subject = rita;
      const res = newRes();
      await call(routes, res);
      expect(renderError).toHaveBeenCalledWith(expect.anything(), res, 403, 'Access Denied', expect.stringContaining('admin-system'));
      expect(res.render).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
      expect(folders.folderNames()).toEqual(['finance']);
      expect(setProperty).not.toHaveBeenCalled();
      expect(audited).toEqual([]);
    });

    test.each(routesUnderTest)('%s, anonymous: sent to sign in', async (_name, call) => {
      subject = { username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false };
      const res = newRes();
      await call(routes, res);
      expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/login\?redirect=/));
      expect(res.render).not.toHaveBeenCalled();
      expect(folders.folderNames()).toEqual(['finance']);
      expect(setProperty).not.toHaveBeenCalled();
      expect(audited).toEqual([]);
    });
  });

  test('the screen lists each folder with who may read and file, and the roles to choose from (never anonymous); never cached', async () => {
    await folders.setFolderAccess(ann, 'finance', { read: ['editor'], file: [] });
    const res = newRes();
    await routes.adminSharedFolders(req({}, {}, { success: 'Saved' }), res);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.render).toHaveBeenCalledWith('admin-shared-folders', expect.objectContaining({
      folders: [{ name: 'finance', read: ['editor'], file: [], others: [] }],
      roles: ['admin', 'editor', 'reader', 'vault-owner'],
      wordsConfirmed: true,
      unavailable: null,
      success: 'Saved'
    }));
  });

  test('making a folder records it, and comes back to the screen', async () => {
    const res = newRes();
    await routes.adminSharedFoldersMake(req({ name: ' Payroll ' }), res);
    expect(folders.folderNames()).toEqual(['finance', 'payroll']);
    expect(audited.map((e) => e.eventType)).toContain('shared-folder-create');
    expect(audited.find((e) => e.eventType === 'shared-folder-create')).toMatchObject({ user: 'ann', resource: 'shared/payroll' });
    expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/shared-folders\?success=/));
  });

  test('a folder that cannot be made says why, and nothing is recorded', async () => {
    const res = newRes();
    await routes.adminSharedFoldersMake(req({ name: 'finance' }), res);
    expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/shared-folders\?error=.*already%20exists/));
    expect(audited).toEqual([]);
  });

  test('Admin → Backup\'s form still makes a folder, and goes back to Admin → Backup', async () => {
    const res = newRes();
    await routes.adminSharedFoldersCreate(req({ name: 'payroll' }), res);
    expect(folders.folderNames()).toContain('payroll');
    expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/backup\?success=.*#shared-folders-key$/));
  });

  test('setting access writes the folder\'s policies and records the change, one role or many', async () => {
    const res = newRes();
    await routes.adminSharedFolderAccess(req({ read: ['editor', 'reader'], file: 'editor' }, { folder: 'finance' }), res);
    expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/shared-folders\?success=/));
    expect(await folders.folderAccess(ann as never, 'finance')).toMatchObject({ read: ['editor', 'reader'], file: ['editor'] });
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      eventType: 'shared-folder-access-change',
      user: 'ann',
      resource: 'shared/finance',
      metadata: expect.objectContaining({ before: { read: [], file: [] }, after: { read: ['editor', 'reader'], file: ['editor'] } })
    });
  });

  test('no box ticked takes the folder\'s policies away, and is recorded', async () => {
    await folders.setFolderAccess(ann, 'finance', { read: ['editor'], file: ['editor'] });
    audited.length = 0;
    const res = newRes();
    await routes.adminSharedFolderAccess(req({}, { folder: 'finance' }), res);
    expect(await folders.folderAccess(ann as never, 'finance')).toMatchObject({ read: [], file: [] });
    expect(custom).not.toHaveProperty('ngdpbase.access.policies');
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({ eventType: 'shared-folder-access-change', metadata: expect.objectContaining({ after: { read: [], file: [] } }) });
  });

  test('a role that is not there, anonymous, or a folder that is not there: refused, said why, nothing written or recorded', async () => {
    for (const [body, folder] of [[{ read: 'ghost' }, 'finance'], [{ read: 'anonymous' }, 'finance'], [{ read: 'editor' }, 'nowhere']] as const) {
      const res = newRes();
      await routes.adminSharedFolderAccess(req(body, { folder }), res);
      expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/shared-folders\?error=/));
    }
    expect(setProperty).not.toHaveBeenCalled();
    expect(audited).toEqual([]);
  });
});
