import { test, expect } from '@playwright/test';

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

/** Mint a token for the logged-in admin, or skip if the feature is disabled. */
async function mint(request, name, scopes) {
  const res = await request.post('/api/tokens', {
    headers: { ...(await sessionHeaders(request)), 'Content-Type': 'application/json' },
    data: { name, scopes, ttlHours: 1 }
  });
  if (res.status() === 404 || res.status() === 501) return null;
  const body = await res.json();
  if (!body.success) throw new Error(`mint failed: ${JSON.stringify(body)}`);
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

/** Mint and register for cleanup. Returns null when the feature is disabled. */
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
    const trash = await (await request.get('/api/admin/deleted-pages')).json().catch(() => ({ pages: [] }));
    for (const entry of (trash.pages || []).filter((p) => String(p.title).startsWith(PREFIX))) {
      await request.delete(`/api/admin/deleted-pages/${entry.uuid}`, { headers }).catch(() => {});
    }
  });

  test('a token scoped to delete can delete, and the page is recoverable', async ({ request }) => {
    const minted = await mintTracked(request, `${PREFIX}-del`, ['page-ingest', 'page-delete']);
    test.skip(!minted, 'agent tokens disabled on this instance');

    const title = `${PREFIX}-delete-${Date.now()}`;
    await makeTrackedPage(request, title);

    const res = await request.delete(`/api/page/${encodeURIComponent(title)}`, {
      headers: { Authorization: `Bearer ${minted.token}`, Accept: 'application/json' }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, pageName: title, recoverable: true });

    expect((await request.get(`/view/${encodeURIComponent(title)}`)).status()).toBe(404);

    // #947: it must be in the trash, not destroyed.
    const trash = await (await request.get('/api/admin/deleted-pages')).json();
    expect(trash.pages.find((p) => p.title === title)).toBeTruthy();
  });

  test('a token WITHOUT page-delete is refused (scope ceiling holds on the real path)', async ({ request }) => {
    const minted = await mintTracked(request, `${PREFIX}-noscope`, ['page-ingest']);
    test.skip(!minted, 'agent tokens disabled on this instance');

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
    test.skip(!minted, 'agent tokens disabled on this instance');

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
