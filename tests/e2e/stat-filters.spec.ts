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

/**
 * #1304 — the two surfaces that misled rather than merely differed.
 *
 * `/admin/keywords` rendered cards pixel-identical to the working ones and did
 * nothing when clicked. `/admin/audit` defined a `:hover` rule on cards with no
 * handler behind them. Both now carry the shared control — and they carry two
 * DIFFERENT kinds of it, which is the distinction worth protecting: keywords
 * filters loaded rows, audit navigates, because the audit table is paginated.
 */
test.describe('adopted stat bars (#1304)', () => {
  test('the keywords bar filters the table it sits above', async ({ page }) => {
    await waitForServerReady(page);
    await page.goto('/admin/keywords');

    const bar = page.locator('[data-stat-filters]');
    await expect(bar).toBeVisible();

    const rows = page.locator('#keywordsTable tbody tr[data-keyword-id]');
    const all = await rows.count();
    test.skip(all === 0, 'no keywords on this instance');

    const withPages = page.locator('[data-stat-match="haspage=true"]');
    await withPages.click();

    const visible = await rows.locator('visible=true').count();
    expect(visible).toBeLessThanOrEqual(all);
    // Every row still showing must be one the filter admits.
    for (const row of await rows.locator('visible=true').all()) {
      await expect(row).toHaveAttribute('data-haspage', 'true');
    }
  });

  test('the audit bar navigates instead of hiding rows', async ({ page }) => {
    // Hiding loaded rows on a paginated table filters the page and implies it
    // filtered the log — the defect #1237 documents. These cards are links.
    await waitForServerReady(page);
    await page.goto('/admin/audit');

    const denied = page.locator('a.stat-filter', { hasText: 'Access Denied' });
    await expect(denied).toBeVisible();
    await expect(denied).toHaveAttribute('href', /result=deny/);

    await denied.click();
    await expect(page).toHaveURL(/[?&]result=deny/);
    await expect(page.locator('#filterResult')).toHaveValue('deny');
    await expect(page.locator('a.stat-filter[data-stat-active]')).toContainText('Access Denied');
  });

  test('the audit counts stay whole while a filter is applied', async ({ page }) => {
    // A bar whose numbers follow the current filter cannot be used to move to
    // another one: click Denied and every card reads the denied count.
    await waitForServerReady(page);
    await page.goto('/admin/audit');
    const totalBefore = await page.locator('.stat-filter', { hasText: 'Total Events' }).textContent();

    await page.goto('/admin/audit?result=deny');
    const totalAfter = await page.locator('.stat-filter', { hasText: 'Total Events' }).textContent();

    expect(totalAfter).toBe(totalBefore);
  });
});
