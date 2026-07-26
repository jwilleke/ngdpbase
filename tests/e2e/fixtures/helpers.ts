import { expect } from '@playwright/test';

/**
 * Common test helpers for E2E tests
 */

/**
 * Prefix applied to every wiki page created by E2E tests.
 * Makes test-created pages easy to identify and bulk-delete.
 */
const TEST_PAGE_PREFIX = 'NGDPBASE-test';

/**
 * Delete a wiki page via the HTTP delete route (requires admin auth).
 *
 * Hardened for #724: a cleanup failure MUST fail loudly, never be silently
 * swallowed. The old `console.warn` path let test pages accumulate unnoticed
 * in live storage for weeks (187 stale `NGDPBASE-test-*` pages were found in
 * jimstest on 2026-05-16, from pre-fix runs whose 403s were swallowed).
 *
 * Throws if the CSRF token can't be obtained, the delete returns an
 * unexpected status, or the page still resolves afterward.
 * @param {import('@playwright/test').Page} page
 * @param {string} pageName
 */
async function deletePage(page, pageName) {
  // CSRF middleware (#663) requires the X-CSRF-Token header on state-changing
  // requests. Fetch /login (a stable page with the meta tag) to grab the
  // session token via page.request — this preserves the cookie jar that
  // page.request.post will use a moment later. We don't navigate the page
  // itself because afterAll cleanup helpers often run on freshly-opened
  // pages still at about:blank.
  let csrfToken = '';
  try {
    const tokenRes = await page.request.get('/login');
    const html = await tokenRes.text();
    const match = html.match(/<meta name="csrf-token" content="([^"]+)"/);
    if (match) csrfToken = match[1];
  } catch {
    // fall through — empty token is treated as a hard failure below
  }
  // An empty token guarantees a 403 the route rejects; that exact path
  // (token silently absent) was the original #724 root cause. Fail now
  // instead of POSTing a request that will be swallowed as "acceptable".
  if (!csrfToken) {
    throw new Error(`[helpers] deletePage("${pageName}"): could not obtain CSRF token from /login`);
  }

  const response = await page.request.post(`/delete/${encodeURIComponent(pageName)}`, {
    headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken }
  });
  const status = response.status();
  // 200 = deleted, 404 = already gone. Anything else (403/500/…) is a real
  // failure — escalate instead of the old console.warn that hid it.
  if (status !== 200 && status !== 404) {
    throw new Error(`[helpers] deletePage("${pageName}"): unexpected delete status ${status}`);
  }

  // Source of truth: the page must actually be gone. A non-existent page
  // returns 404 from /view/<name> (verified); anything else means the
  // delete did not take effect and the page would silently linger.
  const verify = await page.request.get(`/view/${encodeURIComponent(pageName)}`);
  if (verify.status() !== 404) {
    throw new Error(
      `[helpers] deletePage("${pageName}"): page still resolves after delete ` +
        `(delete status ${status}, /view status ${verify.status()})`
    );
  }

  // #947: a delete is now a soft delete — the page file and its full version
  // history are retained for the retention window (30 days by default). That
  // is right for real content and wrong for test fixtures: without this step
  // every E2E run would leave tombstones and version directories behind for a
  // month, which is #724's "187 stale NGDPBASE-test-* pages" all over again,
  // just one level down where nobody would look for it.
  //
  // Purge only what THIS helper just deleted, matched by exact title. Never a
  // blanket "purge everything in the trash" — that would destroy real deleted
  // pages on whatever instance the suite happens to run against.
  await purgeDeletedPage(page, pageName, csrfToken);
}

/**
 * Permanently remove a soft-deleted test page and its versions (#947).
 *
 * Best-effort by design: the page is already gone from every user-visible
 * surface by the time this runs, so a purge failure is a storage-hygiene
 * problem, not a correctness one, and must not fail an otherwise-passing test.
 * A provider without soft delete answers 501 and this is a no-op.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} pageName - Exact title of the page just deleted
 * @param {string} csrfToken - Token already obtained by the caller
 */
async function purgeDeletedPage(page, pageName, csrfToken) {
  try {
    const listRes = await page.request.get('/api/admin/deleted-pages');
    if (listRes.status() !== 200) return;

    const body = await listRes.json();
    const match = (body.pages || []).find((p) => p.title === pageName);
    if (!match) return;

    await page.request.delete(`/api/admin/deleted-pages/${encodeURIComponent(match.uuid)}`, {
      headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken }
    });
  } catch {
    // Storage hygiene only — never break a test run over it.
  }
}

/**
 * Delete many pages, attempting every one before surfacing failures.
 * Use in afterAll cleanup so a single failure can't suppress the rest of
 * the batch (which would leave even more pages lingering).
 * @param {import('@playwright/test').Page} page
 * @param {string[]} pageNames
 */
async function deletePages(page, pageNames) {
  const failures = [];
  for (const name of pageNames) {
    try {
      await deletePage(page, name);
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `[helpers] deletePages: ${failures.length}/${pageNames.length} cleanup(s) failed:\n` +
        failures.join('\n')
    );
  }
}

/**
 * Wait for the server to finish initialization (stop returning 503 maintenance page).
 * Call this once before running tests (e.g., in auth.setup.js).
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @param {number} [options.timeout=120000] - Max time to wait in ms
 * @param {number} [options.interval=2000] - Poll interval in ms
 */
async function waitForServerReady(page, { timeout = 120000, interval = 2000 } = {}) {
  const baseURL = page.context()._options?.baseURL || 'http://localhost:3000';
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const response = await page.goto('/login', { waitUntil: 'domcontentloaded' });
    if (response && response.status() !== 503) {
      return;
    }
    await page.waitForTimeout(interval);
  }

  throw new Error(`Server did not become ready within ${timeout}ms (still returning 503)`);
}

/**
 * Wait for page to be fully loaded
 * @param {import('@playwright/test').Page} page
 */
async function waitForPageReady(page) {
  // networkidle never fires when persistent polling connections are open (#460)
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Create a new wiki page
 * @param {import('@playwright/test').Page} page
 * @param {string} title - Page title
 * @param {string} content - Page content in markdown
 */
async function createPage(page, title, content) {
  await page.goto('/edit?new=true');
  await page.fill('input[name="title"], #title', title);
  await page.fill('textarea[name="content"], #content, .editor-content', content);
  await page.click('button[type="submit"], button:has-text("Save")');
  await waitForPageReady(page);
}

/**
 * Navigate to a wiki page by name
 * @param {import('@playwright/test').Page} page
 * @param {string} pageName
 */
async function navigateToPage(page, pageName) {
  await page.goto(`/view/${encodeURIComponent(pageName)}`);
  await waitForPageReady(page);
}

/**
 * Perform a search
 * @param {import('@playwright/test').Page} page
 * @param {string} query
 */
async function performSearch(page, query) {
  // Find search input - could be in header or dedicated search page
  const searchInput = page.locator('input[type="search"], input[name="q"], #search-input, .search-input');

  if (await searchInput.count() === 0) {
    // Navigate to search page if no search input visible
    await page.goto('/search');
  }

  await searchInput.first().fill(query);
  await searchInput.first().press('Enter');
  await waitForPageReady(page);
}

/**
 * Get flash/notification messages from page
 * @param {import('@playwright/test').Page} page
 */
async function getNotifications(page) {
  const notifications = page.locator('.flash, .notification, .alert, .message');
  const texts = [];
  const count = await notifications.count();
  for (let i = 0; i < count; i++) {
    texts.push(await notifications.nth(i).textContent());
  }
  return texts;
}

/**
 * Check if element with text exists
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
async function hasText(page, text) {
  const element = page.locator(`text=${text}`);
  return (await element.count()) > 0;
}

export {
  TEST_PAGE_PREFIX,
  waitForServerReady,
  waitForPageReady,
  createPage,
  deletePage,
  purgeDeletedPage,
  deletePages,
  navigateToPage,
  performSearch,
  getNotifications,
  hasText
};
