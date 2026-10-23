import { test, expect } from '@playwright/test';
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { TEST_PAGE_PREFIX, deletePage, markTestArtifact, signInWithPassword } from './fixtures/helpers';

/**
 * #1962 — search shows a page only to someone who may open it.
 *
 * An admin makes a page with `audience: [admin]` and a word no other page
 * holds. The admin finds it; a reader and an anonymous visitor, who are both
 * refused at /view, find nothing on every page-search path: the text search,
 * the no-text listing, "All sources", and the /search page itself — and no
 * count includes it.
 *
 * Everything this spec makes is its own: the page (marked test-artifact) and
 * a test reader account, both deleted at the end.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

const RUN = randomUUID().slice(0, 8);
const WORD = `quuxsearchaccess${RUN.replace(/-/g, '')}`;
const TITLE = `${TEST_PAGE_PREFIX}-SearchAccess-${RUN}`;
const READER = `e2e-search-reader-${RUN}`;
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
  await signInWithPassword(page, username, password); // #1603: accepts the terms when asked
  return { context, page };
}

interface SearchBody { results?: Array<{ name?: string; description?: string }>; total?: number }

/** Every page-search path the /search page and the picker use, as `request`. */
async function searchPaths(request: APIRequestContext): Promise<Record<string, SearchBody>> {
  const get = async (url: string): Promise<SearchBody> => {
    const res = await request.get(url, { headers: { Accept: 'application/json' } });
    expect(res.status(), url).toBe(200);
    return await res.json() as SearchBody;
  };
  return {
    fullText: await get(`/api/assets/search?types=page&searchIn=all&q=${WORD}`),
    title: await get(`/api/assets/search?types=page&q=${encodeURIComponent(TITLE)}`),
    allSources: await get(`/api/assets/search?types=all&q=${encodeURIComponent(TITLE)}`),
    noText: await get('/api/assets/search?types=page&q=&pageSize=200')
  };
}

const mentions = (body: SearchBody): boolean =>
  (body.results ?? []).some((r) => r.name === TITLE || (r.description ?? '').includes(WORD));

test.describe('Search keeps to the pages the searcher may open (#1962)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const request = context.request;
    const saved = await request.post(`/save/${encodeURIComponent(TITLE)}`, {
      form: { _csrf: await csrfFrom(request), title: TITLE, content: `This page holds the word ${WORD}.`, 'system-category': 'general', audience: 'admin' }
    });
    expect(saved.status(), await saved.text()).toBeLessThan(400);
    await markTestArtifact(request, TITLE);
    const made = await request.post('/admin/users', {
      form: { _csrf: await csrfFrom(request), username: READER, email: `${READER}@example.test`, displayName: READER, password: READER_PASS, roles: 'reader', isTest: 'true' }
    });
    expect(made.ok()).toBe(true);
    expect(made.url()).not.toContain('error=');
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const page = await context.newPage();
    await deletePage(page, TITLE).catch(() => undefined);
    await context.request.delete(`/admin/users/${encodeURIComponent(READER)}`, {
      headers: { 'X-CSRF-Token': await csrfFrom(context.request), Accept: 'application/json' }
    });
    await context.close();
  });

  test('the admin may open the page and finds it by its word and its title', async ({ page }) => {
    expect((await page.request.get(`/view/${encodeURIComponent(TITLE)}`)).status()).toBe(200);
    // The index takes the save shortly after it lands.
    await expect.poll(async () => mentions((await searchPaths(page.request)).fullText), { timeout: 15000 }).toBe(true);
    const paths = await searchPaths(page.request);
    expect(mentions(paths.title)).toBe(true);
    expect(mentions(paths.allSources)).toBe(true);
    // The /search page loads its results in the browser, from the same API.
    await page.goto(`/search?q=${WORD}&types=page&searchIn=all`);
    await expect(page.locator('#ap-results')).toContainText(TITLE, { timeout: 15000 });
  });

  test('a reader is refused the page and finds it on no search path, in no count', async ({ browser }) => {
    const { context, page } = await signIn(browser, READER, READER_PASS);
    try {
      expect((await page.request.get(`/view/${encodeURIComponent(TITLE)}`)).status()).toBe(403);
      const paths = await searchPaths(page.request);
      for (const [path, body] of Object.entries(paths)) {
        expect(mentions(body), `reader / ${path}`).toBe(false);
      }
      expect(paths.fullText.total).toBe(0);
      expect(paths.title.total).toBe(0);
      // The /search page loads its results in the browser.
      await page.goto(`/search?q=${WORD}&types=page&searchIn=all`);
      await expect(page.locator('#ap-results')).toContainText('No assets found', { timeout: 15000 });
      await expect(page.locator('#ap-results')).not.toContainText(TITLE);
    } finally {
      await context.close();
    }
  });

  test('an anonymous visitor is refused the page and finds it on no search path', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      expect((await page.request.get(`/view/${encodeURIComponent(TITLE)}`)).status()).toBe(403);
      const paths = await searchPaths(page.request);
      for (const [path, body] of Object.entries(paths)) {
        expect(mentions(body), `anonymous / ${path}`).toBe(false);
      }
      expect(paths.fullText.total).toBe(0);
    } finally {
      await context.close();
    }
  });
});
