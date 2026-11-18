/**
 * GET /admin/edit-raw/:page asks the vault door for a vault page (#2413, #2255).
 *
 * The raw editor checked `page-raw-edit` and the audience but not whether the
 * caller may enter the vault, so with `ngdpbase.vaults.admin-access` false it
 * still showed another person's page. It now asks the door the page routes
 * ask: key false refuses, key true admits an administrator to a vault that is
 * not encrypted and records the access, an encrypted vault stays closed.
 */
import fs from 'fs';
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

describe('adminEditRaw — a vault page (#2413)', () => {
  let config: Record<string, unknown>;
  let encrypted: boolean;
  let audit: Array<Record<string, unknown>>;
  let routes: WikiRoutes;
  let renderError: ReturnType<typeof vi.fn>;
  let getRawPageContent: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    config = { ...shipped };
    encrypted = false;
    audit = [];
    getRawPageContent = vi.fn(async () => ({ filePath: '/x/Diary.md', content: 'alice text' }));
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def) },
      AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audit.push(e); return Promise.resolve(); } },
      ShareManager: { isEncryptedVault: () => Promise.resolve(encrypted) },
      PageManager: {
        getRawPageContent,
        // The real container rule at a door, as PageManager applies it.
        checkPrivatePageAccess: async (ctx: { userContext?: ActorContext }, name: string, adminEntry = 'none') => {
          const parsed = parsePrivatePageName(name);
          if (!parsed) return null;
          if (!ctx.userContext) return false;
          return mayEnterVaultAtDoor(adminEntry === 'none' ? null : (managers.PolicyDecisionPoint as PolicyDecisionPoint), ctx.userContext, { owner: parsed.owner, vault: parsed.store, resource: name }, adminEntry === 'record');
        }
      }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    const evaluator = new PolicyEvaluator(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
    await evaluator.initialize();
    routes = new WikiRoutes(engine);
    vi.spyOn(routes, 'createWikiContext').mockImplementation((req: Request) =>
      ({ userContext: req.userContext, hasPermission: async () => true }) as never);
    vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
    renderError = vi.fn(async () => undefined);
    vi.spyOn(routes, 'renderError').mockImplementation(renderError as never);
  });

  const ask = async (userContext: unknown, page = PAGE) => {
    const req = { params: { page: encodeURIComponent(page) }, query: {}, session: {}, userContext } as unknown as Request;
    const res = { render: vi.fn(), status: vi.fn() } as unknown as Response;
    await routes.adminEditRaw(req, res);
    return res;
  };
  const accesses = () => audit.filter((e) => e.eventType === 'vault-admin-access');

  test('with admin-access false an admin is refused and the page is not read', async () => {
    config['ngdpbase.vaults.admin-access'] = false;
    const res = await ask(admin);
    expect(res.render).not.toHaveBeenCalled();
    expect(getRawPageContent).not.toHaveBeenCalled();
    expect(renderError).toHaveBeenCalledWith(expect.anything(), res, 403, 'Access Denied', expect.any(String));
    expect(accesses()).toHaveLength(0);
  });

  test('with admin-access true an admin opens an unencrypted vault page, recorded once', async () => {
    const res = await ask(admin);
    expect(renderError).not.toHaveBeenCalled();
    expect(res.render).toHaveBeenCalledWith('admin-edit-raw', expect.objectContaining({ pageName: PAGE, rawContent: 'alice text' }));
    expect(accesses()).toHaveLength(1);
    expect(accesses()[0]).toMatchObject({ user: 'ada', resource: PAGE, metadata: { owner: 'alice', vault: 'default' } });
  });

  test('an encrypted vault stays closed, whatever the key says', async () => {
    encrypted = true;
    const res = await ask(admin);
    expect(res.render).not.toHaveBeenCalled();
    expect(getRawPageContent).not.toHaveBeenCalled();
    expect(renderError).toHaveBeenCalledWith(expect.anything(), res, 403, 'Access Denied', expect.any(String));
  });

  test('the owner opens their own page, and no administrator access is recorded', async () => {
    const res = await ask(alice);
    expect(res.render).toHaveBeenCalled();
    expect(accesses()).toHaveLength(0);
  });

  test('a public page is read as before', async () => {
    const res = await ask(admin, 'Main');
    expect(res.render).toHaveBeenCalled();
    expect(accesses()).toHaveLength(0);
  });
});
