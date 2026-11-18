/**
 * The private page route lets an administrator in to another person's vault
 * that is not encrypted when `ngdpbase.vaults.admin-access` is true (#2413,
 * #2255), and keeps every other refusal.
 *
 * Before this the route's gate asked the container rule alone, so an
 * administrator got the 404 of a page that is not there before the page door,
 * which does admit them, was ever asked. Run against the shipped policies and
 * a real PolicyDecisionPoint.
 */
import fs from 'fs';
import path from 'path';
import WikiRoutes from '../WikiRoutes';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
import type { Request, Response } from 'express';

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

const user = (username: string, roles: string[]) => ({ username, roles, isAuthenticated: true });
const admin = user('ada', ['admin', 'vault-owner']);
const editor = user('erin', ['editor', 'vault-owner']);
const alice = user('alice', ['reader', 'vault-owner']);

describe('privatePageRoute — an administrator in another person\'s vault (#2413)', () => {
  let config: Record<string, unknown>;
  let encrypted: boolean;
  let audit: Array<Record<string, unknown>>;
  let routes: WikiRoutes;
  let renderError: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    config = { ...shipped };
    encrypted = false;
    audit = [];
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def) },
      AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audit.push(e); return Promise.resolve(); } },
      ShareManager: { isEncryptedVault: () => Promise.resolve(encrypted) },
      // PolicyInformationPoint.canAccessPrivateContainer, on the real rule.
      PolicyInformationPoint: {
        canAccessPrivateContainer: (subject: never, owner: string) => Boolean(subject && owner) && mayActInPrivateContainer(subject, owner),
        currentSubject: async () => null
      }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    const evaluator = new PolicyEvaluator(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
    await evaluator.initialize();
    routes = new WikiRoutes(engine);
    renderError = vi.fn(async () => undefined);
    vi.spyOn(routes, 'renderError').mockImplementation(renderError as never);
  });

  const ask = async (userContext: unknown, action: 'view' | 'save' = 'view') => {
    const req = { params: { owner: 'alice', store: 'default', title: 'Diary' }, query: {}, userContext } as unknown as Request;
    const handler = vi.fn(async () => undefined);
    await (routes as unknown as { privatePageRoute(r: Request, s: Response, a: string, h: () => Promise<unknown>): Promise<unknown> })
      .privatePageRoute(req, {} as Response, action, handler);
    return { handler, req };
  };

  test.each(['view', 'save'] as const)('an admin %s of an unencrypted vault page reaches the handler, with the page named', async (action) => {
    const { handler, req } = await ask(admin, action);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(renderError).not.toHaveBeenCalled();
    expect(req.params.page).toBe('vaults/alice/default/Diary');
  });

  test('the owner still gets in', async () => {
    const { handler } = await ask(alice);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('an admin is still refused on an encrypted vault page', async () => {
    encrypted = true;
    const { handler } = await ask(admin);
    expect(handler).not.toHaveBeenCalled();
    expect(renderError).toHaveBeenCalledWith(expect.anything(), expect.anything(), 404, 'Not Found', 'The page does not exist.');
  });

  test('with admin-access false an admin is refused', async () => {
    config['ngdpbase.vaults.admin-access'] = false;
    const { handler } = await ask(admin);
    expect(handler).not.toHaveBeenCalled();
    expect(renderError).toHaveBeenCalledWith(expect.anything(), expect.anything(), 404, 'Not Found', 'The page does not exist.');
  });

  test('a non-admin is refused, whatever the key says', async () => {
    const { handler } = await ask(editor);
    expect(handler).not.toHaveBeenCalled();
    expect(renderError).toHaveBeenCalledWith(expect.anything(), expect.anything(), 404, 'Not Found', 'The page does not exist.');
  });

  test('the route records nothing itself: the page door records the access once', async () => {
    await ask(admin);
    expect(audit.filter((e) => e.eventType === 'vault-admin-access')).toHaveLength(0);
  });
});
