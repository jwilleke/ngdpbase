import { test as base, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

/**
 * Bearer requests go to the instance's canonical origin, never through a
 * redirect.
 *
 * An instance that terminates TLS itself answers plain HTTP on the same port
 * with a 308 to its https origin (#1163). Clients drop `Authorization` when a
 * redirect changes origin — curl does, and Playwright's request client does
 * from 1.62 (1.57 carried it across). With the default `http://localhost`
 * base URL every bearer call in this file then arrived at the route with no
 * bearer, fell through to the CSRF guard, and `tokensUsable` read that as
 * "tokens unusable" — six tests silently skipped by a dependency bump.
 *
 * A bearer client must use the canonical URL, so the fixture finds it once
 * (one un-followed request, reading `Location`) and rebinds `request` to it
 * with the same session state. Where there is no redirect the fixture is the
 * stock one.
 */
const test = base.extend<{ request: APIRequestContext }>({
  request: async ({ request, playwright }, use) => {
    const probe = await request.get('/api/tokens', { maxRedirects: 0 });
    const location = probe.headers()['location'];
    if (probe.status() >= 300 && probe.status() < 400 && location) {
      const origin = new URL(location, 'http://localhost').origin;
      const canonical = await playwright.request.newContext({
        baseURL: origin,
        ignoreHTTPSErrors: true,
        storageState: await request.storageState()
      });
      await use(canonical);
      await canonical.dispose();
      return;
    }
    await use(request);
  }
});

/**
 * #946 slice 2 — DELETE /api/page/:identifier and POST /api/page/:identifier/rename,
 * exercised through a real agent token.
 *
 * Slice 1's lesson was that unit tests are not enough here: two bugs (the scope
 * ceiling not holding on the real permission path, and `page-ingest` not being
 * an action name) passed the entire unit suite and only failed against a running
 * server. So the scope enforcement below is deliberately tested end to end.
 */

const PREFIX = 'NGDPBASE-test-946';

const csrf = async (request) => {
  const html = await (await request.get('/login')).text();
  const m = html.match(/<meta name="csrf-token" content="([^"]+)"/);
  if (!m) throw new Error('no csrf token');
  return m[1];
};

const sessionHeaders = async (request) => ({
  Accept: 'application/json',
  'X-CSRF-Token': await csrf(request)
});

/**
 * Whether agent tokens actually WORK on the instance under test.
 *
 * Not "can I mint one" — that is the wrong question, and asking it is what made
 * this spec fail on The Fairways during v3.70.0 propagation. Minting succeeds
 * even when the feature is disabled (#981), so a mint probe reports available
 * on instances where no token can ever authenticate.
 *
 * The honest check is end to end: mint, then make one bearer-authenticated
 * request and see whether the middleware recognised it. When the provider is
 * unregistered the request never gets `req.bearerAuth`, falls through to the
 * CSRF guard, and comes back 403 "invalid CSRF token" — which is exactly the
 * misleading symptom #981 is about.
 */
async function tokensUsable(request): Promise<boolean> {
  try {
    const res = await request.post('/api/tokens', {
      headers: { ...(await sessionHeaders(request)), 'Content-Type': 'application/json' },
      data: { name: `${PREFIX}-probe`, scopes: ['page-read'], ttlHours: 1 }
    });
    const body = await res.json().catch(() => ({}));
    if (!body.success) return false;

    // The probe MUST be a mutating request. A GET proves nothing: CSRF skips
    // safe methods outright, so a bearer GET returns 200 even when the bearer
    // middleware never authenticated the token — which is exactly how the
    // previous probe reported "usable" on an instance where it was not.
    //
    // A bearer POST with no CSRF header is the real question: it succeeds only
    // when `req.bearerAuth` was set, and answers 403 "invalid CSRF token" when
    // it was not (#981).
    const probe = await request.post('/api/tokens', {
      headers: { Authorization: `Bearer ${body.token}`, 'Content-Type': 'application/json' },
      data: { name: `${PREFIX}-probe2`, scopes: ['page-read'], ttlHours: 1 }
    });
    // 403 means CSRF rejected it, i.e. bearer auth did not happen. Any other
    // answer (201 mint, or a 4xx from the route's own rules) means it did.
    //
    // #1182 — one 403 is NOT a CSRF rejection. The edge gate (#1173 Part A)
    // refuses `POST /api/tokens` to any token, deliberately: a token minting
    // further tokens is delegation widening. That refusal is 403 with a JSON
    // body naming the reason, and it is POSITIVE evidence — the gate runs only
    // inside the bearer middleware's `viaToken` branch, so reaching it proves
    // the token authenticated.
    //
    // Reading only the status made this probe answer "tokens unusable" the
    // moment the gate shipped, which skipped all six tests in this file while
    // the run reported `6 skipped / 90 passed`. A guard that silently disables
    // its own suite is worse than no guard, and this file covers the two
    // routes that regression broke.
    const probeBodyEarly = await probe.json().catch(() => null) as { reason?: string } | null;
    const refusedByGate = probe.status() === 403 && typeof probeBodyEarly?.reason === 'string';
    const ok = probe.status() !== 403 || refusedByGate;

    const probeBody = (probeBodyEarly ?? {}) as { record?: { id?: string } };
    if (probeBody?.record?.id) {
      await request.delete(`/api/tokens/${probeBody.record.id}`, { headers: await sessionHeaders(request) }).catch(() => {});
    }

    await request.delete(`/api/tokens/${body.record?.id}`, { headers: await sessionHeaders(request) }).catch(() => {});
    return ok;
  } catch {
    return false;
  }
}

/** Mint a token for the logged-in admin. */
async function mint(request, name, scopes) {
  const res = await request.post('/api/tokens', {
    headers: { ...(await sessionHeaders(request)), 'Content-Type': 'application/json' },
    data: { name, scopes, ttlHours: 1 }
  });
  const body = await res.json().catch(() => ({}));
  if (!body.success) throw new Error(`mint failed (${res.status()}): ${JSON.stringify(body)}`);
  return { token: body.token, id: body.record?.id ?? body.id };
}

/**
 * Everything this spec creates, cleaned in afterEach REGARDLESS of outcome.
 *
 * The first version revoked at the end of each test body, which leaks on every
 * failure — and failures are exactly when cleanup matters, because a retry
 * mints again. Three failing runs exhausted the admin's 10-live-token budget
 * and the suite then failed with "Token limit reached" for reasons that had
 * nothing to do with the code under test.
 */
const minted: string[] = [];
const pages: string[] = [];

/** Mint and register for cleanup. */
async function mintTracked(request, name, scopes) {
  const m = await mint(request, name, scopes);
  if (m?.id) minted.push(m.id);
  return m;
}

/** Create a page through the normal save route. */
async function makePage(request, title, content = 'seed content') {
  const res = await request.post(`/save/${encodeURIComponent(title)}`, {
    headers: await sessionHeaders(request),
    form: { pageName: title, content, 'system-category': 'General' }
  });
  expect([200, 302]).toContain(res.status());
}

/** Create a page and register it for cleanup. */
async function makeTrackedPage(request, title, content = 'seed content') {
  pages.push(title);
  await makePage(request, title, content);
}

test.describe.configure({ mode: 'serial' });

test.describe('#946 slice 2 — agent token page mutations', () => {
  // Skip the whole suite where the feature is off, rather than per test: the
  // page-conflict case does not mint, so it would otherwise run alone against an
  // instance with no token feature at all and prove nothing useful.
  test.beforeEach(async ({ request }) => {
    test.skip(!(await tokensUsable(request)), 'agent tokens not usable on this instance (see #981)');
  });

  test.afterEach(async ({ request }) => {
    const headers = await sessionHeaders(request);

    while (minted.length) {
      await request.delete(`/api/tokens/${minted.pop()}`, { headers }).catch(() => {});
    }

    while (pages.length) {
      const name = pages.pop();
      await request.post(`/delete/${encodeURIComponent(name)}`, { headers }).catch(() => {});
    }

    // Purge the #947 tombstones so test pages leave no storage behind.
    // Same tolerance here: no soft delete means no tombstones to purge.
    const trashRes = await request.get('/api/admin/deleted-pages').catch(() => null);
    const trash = trashRes?.status() === 200 ? await trashRes.json().catch(() => ({})) : {};
    for (const entry of (trash.pages || []).filter((p) => String(p.title).startsWith(PREFIX))) {
      await request.delete(`/api/admin/deleted-pages/${entry.uuid}`, { headers }).catch(() => {});
    }
  });

  test('a token scoped to delete can delete, and the page is recoverable', async ({ request }) => {
    const minted = await mintTracked(request, `${PREFIX}-del`, ['page-ingest', 'page-delete']);

    const title = `${PREFIX}-delete-${Date.now()}`;
    await makeTrackedPage(request, title);

    const res = await request.delete(`/api/page/${encodeURIComponent(title)}`, {
      headers: { Authorization: `Bearer ${minted.token}`, Accept: 'application/json' }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, pageName: title, recoverable: true });

    expect((await request.get(`/view/${encodeURIComponent(title)}`)).status()).toBe(404);

    // #947: where soft delete is available, the page must be in the trash rather
    // than destroyed. Not every instance has it — a provider without soft delete
    // answers 501, and the temp build does exactly that. Assert recoverability
    // only where recoverability exists, instead of indexing a `pages` array that
    // is not there.
    const trashRes = await request.get('/api/admin/deleted-pages');
    if (trashRes.status() === 200) {
      const trash = await trashRes.json();
      expect((trash.pages || []).find((p) => p.title === title)).toBeTruthy();
    }
  });

  test('a token WITHOUT page-delete is refused (scope ceiling holds on the real path)', async ({ request }) => {
    const minted = await mintTracked(request, `${PREFIX}-noscope`, ['page-ingest']);

    const title = `${PREFIX}-refused-${Date.now()}`;
    await makeTrackedPage(request, title);

    const res = await request.delete(`/api/page/${encodeURIComponent(title)}`, {
      headers: { Authorization: `Bearer ${minted.token}`, Accept: 'application/json' }
    });
    expect(res.status()).toBe(403);

    // The page must still be there — a refused delete that half-executed would
    // be worse than one that errored.
    expect((await request.get(`/view/${encodeURIComponent(title)}`)).status()).toBe(200);

  });

  test('a token scoped to rename can rename', async ({ request }) => {
    const minted = await mintTracked(request, `${PREFIX}-ren`, ['page-ingest', 'page-rename']);

    const from = `${PREFIX}-from-${Date.now()}`;
    const to = `${PREFIX}-to-${Date.now()}`;
    await makeTrackedPage(request, from, 'content that must survive the rename');
    pages.push(to);

    const res = await request.post(`/api/page/${encodeURIComponent(from)}/rename`, {
      headers: { Authorization: `Bearer ${minted.token}`, 'Content-Type': 'application/json' },
      data: { newTitle: to }
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, from, to });

    const moved = await request.get(`/view/${encodeURIComponent(to)}`);
    expect(moved.status()).toBe(200);
    expect(await moved.text()).toContain('content that must survive the rename');

  });

  test('rename refuses to overwrite an existing title', async ({ request }) => {
    const a = `${PREFIX}-conflict-a-${Date.now()}`;
    const b = `${PREFIX}-conflict-b-${Date.now()}`;
    await makeTrackedPage(request, a, 'page A');
    await makeTrackedPage(request, b, 'page B');

    const res = await request.post(`/api/page/${encodeURIComponent(a)}/rename`, {
      headers: { ...(await sessionHeaders(request)), 'Content-Type': 'application/json' },
      data: { newTitle: b }
    });
    expect(res.status()).toBe(409);

    // Both pages intact — B in particular must not have been clobbered.
    expect(await (await request.get(`/view/${encodeURIComponent(b)}`)).text()).toContain('page B');
    expect((await request.get(`/view/${encodeURIComponent(a)}`)).status()).toBe(200);

  });

  test('unauthenticated mutations are rejected', async ({ playwright }) => {
    const anon = await playwright.request.newContext();
    // 403 in practice, not 401: the CSRF guard sits in front of the handler and
    // rejects the session-less request before it reaches the auth check. Either
    // is a refusal; what matters is that it never reaches the delete.
    expect([401, 403]).toContain((await anon.delete('/api/page/Welcome')).status());
    await anon.dispose();
  });

  test('a missing page returns 404, not a 500', async ({ request }) => {
    const res = await request.delete(`/api/page/${PREFIX}-does-not-exist`, { headers: await sessionHeaders(request) });
    expect(res.status()).toBe(404);
  });
});
