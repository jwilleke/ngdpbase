import { test as setup, expect } from '@playwright/test';
import { waitForServerReady, TEST_PAGE_PREFIX } from './fixtures/helpers';

const STORAGE_STATE = './tests/e2e/.auth/user.json';

/**
 * Authentication Setup
 *
 * This setup runs before the main tests to authenticate and save session state.
 * The saved state is reused by authenticated tests to avoid logging in repeatedly.
 */
setup('authenticate', async ({ page }) => {
  // Wait for server to finish initializing (may show maintenance page during engine startup)
  await waitForServerReady(page);

  // Test credentials from env or defaults
  const adminUser = process.env.E2E_ADMIN_USER || 'admin';
  const adminPass = process.env.E2E_ADMIN_PASS || 'admin123';

  // Navigate to admin login page (always shows password form regardless of OAuth config)
  await page.goto('/admin/login');
  await page.waitForSelector('form');

  // Fill in credentials - target inputs inside the login form specifically
  const loginForm = page.locator('form:has(input[type="password"])');
  const usernameInput = loginForm.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="password"])').first();
  const passwordInput = loginForm.locator('input[type="password"]');

  await usernameInput.fill(adminUser);
  await passwordInput.fill(adminPass);

  // Submit login form
  await page.getByRole('button', { name: /login/i }).click();

  // Wait for successful login - should redirect away from login page
  await expect(page).not.toHaveURL(/\/login$/);
  // Use domcontentloaded — networkidle never fires because admin dashboard
  // keeps persistent polling connections open (#460)
  await page.waitForLoadState('domcontentloaded');

  // Save authentication state
  await page.context().storageState({ path: STORAGE_STATE });

  // #947: sweep away soft-deleted test pages left by earlier runs.
  //
  // deletePage() purges each page it deletes, so a current run cleans up after
  // itself. This catches the back-catalogue: runs from before that landed, and
  // any run where the purge step failed. Without it those tombstones and their
  // version directories sit in storage for the whole retention window — the
  // same slow accumulation as #724, one level down where nobody looks.
  //
  // Scoped strictly to the NGDPBASE-test prefix. It must never purge anything
  // else: the suite runs against real instances, and a blanket trash-empty
  // would destroy genuinely deleted pages an operator was still holding.
  //
  // #970: delete LIVE leftovers first, then purge tombstones — in that order,
  // so pages deleted a moment ago are purged in the same run rather than
  // waiting for the next one.
  await deleteStaleLiveTestPages(page);
  await purgeStaleTestPages(page);
});

/**
 * Delete live pages left behind by a run that crashed before its cleanup (#970).
 *
 * The existing tombstone sweep below only ever saw pages a run had *already*
 * deleted. A run that died earlier — a thrown assertion, a timeout, a killed
 * process — left its pages fully live in the index, visible in listings and
 * search and indistinguishable from real content, with nothing to remove them
 * ever. Four `NGDPBASE-test-LocationTest-*` pages from weeks earlier were found
 * that way on 2026-07-26, alongside two from a failed run the same day.
 *
 * This is #724's failure mode in the one form neither existing protection
 * reached: #724 hardened `deletePage()` to fail loudly, which only helps when
 * the test gets as far as `afterAll`.
 *
 * Runs at SETUP rather than teardown deliberately — it cleans the *previous*
 * run's mess, so it still works when the current run is the one that crashes.
 *
 * Deleting is cheap and reversible now that delete is a soft delete (#947): a
 * mistake sits in the trash for the retention window, and the tombstone sweep
 * that follows clears the storage. Strictly prefix-scoped, and best-effort —
 * storage hygiene must never fail the suite.
 *
 * @param {import('@playwright/test').Page} page - Authenticated page
 */
async function deleteStaleLiveTestPages(page) {
  try {
    // `/api/page-suggestions` matches on substring, so filter to a real prefix
    // match below — never trust it to have scoped this for us.
    const res = await page.request.get(
      `/api/page-suggestions?q=${encodeURIComponent(TEST_PAGE_PREFIX)}&limit=500`
    );
    if (res.status() !== 200) return;

    const body = await res.json();
    const stale = (body.suggestions || [])
      .map((s) => String(s.name ?? s.title ?? ''))
      .filter((name) => name.startsWith(TEST_PAGE_PREFIX));
    if (stale.length === 0) return;

    const tokenRes = await page.request.get('/login');
    const match = (await tokenRes.text()).match(/<meta name="csrf-token" content="([^"]+)"/);
    if (!match) return;

    for (const name of stale) {
      await page.request.post(`/delete/${encodeURIComponent(name)}`, {
        headers: { Accept: 'application/json', 'X-CSRF-Token': match[1] }
      });
    }
    console.log(`[auth.setup] Deleted ${stale.length} stale live ${TEST_PAGE_PREFIX}-* page(s)`);
  } catch {
    // Never fail the suite over cleanup of prior runs.
  }
}

/**
 * Purge soft-deleted pages matching the E2E test prefix (#947).
 *
 * Best-effort: a provider without soft delete answers 501, and a failure here
 * is storage hygiene, not correctness — it must never block the suite.
 *
 * @param {import('@playwright/test').Page} page - Authenticated page
 */
async function purgeStaleTestPages(page) {
  try {
    const listRes = await page.request.get('/api/admin/deleted-pages');
    if (listRes.status() !== 200) return;

    const body = await listRes.json();
    const stale = (body.pages || []).filter((p) => String(p.title).startsWith(TEST_PAGE_PREFIX));
    if (stale.length === 0) return;

    const tokenRes = await page.request.get('/login');
    const match = (await tokenRes.text()).match(/<meta name="csrf-token" content="([^"]+)"/);
    if (!match) return;

    for (const entry of stale) {
      await page.request.delete(`/api/admin/deleted-pages/${encodeURIComponent(entry.uuid)}`, {
        headers: { Accept: 'application/json', 'X-CSRF-Token': match[1] }
      });
    }
    console.log(`[auth.setup] Purged ${stale.length} stale ${TEST_PAGE_PREFIX}-* tombstone(s)`);
  } catch {
    // Never fail the suite over cleanup of prior runs.
  }
}
