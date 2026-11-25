/**
 * A route that fails shows a plain message, never the error's own text (#2494).
 *
 * "Regardless, I should never see an error expressed in the browser." Each case
 * forces the failure a home user's server can really hit (a missing or
 * unwritable file, a refused connection) and checks two things: the response
 * carries no Node error text and no stack line, and the full error reached the
 * server log, once. A deliberate error, written for the person, is still shown.
 */

import { Readable } from 'node:stream';
import request from 'supertest';
import WikiRoutes from '../WikiRoutes';
import { PageWriteRefusedError } from '../../managers/PageManager';
import { PasskeyRefused } from '../../managers/AuthManager';
import { UrlImportRefused, type UrlImportRefusal } from '../../managers/ImportManager';
import { PageTitleConflictError } from '../../utils/pageTitleConflict';
import { buildTestApp } from './__fixtures__/buildTestApp';
import { csrfTestHeaders } from '../../middleware/__tests__/__fixtures__/csrfTestHelpers';
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

const TRY_AGAIN = 'Try again in a moment.';

/** [handler, request additions, what the route is, status, the one sentence the person reads] */
const CASES: Array<[string, Record<string, unknown>, string, number, string]> = [
  ['adminReindex', {}, 'admin: reindex', 500, `The reindex could not be started. ${TRY_AGAIN}`],
  ['adminSyncRequiredPages', {}, 'admin: sync required pages', 500, `The required pages could not be synced. ${TRY_AGAIN}`],
  ['adminDiffApi', { query: { a: 'x', b: 'y' } }, 'admin: page diff', 500, `The page comparison could not be completed. ${TRY_AGAIN}`],
  ['adminImportPreview', { body: { sourceDir: '/imports/a' } }, 'admin: import preview', 500, 'The import preview could not be made. Check the folder and format, then try again.'],
  ['adminImportExecute', { body: { sourceDir: '/imports/a' } }, 'admin: import', 500, 'The import could not be completed. Check the folder and format, then try again.'],
  ['adminImportUrlPreview', { body: { url: 'https://example.com/a' } }, 'admin: URL import preview', 500, 'The preview of that web address could not be made. Check the address and try again.'],
  ['adminImportUrlExecute', { body: { url: 'https://example.com/a' } }, 'admin: URL import', 500, 'The page could not be imported from that web address. Check the address and try again.'],
  ['adminConvertPreview', { body: { page: 'Home' } }, 'admin: conversion preview', 500, `The conversion preview could not be made. ${TRY_AGAIN}`],
  ['adminConvertExecute', { body: { page: 'Home' } }, 'admin: conversion', 500, `The page could not be converted. ${TRY_AGAIN}`],
  ['adminCreateOrganization', { body: { name: 'Acme' } }, 'admin: create organization', 500, `The organization could not be created. ${TRY_AGAIN}`],
  ['adminUpdateOrganization', { params: { id: 'o1' }, body: { name: 'Acme' } }, 'admin: update organization', 500, `The organization could not be saved. ${TRY_AGAIN}`],
  ['adminDeleteOrganization', { params: { id: 'o1' } }, 'admin: delete organization', 500, `The organization could not be deleted. ${TRY_AGAIN}`],
  ['adminGetOrganization', { method: 'GET', params: { id: 'o1' } }, 'admin: get organization', 500, `The organization could not be loaded. ${TRY_AGAIN}`],
  ['adminGetOrganizationSchema', { method: 'GET', params: { id: 'o1' } }, 'admin: organization schema', 500, `The organization data could not be loaded. ${TRY_AGAIN}`],
  ['adminGetPersonSchema', { method: 'GET', params: { id: 'p1' } }, 'admin: person schema', 500, `The person data could not be loaded. ${TRY_AGAIN}`],
  ['checkForUpdates', { method: 'GET', configFails: true }, 'admin: check for updates', 500, 'The check for updates could not be completed. Check that this computer can reach the internet, then try again.'],
  ['apiDeletePage', { method: 'DELETE', params: { page: 'Home' } }, 'API: delete page', 500, `The page could not be deleted. ${TRY_AGAIN}`],
  ['apiRenamePage', { params: { page: 'Home' }, body: { newTitle: 'Away' } }, 'API: rename page', 500, `The page could not be renamed. ${TRY_AGAIN}`],
  ['deleteAttachment', { method: 'DELETE', params: { attachmentId: 'a1' } }, 'delete attachment', 500, `The attachment could not be deleted. ${TRY_AGAIN}`],
  ['userInfo', { method: 'GET', cookies: { sessionId: 's1' } }, 'user info', 500, `Your account details could not be loaded. ${TRY_AGAIN}`],
  ['apiUsersSearch', { method: 'GET', query: { q: 'a' } }, 'user search', 500, `The user search could not be completed. ${TRY_AGAIN}`],
  ['passkeyRegisterOptions', { method: 'GET' }, 'passkey enrol options', 400, 'Adding a passkey could not be started. Try again, or sign in another way.'],
  ['passkeyRegisterVerify', { body: { response: {}, label: 'Phone' }, session: { csrfToken: 'tok', passkeyChallenge: { value: 'c', purpose: 'register', expires: Date.now() + 60_000 } } }, 'passkey enrol verify', 400, 'The passkey could not be saved. Try adding it again.'],
  ['getPageMetadata', { method: 'GET', params: { page: 'Home' } }, 'API: page metadata', 500, `The page details could not be loaded. ${TRY_AGAIN}`],
  ['getPageSuggestions', { method: 'GET', query: { q: 'ho' } }, 'API: page suggestions', 500, `The suggestions could not be loaded. ${TRY_AGAIN}`],
  ['getPageVersions', { method: 'GET', params: { identifier: 'Home' } }, 'API: page versions', 500, `The version list could not be loaded. ${TRY_AGAIN}`],
  ['getPageVersion', { method: 'GET', params: { identifier: 'Home', version: '2' } }, 'API: one page version', 500, `The version could not be loaded. ${TRY_AGAIN}`],
  ['comparePageVersions', { method: 'GET', params: { identifier: 'Home', v1: '1', v2: '2' } }, 'API: compare versions', 500, `The versions could not be compared. ${TRY_AGAIN}`],
  ['restorePageVersion', { params: { identifier: 'Home', version: '2' } }, 'API: restore a version', 500, `The page version could not be restored. ${TRY_AGAIN}`],
  ['listDeletedPages', { method: 'GET' }, 'API: deleted pages', 500, `The list of deleted pages could not be loaded. ${TRY_AGAIN}`],
  ['restoreDeletedPage', { params: { uuid: 'u1' } }, 'API: restore deleted page', 500, `The page could not be restored. ${TRY_AGAIN}`],
  ['purgeDeletedPage', { method: 'DELETE', params: { uuid: 'u1' } }, 'API: purge deleted page', 500, `The page could not be permanently deleted. ${TRY_AGAIN}`]
];

/** The first JSON body a handler sent, or what it redirected to. */
function firstJson(res: ReturnType<typeof makeRes>): Record<string, unknown> {
  return res.json.mock.calls[0]?.[0] as Record<string, unknown>;
}

/** The sentence a response carries, whichever field this route puts it in. */
function messageOf(res: ReturnType<typeof makeRes>): unknown {
  const body = firstJson(res);
  return body?.details ?? body?.error ?? body?.message;
}

describe('a failing route shows a plain message (#2494)', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorLog = vi.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  test.each(CASES)('%s (%s): that status, that one sentence, one log line with the full error', async (handler, extra, _label, status, message) => {
    const { configFails, ...reqExtra } = extra as { configFails?: boolean };
    const routes = makeRoutes(failure, configFails === true);
    const res = makeRes();

    await routes[handler](makeReq(reqExtra), res);

    const body = sent(res);
    expect(body, `${handler} sent nothing`).not.toBe('');
    expect(body).not.toMatch(NODE_ERROR_TEXT);
    expect(body).not.toMatch(STACK_LINE);
    expect(res.statusCode).toBe(status);
    expect(messageOf(res), `${handler} sent another sentence`).toBe(message);

    // One failure, one line: the route does not log it again before the helper does.
    expect(errorLog, `${handler} logged the failure ${errorLog.mock.calls.length} times`).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorLog.mock.calls, (_k, v) => (v instanceof Error ? { message: v.message, stack: v.stack } : v));
    expect(logged, `${handler} did not log the error`).toContain('ENOENT: no such file or directory');
    expect(logged).toContain('    at ');
  });
});

describe('an error written for the person is still shown (#2494)', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorLog = vi.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  test('rename onto a name that is taken says which page has it', async () => {
    const routes = makeRoutes(() => new PageTitleConflictError('Existing', 'id-1', 'Away'));
    const res = makeRes();

    await routes.apiRenamePage(makeReq({ params: { page: 'Home' }, body: { newTitle: 'Away' } }), res);

    expect(res.statusCode).toBe(409);
    expect(firstJson(res)).toMatchObject({ message: 'A page called "Existing" already exists.' });
    expect(errorLog).not.toHaveBeenCalled();
  });

  test('rename onto a name that is too close says so', async () => {
    const routes = makeRoutes(() => new PageTitleConflictError('Existing', 'id-1', 'existing!', true));
    const res = makeRes();

    await routes.apiRenamePage(makeReq({ params: { page: 'Home' }, body: { newTitle: 'existing!' } }), res);

    expect(res.statusCode).toBe(409);
    expect(firstJson(res)).toMatchObject({ message: 'That name is too close to the name of an existing page, "Existing".' });
  });

  test('a rename the person may not make says so, and is not a server failure', async () => {
    const routes = makeRoutes(() => new PageWriteRefusedError('Home', 'page-rename'));
    const res = makeRes();

    await routes.apiRenamePage(makeReq({ params: { page: 'Home' }, body: { newTitle: 'Away' } }), res);

    expect(res.statusCode).toBe(403);
    expect(firstJson(res)).toMatchObject({ message: 'You may not rename this page' });
    expect(errorLog).not.toHaveBeenCalled();
  });

  test('a delete the person may not make says so, and is not a server failure', async () => {
    const routes = makeRoutes(() => new PageWriteRefusedError('Home', 'page-delete'));
    const res = makeRes();

    await routes.apiDeletePage(makeReq({ method: 'DELETE', params: { page: 'Home' } }), res);

    expect(res.statusCode).toBe(403);
    expect(firstJson(res)).toMatchObject({ message: 'You may not delete this page' });
    expect(errorLog).not.toHaveBeenCalled();
  });

  test('a restore the person may not make says so', async () => {
    const routes = makeRoutes(() => new PageWriteRefusedError('Home', 'page-create'));
    const res = makeRes();

    await routes.restoreDeletedPage(makeReq({ params: { uuid: 'u1' } }), res);

    expect(res.statusCode).toBe(403);
    expect(firstJson(res)).toMatchObject({ detail: 'You may not create this page' });
    expect(errorLog).not.toHaveBeenCalled();
  });
});

describe('a web address that can not be imported says why (#2494)', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorLog = vi.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  const REASONS: Array<[UrlImportRefusal, number, string]> = [
    ['invalid-address', 400, 'That is not a web address. Check that you typed or pasted all of it.'],
    ['not-web-address', 400, 'Only web addresses that start with http:// or https:// can be imported.'],
    ['not-found', 422, 'That page was not found, or the site does not let us read it. Check the address and try again.'],
    ['not-a-page', 422, 'That address is not a web page (it may be an image or a file). Use the address of a page.']
  ];

  test.each(REASONS.flatMap(([reason, status, message]) => [
    ['adminImportUrlPreview', reason, status, message],
    ['adminImportUrlExecute', reason, status, message]
  ] as Array<[string, UrlImportRefusal, number, string]>))('%s, %s: its own sentence', async (handler, reason, status, message) => {
    const routes = makeRoutes(() => new UrlImportRefused(reason, `internal text for ${reason}`));
    const res = makeRes();

    await routes[handler](makeReq({ body: { url: 'https://example.com/a' } }), res);

    expect(res.statusCode).toBe(status);
    expect(firstJson(res)).toEqual({ success: false, error: message });
    expect(errorLog).not.toHaveBeenCalled();
  });

  test('the four sentences differ', () => {
    expect(new Set(REASONS.map(([, , message]) => message)).size).toBe(4);
  });
});

describe('an organization needs a name (#2494)', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorLog = vi.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  test.each([[''], ['   ']])('a name of %j is asked for, as JSON', async (name) => {
    const routes = makeRoutes(failure);
    const res = makeRes();

    await routes.adminCreateOrganization(makeReq({ body: { name } }), res);

    expect(res.statusCode).toBe(400);
    expect(firstJson(res)).toEqual({ error: 'Give the organization a name.' });
    expect(errorLog).not.toHaveBeenCalled();
  });

  test('and on the page, it comes back to the list with that sentence', async () => {
    const routes = makeRoutes(failure);
    const res = makeRes();

    await routes.adminCreateOrganization(makeReq({ body: {}, headers: { accept: 'text/html' } }), res);

    expect(res.redirect).toHaveBeenCalledWith('/admin/organizations?error=' + encodeURIComponent('Give the organization a name.'));
    expect(errorLog).not.toHaveBeenCalled();
  });
});

describe('a passkey that can not be added says why (#2494)', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorLog = vi.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  test.each([
    ['Passkeys are not available on this site'],
    ['This account cannot sign in with a passkey']
  ])('%s', async (message) => {
    const routes = makeRoutes(() => new PasskeyRefused(message));
    const res = makeRes();

    await routes.passkeyRegisterOptions(makeReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(400);
    expect(firstJson(res)).toEqual({ error: message });
    expect(errorLog).not.toHaveBeenCalled();
  });
});

describe('an upload that can not be read shows a plain message (#2494)', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorLog = vi.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  /** A multipart body that stops in the middle of a file: the parser fails with its own, technical text. */
  const cutOffUpload = () => Object.assign(
    Readable.from([Buffer.from('--xx\r\nContent-Disposition: form-data; name="files"; filename="a.txt"\r\n\r\nhalf a file')]),
    makeReq({ headers: { 'content-type': 'multipart/form-data; boundary=xx', 'content-length': '90', accept: 'application/json' } })
  );

  test('the import upload says the file may be damaged, and logs the parser error once', async () => {
    const routes = makeRoutes(failure);
    const res = makeRes();

    await routes.importUpload(cutOffUpload(), res);

    expect(res.statusCode).toBe(400);
    expect(firstJson(res)).toEqual({
      success: false,
      error: 'The upload could not be read. Check that the file is not damaged, then upload it again.'
    });
    expect(errorLog).toHaveBeenCalledTimes(1);
  });

  test('the attachment upload says to try again, and logs the parser error once', async () => {
    const app = buildTestApp({ withCsrf: true, userContext: admin });
    new WikiRoutes({ getManager: vi.fn(() => null), logger }).registerRoutes(app);

    const response = await request(app)
      .post('/attachments/upload/Home')
      .set(csrfTestHeaders())
      .set('Content-Type', 'multipart/form-data; boundary=xx')
      .send('--xx\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\n\r\nhalf a file');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: 'The file could not be uploaded. Try again in a moment.' });
    expect(errorLog).toHaveBeenCalledTimes(1);
  });
});
