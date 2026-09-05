/**
 * #1219 — anything that lists pages to a reader reaches the same evaluator as
 * the thing that decides access to one (guiding-framework rule 10).
 *
 * Static half: the reader-facing handlers call `listPagesFor`, never
 * `getAllPages`, and the raw index is confined to the sites that have no
 * reader. Behavioural half: the kiosk — which renders CONTENT, not just
 * titles — refuses a page the read gate refuses, whether the request named it
 * or the random draw found it. Sabotage: put `getAllPages()` back in any
 * handler below and the static test goes red; drop the kiosk's gate and the
 * private slide renders.
 */
import fs from 'fs';
import path from 'path';
import WikiRoutes from '../WikiRoutes';

const src = fs.readFileSync(path.join(process.cwd(), 'src', 'routes', 'WikiRoutes.ts'), 'utf8');

function methodBody(name: string): string {
  const start = src.indexOf(`  async ${name}(req: Request`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const end = src.indexOf('\n  }\n', start);
  return src.slice(start, end).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
}

/** Every handler that renders a page list to a request. */
const READER_FACING = ['editPageIndex', 'kiosk', 'exportPage', 'getPageSuggestions', 'getCommonTemplateData'];

/**
 * The sites that may still read the raw index: admin surfaces behind
 * `admin-system`, and counts after a rebuild. Adding a name here is a claim
 * that the surface has no reader — say why in the handler.
 */
const NO_READER_ALLOWED = 7;

describe('#1219 reader-facing listings go through the listing door', () => {
  test.each(READER_FACING)('%s calls listPagesFor and never getAllPages', (name) => {
    const body = methodBody(name);
    expect(body).not.toMatch(/\.getAllPages\(/);
    if (name !== 'getCommonTemplateData') expect(body).toMatch(/\.listPagesFor\(/);
  });

  test('the raw index is read only where there is no reader', () => {
    const uses = src.split('\n').filter((l) => /\.getAllPages\(/.test(l) && !/^\s*(\/\/|\*)/.test(l));
    expect(uses.length, uses.join('\n')).toBeLessThanOrEqual(NO_READER_ALLOWED);
  });
});

describe('#1219 the kiosk renders only what the read gate allows', () => {
  const createMockRes = () => ({
    status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis()
  });
  const createMockReq = (query: Record<string, string>) => ({
    params: {}, query, body: {}, session: {}, path: '/kiosk', originalUrl: '/kiosk', protocol: 'http',
    get: vi.fn().mockReturnValue('localhost'), userContext: { username: 'Anonymous', roles: ['anonymous', 'All'], isAuthenticated: false }
  });

  function makeRoutes(readable: string[]) {
    const pages: Record<string, { title: string; rawContent: string }> = {
      Public: { title: 'Public', rawContent: 'public words' },
      Secret: { title: 'Secret', rawContent: 'secret words' }
    };
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'PageManager') {
          return {
            listPagesFor: vi.fn(async () => readable),
            getAllPages: vi.fn(async () => Object.keys(pages)),
            getPage: vi.fn(async (n: string) => pages[n] ?? null),
            getPageMetadata: vi.fn(async (n: string) => (pages[n] ? { title: n } : null))
          };
        }
        if (name === 'ACLManager') {
          return { checkPagePermissionWithContext: vi.fn(async (ctx: { pageName?: string }) => readable.includes(ctx.pageName ?? '')) };
        }
        if (name === 'RenderingManager') return { textToHTML: vi.fn(async (_c: unknown, md: string) => `<p>${md}</p>`) };
        if (name === 'ConfigurationManager') return { getProperty: vi.fn((_k: string, d: unknown) => d) };
        return null;
      })
    };
    const routes = new WikiRoutes(engine);
    vi.spyOn(routes as never, 'getCommonTemplateData').mockResolvedValue({});
    vi.spyOn(routes as never, 'loadPageMetadataForAcl').mockImplementation(async (n: string) => ({ title: n }));
    return routes as unknown as { kiosk(req: unknown, res: unknown): Promise<unknown> };
  }

  test('a named page the gate refuses is not a slide — its content is never rendered', async () => {
    const routes = makeRoutes(['Public']);
    const res = createMockRes();
    await routes.kiosk(createMockReq({ pages: 'Public,Secret' }), res);
    const data = res.render.mock.calls[0][1] as { slides: Array<{ name: string; html: string }> };
    expect(data.slides.map((s) => s.name)).toEqual(['Public']);
    expect(JSON.stringify(data.slides)).not.toContain('secret words');
  });

  test('the random draw is from what the viewer may read', async () => {
    const routes = makeRoutes(['Public']);
    const res = createMockRes();
    await routes.kiosk(createMockReq({ count: '10' }), res);
    const data = res.render.mock.calls[0][1] as { slides: Array<{ name: string }> };
    expect(data.slides.map((s) => s.name)).toEqual(['Public']);
  });
});
