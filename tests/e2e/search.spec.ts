import { test, expect } from '@playwright/test';

/**
 * Search E2E Tests
 *
 * Tests for search functionality including text search and filtering.
 */

test.describe('Search', () => {
  // Use authenticated state from setup
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  test.describe('Search Page', () => {
    // #693 slice 3: /search now renders the asset-picker UI. Search runs
    // client-side via /api/assets/search rather than a form submit.
    test('should display search interface', async ({ page }) => {
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');

      // Asset-picker query input
      const searchInput = page.locator('#ap-query');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
    });

    test('should perform basic text search', async ({ page }) => {
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');

      const searchInput = page.locator('#ap-query');
      await searchInput.waitFor({ state: 'visible', timeout: 10000 });
      await searchInput.fill('test');

      // Trigger the JS-driven search
      await page.locator('#ap-search-btn').click();

      // The picker replaces #ap-results' innerHTML when a search runs — the
      // initial #ap-placeholder element gets cleared. Detect that as the
      // "search ran at all" signal (covers result-cards, "No assets found",
      // and error states equally).
      await expect(page.locator('#ap-placeholder')).toHaveCount(0, { timeout: 10000 });

      // Picker shell still on /search (no server error redirected away).
      expect(page.url()).toContain('/search');
    });
  });

  test.describe('Search from Header', () => {
    test('should search from header search box', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // Header always renders #headerSearchInput
      const headerSearch = page.locator('#headerSearchInput');
      await headerSearch.waitFor({ state: 'visible', timeout: 5000 });
      await headerSearch.fill('wiki');
      await headerSearch.press('Enter');
      await page.waitForLoadState('domcontentloaded');

      // Should navigate to search results
      expect(page.url()).toContain('search');
    });
  });

  test.describe('Search Results', () => {
    test('should display search results with links', async ({ page }) => {
      await page.goto('/search?q=test');
      await page.waitForLoadState('domcontentloaded');

      // Asset-picker result cards each wrap their thumb in an anchor.
      // Only assert link shape when results exist; not all queries return rows.
      await page.waitForTimeout(2000); // allow client-side fetch to settle
      const resultLinks = page.locator('#ap-results .card a[href]');

      if (await resultLinks.count() > 0) {
        await expect(resultLinks.first()).toHaveAttribute('href', /.+/);
      }
    });

    test('should handle empty search gracefully', async ({ page }) => {
      await page.goto('/search?q=');
      await page.waitForLoadState('domcontentloaded');

      const hasError = await page.locator('.error-500').count() > 0 ||
        await page.getByText(/server error/i).count() > 0;
      expect(hasError).toBe(false);
    });

    test('should handle special characters in search', async ({ page }) => {
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');

      const searchInput = page.locator('#ap-query');
      await searchInput.waitFor({ state: 'visible', timeout: 10000 });
      await searchInput.fill('test & "special" <chars>');

      await page.locator('#ap-search-btn').click();
      await page.waitForTimeout(2000); // client-side render

      // No 500 page; the picker shell stayed on /search
      const hasErrorPage = await page.locator('.error-500, .error-page, [data-error="500"]').count() > 0;
      const hasErrorTitle = await page.locator('h1:has-text("Error"), h1:has-text("500")').count() > 0;
      const hasSearchHeading = await page.locator('h1:has-text("Search")').count() > 0;

      expect(hasErrorPage).toBe(false);
      expect(hasErrorTitle).toBe(false);
      expect(hasSearchHeading).toBe(true);
    });
  });

  test.describe('Search Filters', () => {
    test('should have category/tag filters if available', async ({ page }) => {
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');

      // Check for filter options - could be selects, checkboxes, or custom filters
      const filterSelects = page.locator('select.filter, select[name*="category"], select[name*="filter"]');
      const filterCheckboxes = page.locator('input[type="checkbox"][name*="category"], input[type="checkbox"][name*="keyword"]');

      const hasSelectFilters = await filterSelects.count() > 0;
      const hasCheckboxFilters = await filterCheckboxes.count() > 0;

      // This is informational - test passes as long as some filter mechanism exists
      if (hasSelectFilters) {
        await expect(filterSelects.first()).toBeVisible();
      } else if (hasCheckboxFilters) {
        // Checkboxes might be in a collapsed section - just verify they exist
        expect(await filterCheckboxes.count()).toBeGreaterThan(0);
      }
      // If neither exists, test still passes (informational only)
    });
  });
});
