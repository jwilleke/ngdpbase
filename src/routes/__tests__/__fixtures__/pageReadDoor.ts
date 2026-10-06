/**
 * #1622: the page-read door (PageManager.readPage, readVersionHistory,
 * readVersion, readVersionDiff) for a route test's PageManager mock.
 *
 * The routes no longer decide page-read; they ask the door and act on its
 * answer. A route test mocks the manager, so this gives its mock a door that
 * answers the way the real one does — `{ ok, name, metadata, value }` or
 * `{ ok: false, refusal }` — built from what the test already mocks: the page
 * from `getPage` (or `getPageContent` + `getPageMetadata`), the history from
 * the mocked provider, and the decision from the mocked PolicyInformationPoint.
 * The real decision is PageManager's, and is tested there
 * (`PageManager.readDoor.test.ts`); here it is only the test's own answer.
 *
 * Everything is looked up when called, so a test that swaps a mock after the
 * door is attached still gets what it set.
 */
type AnyFn = (...args: never[]) => unknown;
interface PageManagerMock {
  getPage?: AnyFn;
  getPageContent?: AnyFn;
  getPageMetadata?: AnyFn;
  pageExists?: AnyFn;
  provider?: Record<string, unknown> | null;
}
interface EngineMock {
  getManager: (name: string) => unknown;
}
type Refusal = 'not-found' | 'no-metadata' | 'denied';
type Read<T> = { ok: true; name: string; metadata: Record<string, unknown>; value: T } | { ok: false; refusal: Refusal };

const call = async (fn: unknown, ...args: unknown[]): Promise<unknown> =>
  (typeof fn === 'function' ? await (fn as (...a: unknown[]) => unknown)(...args) : undefined);

/** The test's own decision: whichever page question its PIP mock answers; allowed when it has none. */
async function mayRead(engine: EngineMock, name: string, ctx: unknown, metadata: unknown): Promise<boolean> {
  const pip = engine.getManager('PolicyInformationPoint') as Record<string, unknown> | null | undefined;
  if (!pip) return true;
  const wikiContext = { pageName: name, userContext: ctx, pageMetadata: metadata, content: null, context: 'view' };
  if (typeof pip.checkPagePermissionWithContext === 'function') return !!(await call(pip.checkPagePermissionWithContext, wikiContext, 'view'));
  if (typeof pip.evaluatePagePermission === 'function') return !!((await call(pip.evaluatePagePermission, wikiContext, 'view')) as { allowed?: boolean } | undefined)?.allowed;
  if (typeof pip.canUserAccessPage === 'function') return !!(await call(pip.canUserAccessPage, ctx, name, 'view', metadata));
  return true;
}

/**
 * The page's content, read only once the decision allowed it — as the real
 * door does. `getPageContent` throwing "not found" means no page.
 */
async function contentOf(pm: PageManagerMock, id: string, ctx: unknown, page: Record<string, unknown> | undefined): Promise<Record<string, unknown> | null> {
  let content: unknown;
  try {
    content = await call(pm.getPageContent, id, ctx);
  } catch (err) {
    if (String((err as Error)?.message ?? err).includes('not found')) return null;
    throw err;
  }
  if (typeof page?.content === 'string') return page;
  if (typeof content === 'string') return { title: id, metadata: null, ...page, content };
  return page ?? null;
}

/**
 * The four deciding reads, for `Object.assign(pageManagerMock, readDoor(pageManagerMock, engineMock))`.
 */
export function readDoor(pm: PageManagerMock, engine: EngineMock) {
  const decide = async (id: string, ctx: unknown): Promise<Read<Record<string, unknown>>> => {
    // `getPage` answering `null` is "no such page"; a bare `vi.fn()` answers
    // undefined, which says nothing.
    const page = (await call(pm.getPage, id, ctx)) as Record<string, unknown> | null | undefined;
    if (page === null) return { ok: false, refusal: 'not-found' };
    // The decision's metadata comes from `getPageMetadata`, as the real door's does.
    const metadata = ((await call(pm.getPageMetadata, id, ctx)) ?? page?.metadata ?? null) as Record<string, unknown> | null;
    if (!metadata) return { ok: false, refusal: page ? 'no-metadata' : 'not-found' };
    if (!(await mayRead(engine, id, ctx, metadata))) return { ok: false, refusal: 'denied' };
    const read = await contentOf(pm, id, ctx, page ?? undefined);
    if (!read) return { ok: false, refusal: 'not-found' };
    return { ok: true, name: id, metadata, value: read };
  };
  /** A version read decides first, then asks the mocked provider — its errors pass through, as the real door's do. */
  const decideVersions = async (id: string, ctx: unknown): Promise<Read<null>> => {
    // Only an explicit `false`: a bare `vi.fn()` answers undefined.
    if ((await call(pm.pageExists, id, ctx)) === false) return { ok: false, refusal: 'not-found' };
    const metadata = ((await call(pm.getPageMetadata, id, ctx)) ?? { title: id }) as Record<string, unknown>;
    if (!(await mayRead(engine, id, ctx, metadata))) return { ok: false, refusal: 'denied' };
    return { ok: true, name: id, metadata, value: null };
  };
  const provider = (): Record<string, unknown> => pm.provider ?? {};
  return {
    readPage: async (id: string, ctx: unknown) => decide(id, ctx),
    readVersionHistory: async (id: string, ctx: unknown, limit?: number) => {
      const d = await decideVersions(id, ctx);
      return d.ok ? { ...d, value: await call(provider().getVersionHistory, id, ctx, ...(limit === undefined ? [] : [limit])) } : d;
    },
    readVersion: async (id: string, version: number, ctx: unknown) => {
      const d = await decideVersions(id, ctx);
      return d.ok ? { ...d, value: await call(provider().getPageVersion, id, version, ctx) } : d;
    },
    readVersionDiff: async (id: string, v1: number, v2: number, ctx: unknown) => {
      const d = await decideVersions(id, ctx);
      return d.ok ? { ...d, value: await call(provider().compareVersions, id, v1, v2, ctx) } : d;
    }
  };
}
