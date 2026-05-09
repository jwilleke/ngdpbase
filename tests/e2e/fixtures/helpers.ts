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
 * Silently ignores 404 (page already gone).
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
    // network blip — fall through with empty token; resulting 403 surfaces
    // as the same warn this branch always handled.
  }
  const response = await page.request.post(`/delete/${encodeURIComponent(pageName)}`, {
    headers: { 'Accept': 'application/json', 'X-CSRF-Token': csrfToken }
  });
  // 200 = deleted, 404 = already gone — both are acceptable
  if (response.status() !== 200 && response.status() !== 404) {
    console.warn(`[helpers] deletePage: unexpected status ${response.status()} for "${pageName}"`);
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
  navigateToPage,
  performSearch,
  getNotifications,
  hasText
};
