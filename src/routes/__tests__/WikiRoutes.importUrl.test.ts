/**
 * #1337 — admin Import from URL passes the importer's own context, and a page
 * the save-time rules refuse comes back as a 400 naming the rule, not a 500.
 */
import WikiRoutes from '../WikiRoutes';
import { PageContentValidationError } from '../../managers/PageManager';

const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

const makeReq = (body: Record<string, unknown>) => ({
  params: {}, query: {}, body, ip: '10.0.0.9',
  session: { csrfToken: 't' }, path: '/', originalUrl: '/', protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: admin
});

const makeRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis()
});

function makeRoutes(importFromUrl: ReturnType<typeof vi.fn>) {
  const engine = {
    getManager: vi.fn((name: string) => (name === 'ImportManager' ? { importFromUrl } : null))
  };
  const routes = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, r: unknown) => Promise<unknown>>;
  (routes as unknown as { createWikiContext: () => unknown }).createWikiContext =
    () => ({ userContext: admin, hasPermission: vi.fn().mockResolvedValue(true) });
  return routes;
}

describe('POST /admin/import/url/* (#1337)', () => {
  test('preview and execute import as the requesting admin', async () => {
    const importFromUrl = vi.fn().mockResolvedValue({ metadata: { title: 'T' }, warnings: [], written: false });
    const routes = makeRoutes(importFromUrl);

    await routes.adminImportUrlPreview(makeReq({ url: 'https://example.org/p' }), makeRes());
    await routes.adminImportUrlExecute(makeReq({ url: 'https://example.org/p' }), makeRes());

    expect(importFromUrl).toHaveBeenNthCalledWith(1, 'https://example.org/p', expect.objectContaining({ actorContext: admin, dryRun: true }));
    expect(importFromUrl).toHaveBeenNthCalledWith(2, 'https://example.org/p', expect.objectContaining({ actorContext: admin, dryRun: false }));
  });

  test('content the save refuses is a 400 that names the rule', async () => {
    const violation = { filterId: 'security', rule: 'no-script-tags', severity: 'error' as const, message: 'Inline <script> is not allowed', line: 3 };
    const importFromUrl = vi.fn().mockRejectedValue(new PageContentValidationError('T', [violation]));
    const routes = makeRoutes(importFromUrl);
    const res = makeRes();

    await routes.adminImportUrlExecute(makeReq({ url: 'https://example.org/p' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'The page was not imported: Inline <script> is not allowed',
      validationErrors: [violation]
    }));
  });
});
