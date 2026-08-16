/**
 * #885 — /sitemap.xml route behaviour.
 *
 * The gate and the two Tier-2 guards are the tests that matter. Everything else
 * about this feature is a missed crawl if it breaks; these three are a leak.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import WikiRoutes from '../WikiRoutes';

const ALLOW_ANON = [{
  id: 'anonymous-read-only',
  effect: 'allow',
  subjects: [{ type: 'role', value: 'anonymous' }],
  resources: [{ type: 'page', pattern: '*' }],
  actions: ['page-read']
}];

const INDEX = {
  a: { slug: 'alpha', title: 'Alpha', lastModified: '2026-02-10T00:00:00.000Z', location: 'pages' },
  b: { slug: 'secret', title: 'Secret', location: 'private' },
  c: { slug: 'team-only', title: 'Team', location: 'pages', audienceRoles: ['editor'] }
};

function makeRoutes(opts: {
  seo?: boolean;
  policies?: unknown;
  baseUrl?: string;
  pages?: Record<string, unknown>;
  meta?: Record<string, unknown>;
} = {}) {
  const configManager = {
    getProperty: vi.fn((key: string, def: unknown) => {
      if (key === 'ngdpbase.seo.enabled') return opts.seo ?? true;
      if (key === 'ngdpbase.access.policies') return opts.policies ?? ALLOW_ANON;
      return def;
    }),
    getBaseURL: vi.fn(() => opts.baseUrl ?? 'https://x.test')
  };
  // getPageMetadata is the second, authoritative pass — the index's
  // audienceRoles is stale on pages not re-saved since #754, so frontmatter
  // decides. `meta` here stands in for that frontmatter.
  const pageManager = {
    getCurrentPageProvider: () => ({ pageIndex: { pages: opts.pages ?? INDEX } }),
    getPageMetadata: vi.fn(async (slug: string) =>
      (opts.meta ?? { alpha: {}, secret: {}, 'team-only': { audience: ['editor'] } })[slug] ?? null)
  };
  const routes = Object.create(WikiRoutes.prototype);
  routes.engine = {
    getManager: vi.fn((n: string) =>
      n === 'ConfigurationManager' ? configManager : n === 'PageManager' ? pageManager : null)
  };
  return routes as WikiRoutes;
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: '',
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { this.headers[k] = v; return this; },
    status(c: number) { this.statusCode = c; return this; },
    send(b: string) { this.body = b; return this; }
  };
  return res;
}

const req = (page?: string) => ({ params: page === undefined ? {} : { page } });

beforeEach(() => vi.clearAllMocks());

describe('GET /sitemap.xml', () => {
  test('404s when ngdpbase.seo.enabled is off', async () => {
    // A 404 rather than an empty 200: an intranet install should not confirm
    // the feature exists, let alone that it has pages.
    const res = makeRes();
    await makeRoutes({ seo: false }).sitemap(req(), res);
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('<urlset');
  });

  test('serves a urlset listing only the public page', async () => {
    const res = makeRes();
    await makeRoutes().sitemap(req(), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/xml; charset=utf-8');
    expect(res.body).toContain('<loc>https://x.test/view/alpha</loc>');
    expect(res.body).not.toContain('secret');
    expect(res.body).not.toContain('team-only');
  });

  describe('Tier-2 guards — each returns an empty sitemap rather than guessing', () => {
    test('a page-scoped policy pattern yields no URLs', async () => {
      // An instance-wide answer is unsound once any policy targets specific
      // pages, so the feature declines to answer at all.
      const res = makeRes();
      await makeRoutes({
        policies: [{
          ...ALLOW_ANON[0],
          resources: [{ type: 'page', pattern: 'Secret*' }]
        }]
      }).sitemap(req(), res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('<urlset');
      expect(res.body).not.toContain('<loc>');
    });

    test('no anonymous page-read policy yields no URLs', async () => {
      const res = makeRes();
      await makeRoutes({
        policies: [{
          id: 'editors', effect: 'allow',
          subjects: [{ type: 'role', value: 'editor' }],
          resources: [{ type: 'page', pattern: '*' }],
          actions: ['page-read']
        }]
      }).sitemap(req(), res);
      expect(res.body).not.toContain('<loc>');
    });

    test('an explicit anonymous deny beats an allow', async () => {
      const res = makeRes();
      await makeRoutes({
        policies: [
          ALLOW_ANON[0],
          { ...ALLOW_ANON[0], id: 'lockdown', effect: 'deny' }
        ]
      }).sitemap(req(), res);
      expect(res.body).not.toContain('<loc>');
    });

    test('an empty or missing policy list yields no URLs', async () => {
      const res = makeRes();
      await makeRoutes({ policies: [] }).sitemap(req(), res);
      expect(res.body).not.toContain('<loc>');
    });
  });

  test('yields no URLs when base-url is not absolute', async () => {
    const res = makeRes();
    await makeRoutes({ baseUrl: 'localhost:3000' }).sitemap(req(), res);
    expect(res.body).not.toContain('<loc>');
  });

  test('fails closed: a page whose metadata will not resolve is omitted', async () => {
    // "We could not tell" must never become "list it" — the index pre-filter
    // is blind to frontmatter, so a lookup miss is not evidence of public.
    const res = makeRes();
    await makeRoutes({ meta: {} }).sitemap(req(), res);
    expect(res.body).not.toContain('<loc>');
  });

  test('frontmatter audience excludes a page the index thinks is public', async () => {
    // The live leak: 345 journal pages had audience in frontmatter and nothing
    // in the index, because audienceRoles is only written on save.
    const res = makeRes();
    await makeRoutes({
      pages: { a: { slug: 'alpha', location: 'pages' } },
      meta: { alpha: { audience: ['jim'] } }
    }).sitemap(req(), res);
    expect(res.body).not.toContain('<loc>');
  });

  test('404s for a numbered file when everything fits in one', async () => {
    const res = makeRes();
    await makeRoutes().sitemap(req('1'), res);
    expect(res.statusCode).toBe(404);
  });

  test('survives a provider with no page index', async () => {
    const res = makeRes();
    const routes = makeRoutes();
    routes.engine.getManager = vi.fn((n: string) =>
      n === 'ConfigurationManager'
        ? { getProperty: () => true, getBaseURL: () => 'https://x.test' }
        : n === 'PageManager' ? { getCurrentPageProvider: () => null } : null) as never;

    await routes.sitemap(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<urlset');
  });
});
