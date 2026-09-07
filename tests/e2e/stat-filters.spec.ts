import { test, expect } from '@playwright/test';
import { waitForServerReady } from './fixtures/helpers';

/**
 * #1303 — the summary-stat filter bar became a shared control.
 *
 * `/admin/users` is the surface that already had this interaction, hand-rolled
 * in its template. It is therefore the one that proves the control behaves
 * identically after the move: toggle on, toggle off, dim the others, outline
 * the active one, and combine with the page's own search box rather than
 * replacing it.
 */
test.describe('summary-stat filter bar', () => {
  test.beforeEach(async ({ page }) => {
    await waitForServerReady(page);
    await page.goto('/admin/users');
    await expect(page.locator('[data-stat-filters]')).toBeVisible();
  });

  test('renders the canonical bar with its four cards', async ({ page }) => {
    const bar = page.locator('[data-stat-filters]');
    await expect(bar.locator('.stat-filter')).toHaveCount(4);
    // Three filter, one clears. A card that neither filters nor clears would be
    // the lie this issue exists to remove.
    await expect(bar.locator('[data-stat-match]')).toHaveCount(3);
    await expect(bar.locator('[data-stat-clear]')).toHaveCount(1);
  });

  test('a quick filter hides the rows it excludes and marks itself active', async ({ page }) => {
    const bar = page.locator('[data-stat-filters]');
    const inactiveRows = page.locator('tbody tr[data-username][data-status="inactive"]');
    test.skip(await inactiveRows.count() === 0, 'every user on this instance is active');

    await bar.locator('[data-stat-match="status=active"]').click();

    await expect(bar).toHaveAttribute('data-stat-current', 'status=active');
    await expect(inactiveRows.first()).toBeHidden();
    await expect(page.locator('tbody tr[data-username][data-status="active"]').first()).toBeVisible();
  });

  test('clicking the active card again clears the filter', async ({ page }) => {
    const bar = page.locator('[data-stat-filters]');
    const card = bar.locator('[data-stat-match="status=active"]');

    await card.click();
    await expect(bar).toHaveAttribute('data-stat-current', 'status=active');

    await card.click();
    await expect(bar).not.toHaveAttribute('data-stat-current', /.*/);
    // Every row is back, including any the filter had hidden.
    const rows = page.locator('tbody tr[data-username]');
    for (let i = 0; i < await rows.count(); i++) {
      await expect(rows.nth(i)).toBeVisible();
    }
  });

  test('the Total card clears whatever is filtered', async ({ page }) => {
    const bar = page.locator('[data-stat-filters]');
    await bar.locator('[data-stat-match="roles=admin"]').click();
    await expect(bar).toHaveAttribute('data-stat-current', 'roles=admin');

    await bar.locator('[data-stat-clear]').click();
    await expect(bar).not.toHaveAttribute('data-stat-current', /.*/);
  });

  test('the cards answer the keyboard, because they claim to be buttons', async ({ page }) => {
    // role="button" is a promise. Before this control the cards were divs with
    // an onclick and no tabindex, so the promise was decorative.
    const card = page.locator('[data-stat-match="roles=admin"]');
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-stat-filters]')).toHaveAttribute('data-stat-current', 'roles=admin');
  });

  test('the quick filter narrows the search box rather than replacing it', async ({ page }) => {
    // The page owns the compound filter — search, role, status AND the quick
    // filter — which is why the bar carries no data-stat-rows here.
    const rows = page.locator('tbody tr[data-username]');
    const firstUser = await rows.first().getAttribute('data-username');
    test.skip(!firstUser, 'no users on this instance');

    await page.fill('#userSearchInput', firstUser);
    await expect(rows.first()).toBeVisible();

    await page.locator('[data-stat-match="system=true"]').click();

    // The search matched this row; the quick filter decides whether it stays.
    const isSystem = await rows.first().getAttribute('data-system');
    if (isSystem === 'true') {
      await expect(rows.first()).toBeVisible();
    } else {
      await expect(rows.first()).toBeHidden();
      await expect(page.locator('#noUsersFound')).toBeVisible();
    }
  });
});
