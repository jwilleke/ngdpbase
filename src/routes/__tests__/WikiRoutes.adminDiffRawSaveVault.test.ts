/**
 * The admin diff view and the raw save apply the same checks as the raw
 * editor's GET route (#2413, #2255).
 *
 * - GET /admin/diff and /api/admin/diff, `source=required`: `uuid` and
 *   `liveUuid` must each be a plain uuid, or the request is a 400 and no file
 *   is read.
 * - POST /admin/edit-raw/:page asks the vault door before it saves, and its
 *   error view names the page, not the file on disk.
 * - A vault page name is refused when the vault check cannot run.
 */
import fs from 'fs';
import os from 'os';
import fse from 'fs-extra';
import path from 'path';
import WikiRoutes from '../WikiRoutes';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import { mayEnterVaultAtDoor } from '../../utils/privateStoreAccess';
import { parsePrivatePageName } from '../../utils/privateStorePath';
import type { ActorContext } from '../../context/ActorContext';
import type { Request, Response } from 'express';

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;
const user = (username: string, roles: string[]) => ({ username, roles, isAuthenticated: true });
const admin = user('ada', ['admin', 'vault-owner']);
const alice = user('alice', ['reader', 'vault-owner']);
const PAGE = 'vaults/alice/default/Diary';
const UUID = '11111111-2222-4333-8444-555555555555';
const LIVE_UUID = '66666666-7777-4888-9999-aaaaaaaaaaaa';

describe('admin diff and raw save — vault and path checks (#2413)', () => {
  let tmp: string;
  let requiredDir: string;
  let pagesDir: string;
  let config: Record<string, unknown>;
  let readFileSpy: ReturnType<typeof vi.spyOn>;
  let routes: WikiRoutes;
  let renderError: ReturnType<typeof vi.fn>;
  let getRawPageContent: ReturnType<typeof vi.fn>;
  let saveRaw: ReturnType<typeof vi.fn>;
  let hasCheck: boolean;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-diff-'));
    requiredDir = path.join(tmp, 'required');
    pagesDir = path.join(tmp, 'data', 'pages');
    fs.mkdirSync(requiredDir, { recursive: true });
    fs.mkdirSync(pagesDir, { recursive: true });
    fs.mkdirSync(path.join(tmp, 'data', 'vaults'), { recursive: true });
    fs.writeFileSync(path.join(requiredDir, `${UUID}.md`), '---\ntitle: Source\n---\nsource text\n');
    fs.writeFileSync(path.join(pagesDir, `${LIVE_UUID}.md`), '---\ntitle: Live\n---\nlive text\n');
    fs.writeFileSync(path.join(tmp, 'data', 'vaults', 'alice.md'), '---\ntitle: Private\n---\nalice private text\n');

    hasCheck = true;
    config = {
      ...shipped,
      'ngdpbase.page.provider.filesystem.requiredpagesdir': requiredDir,
      'ngdpbase.vaults.admin-access': false
    };
    getRawPageContent = vi.fn(async () => ({ filePath: '/srv/data/vaults/alice/Diary.md', content: 'alice text' }));
    saveRaw = vi.fn(async () => { throw Object.assign(new Error('bad indentation of a mapping entry at line 2, column 3'), { name: 'YAMLException' }); });
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (key: string, def: unknown) => (key in config ? config[key] : def),
        getResolvedDataPath: () => pagesDir
      },
      AuditManager: { logAuditEvent: () => Promise.resolve() },
      ShareManager: { isEncryptedVault: () => Promise.resolve(false) }
    };
    managers.PageManager = new Proxy({
      getRawPageContent,
      saveRawPageWithAdminOverride: saveRaw,
      readPage: vi.fn(async () => ({ ok: false, refusal: 'not-found' })),
      checkPrivatePageAccess: async (ctx: { userContext?: ActorContext }, name: string, adminEntry = 'none') => {
        const parsed = parsePrivatePageName(name);
        if (!parsed) return null;
        if (!ctx.userContext) return false;
        return mayEnterVaultAtDoor(adminEntry === 'none' ? null : (managers.PolicyDecisionPoint as PolicyDecisionPoint), ctx.userContext, { owner: parsed.owner, vault: parsed.store, resource: name }, adminEntry === 'record');
      }
    }, {
      get: (target, prop) => (prop === 'checkPrivatePageAccess' && !hasCheck ? undefined : target[prop as string])
    });
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    const evaluator = new PolicyEvaluator(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
    await evaluator.initialize();
    routes = new WikiRoutes(engine);
    vi.spyOn(routes, 'createWikiContext').mockImplementation((req: Request) =>
      ({ userContext: req.userContext, hasPermission: async () => true }) as never);
    vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
    (vi.spyOn(routes as never, 'hasAdminViewAccess') as unknown as { mockResolvedValue(v: boolean): void }).mockResolvedValue(true);
    renderError = vi.fn(async () => undefined);
    vi.spyOn(routes, 'renderError').mockImplementation(renderError as never);
    readFileSpy = vi.spyOn(fse, 'readFile');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const makeRes = () => {
    const res = { render: vi.fn(), redirect: vi.fn(), status: vi.fn(), json: vi.fn(), send: vi.fn() } as unknown as Response & Record<string, ReturnType<typeof vi.fn>>;
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    res.send.mockReturnValue(res);
    res.render.mockReturnValue(res);
    return res;
  };

  // ── diff ────────────────────────────────────────────────────────────────
  const diff = async (query: Record<string, string>) => {
    const res = makeRes();
    await routes.adminDiffApi({ query, session: {}, userContext: admin }, res);
    return res;
  };
  const readPaths = () => readFileSpy.mock.calls.map((c) => String(c[0]));

  test.each([
    ['a slash', '../vaults/alice'],
    ['dot-dot segments', '../../vaults/alice'],
    ['an absolute path', '/etc/hostname'],
    ['a name that is not a uuid', 'Diary']
  ])('liveUuid with %s is a 400 and no file is read', async (_label, liveUuid) => {
    const res = await diff({ uuid: UUID, source: 'required', liveUuid });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.not.objectContaining({ success: true }));
    expect(readPaths()).toHaveLength(0);
  });

  test('uuid with a slash or dot-dot is a 400 and no file is read', async () => {
    const res = await diff({ uuid: '../data/vaults/alice', source: 'required' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(readPaths()).toHaveLength(0);
  });

  test('a plain uuid and liveUuid still diff', async () => {
    const res = await diff({ uuid: UUID, source: 'required', liveUuid: LIVE_UUID });
    expect(res.status).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0] as { success: boolean; diffString: string; uuidB: string };
    expect(body.success).toBe(true);
    expect(body.uuidB).toBe(LIVE_UUID);
    expect(body.diffString).toContain('source text');
    expect(body.diffString).toContain('live text');
  });

  test('the same checks apply to the full-page diff view', async () => {
    const res = makeRes();
    await routes.adminDiff({ query: { uuid: UUID, source: 'required', liveUuid: '../vaults/alice' }, session: {}, userContext: admin }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.render).not.toHaveBeenCalled();
    expect(readPaths()).toHaveLength(0);
  });

  // ── raw save ────────────────────────────────────────────────────────────
  const save = async (userContext: unknown, page = PAGE) => {
    const req = { params: { page: encodeURIComponent(page) }, body: { rawContent: '---\n: : bad\n---\nx' }, query: {}, session: {}, userContext } as unknown as Request;
    const res = makeRes();
    await routes.adminSaveRaw(req, res);
    return res;
  };

  test('with admin-access false and invalid front matter, another user\'s vault page is a 403', async () => {
    const res = await save(admin);
    expect(renderError).toHaveBeenCalledWith(expect.anything(), res, 403, 'Access Denied', expect.any(String));
    expect(res.render).not.toHaveBeenCalled();
    expect(saveRaw).not.toHaveBeenCalled();
    expect(getRawPageContent).not.toHaveBeenCalled();
  });

  test('the error view for invalid front matter does not show the file on disk', async () => {
    const res = await save(alice);
    expect(res.status).toHaveBeenCalledWith(400);
    const [view, data] = res.render.mock.calls[0] as [string, Record<string, unknown>];
    expect(view).toBe('admin-edit-raw');
    expect(JSON.stringify(data)).not.toContain('/srv/data');
    expect(getRawPageContent).not.toHaveBeenCalled();
  });

  test('a public page with invalid front matter is still a 400 error view', async () => {
    const res = await save(admin, 'Main');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.render).toHaveBeenCalledWith('admin-edit-raw', expect.objectContaining({ errorMessage: expect.stringContaining('the front matter at the top') }));
  });

  // ── the vault check cannot run ──────────────────────────────────────────
  test('GET refuses a vault page name when the vault check is missing', async () => {
    hasCheck = false;
    const res = makeRes();
    await routes.adminEditRaw({ params: { page: encodeURIComponent(PAGE) }, query: {}, session: {}, userContext: alice }, res);
    expect(renderError).toHaveBeenCalledWith(expect.anything(), res, 403, 'Access Denied', expect.any(String));
    expect(getRawPageContent).not.toHaveBeenCalled();
  });

  test('POST refuses a vault page name when the vault check is missing', async () => {
    hasCheck = false;
    const res = await save(alice);
    expect(renderError).toHaveBeenCalledWith(expect.anything(), res, 403, 'Access Denied', expect.any(String));
    expect(saveRaw).not.toHaveBeenCalled();
  });

  test('GET still reads a public page when the vault check is missing', async () => {
    hasCheck = false;
    const res = makeRes();
    await routes.adminEditRaw({ params: { page: 'Main' }, query: {}, session: {}, userContext: admin }, res);
    expect(res.render).toHaveBeenCalledWith('admin-edit-raw', expect.objectContaining({ pageName: 'Main' }));
  });
});
