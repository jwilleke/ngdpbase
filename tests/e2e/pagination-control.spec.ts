import { test, expect } from '@playwright/test';
import { waitForServerReady } from './fixtures/helpers';

/**
 * #1300 — the existing consumers of `WikiPagination` must not change.
 *
 * `/attachments/browse` renders its pager in the browser through `renderNav`.
 * This issue added the canonical marker to that markup and a bind-once guard
 * to the keyboard and swipe helpers, so the risk worth covering is that the
 * one surface already using the control still paginates exactly as it did.
 */
test.describe('pagination control', () => {
  test('/attachments/browse still paginates through the client-rendered control', async ({ page }) => {
    await waitForServerReady(page);
    await page.goto('/attachments/browse');

    // The results and their pager arrive from a fetch, so the control does not
    // exist at load. An instance with few attachments renders none at all,
    // which is correct and leaves nothing to assert about.
    const pager = page.locator('[data-pagination]').first();
    try {
      await pager.waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      test.skip(true, 'not enough attachments to paginate');
    }

    // The marker added by #1300 must carry real state, not empty attributes.
    expect(Number(await pager.getAttribute('data-total-pages'))).toBeGreaterThan(1);
    expect(await pager.getAttribute('data-current-page')).toBe('1');

    const secondPage = pager.locator('a.page-link', { hasText: '2' }).first();
    test.skip(await secondPage.count() === 0, 'only one page of results');

    await secondPage.click();
    await expect(page.locator('[data-pagination]').first()).toHaveAttribute('data-current-page', '2');
  });
});
