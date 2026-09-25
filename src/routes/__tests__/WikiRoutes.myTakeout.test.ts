/**
 * The owner's own download (#1387).
 *
 * The properties that matter are about refusal and about record-keeping, not
 * about zip mechanics — those are `zipArchive`'s own tests:
 *
 *   - only the requester's own store, and only through the manager door;
 *   - a LOCKED store is refused with an explanation, never a download that
 *     arrives unreadable;
 *   - the archive is not written anywhere, it is streamed;
 *   - it is audited under its own event, because a decrypted copy of someone's
 *     whole private store leaving the building is not a `page-export`.
 */

import express from 'express';
import request from 'supertest';
import WikiRoutes from '../WikiRoutes';
import type { Request, Response } from 'express';
import { AUDIT_EVENT } from '../../utils/auditEventNames';
import { TakeoutImportRefused } from '../../managers/ImportManager';

type Res = Response & {
  setHeader: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
};

const newRes = (): Res => {
  const res = {
    setHeader: vi.fn(),
    end: vi.fn(),
    render: vi.fn(),
    redirect: vi.fn(),
    send: vi.fn()
  } as unknown as Res;
  (res as unknown as { status: unknown }).status = vi.fn(() => res);
  return res;
};

const MOLLY = { username: 'molly', isAuthenticated: true, roles: ['editor'] };

function makeRoutes(options: {
  takeout?: unknown;
  buildThrows?: Error;
  stores?: string[];
  importThrows?: Error;
  maxSize?: number;
} = {}) {
  const logAuditEvent = vi.fn().mockResolvedValue('evt-1');
  const buildOwnStoreTakeout = vi.fn(async () => {
    if (options.buildThrows) throw options.buildThrows;
    return options.takeout ?? {
      files: [{ path: 'vault/Recipes.md', bytes: Buffer.from('# Recipes\n'), mtime: new Date() }],
      pageCount: 1,
      attachmentCount: 0,
      totalBytes: 10
    };
  });
  const pageManager = {
    buildOwnStoreTakeout,
    listOwnStoreIds: vi.fn(async () => options.stores ?? ['vault'])
  };

  const importOwnStoreTakeout = vi.fn(async (_ctx: unknown, opts: { store: string }) => {
    if (options.importThrows) throw options.importThrows;
    return {
      store: opts.store,
      pages: [{ title: 'Recipes', outcome: 'imported', importedAs: 'private/molly/vault/Recipes' }, { title: 'Soup', outcome: 'unchanged' }],
      files: 2,
      fileErrors: [],
      unlinkedFiles: ['scan.pdf'],
      ignored: []
    };
  });

  const managers: Record<string, unknown> = {
    PageManager: pageManager,
    ImportManager: { importOwnStoreTakeout },
    AuditManager: { logAuditEvent, flushAuditQueue: vi.fn() },
    ConfigurationManager: {
      getProperty: (k: string, d: unknown) => (k === 'ngdpbase.stores.import.maxsize' && options.maxSize ? options.maxSize : d)
    }
  };

  const routes = new WikiRoutes({ getManager: (n: string) => managers[n] ?? null });
  vi.spyOn(routes, 'createWikiContext').mockImplementation((req: Request) =>
    ({ userContext: req.userContext, hasPermission: async () => true }) as never);
  vi.spyOn(routes as unknown as { permitted: () => Promise<boolean> }, 'permitted')
    .mockResolvedValue(true);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({ csrfToken: 't' });
  const renderError = vi.fn(async () => undefined);
  vi.spyOn(routes, 'renderError').mockImplementation(renderError as never);

  return { routes, renderError, logAuditEvent, buildOwnStoreTakeout, pageManager, importOwnStoreTakeout };
}

const post = (body: Record<string, unknown>, user: unknown = MOLLY) =>
  ({ body, params: {}, query: {}, ip: '10.0.0.9', userContext: user, session: { csrfToken: 't' } }) as unknown as Request;

describe('POST /my/takeout (#1387)', () => {
  test('sends a zip as an attachment, and writes nothing to disk', async () => {
    const { routes } = makeRoutes();
    const res = newRes();

    await (routes as unknown as { myTakeoutDownload: (q: Request, s: Response) => Promise<unknown> })
      .myTakeoutDownload(post({ store: 'vault' }), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    const disposition = res.setHeader.mock.calls.find(c => c[0] === 'Content-Disposition')?.[1] as string;
    expect(disposition).toMatch(/^attachment; filename="takeout-vault-\d{4}-\d{2}-\d{2}\.zip"$/);

    // The bytes went straight out; `end` carries the archive.
    const sent = res.end.mock.calls[0][0] as Buffer;
    expect(Buffer.isBuffer(sent)).toBe(true);
    expect(sent.subarray(0, 2).toString('binary')).toBe('PK');
  });

  test('it is not cached — a takeout is the last thing a shared browser should keep', async () => {
    const { routes } = makeRoutes();
    const res = newRes();

    await (routes as unknown as { myTakeoutDownload: (q: Request, s: Response) => Promise<unknown> })
      .myTakeoutDownload(post({ store: 'vault' }), res);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  test('a locked store is refused with an explanation, not a broken download', async () => {
    const { routes, renderError } = makeRoutes({
      buildThrows: new Error('encrypted store is locked: missing DEK')
    });
    const res = newRes();

    await (routes as unknown as { myTakeoutDownload: (q: Request, s: Response) => Promise<unknown> })
      .myTakeoutDownload(post({ store: 'vault' }), res);

    expect(res.end).not.toHaveBeenCalled();
    expect(renderError).toHaveBeenCalledWith(
      expect.anything(), res, 409, 'Locked', expect.stringMatching(/unlock/i)
    );
  });

  test('the manager decides whose store it is — the route never names an owner', async () => {
    const { routes, buildOwnStoreTakeout } = makeRoutes();
    const res = newRes();

    await (routes as unknown as { myTakeoutDownload: (q: Request, s: Response) => Promise<unknown> })
      .myTakeoutDownload(post({ store: 'vault' }), res);

    // Requester positional, options carrying no owner: ownership is not the
    // route's to assert, and an owner parameter here could be anyone's.
    expect(buildOwnStoreTakeout).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'molly' }),
      { store: 'vault', pagesOnly: false }
    );
  });

  test('pagesOnly is carried through', async () => {
    const { routes, buildOwnStoreTakeout } = makeRoutes();
    const res = newRes();

    await (routes as unknown as { myTakeoutDownload: (q: Request, s: Response) => Promise<unknown> })
      .myTakeoutDownload(post({ store: 'vault', pagesOnly: 'true' }), res);

    expect(buildOwnStoreTakeout).toHaveBeenCalledWith(expect.anything(), { store: 'vault', pagesOnly: true });
  });

  test('no store named is a 400, and nothing is built', async () => {
    const { routes, renderError, buildOwnStoreTakeout } = makeRoutes();
    const res = newRes();

    await (routes as unknown as { myTakeoutDownload: (q: Request, s: Response) => Promise<unknown> })
      .myTakeoutDownload(post({}), res);

    expect(buildOwnStoreTakeout).not.toHaveBeenCalled();
    expect(renderError).toHaveBeenCalledWith(expect.anything(), res, 400, 'Bad Request', expect.any(String));
  });
});

describe('POST /my/takeout — the audit record (#1387)', () => {
  test('its own event, naming who, which store and how much', async () => {
    const { routes, logAuditEvent } = makeRoutes();
    const res = newRes();

    await (routes as unknown as { myTakeoutDownload: (q: Request, s: Response) => Promise<unknown> })
      .myTakeoutDownload(post({ store: 'vault' }), res);

    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: AUDIT_EVENT.STORE_TAKEOUT,
      user: 'molly',
      ipAddress: '10.0.0.9',
      severity: 'high',
      resourceType: 'private-store',
      resource: 'private/molly/vault'
    }));
  });

  test('not page-export — a whole decrypted store is a different act', async () => {
    const { routes, logAuditEvent } = makeRoutes();
    const res = newRes();

    await (routes as unknown as { myTakeoutDownload: (q: Request, s: Response) => Promise<unknown> })
      .myTakeoutDownload(post({ store: 'vault' }), res);

    const event = logAuditEvent.mock.calls[0][0] as { eventType: string };
    expect(event.eventType).not.toBe(AUDIT_EVENT.PAGE_EXPORT);
  });

  test('a refused download is not recorded as a successful one', async () => {
    const { routes, logAuditEvent } = makeRoutes({ buildThrows: new Error('locked') });
    const res = newRes();

    await (routes as unknown as { myTakeoutDownload: (q: Request, s: Response) => Promise<unknown> })
      .myTakeoutDownload(post({ store: 'vault' }), res);

    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe('GET /my/takeout (#1387)', () => {
  test('lists each store with what it holds, so the size is known before the download', async () => {
    const { routes } = makeRoutes({ stores: ['default', 'vault'] });
    const res = newRes();

    await (routes as unknown as { myTakeoutPage: (q: Request, s: Response) => Promise<unknown> })
      .myTakeoutPage(post({}), res);

    const data = res.render.mock.calls[0][1] as {
      listKind: string; items: Array<{ store: string; pageCount: number; locked: boolean }>;
    };
    expect(data.listKind).toBe('takeout');
    expect(data.items.map(i => i.store)).toEqual(['default', 'vault']);
    expect(data.items.every(i => i.locked === false)).toBe(true);
  });

  test('a store that cannot be opened is shown as locked, not offered', async () => {
    const { routes } = makeRoutes({ buildThrows: new Error('locked'), stores: ['vault'] });
    const res = newRes();

    await (routes as unknown as { myTakeoutPage: (q: Request, s: Response) => Promise<unknown> })
      .myTakeoutPage(post({}), res);

    const data = res.render.mock.calls[0][1] as { items: Array<{ locked: boolean }> };
    expect(data.items[0].locked).toBe(true);
  });
});

/** The import route behind a real multipart parse, as a browser posts it. */
function importApp(routes: WikiRoutes) {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { userContext: unknown }).userContext = MOLLY;
    (req as unknown as { session: unknown }).session = { csrfToken: 't' };
    next();
  });
  app.post('/my/takeout/import', (req, res) =>
    void (routes as unknown as { myTakeoutImport: (q: Request, s: Response) => Promise<unknown> }).myTakeoutImport(req, res));
  return app;
}

const ZIP = Buffer.from('PK fake archive bytes');

describe('POST /my/takeout/import (#1472)', () => {
  test('hands the uploaded bytes to the manager door and answers with its report', async () => {
    const { routes, importOwnStoreTakeout } = makeRoutes();

    const res = await request(importApp(routes))
      .post('/my/takeout/import')
      .field('store', 'vault')
      .attach('archive', ZIP, 'takeout-vault.zip');

    expect(res.status).toBe(200);
    expect(res.body.report.pages).toHaveLength(2);
    // Requester positional, no owner named: the door decides whose store it is.
    expect(importOwnStoreTakeout).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'molly' }),
      expect.objectContaining({ store: 'vault', archive: ZIP, sourceName: 'takeout-vault.zip' })
    );
  });

  test('audited under its own event, with counts and no page names', async () => {
    const { routes, logAuditEvent } = makeRoutes();

    await request(importApp(routes)).post('/my/takeout/import').field('store', 'vault').attach('archive', ZIP, 'a.zip');

    const event = logAuditEvent.mock.calls[0][0] as { eventType: string; resource: string; metadata: Record<string, unknown> };
    expect(event.eventType).toBe(AUDIT_EVENT.STORE_IMPORT);
    expect(event.resource).toBe('private/molly/vault');
    expect(event.metadata).toMatchObject({ pagesImported: 1, pagesUnchanged: 1, files: 2, filesUnlinked: 1 });
    // Counts only: a private page or file is never named in a log (#1461).
    expect(JSON.stringify(event)).not.toContain('Recipes');
    expect(JSON.stringify(event)).not.toContain('scan.pdf');
  });

  test('a locked store is a 409 with the reason, and nothing is audited', async () => {
    const { routes, logAuditEvent } = makeRoutes({
      importThrows: new TakeoutImportRefused('locked', 'That store is encrypted and locked in this session. Unlock it, then import again.')
    });

    const res = await request(importApp(routes)).post('/my/takeout/import').field('store', 'vault').attach('archive', ZIP, 'a.zip');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/unlock/i);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  test('a file over the operator\'s cap is a 413, and never reaches the door', async () => {
    const { routes, importOwnStoreTakeout } = makeRoutes({ maxSize: 8 });

    const res = await request(importApp(routes)).post('/my/takeout/import').field('store', 'vault').attach('archive', ZIP, 'a.zip');

    expect(res.status).toBe(413);
    expect(importOwnStoreTakeout).not.toHaveBeenCalled();
  });

  test('no file is a 400', async () => {
    const { routes, importOwnStoreTakeout } = makeRoutes();

    const res = await request(importApp(routes)).post('/my/takeout/import').field('store', 'vault');

    expect(res.status).toBe(400);
    expect(importOwnStoreTakeout).not.toHaveBeenCalled();
  });
});

describe('GET /my/takeout — where an import may go (#1472)', () => {
  test('the open stores, plus the default store a new site starts with', async () => {
    const { routes } = makeRoutes({ stores: ['vault'] });
    const res = newRes();

    await (routes as unknown as { myTakeoutPage: (q: Request, s: Response) => Promise<unknown> })
      .myTakeoutPage(post({}), res);

    expect((res.render.mock.calls[0][1] as { importStores: string[] }).importStores).toEqual(['vault', 'default']);
  });

  test('a locked store is not offered', async () => {
    const { routes } = makeRoutes({ buildThrows: new Error('locked'), stores: ['default'] });
    const res = newRes();

    await (routes as unknown as { myTakeoutPage: (q: Request, s: Response) => Promise<unknown> })
      .myTakeoutPage(post({}), res);

    expect((res.render.mock.calls[0][1] as { importStores: string[] }).importStores).toEqual([]);
  });
});
