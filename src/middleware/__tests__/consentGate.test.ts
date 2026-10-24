/**
 * The consent gate (#1603). A session asked at sign-in goes nowhere but the
 * prompt (and signing in and out, and the documents themselves) until it
 * accepts; an add-on's registered paths ask for its documents first; tokens
 * and proxies are never held. #2027: a user with documents to accept sees a
 * banner on every page, and a refusal says what to accept and where.
 *
 * Sabotaged once each (then restored): the bearerAuth pass (removed) — the
 * token test went red; the viaProxy pass on an add-on path (removed) — the
 * proxy test went red; the document-page opening (removed) — the document
 * test went red. #2027, each once: the banner's token/share guard (down to
 * proxy only) — the delegated test; the banner not set — the three banner
 * tests; the link without returnTo — every link test; the old refusal words —
 * the words test; form POSTs not recognised — the form test; sendApiError's
 * consent redirect removed — the redirect tests.
 */
import type { Request, Response } from 'express';
import { consentGate } from '../consentGate';

interface Opts { enabled?: string[]; addonPending?: string[]; corePending?: string[] }

const TITLES: Record<string, string> = { 'terms-of-service': 'Terms of Service', 'privacy-policy': 'Privacy Policy', 'phr-terms': 'PHR Terms' };
const doc = (id: string) => ({ id, scope: id.startsWith('phr-') ? 'phr' : 'core', title: TITLES[id] ?? id, version: '2', effective: null });

function engineWith(opts: Opts = {}) {
  const consent = {
    addonForPath: (p: string) => (p.startsWith('/phr') ? 'phr' : null),
    allDocumentIds: () => ['terms-of-service', 'privacy-policy', 'phr-terms'],
    registeredAddons: () => ['phr'],
    pendingFor: vi.fn(async (_u: string, scope?: string) => ((scope === 'phr' ? opts.addonPending : opts.corePending) ?? []).map(doc))
  };
  const addons = { enabledAddonsFor: vi.fn(async () => opts.enabled ?? []) };
  return { getManager: (n: string) => (n === 'ConsentManager' ? consent : n === 'AddonsManager' ? addons : null), consent };
}

interface Outcome { next: boolean; redirect?: string; status?: number; body?: unknown; locals: Record<string, unknown> }

const PAGE = { accept: 'text/html,application/xhtml+xml' };

/** A browser page read unless `headers` says otherwise. */
async function run(engine: { getManager: (n: string) => unknown }, req: Partial<Request> & { bearerAuth?: boolean }, headers: Record<string, string> = PAGE): Promise<Outcome> {
  return new Promise((resolve) => {
    const locals: Record<string, unknown> = {};
    const res = {
      locals,
      redirect: (to: string) => resolve({ next: false, redirect: to, locals }),
      status: (code: number) => ({ json: (body: unknown) => resolve({ next: false, status: code, body, locals }) })
    } as unknown as Response;
    consentGate(engine)({ method: 'GET', originalUrl: req.path, get: (h: string) => headers[h.toLowerCase()], ...req } as Request, res, () => resolve({ next: true, locals }));
  });
}

const signedIn = (extra: Record<string, unknown> = {}) => ({ isAuthenticated: true, username: 'ann', ...extra });
const ann = { username: 'ann', isAuthenticated: true };
const tos = { corePending: ['terms-of-service'] };

describe('consentGate (#1603)', () => {
  test('a session holding consentPending is sent to the prompt, with where it was going', async () => {
    const r = await run(engineWith(tos), { path: '/view/Main', session: signedIn({ consentPending: true }) as never });
    expect(r.redirect).toBe(`/consent?returnTo=${encodeURIComponent('/view/Main')}`);
  });

  test('anything but a page read gets a 403 naming the prompt', async () => {
    const r = await run(engineWith(tos), { path: '/api/pages', method: 'POST', session: signedIn({ consentPending: true }) as never }, { accept: 'application/json', 'content-type': 'application/json' });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ consent: '/consent?returnTo=%2F' });
  });

  test.each(['/consent', '/logout', '/login', '/login/second-factor', '/view/terms-of-service', '/view/Privacy%20Policy'])('%s stays reachable while asked', async (p) => {
    expect((await run(engineWith(tos), { path: p, session: signedIn({ consentPending: true }) as never })).next).toBe(true);
  });

  test('an agent or app token is never held', async () => {
    expect((await run(engineWith(tos), { path: '/view/Main', bearerAuth: true, session: signedIn({ consentPending: true }) as never })).next).toBe(true);
  });

  test('a visitor who is not signed in passes', async () => {
    expect((await run(engineWith(tos), { path: '/view/Main', session: {} as never })).next).toBe(true);
  });

  test('held, but everything was accepted meanwhile (in another session): the hold lifts', async () => {
    const session = signedIn({ consentPending: true }) as Record<string, unknown>;
    const r = await run(engineWith(), { path: '/view/Main', session: session as never, userContext: ann as never });
    expect(r.next).toBe(true);
    expect(session.consentPending).toBeUndefined();
  });

  describe('the banner and the refusal words (#2027)', () => {
    test('a signed-in user with terms to accept sees the banner, naming them and linking to the prompt with this page', async () => {
      const r = await run(engineWith({ corePending: ['terms-of-service', 'privacy-policy'] }), { path: '/view/Main', originalUrl: '/view/Main?x=1', session: signedIn() as never, userContext: ann as never });
      expect(r.next).toBe(true);
      expect(r.locals.consentNotice).toEqual({
        message: 'You have terms to accept: Terms of Service, version 2 and Privacy Policy, version 2.',
        link: `/consent?returnTo=${encodeURIComponent('/view/Main?x=1')}`
      });
    });

    test('nothing to accept: no banner', async () => {
      const r = await run(engineWith(), { path: '/view/Main', session: signedIn() as never, userContext: ann as never });
      expect(r.next).toBe(true);
      expect(r.locals.consentNotice).toBeUndefined();
    });

    test('not a page (an asset, a script\'s request): no banner, nothing asked', async () => {
      const e = engineWith(tos);
      const r = await run(e, { path: '/api/pages', session: signedIn() as never, userContext: ann as never }, { accept: 'application/json' });
      expect(r.next).toBe(true);
      expect(r.locals.consentNotice).toBeUndefined();
      expect(e.consent.pendingFor).not.toHaveBeenCalled();
    });

    test('the documents themselves show the banner while held; the prompt does not', async () => {
      const e = engineWith(tos);
      expect((await run(e, { path: '/view/terms-of-service', session: signedIn({ consentPending: true }) as never, userContext: ann as never })).locals.consentNotice).toBeDefined();
      expect((await run(e, { path: '/consent', session: signedIn({ consentPending: true }) as never, userContext: ann as never })).locals.consentNotice).toBeUndefined();
    });

    test('an add-on the user has on, with documents to accept, links to its own prompt; one that is off shows nothing', async () => {
      const r = await run(engineWith({ enabled: ['phr'], addonPending: ['phr-terms'] }), { path: '/view/Main', session: signedIn() as never, userContext: ann as never });
      expect(r.locals.consentNotice).toEqual({ message: 'You have terms to accept: PHR Terms, version 2.', link: `/consent?scope=phr&returnTo=${encodeURIComponent('/view/Main')}` });
      expect((await run(engineWith({ enabled: [], addonPending: ['phr-terms'] }), { path: '/view/Main', session: signedIn() as never, userContext: ann as never })).locals.consentNotice).toBeUndefined();
    });

    test('delegated credentials are never shown the banner: an agent or app token, a proxy, a share link', async () => {
      const e = engineWith(tos);
      expect((await run(e, { path: '/view/Main', bearerAuth: true, session: signedIn() as never, userContext: { ...ann, viaToken: { id: 't' } } as never })).locals.consentNotice).toBeUndefined();
      expect((await run(e, { path: '/view/Main', session: signedIn() as never, userContext: { ...ann, viaProxy: { grantId: 'g' } } as never })).locals.consentNotice).toBeUndefined();
      expect((await run(e, { path: '/view/Main', session: signedIn() as never, userContext: { ...ann, viaShare: { id: 's' } } as never })).locals.consentNotice).toBeUndefined();
    });

    test('a refused request that is not a page gets the same words and the link', async () => {
      const r = await run(engineWith(tos), { path: '/api/pages', session: signedIn({ consentPending: true }) as never }, { accept: 'application/json' });
      expect(r.status).toBe(403);
      expect(r.body).toEqual({ success: false, error: 'You have terms to accept: Terms of Service, version 2.', consent: '/consent?returnTo=%2F' });
    });

    test('a refused form POST is sent to the prompt, returning to the page the form was on', async () => {
      const r = await run(engineWith(tos), { path: '/save/Main', method: 'POST', session: signedIn({ consentPending: true }) as never }, { ...PAGE, 'content-type': 'application/x-www-form-urlencoded', referer: 'http://site.test/edit/Main' });
      expect(r.redirect).toBe(`/consent?returnTo=${encodeURIComponent('/edit/Main')}`);
    });
  });

  describe('an add-on\'s paths', () => {
    test('a person who has it on, with a changed version to accept, is asked for that add-on', async () => {
      const r = await run(engineWith({ enabled: ['phr'], addonPending: ['phr-terms'] }), { path: '/phr/records', session: signedIn() as never, userContext: ann as never });
      expect(r.redirect).toBe(`/consent?scope=phr&returnTo=${encodeURIComponent('/phr/records')}`);
    });

    test('nothing to accept, or the add-on is off: passes', async () => {
      expect((await run(engineWith({ enabled: ['phr'] }), { path: '/phr', session: signedIn() as never, userContext: { username: 'ann' } as never })).next).toBe(true);
      expect((await run(engineWith({ enabled: [], addonPending: ['phr-terms'] }), { path: '/phr', session: signedIn() as never, userContext: { username: 'ann' } as never })).next).toBe(true);
    });

    test('someone acting for the person under a proxy grant is not held (they cannot accept for them)', async () => {
      const r = await run(engineWith({ enabled: ['phr'], addonPending: ['phr-terms'] }), { path: '/phr', session: signedIn() as never, userContext: { username: 'ann', viaProxy: { grantId: 'g' } } as never });
      expect(r.next).toBe(true);
    });
  });
});
