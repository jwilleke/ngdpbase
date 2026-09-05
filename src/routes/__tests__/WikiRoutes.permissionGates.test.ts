/**
 * #1198 — allow and deny come from hasPermission, never from a role name.
 *
 * Seventeen sites in WikiRoutes asked `hasRole('admin', …)`, which skips the
 * policy evaluator, deny policies, and the agent-token scope ceiling. Each now
 * asks policy for the permission the action is. These tests hold two things:
 * the file contains no role-name gate, and a representative site refuses when
 * policy refuses and allows when policy allows — the negative control that
 * shows the refusal moved rather than vanished. Sabotage: put
 * `wikiContext.hasRole('admin')` back at any site and the static test goes red.
 */
import fs from 'fs';
import path from 'path';
import WikiRoutes from '../WikiRoutes';

const createMockReq = (userContext: unknown, extra: Record<string, unknown> = {}) => ({
  params: {}, query: {}, body: {}, session: { csrfToken: 'tok' }, path: '/', originalUrl: '/', protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'), userContext, ...extra
});
const createMockRes = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis()
});

function makeRoutes(granted: string[], managers: Record<string, unknown> = {}) {
  const asked: string[] = [];
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'UserManager') {
        return { hasPermission: vi.fn((_u: unknown, p: string) => { asked.push(p); return Promise.resolve(granted.includes(p)); }) };
      }
      // Agent tokens are opt-in; the list route answers 503 before it asks policy otherwise.
      if (name === 'ConfigurationManager') return { getProperty: vi.fn((k: string, d: unknown) => (k === 'ngdpbase.auth.agent-token.enabled' ? true : d)) };
      return managers[name] ?? null;
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes as never, 'getCommonTemplateData').mockResolvedValue({});
  return { routes: routes as unknown as Record<string, (req: unknown, res: unknown) => Promise<unknown>>, asked };
}

const editor = { username: 'ed', isAuthenticated: true, roles: ['editor'] };

describe('#1198 no route decides allow or deny by isAuthenticated', () => {
  /**
   * The honest uses of the flag (security-posture P2): classifying a refusal
   * after policy said no, login-vs-profile chrome, sending a signed-in
   * visitor away from the login page, and a session-file sweep that reads
   * the flag off disk. Everything else asks `permitted()`.
   */
  const HONEST = new Set(['refuse', 'getCommonTemplateData', 'loginPage', 'adminLoginPage', 'sweepAnonymousSessions']);
  // `assetSearch` reads the `authenticated` alias for the #694 people-search scope — pending the operator's permission choice; it is not gated here because the test matches `isAuthenticated` only.

  test('every isAuthenticated test in WikiRoutes.ts is in a listed method', () => {
    const lines = fs.readFileSync(path.join(process.cwd(), 'src', 'routes', 'WikiRoutes.ts'), 'utf8').split('\n');
    const offenders: string[] = [];
    lines.forEach((l, i) => {
      if (!/isAuthenticated/.test(l) || /^\s*(\/\/|\*)/.test(l) || !/if \(|\? |const anonymous =/.test(l)) return;
      let method = '?';
      for (let j = i; j >= 0; j--) {
        const m = lines[j].match(/^(?:export )?(?:async )?function (\w+)|^ {2}(?:private )?(?:async )?(\w+)\(/);
        if (m) { method = m[1] ?? m[2]; break; }
      }
      if (!HONEST.has(method)) offenders.push(`${method}:${i + 1}: ${l.trim()}`);
    });
    expect(offenders).toEqual([]);
  });
});

describe('#1198 no route decides allow or deny by role name', () => {
  test('WikiRoutes.ts contains no hasRole gate', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'routes', 'WikiRoutes.ts'), 'utf8');
    const gates = src.split('\n').filter((l) =>
      /\bhasRole\(/.test(l) && !/hasRole\(username: string/.test(l) && !/^\s*(\/\/|\*)/.test(l)
    );
    expect(gates).toEqual([]);
  });
});

describe('#1198 listing every agent token asks for admin-system', () => {
  const tokens = { listAll: () => [{ id: 'all' }], listForOwner: () => [{ id: 'mine' }] };

  test('refused by policy: 403, and the permission asked is admin-system', async () => {
    // #1198: token-mint is the door to the token routes; admin-system is asked for the all= view.
    const { routes, asked } = makeRoutes(['token-mint'], { AgentTokenManager: tokens });
    const res = createMockRes();
    await routes.listAgentTokens(createMockReq(editor, { query: { all: 'true' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(asked).toContain('admin-system');
  });

  test('granted by policy: the full list, regardless of role name', async () => {
    // The subject's roles say "editor"; policy says admin-system. Policy wins —
    // that is the whole point of P2.
    const { routes } = makeRoutes(['token-mint', 'admin-system'], { AgentTokenManager: tokens });
    const res = createMockRes();
    await routes.listAgentTokens(createMockReq(editor, { query: { all: 'true' } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true, tokens: [{ id: 'all' }] });
  });
});

describe('#1198 the attachment browser asks for asset-upload', () => {
  const attachments = { getAllAttachments: async () => [] };

  test('refused by policy: 403', async () => {
    const { routes, asked } = makeRoutes([], { AttachmentManager: attachments });
    const res = createMockRes();
    await routes.browseAttachmentsApi(createMockReq(editor), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(asked).toContain('asset-upload');
  });

  test('granted by policy: allowed', async () => {
    const { routes } = makeRoutes(['asset-upload'], { AttachmentManager: attachments });
    const res = createMockRes();
    await routes.browseAttachmentsApi(createMockReq(editor), res);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});

describe('#1224 share management asks for share-manage', () => {
  const shareManager = { isEnabled: () => true, list: () => [] };

  test('refused by policy: 403, and the permission asked is share-manage', async () => {
    const { routes, asked } = makeRoutes([], { ShareManager: shareManager });
    const res = createMockRes();
    await routes.sharesList(createMockReq(editor, { get: vi.fn().mockReturnValue('') }), res);
    expect(asked).toContain('share-manage');
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('granted by policy: the list renders, regardless of role name', async () => {
    const { routes } = makeRoutes(['share-manage'], { ShareManager: shareManager });
    const res = createMockRes();
    await routes.sharesList(createMockReq(editor, { get: vi.fn().mockReturnValue('') }), res);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});
