import { test, expect } from '@playwright/test';
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { TEST_PAGE_PREFIX, deletePage, instanceOrigin, markTestArtifact, signInWithPassword, waitForServerReady } from './fixtures/helpers';

/**
 * #1964 — page audience `addon:<slug>`: the people who turned on <slug>.
 *
 * Three pages carry a word no other page holds:
 *   ADDON  audience [addon:per-person-audience-e2e]
 *   MIXED  audience [addon:per-person-audience-e2e, admin]
 *   GHOST  audience [addon:no-such-addon-e2e]  (an add-on the site does not have)
 * A test editor opens them, finds them in search and in the page-name list
 * with their switch on, and not with it off; with it off they cannot edit
 * them either — the editor, a save and a delete are refused. An admin, whose
 * switch is off, gets all three: an administrator is the audience's one
 * exception (operator, 2026-10-23). An anonymous visitor gets none.
 *
 * Needs the fixture add-on in tests/e2e/fixtures/addons/per-person-audience-e2e
 * on the instance under test:
 *   "ngdpbase.addons.per-person-audience-e2e.enabled": true,
 *   "ngdpbase.managers.addons-manager.addons-path": ["./addons", "<checkout>/tests/e2e/fixtures/addons"]
 * Skips when it is missing. Everything it makes is its own — the three pages
 * (marked test-artifact) and the editor account — and is deleted at the end.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

const ADDON = 'per-person-audience-e2e';
const RUN = randomUUID().slice(0, 8);
const WORD = `quuxaddonaudience${RUN.replace(/-/g, '')}`;
const TITLES = {
  addon: `${TEST_PAGE_PREFIX}-AddonAudience-${RUN}`,
  mixed: `${TEST_PAGE_PREFIX}-AddonOrAdmin-${RUN}`,
  ghost: `${TEST_PAGE_PREFIX}-AddonGhost-${RUN}`
};
const AUDIENCE: Record<keyof typeof TITLES, string[]> = {
  addon: [`addon:${ADDON}`],
  mixed: [`addon:${ADDON}`, 'admin'],
  ghost: ['addon:no-such-addon-e2e']
};
const READER = `e2e-addon-reader-${RUN}`;
const READER_PASS = `pw-${randomUUID()}`;

async function csrfFrom(request: APIRequestContext): Promise<string> {
  const html = await (await request.get('/login')).text();
  const token = (html.match(/<meta name="csrf-token" content="([^"]+)"/) ?? [])[1];
  if (!token) throw new Error('no csrf token');
  return token;
}

async function signIn(browser: Browser, username: string, password: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  // Accepts the site's terms when asked (#1603), as a new account is.
  await signInWithPassword(page, username, password);
  return { context, page };
}

/** The person's switch, through their own /profile form. */
async function setSwitch(request: APIRequestContext, on: boolean): Promise<void> {
  const form = new URLSearchParams({ _csrf: await csrfFrom(request), [`${ADDON}._rendered`]: '1' });
  if (on) form.append(`${ADDON}.enabled`, 'on');
  const res = await request.post('/preferences', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: form.toString()
  });
  expect(res.status(), await res.text()).toBeLessThan(400);
}

/** What `request` can reach of each page: the view, search, and the page-name list. */
async function reach(request: APIRequestContext): Promise<Record<keyof typeof TITLES, { view: number; search: boolean; listed: boolean }>> {
  const search = await (await request.get(`/api/assets/search?types=page&searchIn=all&q=${WORD}`, { headers: { Accept: 'application/json' } })).json() as { results?: Array<{ name?: string }> };
  const found = new Set((search.results ?? []).map((r) => r.name));
  const out = {} as Record<keyof typeof TITLES, { view: number; search: boolean; listed: boolean }>;
  for (const [key, title] of Object.entries(TITLES) as Array<[keyof typeof TITLES, string]>) {
    const suggestions = await (await request.get(`/api/page-suggestions?q=${encodeURIComponent(title)}`)).json() as { suggestions?: Array<{ name?: string } | string> };
    const names = (suggestions.suggestions ?? []).map((s) => (typeof s === 'string' ? s : s.name));
    out[key] = {
      view: (await request.get(`/view/${encodeURIComponent(title)}`)).status(),
      search: found.has(title),
      listed: names.includes(title)
    };
  }
  return out;
}

const OPEN = { view: 200, search: true, listed: true };
const SHUT = { view: 403, search: false, listed: false };

test.describe('Page audience addon:<slug> (#1964)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90000);
  let fixtureLoaded = true;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const request = context.request;
    await waitForServerReady(await context.newPage());
    fixtureLoaded = (await (await request.get('/profile')).text()).includes(`${ADDON}._rendered`);
    if (!fixtureLoaded) { await context.close(); return; }
    for (const key of Object.keys(TITLES) as Array<keyof typeof TITLES>) {
      const form = new URLSearchParams({
        _csrf: await csrfFrom(request), title: TITLES[key], content: `This page holds the word ${WORD}.`, 'system-category': 'general'
      });
      for (const a of AUDIENCE[key]) form.append('audience', a);
      const saved = await request.post(`/save/${encodeURIComponent(TITLES[key])}`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data: form.toString(),
        maxRedirects: 0
      });
      expect(saved.status(), await saved.text()).toBeLessThan(400);
      await markTestArtifact(request, TITLES[key]);
    }
    const made = await request.post('/admin/users', {
      form: { _csrf: await csrfFrom(request), username: READER, email: `${READER}@example.test`, displayName: READER, password: READER_PASS, roles: 'editor', isTest: 'on' }
    });
    expect(made.ok()).toBe(true);
    expect(made.url()).not.toContain('error=');
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!fixtureLoaded) return;
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const page = await context.newPage();
    for (const title of Object.values(TITLES)) await deletePage(page, title).catch(() => undefined);
    await context.request.delete(`/admin/users/${encodeURIComponent(READER)}`, {
      headers: { 'X-CSRF-Token': await csrfFrom(context.request), Accept: 'application/json' }
    });
    await context.close();
  });

  test('the admin, with the add-on off, gets every audience page, and may edit them', async ({ page }) => {
    test.skip(!fixtureLoaded, 'the per-person-audience-e2e fixture add-on is not enabled on this instance');
    // The index takes the saves shortly after they land.
    await expect.poll(async () => (await reach(page.request)).ghost.search, { timeout: 15000 }).toBe(true);
    // An administrator is the audience's one exception (operator, 2026-10-23).
    expect(await reach(page.request)).toEqual({ addon: OPEN, mixed: OPEN, ghost: OPEN });
    for (const title of Object.values(TITLES)) {
      expect((await page.request.get(`${await instanceOrigin(page)}/edit/${encodeURIComponent(title)}`, { maxRedirects: 0 })).status(), title).toBe(200);
    }
  });

  test('an editor sees the pages only while their switch is on, and cannot edit them with it off', async ({ browser }) => {
    test.skip(!fixtureLoaded, 'the per-person-audience-e2e fixture add-on is not enabled on this instance');
    const { context, page } = await signIn(browser, READER, READER_PASS);
    const origin = await instanceOrigin(page);
    const editStatus = async (title: string): Promise<number> =>
      (await page.request.get(`${origin}/edit/${encodeURIComponent(title)}`, { maxRedirects: 0 })).status();
    try {
      expect(await reach(page.request)).toEqual({ addon: SHUT, mixed: SHUT, ghost: SHUT });
      // Outside the audience, an editor's page-edit does not reach the page:
      // not the editor, not a save, not a delete.
      expect(await editStatus(TITLES.addon)).toBe(403);
      const form = new URLSearchParams({ _csrf: await csrfFrom(page.request), title: TITLES.addon, content: 'overwritten', 'system-category': 'general' });
      const save = await page.request.post(`${origin}/save/${encodeURIComponent(TITLES.addon)}`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, data: form.toString(), maxRedirects: 0
      });
      expect(save.status()).toBe(403);
      const del = await page.request.post(`${origin}/delete/${encodeURIComponent(TITLES.addon)}`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data: new URLSearchParams({ _csrf: await csrfFrom(page.request) }).toString(),
        maxRedirects: 0
      });
      expect(del.status()).toBe(403);

      await setSwitch(page.request, true);
      expect(await reach(page.request)).toEqual({ addon: OPEN, mixed: OPEN, ghost: SHUT });
      expect(await editStatus(TITLES.addon)).toBe(200);
      // The same save, now inside the audience, is allowed: the refusal above
      // was the audience, not the form.
      const form2 = new URLSearchParams({ _csrf: await csrfFrom(page.request), title: TITLES.addon, content: `This page holds the word ${WORD}.`, 'system-category': 'general' });
      for (const a of AUDIENCE.addon) form2.append('audience', a);
      const save2 = await page.request.post(`${origin}/save/${encodeURIComponent(TITLES.addon)}`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, data: form2.toString(), maxRedirects: 0
      });
      expect(save2.status(), await save2.text()).toBeLessThan(400);
      expect(await editStatus(TITLES.ghost)).toBe(403);
      await setSwitch(page.request, false);
      expect(await reach(page.request)).toEqual({ addon: SHUT, mixed: SHUT, ghost: SHUT });
      expect(await editStatus(TITLES.mixed)).toBe(403);
    } finally {
      await context.close();
    }
  });

  test('an anonymous visitor reaches none of them', async ({ browser }) => {
    test.skip(!fixtureLoaded, 'the per-person-audience-e2e fixture add-on is not enabled on this instance');
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      expect(await reach(page.request)).toEqual({ addon: SHUT, mixed: SHUT, ghost: SHUT });
    } finally {
      await context.close();
    }
  });
});
