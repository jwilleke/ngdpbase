/**
 * Unit tests for WikiRoutes.adminImportPreview() — POST /admin/import/preview (#815).
 *
 * The import dialog in admin-import.ejs only displays a top-level `error`
 * string, but ImportManager failures arrive as an `errors[]` array — so every
 * preview failure surfaced as "Unknown error". The handler now composes a
 * top-level `error` summary from `errors[]` whenever the result is
 * unsuccessful. Strategy mirrors the ingest suite: spy createWikiContext,
 * mock ImportManager.
 *
 * Covers:
 * - 403 when the caller lacks admin-system
 * - 400 when sourceDir missing
 * - failure result → response carries composed `error` ("file: message; …")
 * - failure with >5 errors → summary capped at 5
 * - success result → no `error` field
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import WikiRoutes from '../WikiRoutes';
import { createMockWikiContext } from './__fixtures__/createMockWikiContext';

const ADMIN = { username: 'admin', displayName: 'Admin', roles: ['admin'], isAuthenticated: true };

function makeEngine(previewResult: unknown) {
  const importManager = { previewImport: vi.fn().mockResolvedValue(previewResult) };
  return {
    getManager: vi.fn((name: string) => (name === 'ImportManager' ? importManager : null)),
    _importManager: importManager
  };
}

function installContextSpy(routes: WikiRoutes, permitted = true) {
  const mockUserManager = { hasPermission: vi.fn().mockResolvedValue(permitted) };
  vi.spyOn(routes, 'createWikiContext').mockImplementation((req: { userContext?: unknown }, options = {}) =>
    createMockWikiContext(
      { userContext: req.userContext as never, ...options },
      { engine: (routes as unknown as { engine: unknown }).engine, mockUserManager }
    ) as never
  );
  return mockUserManager;
}

function createRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn().mockReturnThis()
  };
}

function createReq(userContext: unknown, body: Record<string, unknown>) {
  return { userContext, body, headers: {}, params: {}, query: {} } as never;
}

describe('WikiRoutes.adminImportPreview() — POST /admin/import/preview (#815)', () => {
  afterEach(() => vi.restoreAllMocks());

  test('403 when caller lacks admin-system', async () => {
    const routes = new WikiRoutes(makeEngine({}) as never);
    installContextSpy(routes, false);
    const res = createRes();
    await routes.adminImportPreview(createReq(ADMIN, { sourceDir: '/x' }), res as never);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('400 when sourceDir missing', async () => {
    const routes = new WikiRoutes(makeEngine({}) as never);
    installContextSpy(routes);
    const res = createRes();
    await routes.adminImportPreview(createReq(ADMIN, {}), res as never);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('failure result surfaces composed top-level error', async () => {
    const routes = new WikiRoutes(makeEngine({
      success: false,
      files: [],
      converted: 0,
      skipped: 0,
      failed: 0,
      errors: [{ file: '/Users/jim/Downloads/LD2450.md', message: 'Source path does not exist' }]
    }) as never);
    installContextSpy(routes);
    const res = createRes();
    await routes.adminImportPreview(createReq(ADMIN, { sourceDir: '/Users/jim/Downloads/LD2450.md' }), res as never);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('/Users/jim/Downloads/LD2450.md: Source path does not exist');
    expect(payload.errors).toHaveLength(1);
  });

  test('failure with many errors caps the summary at 5', async () => {
    const errors = Array.from({ length: 8 }, (_, i) => ({ file: `/f${i}.md`, message: `boom ${i}` }));
    const routes = new WikiRoutes(makeEngine({
      success: false, files: [], converted: 0, skipped: 0, failed: 8, errors
    }) as never);
    installContextSpy(routes);
    const res = createRes();
    await routes.adminImportPreview(createReq(ADMIN, { sourceDir: '/dir' }), res as never);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error.split(';')).toHaveLength(5);
    expect(payload.error).toContain('/f0.md: boom 0');
    expect(payload.error).not.toContain('boom 5');
  });

  test('success result carries no error field', async () => {
    const routes = new WikiRoutes(makeEngine({
      success: true,
      files: [{ sourcePath: '/dir/a.md', written: false }],
      converted: 1,
      skipped: 0,
      failed: 0,
      errors: []
    }) as never);
    installContextSpy(routes);
    const res = createRes();
    await routes.adminImportPreview(createReq(ADMIN, { sourceDir: '/dir' }), res as never);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload).not.toHaveProperty('error');
  });
});
