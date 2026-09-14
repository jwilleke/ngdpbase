import { test, expect } from '@playwright/test';
import { TEST_PAGE_PREFIX, deletePage, markTestArtifact } from './fixtures/helpers';

/**
 * Page Operations E2E Tests
 *
 * Tests for viewing, creating, editing, and deleting wiki pages.
 * These tests run with authenticated user (from setup).
 */

test.describe('Page Operations', () => {
  // Use authenticated state from setup
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  test.describe('View Pages', () => {
    test('should display home page', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // Page should load without error
      await expect(page).not.toHaveURL(/error|500|404/);

      // Should have some content
      const body = page.locator('body');
      await expect(body).toBeVisible();
    });

    test('should navigate to wiki pages', async ({ page }) => {
      await page.goto('/view/Main');
      await page.waitForLoadState('domcontentloaded');

      // Should either show the page or a "create new page" option
      const hasContent = await page.locator('.wiki-content, .page-content, article, main').count() > 0;
      const hasCreateOption = await page.locator('a:has-text("Create"), button:has-text("Create")').count() > 0;

      expect(hasContent || hasCreateOption).toBe(true);
    });
  });

  test.describe('Create Page', () => {
    const testPageTitle = `${TEST_PAGE_PREFIX}-Page-${Date.now()}`;

    test.afterAll(async ({ browser }) => {
      const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
      const p = await context.newPage();
      await deletePage(p, testPageTitle);
      await context.close();
    });

    test('should create a new wiki page', async ({ page }) => {
      // Navigate to create page (not /edit which is for editing existing pages)
      await page.goto('/create');
      await page.waitForLoadState('domcontentloaded');

      // Fill in page name - the create form uses #pageName
      const pageNameInput = page.locator('#pageName, input[name="pageName"]');
      await pageNameInput.first().waitFor({ state: 'visible', timeout: 10000 });
      await pageNameInput.first().fill(testPageTitle);

      // Select a template if required
      const templateSelect = page.locator('#templateName, select[name="templateName"]');
      if (await templateSelect.count() > 0 && await templateSelect.isVisible()) {
        // Select first non-empty option
        const options = await templateSelect.locator('option').all();
        for (const option of options) {
          const value = await option.getAttribute('value');
          if (value && value !== '') {
            await templateSelect.selectOption(value);
            break;
          }
        }
      }

      // Submit the create form - use specific button text to avoid matching header search
      const createButton = page.locator('button:has-text("Create Page"), form[action="/create"] button[type="submit"]');

      // Click and wait for navigation (form submit causes redirect)
      await Promise.all([
        page.waitForURL(/\/(edit|view)\//, { timeout: 15000 }),
        createButton.first().click()
      ]);
      await markTestArtifact(page, testPageTitle);

      // Verify page was created - should redirect to edit page for the new page or view page
      const currentUrl = page.url();
      expect(currentUrl.includes('/edit/') || currentUrl.includes('/view/')).toBe(true);
    });
  });

  test.describe('Edit Page', () => {
    test('should be able to edit an existing page', async ({ page }) => {
      // Go to home or main page
      // Use Welcome — a required page that always exists
      await page.goto('/view/Welcome');
      await page.waitForLoadState('domcontentloaded');

      // Find and click edit button/link (rendered when canEdit=true for authenticated user)
      const editLink = page.locator('a[href*="/edit/"], a:has-text("Edit")');
      await editLink.first().waitFor({ state: 'visible', timeout: 5000 });
      await editLink.first().click();
      await page.waitForLoadState('domcontentloaded');

      // Should be on edit page
      const onEditPage = page.url().includes('edit');
      const hasEditor = await page.locator('textarea, .editor, .CodeMirror').count() > 0;
      expect(onEditPage || hasEditor).toBe(true);
    });
  });

  test.describe('Page Navigation', () => {
    test('should show breadcrumbs or navigation', async ({ page }) => {
      await page.goto('/view/Main');
      await page.waitForLoadState('domcontentloaded');

      // Check for navigation elements
      const hasNav = await page.locator('nav, .breadcrumb, .navigation, .sidebar').count() > 0;
      expect(hasNav).toBe(true);
    });

    test('should handle non-existent pages gracefully', async ({ page }) => {
      await page.goto('/view/NonExistentPageXYZ123');
      await page.waitForLoadState('domcontentloaded');

      // Should either show 404, redirect, or offer to create
      const is404 = await page.locator('text=/not found|404|does not exist/i').count() > 0;
      const hasCreateOption = await page.locator('a:has-text("Create"), button:has-text("Create")').count() > 0;
      const redirected = !page.url().includes('NonExistentPageXYZ123');

      expect(is404 || hasCreateOption || redirected).toBe(true);
    });
  });

  test.describe('Page History', () => {
    test('should show page version history', async ({ page }) => {
      // Use Welcome page which is a default required page
      await page.goto('/view/Welcome');
      await page.waitForLoadState('domcontentloaded');

      // Check if page exists (not a 404)
      const is404 = await page.locator('text=/not found|404|does not exist/i').count() > 0;
      if (is404) {
        test.skip();
        return;
      }

      // Open the Info dropdown
      await page.locator('button:has-text("Info")').first().click();

      // Wait for the dropdown item to become visible
      const historyLink = page.locator('.dropdown-menu a:has-text("History")');
      await historyLink.waitFor({ state: 'visible', timeout: 3000 });
      await historyLink.first().click();
      await page.waitForLoadState('domcontentloaded');

      // Should show version list or history content
      const hasVersionList = await page.locator('.version, .history-entry, table tr, .revision, .card').count() > 0;
      expect(hasVersionList).toBe(true);
    });
  });
});
