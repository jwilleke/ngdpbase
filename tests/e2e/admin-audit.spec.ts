import { test, expect } from '@playwright/test';
import { waitForServerReady } from './fixtures/helpers';

/**
 * /admin/audit had no E2E coverage at all, which is why a claim about its
 * Details button could be argued from source for as long as it was.
 *
 * These are plain behavioural checks on the surface #1237 is about to change:
 * the log lists events, and the Details button opens a populated modal without
 * raising an alert. They exist so the pagination rewrite has something to
 * regress against.
 */
test.describe('admin audit log', () => {
  test.beforeEach(async ({ page }) => {
    await waitForServerReady(page);
    await page.goto('/admin/audit');
    // The skip guards below count elements, and a count of 0 on a page that has
    // simply not finished rendering reads as "this instance has one page" — a
    // test that silently skips under parallel load. Wait for the table first.
    await expect(page.locator('#auditTableBody tr').first()).toBeVisible();
  });

  test('lists audit events', async ({ page }) => {
    await expect(page.locator('#auditTable')).toBeVisible();
    expect(await page.locator('#auditTableBody tr').count()).toBeGreaterThan(0);
  });

  test('Details opens a populated modal and raises no alert', async ({ page }) => {
    // The failure mode worth catching here is a client error swallowed by the
    // fetch chain's .catch(), which surfaces as a native alert claiming the
    // load failed. Record dialogs rather than letting Playwright dismiss them
    // silently, so that shape fails the test loudly.
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });

    const detailsButtons = page.locator('#auditTableBody button', { hasText: 'Details' });
    test.skip(await detailsButtons.count() === 0, 'no audit events on this instance to open');

    await detailsButtons.first().click();

    await expect(page.locator('#logDetailsModal')).toBeVisible();
    await expect(page.locator('#logDetailsContent')).toContainText('Basic Information');
    expect(dialogs).toEqual([]);
  });

  /**
   * #1237 — the nav linked to `?page=N`, the handler read only `limit` and
   * `offset`, and DataTables drew a second pager at its own page size over the
   * same rows. So every one of 166 page links re-rendered the same 50 records
   * under a control claiming "1 to 25 of 50".
   */
  test('page 2 shows different records than page 1', async ({ page }) => {
    const pager = page.locator('nav[data-pagination]');
    test.skip(await pager.count() === 0, 'this instance has one page of audit events');

    const firstRowOnPageOne = await page.locator('#auditTableBody tr').first().textContent();

    await pager.getByRole('link', { name: '2', exact: true }).click();
    await expect(page).toHaveURL(/[?&]page=2/);

    await expect(page.locator('nav[data-pagination]')).toHaveAttribute('data-current-page', '2');
    expect(await page.locator('#auditTableBody tr').first().textContent()).not.toBe(firstRowOnPageOne);
  });

  test('one pager, not two — DataTables is gone from this table', async ({ page }) => {
    // DataTables renders #<id>_wrapper around any table it initialises, and its
    // own info line. Their absence is what "consistent" means here.
    await expect(page.locator('#auditTable_wrapper')).toHaveCount(0);
    await expect(page.locator('#auditTable_info')).toHaveCount(0);
    expect(await page.locator('nav[data-pagination]').count()).toBeLessThanOrEqual(1);
  });

  test('the page size resizes the query, and filters survive a page change', async ({ page }) => {
    const pager = page.locator('nav[data-pagination]');
    test.skip(await pager.count() === 0, 'this instance has one page of audit events');

    await page.selectOption('#filterLimit', '25');
    await expect(page).toHaveURL(/[?&]limit=25/);
    expect(await page.locator('#auditTableBody tr').count()).toBeLessThanOrEqual(25);

    // Only the page size navigates on change; a filter waits for Apply, which
    // is why the two are separate gestures here.
    await page.selectOption('#filterSeverity', 'low');
    await page.getByRole('button', { name: 'Apply Filters' }).click();
    await expect(page).toHaveURL(/[?&]severity=low/);

    const nextPage = page.locator('nav[data-pagination]').getByRole('link', { name: '2', exact: true });
    test.skip(await nextPage.count() === 0, 'the filtered result is a single page');
    await nextPage.click();

    // The filter and the page size have to be in the link itself: a full page
    // load is what a page link does, and it resets anything held in a variable.
    await expect(page).toHaveURL(/[?&]severity=low/);
    await expect(page).toHaveURL(/[?&]limit=25/);
    await expect(page.locator('#filterSeverity')).toHaveValue('low');
  });
});
