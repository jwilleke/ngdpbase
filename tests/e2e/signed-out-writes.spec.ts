import { test, expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { TOTP, Secret } from 'otpauth';
import { CORE_SIGNED_OUT_WRITES } from '../../src/security/signedOutWrites';

/**
 * #2298 — a write from someone who is not signed in is refused before any
 * route runs, and every route on the signed-out write list still works.
 *
 * Everything here is plain HTTP (Playwright's request client, no browser), as
 * a signed-out caller would send it: each caller is a context of its own with
 * no cookies. The refusal is recognised by its exact shape: a form is sent to
 * `/login?redirect=<its own Referer path>`, JSON gets 401 'Authentication
 * required'. A Referer of `/gate-probe` makes the redirect unmistakable.
 *
 * The flows run end to end: sign-in, sign-in with an authenticator-app second
 * factor, registration, an invitation (needs E2E_MAIL_LOG, as invitation.spec),
 * consent, and the forms add-on's public submit (skips when forms is off).
 * Password reset is checked as far as the handler: it needs a user's 12
 * recovery words, which no run here holds.
 *
 * Accounts and forms made here are its own, each deleted at the end.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const RUN = randomUUID().slice(0, 8);
const ADMIN = process.env.E2E_ADMIN_USER ?? 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? process.env.NGDPBASE_ADMIN_PASSWORD ?? 'admin123';
const MAIL_LOG = process.env.E2E_MAIL_LOG;
const PROBE = '/gate-probe';

let baseURL: string;
// Playwright requires the first argument to be a destructuring pattern; no fixture is needed.
// eslint-disable-next-line no-empty-pattern
test.beforeAll(({}, info) => { baseURL = String(info.project.use.baseURL ?? process.env.E2E_BASE_URL); });

const fresh = (): Promise<APIRequestContext> => playwrightRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } });

async function csrfOf(ctx: APIRequestContext): Promise<string> {
  const html = await (await ctx.get('/login', { headers: { Accept: 'text/html' } })).text();
  const token = /<meta name="csrf-token" content="([^"]+)"/.exec(html)?.[1];
  if (!token) throw new Error('no CSRF token on /login');
  return token;
}

const formHeaders = { Accept: 'text/html', Referer: '' };

/** A form post as the browser sends it. */
async function postForm(ctx: APIRequestContext, path: string, fields: Record<string, string>, csrf?: string, method: 'POST' = 'POST'): Promise<APIResponse> {
  return ctx.fetch(path, {
    method,
    maxRedirects: 0,
    headers: { ...formHeaders, Referer: `${baseURL}${PROBE}` },
    form: { ...(csrf ? { _csrf: csrf } : {}), ...fields }
  });
}

const sentBackByGate = (res: APIResponse): boolean =>
  res.status() === 302 && res.headers()['location'] === `/login?redirect=${encodeURIComponent(PROBE)}`;

async function refusedByGateAsJson(res: APIResponse): Promise<boolean> {
  if (res.status() !== 401) return false;
  const body = await res.json().catch(() => ({})) as { success?: boolean; error?: string };
  return body.success === false && body.error === 'Authentication required';
}

async function signedIn(ctx: APIRequestContext): Promise<boolean> {
  return (await ctx.get('/profile', { maxRedirects: 0, headers: { Accept: 'text/html' } })).status() === 200;
}

async function adminContext(): Promise<{ ctx: APIRequestContext; csrf: string }> {
  const ctx = await fresh();
  const csrf = await csrfOf(ctx);
  const res = await postForm(ctx, '/login', { username: ADMIN, password: ADMIN_PASS }, csrf);
  if (res.status() !== 302) throw new Error(`admin sign-in answered ${res.status()}`);
  // A site with an authenticator app on the admin would ask for a code; this run does not enrol one for the admin.
  await acceptIfAsked(ctx, await csrfOf(ctx));
  if (!(await signedIn(ctx))) throw new Error('admin is not signed in after the password step');
  return { ctx, csrf: await csrfOf(ctx) };
}

async function deleteAccount(admin: { ctx: APIRequestContext; csrf: string }, username: string): Promise<void> {
  await admin.ctx.delete(`/admin/users/${encodeURIComponent(username)}`, { headers: { 'X-CSRF-Token': admin.csrf, Accept: 'application/json' } });
}

async function makeAccount(admin: { ctx: APIRequestContext; csrf: string }, username: string, password: string): Promise<void> {
  const made = await postForm(admin.ctx, '/admin/users', { username, email: `${username}@example.test`, displayName: username, password, roles: 'reader', isTest: 'true' }, admin.csrf);
  expect(made.headers()['location'] ?? '', `create ${username}`).not.toContain('error=');
}

test.describe('a signed-out write is refused whatever the route or target (#2298)', () => {
  test('a form is sent to sign-in and JSON gets 401, for an existing page, a missing page and no route at all', async () => {
    const ctx = await fresh();
    try {
      const csrf = await csrfOf(ctx);
      const existing = (await ctx.get('/view/Main', { maxRedirects: 0 })).status() === 200 ? 'Main' : 'Welcome';
      const targets: Array<[string, string]> = [
        ['POST', `/save/${existing}`], ['POST', `/save/NoSuchPage${RUN}`], ['POST', `/delete/${existing}`],
        ['POST', '/create'], ['POST', '/admin/users'], ['POST', '/api/comments/none'], ['POST', '/no/such/route'],
        ['PUT', '/admin/users/nobody'], ['PATCH', '/attachments/api/none'], ['DELETE', '/api/page/NoSuchPage'], ['DELETE', `/api/page/${existing}`]
      ];
      for (const [method, path] of targets) {
        // With and without the CSRF token: the gate answers first.
        for (const token of [csrf, undefined]) {
          if (method === 'POST') {
            expect(sentBackByGate(await postForm(ctx, path, { content: 'x' }, token)), `${method} ${path} (form)`).toBe(true);
          }
          const json = await ctx.fetch(path, { method, maxRedirects: 0, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) }, data: {} });
          expect(await refusedByGateAsJson(json), `${method} ${path} (json) answered ${json.status()}`).toBe(true);
        }
      }
      // Nothing about the target is revealed: the page that exists and the one that does not answer alike.
      const a = await postForm(ctx, `/save/${existing}`, { content: 'x' }, csrf);
      const b = await postForm(ctx, `/save/NoSuchPage${RUN}`, { content: 'x' }, csrf);
      expect([a.status(), a.headers()['location']]).toEqual([b.status(), b.headers()['location']]);
    } finally { await ctx.dispose(); }
  });

  test('every route on the list reaches its own handler signed out', async () => {
    const ctx = await fresh();
    try {
      const csrf = await csrfOf(ctx);
      for (const route of CORE_SIGNED_OUT_WRITES) {
        // Registration is rate limited per address; the registration test below makes a real one.
        if (route.path === '/register') continue;
        const path = route.path.replace(/:[A-Za-z]+/g, 'github');
        const res = await postForm(ctx, path, {}, csrf);
        expect(sentBackByGate(res), `${route.method} ${route.path} was answered by the gate`).toBe(false);
        const json = await ctx.fetch(path, { method: route.method, maxRedirects: 0, headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, data: {} });
        expect(await refusedByGateAsJson(json), `${route.method} ${route.path} (json) was answered by the gate`).toBe(false);
      }
    } finally { await ctx.dispose(); }
  });

  test('a signed-in caller is not held by the gate', async () => {
    const admin = await adminContext();
    try {
      const res = await postForm(admin.ctx, `/save/NoSuchPage${RUN}`, { content: 'x' }, admin.csrf);
      expect(sentBackByGate(res)).toBe(false);
    } finally { await admin.ctx.dispose(); }
  });
});

test.describe('the signed-out routes still work (#2298)', () => {
  test('sign in with a password, then with a second factor (authenticator app), then sign out', async () => {
    const admin = await adminContext();
    const username = `e2e2298tf${RUN}`;
    const password = `pw-${randomUUID()}`;
    try {
      await makeAccount(admin, username, password);

      // Password only: signed in (after the terms, if asked).
      const plain = await fresh();
      const login = await postForm(plain, '/login', { username, password }, await csrfOf(plain));
      expect(login.status()).toBe(302);
      expect(login.headers()['location']).not.toContain('error=');

      // Enrol an authenticator app as that user.
      const csrf = await csrfOf(plain);
      await acceptIfAsked(plain);
      const page = await (await plain.get('/profile/totp', { headers: { Accept: 'text/html' } })).text();
      const seed = /data-totp-seed[^>]*>\s*([A-Z2-7]{16,})|<code[^>]*>\s*([A-Z2-7 ]{16,})\s*<\/code>/.exec(page);
      const secret = (seed?.[1] ?? seed?.[2] ?? '').replace(/\s+/g, '');
      test.skip(!secret, 'the authenticator-app enrolment is not offered on this instance');
      const totp = new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 });
      const enrol = await postForm(plain, '/profile/totp', { code: totp.generate() }, csrf);
      expect(enrol.headers()['location'] ?? '').not.toContain('error');
      await plain.dispose();

      // Signed out again: the password now holds the sign-in at a second step, and the code finishes it.
      const second = await fresh();
      const csrf2 = await csrfOf(second);
      const step1 = await postForm(second, '/login', { username, password }, csrf2);
      expect(step1.headers()['location']).toContain('/login/second-factor');
      expect(await signedIn(second)).toBe(false);
      const wrong = await postForm(second, '/login/second-factor/totp', { code: '000000' }, csrf2);
      expect(await signedIn(second)).toBe(false);
      expect(sentBackByGate(wrong)).toBe(false);
      const done = await postForm(second, '/login/second-factor/totp', { code: totp.generate({ timestamp: Date.now() + 30_000 }) }, csrf2);
      expect(sentBackByGate(done)).toBe(false);
      await acceptIfAsked(second, csrf2);
      expect(await signedIn(second), 'signed in after the second factor').toBe(true);

      // Sign out.
      const out = await postForm(second, '/logout', {}, await csrfOf(second));
      expect(sentBackByGate(out)).toBe(false);
      expect(await signedIn(second)).toBe(false);
      await second.dispose();
    } finally {
      await deleteAccount(admin, username);
      await admin.ctx.dispose();
    }
  });

  test('registration', async () => {
    const admin = await adminContext();
    const username = `e2e2298reg${RUN}`;
    const ctx = await fresh();
    try {
      const form = await (await ctx.get('/register', { headers: { Accept: 'text/html' } })).text();
      test.skip(!form.includes('action="/register"'), 'password registration is off on this instance');
      const password = `pw-${randomUUID()}`;
      const res = await postForm(ctx, '/register', {
        username, email: `${username}@example.test`, displayName: username, password, confirmPassword: password, acceptTerms: 'on'
      }, await csrfOf(ctx));
      expect(sentBackByGate(res)).toBe(false);
      expect(res.headers()['location'] ?? '').not.toContain('error');
      // The account exists: it signs in with the password it registered with.
      const back = await fresh();
      const login = await postForm(back, '/login', { username, password }, await csrfOf(back));
      expect(login.headers()['location'] ?? '').not.toContain('error=');
      await acceptIfAsked(back);
      expect(await signedIn(back)).toBe(true);
      await back.dispose();
    } finally {
      await deleteAccount(admin, username);
      await ctx.dispose();
      await admin.ctx.dispose();
    }
  });

  test('password reset reaches its handler and answers about the recovery words', async () => {
    const ctx = await fresh();
    try {
      const res = await postForm(ctx, '/recover-password', { username: 'nobody', words: 'one two three', password: 'x', confirmPassword: 'x' }, await csrfOf(ctx));
      expect(sentBackByGate(res)).toBe(false);
      expect(res.status()).toBeLessThan(500);
      expect((await res.text()) + (res.headers()['location'] ?? '')).toMatch(/recovery words|words/i);
    } finally { await ctx.dispose(); }
  });

  test('an invitation signs the invited person in; consent is then accepted', async () => {
    test.skip(!MAIL_LOG, 'needs E2E_MAIL_LOG: the log of an instance with mail on and the console mail provider');
    const admin = await adminContext();
    const username = `e2e2298inv${RUN}`;
    const ctx = await fresh();
    try {
      const made = await postForm(admin.ctx, '/admin/users', { username, email: `${username}@example.test`, displayName: username, roles: 'reader', isTest: 'true', invite: 'true' }, admin.csrf);
      expect(made.headers()['location'] ?? '').not.toContain('error=');
      let link: string | undefined;
      for (let i = 0; i < 40 && !link; i++) {
        const log = fs.existsSync(MAIL_LOG) ? fs.readFileSync(MAIL_LOG, 'utf8') : '';
        const at = log.lastIndexOf(`with the username ${username}.`);
        link = at >= 0 ? /(https?:\/\/[^\s"\\]+\/invitation\?t=([\w-]+))/.exec(log.slice(at))?.[2] : undefined;
        if (!link) await new Promise((r) => setTimeout(r, 250));
      }
      expect(link, 'invitation link in the mail log').toBeTruthy();
      const open = await ctx.get(`/invitation?t=${link}`, { headers: { Accept: 'text/html' } });
      expect(open.status()).toBe(200);
      const used = await postForm(ctx, '/invitation', { t: link }, await csrfOf(ctx));
      expect(sentBackByGate(used)).toBe(false);
      expect(used.status()).toBe(302);
      // Signed in now; the terms come first, and accepting them is a signed-in write.
      await acceptIfAsked(ctx, await csrfOf(ctx));
      expect(await signedIn(ctx)).toBe(true);
    } finally {
      await deleteAccount(admin, username);
      await ctx.dispose();
      await admin.ctx.dispose();
    }
  });

  test('consent: a new account is held to the terms, accepts them, and goes on', async () => {
    const admin = await adminContext();
    const username = `e2e2298con${RUN}`;
    const password = `pw-${randomUUID()}`;
    const ctx = await fresh();
    try {
      await makeAccount(admin, username, password);
      const login = await postForm(ctx, '/login', { username, password }, await csrfOf(ctx));
      expect(login.headers()['location']).toContain('/consent');
      expect(await signedIn(ctx)).toBe(false); // held at the prompt: /profile sends it back
      const accepted = await acceptConsent(ctx, login.headers()['location']);
      expect(sentBackByGate(accepted)).toBe(false);
      expect(accepted.headers()['location'] ?? '').not.toContain('error');
      expect(await signedIn(ctx)).toBe(true);
    } finally {
      await deleteAccount(admin, username);
      await ctx.dispose();
      await admin.ctx.dispose();
    }
  });

  test("the forms add-on's public submit takes a submission from a signed-out visitor", async () => {
    const admin = await adminContext();
    const id = `e2e-2298-${RUN}`;
    const ctx = await fresh();
    try {
      const probe = await admin.ctx.get('/addons/forms/builder/new', { maxRedirects: 0 });
      test.skip(probe.status() === 404, 'forms add-on not enabled on this instance');
      const made = await postForm(admin.ctx, '/addons/forms/builder', {
        id, title: `E2E ${id}`, fieldsJson: JSON.stringify([{ name: 'note', type: 'text', label: 'Note', required: false }])
      }, admin.csrf);
      expect(made.status()).toBe(302);
      const csrf = await csrfOf(ctx);
      const res = await ctx.post(`/api/forms/submit/${id}`, { headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' }, data: { note: 'from a signed-out visitor' }, maxRedirects: 0 });
      expect(await refusedByGateAsJson(res)).toBe(false);
      expect(res.status(), await res.text()).toBe(201);
    } finally {
      await postForm(admin.ctx, `/addons/forms/builder/${id}/delete`, {}, admin.csrf);
      await ctx.dispose();
      await admin.ctx.dispose();
    }
  });
});

/** Accept what the consent prompt asks, as its form does: the documents and versions it shows, plus the tick. */
async function acceptConsent(ctx: APIRequestContext, promptPath: string): Promise<APIResponse> {
  const html = await (await ctx.get(promptPath, { headers: { Accept: 'text/html' } })).text();
  const value = (name: string): string[] => [...html.matchAll(new RegExp(`name="${name}" value="([^"]*)"`, 'g'))].map((m) => m[1].replace(/&amp;/g, '&').replace(/&#34;|&quot;/g, '"'));
  const body = new URLSearchParams();
  for (const name of ['_csrf', 'scope', 'returnTo']) body.set(name, value(name)[0] ?? '');
  for (const d of value('document')) body.append('document', d);
  for (const v of value('version')) body.append('version', v);
  body.set('accept', 'on');
  return ctx.fetch('/consent', { method: 'POST', maxRedirects: 0, headers: { Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${baseURL}${PROBE}` }, data: body.toString() });
}

/** Accept the terms when the sign-in landed on the prompt. */
async function acceptIfAsked(ctx: APIRequestContext, _csrf?: string): Promise<void> {
  const res = await ctx.get('/profile', { maxRedirects: 0, headers: { Accept: 'text/html' } });
  const where = res.headers()['location'] ?? '';
  if (res.status() === 302 && where.startsWith('/consent')) {
    const done = await acceptConsent(ctx, where);
    expect(sentBackByGate(done), 'POST /consent is a signed-in write').toBe(false);
  }
}
