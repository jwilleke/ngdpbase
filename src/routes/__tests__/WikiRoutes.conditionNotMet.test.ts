/**
 * #2288 — a refusal because a condition was not met names that allow.
 *
 * The real PolicyEvaluator, PolicyDecisionPoint and PolicyInformationPoint on
 * the shipped configuration, with an allow of `page-edit` on `general` for
 * `editor` that needs `subject:aal` 2. A password-only editor's POST /save is
 * refused and the `authorization-deny` record names that allow in
 * `metadata.conditionNotMet`, with no attribute value. The Decision and the
 * page list carry the same ids.
 */
import fs from 'fs';
import path from 'path';
import WikiRoutes from '../WikiRoutes';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import PolicyEvaluator from '../../managers/PolicyEvaluator';

const core = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

const AAL2_ID = 'editor-general-edit-aal2';
const policies = [
  { id: AAL2_ID, effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-edit'], condition: { attribute: 'subject:aal', 'greater-or-equal': 2 } },
  { id: 'editor-general-read', effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-read'] }
];
const meta = { title: 'TestPage', uuid: 'u1', lastModified: '', 'system-category': 'general', author: 'system' };
const signedIn = (aal: number) => ({ username: 'ed', roles: ['editor'], isAuthenticated: true, signIn: { provider: 'password', factors: [], at: '2026-01-01T00:00:00Z', aal } });

let records: Array<Record<string, unknown>> = [];
let pdp: PolicyDecisionPoint;
let pip: PolicyInformationPoint;
let routes: WikiRoutes;
let pageManager: { savePage: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  records = [];
  const config: Record<string, unknown> = { ...core, 'ngdpbase.access.policies': policies };
  pageManager = {
    savePage: vi.fn().mockResolvedValue({ name: 'TestPage' }),
    getPage: vi.fn().mockResolvedValue({ content: 'old', metadata: meta }),
    getPageMetadata: vi.fn().mockResolvedValue(meta),
    pageExists: vi.fn().mockReturnValue(true),
    checkPrivatePageAccess: vi.fn().mockResolvedValue(null),
    getCurrentPageProvider: vi.fn().mockReturnValue({ pageIndex: { pages: {} } })
  } as never;
  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def) },
    ValidationManager: { getDefaultSystemCategory: () => 'general', generateValidMetadata: vi.fn((title: string, m: object) => ({ title, ...m })), getAvailableCategories: vi.fn().mockReturnValue([]), getAvailableRoles: vi.fn().mockReturnValue([]) },
    AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { records.push(e); return Promise.resolve('evt'); } },
    UserManager: { getUser: () => Promise.resolve(undefined) },
    PageManager: pageManager
  };
  const engine = { getManager: (name: string) => managers[name] ?? null } as never;
  const evaluator = new PolicyEvaluator(engine);
  pdp = new PolicyDecisionPoint(engine);
  managers.PolicyEvaluator = evaluator;
  managers.PolicyDecisionPoint = pdp;
  await evaluator.initialize();
  pip = new PolicyInformationPoint(engine);
  await pip.initialize();
  managers.PolicyInformationPoint = pip;
  routes = new WikiRoutes(engine);
  vi.spyOn(routes as never, 'getCommonTemplateData').mockResolvedValue({});
  vi.spyOn(routes as never, 'renderError').mockResolvedValue(undefined);
});

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const save = (userContext: unknown, headers: Record<string, string> = {}) => {
  const req = {
    params: { page: 'TestPage' }, session: {}, path: '/save/TestPage', userContext, headers, query: {}, get: vi.fn(),
    body: { title: 'TestPage', content: '# Test', categories: '', userKeywords: '', 'system-category': 'general', 'author-lock-present': '1' }
  };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis() };
  return { req, res };
};
const denials = () => records.filter((r) => r.eventType === 'authorization-deny');

describe('the Decision (#2288)', () => {
  const ask = (subject: unknown) => pdp.decide(subject, { action: 'page-edit', resource: { type: 'page', id: 'TestPage' }, pageMetadata: meta });

  test('a password-only editor is refused with the unmet allow named, and it is not a deciding policy', async () => {
    const d = await ask(signedIn(1));
    expect(d).toMatchObject({ permit: false, policyIds: [], conditionNotMet: [AAL2_ID] });
  });

  test('an AAL2 editor is permitted and the Decision names no unmet allow', async () => {
    const d = await ask(signedIn(2));
    expect(d).toMatchObject({ permit: true, policyIds: [AAL2_ID] });
    expect(d).not.toHaveProperty('conditionNotMet');
  });

  test('a signed-out visitor holding the role is refused with the same allow named (the level is unknown)', async () => {
    expect((await ask({ username: 'Anonymous', roles: ['editor'], isAuthenticated: false })).conditionNotMet).toEqual([AAL2_ID]);
  });
});

describe('the single path: POST /save by a password-only editor (#2288)', () => {
  test('writes one authorization-deny whose metadata names the unmet allow, and no attribute value', async () => {
    const { req, res } = save(signedIn(1));
    await routes.savePage(req, res);
    await settle();
    expect(pageManager.savePage).not.toHaveBeenCalled();
    expect((routes as never as { renderError: ReturnType<typeof vi.fn> }).renderError).toHaveBeenCalledWith(req, res, 403, 'Access Denied', expect.any(String));
    expect(denials()).toHaveLength(1);
    const record = denials()[0];
    expect(record).toMatchObject({ action: 'page-edit', resource: 'TestPage', result: 'deny', user: 'ed' });
    expect(record.metadata).toEqual({ conditionNotMet: [AAL2_ID] });
    expect(JSON.stringify(record.metadata)).not.toMatch(/subject:aal|greater-or-equal|"aal"/);
  });

  test('an AAL2 editor saves and no denial is recorded', async () => {
    const { req, res } = save(signedIn(2));
    await routes.savePage(req, res);
    await settle();
    expect(pageManager.savePage).toHaveBeenCalled();
    expect(denials()).toHaveLength(0);
  });

  test('the page door (PIP) records the same field when it refuses an edit', async () => {
    const wikiContext = { pageName: 'TestPage', content: 'x', context: 'edit', userContext: signedIn(1), pageMetadata: meta } as never;
    expect(await pip.checkPagePermissionWithContext(wikiContext, 'edit')).toBe(false);
    await settle();
    expect(denials()).toHaveLength(1);
    expect(denials()[0].metadata).toMatchObject({ conditionNotMet: [AAL2_ID] });
  });
});

describe('the list path (#2288)', () => {
  test('the compiled evaluator carries the unmet allow for the page the list leaves out, and the list agrees with the door', async () => {
    const candidates = [{ title: 'TestPage', metadata: meta }];
    expect(await pip.filterAccessiblePages(signedIn(1) as never, 'edit', candidates)).toEqual([]);
    expect(await pip.filterAccessiblePages(signedIn(2) as never, 'edit', candidates)).toEqual(['TestPage']);
    const evaluator = (pip as unknown as { policyEvaluator: PolicyEvaluator }).policyEvaluator;
    const decide = evaluator.compile(signedIn(1), 'page-edit');
    const listed = await decide('TestPage', { 'system-category': 'general' }, (n) => (n === 'subject:aal' ? 1 : undefined));
    expect(listed).toMatchObject({ hasDecision: false, conditionNotMet: [AAL2_ID] });
  });
});

describe('a signed-out form POST on a page whose policy needs subject:aal (#2289)', () => {
  const anonymous = { username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false };

  test('is redirected to sign-in and still recorded as a refusal, not shown a bare 403', async () => {
    const { req, res } = save(anonymous);
    await routes.savePage(req, res);
    await settle();
    expect(res.redirect).toHaveBeenCalledWith('/login?redirect=' + encodeURIComponent('/edit/TestPage'));
    expect((routes as never as { renderError: ReturnType<typeof vi.fn> }).renderError).not.toHaveBeenCalled();
    expect(pageManager.savePage).not.toHaveBeenCalled();
    expect(denials()).toHaveLength(1);
  });

  test('JSON is a 401', async () => {
    const { req, res } = save(anonymous, { accept: 'application/json' });
    await routes.savePage(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
