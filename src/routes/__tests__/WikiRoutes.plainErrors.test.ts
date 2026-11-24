/**
 * A route that fails shows a plain message, never the error's own text (#2494).
 *
 * "Regardless, I should never see an error expressed in the browser." Each case
 * forces the failure a home user's server can really hit (a missing or
 * unwritable file, a refused connection) and checks two things: the response
 * carries no Node error text and no stack line, and the full error reached the
 * server log.
 */

import WikiRoutes from '../WikiRoutes';
import logger from '../../utils/logger';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';

const NODE_ERROR_TEXT = /ENOENT|EACCES|ECONNREFUSED|no such file|permission denied|connect ECONN/i;
const STACK_LINE = /\n?\s{2,}at\s/;

const failure = () => Object.assign(
  new Error("ENOENT: no such file or directory, open '/data/pages/x.md' EACCES ECONNREFUSED"),
  { code: 'ENOENT' }
);

const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

/** Every method of a manager throws the failure, sync or async, so whichever one the route reaches fails. */
function failingManager(err: () => Error): object {
  return new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      if (prop === 'provider') return failingManager(err);
      return vi.fn(() => { throw err(); });
    }
  });
}

function makeRoutes(err: () => Error, configFails = false) {
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'PluginManager') return TEST_PLUGIN_MANAGER;
      if (name === 'PolicyDecisionPoint') {
        return { permits: vi.fn().mockResolvedValue(true), rolePermissionLists: vi.fn(() => ({})) };
      }
      if (name === 'ConfigurationManager') {
        const reads: Record<string, unknown> = {
          getProperty: vi.fn((_k: string, def: unknown) => { if (configFails) throw err(); return def; }),
          getDefaultProperties: () => ({}),
          getCustomProperties: () => ({}),
          getAllProperties: () => ({})
        };
        return new Proxy(reads, {
          get: (t, prop) => (prop in t ? t[prop as string] : prop === 'then' ? undefined : vi.fn(() => { throw err(); }))
        });
      }
      return failingManager(err);
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  return routes as unknown as Record<string, (req: unknown, res: unknown) => Promise<unknown>>;
}

function makeReq(extra: Record<string, unknown> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    headers: { accept: 'application/json' },
    session: { csrfToken: 'tok' },
    method: 'POST',
    path: '/x',
    originalUrl: '/x',
    protocol: 'http',
    ip: '127.0.0.1',
    get: vi.fn().mockReturnValue('localhost:3000'),
    userContext: admin,
    ...extra
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    status: vi.fn((code: number) => { res.statusCode = code; return res; }),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    render: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis()
  };
  return res;
}

/** Everything the handler sent to the browser, as one string. */
function sent(res: ReturnType<typeof makeRes>): string {
  const calls = [res.json, res.send, res.redirect, res.render, res.write, res.end].flatMap((m) => m.mock.calls);
  return calls.map((c) => JSON.stringify(c)).join('\n');
}

/** [handler, request additions, what the route is] */
const CASES: Array<[string, Record<string, unknown>, string]> = [
  ['adminReindex', {}, 'admin: reindex'],
  ['adminSyncRequiredPages', {}, 'admin: sync required pages'],
  ['adminDiffApi', { query: { a: 'x', b: 'y' } }, 'admin: page diff'],
  ['adminImportPreview', { body: { sourceDir: '/imports/a' } }, 'admin: import preview'],
  ['adminImportExecute', { body: { sourceDir: '/imports/a' } }, 'admin: import'],
  ['adminImportUrlPreview', { body: { url: 'https://example.com/a' } }, 'admin: URL import preview'],
  ['adminImportUrlExecute', { body: { url: 'https://example.com/a' } }, 'admin: URL import'],
  ['adminConvertPreview', { body: { page: 'Home' } }, 'admin: conversion preview'],
  ['adminConvertExecute', { body: { page: 'Home' } }, 'admin: conversion'],
  ['adminCreateOrganization', { body: { name: 'Acme' } }, 'admin: create organization'],
  ['adminUpdateOrganization', { params: { id: 'o1' }, body: { name: 'Acme' } }, 'admin: update organization'],
  ['adminDeleteOrganization', { params: { id: 'o1' } }, 'admin: delete organization'],
  ['adminGetOrganization', { method: 'GET', params: { id: 'o1' } }, 'admin: get organization'],
  ['adminGetOrganizationSchema', { method: 'GET', params: { id: 'o1' } }, 'admin: organization schema'],
  ['adminGetPersonSchema', { method: 'GET', params: { id: 'p1' } }, 'admin: person schema'],
  ['checkForUpdates', { method: 'GET', configFails: true }, 'admin: check for updates'],
  ['apiDeletePage', { method: 'DELETE', params: { page: 'Home' } }, 'API: delete page'],
  ['apiRenamePage', { params: { page: 'Home' }, body: { newTitle: 'Away' } }, 'API: rename page'],
  ['deleteAttachment', { method: 'DELETE', params: { attachmentId: 'a1' } }, 'delete attachment'],
  ['userInfo', { method: 'GET', cookies: { sessionId: 's1' } }, 'user info'],
  ['apiUsersSearch', { method: 'GET', query: { q: 'a' } }, 'user search'],
  ['passkeyRegisterOptions', { method: 'GET' }, 'passkey enrol options'],
  ['getPageMetadata', { method: 'GET', params: { page: 'Home' } }, 'API: page metadata'],
  ['getPageSuggestions', { method: 'GET', query: { q: 'ho' } }, 'API: page suggestions'],
  ['getPageVersions', { method: 'GET', params: { page: 'Home' } }, 'API: page versions'],
  ['listDeletedPages', { method: 'GET' }, 'API: deleted pages'],
  ['purgeDeletedPage', { method: 'DELETE', params: { uuid: 'u1' } }, 'API: purge deleted page']
];

describe('a failing route shows a plain message (#2494)', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorLog = vi.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  test.each(CASES)('%s (%s): no Node error text in the response, full error in the log', async (handler, extra) => {
    const { configFails, ...reqExtra } = extra as { configFails?: boolean };
    const routes = makeRoutes(failure, configFails === true);
    const res = makeRes();

    await routes[handler](makeReq(reqExtra), res);

    const body = sent(res);
    expect(body, `${handler} sent nothing`).not.toBe('');
    expect(body).not.toMatch(NODE_ERROR_TEXT);
    expect(body).not.toMatch(STACK_LINE);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);

    const logged = JSON.stringify(errorLog.mock.calls, (_k, v) => (v instanceof Error ? { message: v.message, stack: v.stack } : v));
    expect(logged, `${handler} did not log the error`).toContain('ENOENT: no such file or directory');
    expect(logged).toContain('    at ');
  });
});
