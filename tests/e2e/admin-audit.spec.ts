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
});
