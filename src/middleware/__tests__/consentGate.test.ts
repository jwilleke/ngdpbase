/**
 * The consent gate (#1603). A session asked at sign-in goes nowhere but the
 * prompt (and signing in and out, and the documents themselves) until it
 * accepts; an add-on's registered paths ask for its documents first; tokens
 * and proxies are never held.
 *
 * Sabotaged once each (then restored): the bearerAuth pass (removed) — the
 * token test went red; the viaProxy pass on an add-on path (removed) — the
 * proxy test went red; the document-page opening (removed) — the document
 * test went red.
 */
import type { Request, Response } from 'express';
import { consentGate } from '../consentGate';

interface Opts { pending?: boolean; enabled?: string[]; addonPending?: string[] }

function engineWith(opts: Opts = {}) {
  const consent = {
    addonForPath: (p: string) => (p.startsWith('/phr') ? 'phr' : null),
    allDocumentIds: () => ['terms-of-service', 'privacy-policy', 'phr-terms'],
    pendingFor: vi.fn(async (_u: string, scope?: string) => (scope === 'phr' ? (opts.addonPending ?? []) : []))
  };
  const addons = { enabledAddonsFor: vi.fn(async () => opts.enabled ?? []) };
  return { getManager: (n: string) => (n === 'ConsentManager' ? consent : n === 'AddonsManager' ? addons : null), consent };
}

async function run(engine: { getManager: (n: string) => unknown }, req: Partial<Request> & { bearerAuth?: boolean }): Promise<{ next: boolean; redirect?: string; status?: number; body?: unknown }> {
  return new Promise((resolve) => {
    const res = {
      redirect: (to: string) => resolve({ next: false, redirect: to }),
      status: (code: number) => ({ json: (body: unknown) => resolve({ next: false, status: code, body }) })
    } as unknown as Response;
    consentGate(engine)({ method: 'GET', originalUrl: req.path, get: (h: string) => (h === 'accept' ? 'text/html,application/xhtml+xml' : undefined), ...req } as Request, res, () => resolve({ next: true }));
  });
}

const signedIn = (extra: Record<string, unknown> = {}) => ({ isAuthenticated: true, username: 'ann', ...extra });

describe('consentGate (#1603)', () => {
  test('a session holding consentPending is sent to the prompt, with where it was going', async () => {
    const r = await run(engineWith(), { path: '/view/Main', session: signedIn({ consentPending: true }) as never });
    expect(r.redirect).toBe(`/consent?returnTo=${encodeURIComponent('/view/Main')}`);
  });

  test('anything but a page read gets a 403 naming the prompt', async () => {
    const r = await run(engineWith(), { path: '/api/pages', method: 'POST', session: signedIn({ consentPending: true }) as never, get: () => 'application/json' } as never);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ consent: '/consent?returnTo=%2F' });
  });

  test.each(['/consent', '/logout', '/login', '/login/second-factor', '/view/terms-of-service', '/view/Privacy%20Policy'])('%s stays reachable while asked', async (p) => {
    expect((await run(engineWith(), { path: p, session: signedIn({ consentPending: true }) as never })).next).toBe(true);
  });

  test('an agent or app token is never held', async () => {
    expect((await run(engineWith(), { path: '/view/Main', bearerAuth: true, session: signedIn({ consentPending: true }) as never })).next).toBe(true);
  });

  test('a visitor who is not signed in passes', async () => {
    expect((await run(engineWith(), { path: '/view/Main', session: {} as never })).next).toBe(true);
  });

  describe('an add-on\'s paths', () => {
    test('a person who has it on, with a changed version to accept, is asked for that add-on', async () => {
      const r = await run(engineWith({ enabled: ['phr'], addonPending: ['phr-terms'] }), { path: '/phr/records', session: signedIn() as never, userContext: { username: 'ann', isAuthenticated: true } as never });
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
