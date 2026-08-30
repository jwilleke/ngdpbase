/**
 * #1127 — Convert-to-NCM from the editor, gated on page-edit, not admin.
 *
 * The /admin/convert machinery (#728 S5a) already does preview+confirm; #1127
 * surfaces it per-page. Converting IS an edit — anyone who may edit the page
 * could paste the converted text by hand — so the gate moves from
 * admin-system to the page's own edit ACL, checked per page inside the
 * handler. The execute path saves through savePageWithContext so the audit
 * record names the USER who converted, not 'system'.
 */
import WikiRoutes from '../WikiRoutes';

const editor = { username: 'alice', isAuthenticated: true, roles: ['editor'] };

const makeReq = (body: Record<string, unknown> = {}) => ({
  params: {}, query: {}, body, ip: '10.0.0.9',
  session: { csrfToken: 't' }, path: '/', originalUrl: '/', protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: editor
});

const makeRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis()
});

function makeRoutes(canEdit: boolean) {
  const savePageWithContext = vi.fn().mockResolvedValue(undefined);
  const savePage = vi.fn().mockResolvedValue(undefined);
  const pageManager = {
    getPage: vi.fn().mockResolvedValue({
      // A CommonMark link the normalizer rewrites, so `changed` is true.
      content: 'See [the docs](https://example.org/docs) here.',
      metadata: { title: 'Target', uuid: 'uuid-t', 'system-category': 'general' }
    }),
    savePageWithContext,
    savePage
  };
  const aclManager = {
    checkPagePermissionWithContext: vi.fn().mockResolvedValue(canEdit)
  };
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'PageManager') return pageManager;
      if (name === 'ACLManager') return aclManager;
      if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
      return null;
    })
  };
  const routes = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, r: unknown) => Promise<unknown>>;
  (routes as unknown as { createWikiContext: () => unknown }).createWikiContext =
    () => ({ userContext: editor, hasPermission: vi.fn().mockResolvedValue(false) });
  (routes as unknown as { localizePageImages: (...a: unknown[]) => Promise<unknown> }).localizePageImages =
    async (content: unknown) => ({ content, warnings: [] });
  return { routes, pageManager, aclManager, savePageWithContext, savePage };
}

describe('#1127 convert-to-NCM is gated on the page edit ACL', () => {
  test('a page-edit caller gets a preview', async () => {
    const { routes, aclManager } = makeRoutes(true);
    const res = makeRes();
    await routes.adminConvertPreview(makeReq({ page: 'Target' }), res);
    expect(aclManager.checkPagePermissionWithContext).toHaveBeenCalledWith(expect.anything(), 'edit');
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(payload.changed).toBe(true);
    expect(String(payload.proposed)).toContain('[the docs|https://example.org/docs');
  });

  test('a caller without page-edit is refused, admin-system not required', async () => {
    const { routes } = makeRoutes(false);
    const res = makeRes();
    await routes.adminConvertPreview(makeReq({ page: 'Target' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('execute saves through savePageWithContext — the audit names the user', async () => {
    const { routes, savePageWithContext, savePage } = makeRoutes(true);
    const res = makeRes();
    await routes.adminConvertExecute(makeReq({ page: 'Target' }), res);
    expect(savePageWithContext).toHaveBeenCalledOnce();
    expect(savePage).not.toHaveBeenCalled();
    const [, metadata, options] = savePageWithContext.mock.calls[0] as [unknown, Record<string, unknown>, Record<string, unknown>];
    expect(metadata.uuid).toBe('uuid-t');
    expect(options).toMatchObject({ audit: { ipAddress: '10.0.0.9' } });
  });

  test('execute without page-edit is refused before any save', async () => {
    const { routes, savePageWithContext, savePage } = makeRoutes(false);
    const res = makeRes();
    await routes.adminConvertExecute(makeReq({ page: 'Target' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(savePageWithContext).not.toHaveBeenCalled();
    expect(savePage).not.toHaveBeenCalled();
  });
});

describe('#1125 convert transfers footnote definitions to the sidecar list', () => {
  function makeFootnoteRoutes() {
    // #1126: the route delegates to FootnoteManager.transferFromContent —
    // the ONE implementation. This mock reproduces its contract on top of an
    // importFootnote spy so the assertions below still pin per-definition
    // behaviour (ids preserved, caller as author, collision keeps body def).
    const importFootnote = vi.fn().mockResolvedValue(true);
    const savePageWithContext = vi.fn().mockResolvedValue(undefined);
    const pageManager = {
      getPage: vi.fn().mockResolvedValue({
        content: 'A claim[^1] and another[^src].\n\n[^1]: Supporting note.\n\n[^src]: https://example.org/paper\n',
        metadata: { title: 'Noted', uuid: 'uuid-n', 'system-category': 'general' }
      }),
      savePageWithContext
    };
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'PageManager') return pageManager;
        if (name === 'ACLManager') return { checkPagePermissionWithContext: vi.fn().mockResolvedValue(true) };
        if (name === 'FootnoteManager') {
          return {
            isEnabled: () => true,
            async transferFromContent(uuid: string, content: string, by: string, dryRun: boolean) {
              const { extractFootnoteDefs, ensureFootnotesPlugin } = await import('../../converters/ncm/footnotes');
              const ex = extractFootnoteDefs(content);
              if (ex.defs.length === 0) return { content, warnings: [] };
              const warnings: string[] = [];
              const kept: string[] = [];
              for (const def of ex.defs) {
                if (dryRun) { warnings.push(`footnote-transferred: [^${def.id}] → footnote list`); continue; }
                const ok = await importFootnote(uuid, def.id, def, by);
                if (ok) warnings.push(`footnote-transferred: [^${def.id}] → footnote list`);
                else { warnings.push(`footnote-skipped-exists: [^${def.id}] already in the footnote list; body definition kept`); kept.push(`[^${def.id}]: ${def.url || def.note}`); }
              }
              const body = kept.length ? `${ex.content.replace(/\s*$/, '')}\n\n${kept.join('\n')}\n` : ex.content;
              return { content: ensureFootnotesPlugin(body), warnings };
            }
          };
        }
        if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
        return null;
      })
    };
    const routes = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, r: unknown) => Promise<unknown>>;
    (routes as unknown as { createWikiContext: () => unknown }).createWikiContext =
      () => ({ userContext: editor, hasPermission: vi.fn().mockResolvedValue(false) });
    (routes as unknown as { localizePageImages: (...a: unknown[]) => Promise<unknown> }).localizePageImages =
      async (content: unknown) => ({ content, warnings: [] });
    return { routes, importFootnote, savePageWithContext };
  }

  test('preview reports the transfer, removes defs from the proposed body, writes nothing', async () => {
    const { routes, importFootnote } = makeFootnoteRoutes();
    const res = makeRes();
    await routes.adminConvertPreview(makeReq({ page: 'Noted' }), res);
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(importFootnote).not.toHaveBeenCalled();
    expect(payload.changed).toBe(true);
    const proposed = String(payload.proposed);
    expect(proposed).not.toContain('[^1]:');
    expect(proposed).not.toContain('[^src]:');
    expect(proposed).toContain('claim[^1]');
    expect(proposed).toContain('[{FootnotesPlugin}]');
    expect((payload.warnings as string[]).filter(w => w.startsWith('footnote-transferred'))).toHaveLength(2);
  });

  test('execute imports each definition with its id preserved and the caller as author', async () => {
    const { routes, importFootnote, savePageWithContext } = makeFootnoteRoutes();
    const res = makeRes();
    await routes.adminConvertExecute(makeReq({ page: 'Noted' }), res);
    expect(importFootnote).toHaveBeenCalledTimes(2);
    expect(importFootnote).toHaveBeenCalledWith('uuid-n', '1', expect.objectContaining({ note: 'Supporting note.' }), 'alice');
    expect(importFootnote).toHaveBeenCalledWith('uuid-n', 'src', expect.objectContaining({ url: 'https://example.org/paper' }), 'alice');
    expect(savePageWithContext).toHaveBeenCalledOnce();
  });

  test('a sidecar collision keeps the body definition and warns', async () => {
    const { routes, importFootnote } = makeFootnoteRoutes();
    importFootnote.mockImplementation(async (_u: string, id: string) => id !== '1');
    const res = makeRes();
    await routes.adminConvertExecute(makeReq({ page: 'Noted' }), res);
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect((payload.warnings as string[]).some(w => w.startsWith('footnote-skipped-exists: [^1]'))).toBe(true);
  });
});
