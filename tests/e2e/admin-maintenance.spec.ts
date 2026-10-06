import { test, expect } from '@playwright/test';

/**
 * Admin Maintenance Mode E2E Tests
 *
 * Tests the full admin maintenance mode lifecycle:
 * - Admin enables maintenance mode via dashboard
 * - Non-admin users see 503 maintenance page
 * - Admin can still access admin routes
 * - Admin disables maintenance mode
 * - Normal access resumes
 */

test.describe('Admin Maintenance Mode', () => {
  test.describe.configure({ mode: 'serial' });

  // Use authenticated admin state
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  // #1664: this suite runs against real instances. If any test between
  // "enable" and "disable" fails, the serial run stops and the instance would
  // be left serving the maintenance page to everyone. So whatever happened,
  // switch it off again — and fail loudly if that is not possible, never
  // leave a live site stranded silently.
  test.afterAll(async ({ browser }) => {
    const baseURL = test.info().project.use.baseURL;
    const context = await browser.newContext({ baseURL, storageState: './tests/e2e/.auth/user.json' });
    const page = await context.newPage();
    try {
      await page.goto('/admin');
      const disableButton = page.locator('button:has-text("Disable Maintenance"), a:has-text("Disable Maintenance")');
      if ((await disableButton.count()) === 0) return;
      page.on('dialog', (dialog) => dialog.accept());
      await disableButton.first().click();
      await page.waitForLoadState('domcontentloaded');
      const anon = await browser.newContext({ baseURL, storageState: undefined });
      const status = (await (await anon.newPage()).goto('/'))?.status();
      await anon.close();
      if (status === 503) throw new Error('Maintenance mode is still ON after the suite — switch it off from /admin (#1664)');
    } finally {
      await context.close();
    }
  });

  test('admin can enable maintenance mode', async ({ page }) => {
    // Go to admin dashboard
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');

    // Verify we're on the admin page
    await expect(page).toHaveURL(/\/admin/);

    // Find and click the maintenance mode toggle button
    const enableButton = page.locator('button:has-text("Enable Maintenance"), a:has-text("Enable Maintenance")');

    if (await enableButton.count() > 0) {
      // Handle confirmation dialog
      page.on('dialog', dialog => dialog.accept());
      await enableButton.first().click();
      await page.waitForLoadState('domcontentloaded');

      // Verify maintenance mode is now active - look for indication on admin page
      // The admin page should show maintenance is enabled
      const pageContent = await page.content();
      const isActive = pageContent.includes('Disable Maintenance') ||
                       pageContent.includes('ACTIVE') ||
                       pageContent.includes('maintenance mode is currently');

      expect(isActive).toBe(true);
    } else {
      // Maintenance might already be enabled - check for disable button
      const disableButton = page.locator('button:has-text("Disable Maintenance")');
      expect(await disableButton.count()).toBeGreaterThan(0);
    }
  });

  test('admin can still access admin routes during maintenance', async ({ page }) => {
    // Admin should be able to access admin dashboard
    const adminResponse = await page.goto('/admin');
    expect(adminResponse?.status()).not.toBe(503);

    // Verify we see the admin dashboard content
    await expect(page.locator('h1:has-text("Admin Dashboard"), h2:has-text("Admin Dashboard")').first()).toBeVisible({ timeout: 5000 });
  });

  test('non-admin requests get 503 during maintenance', async ({ context }) => {
    // Create a new browser context WITHOUT storageState (truly anonymous)
    const browser = context.browser();
    const anonContext = await browser.newContext({ storageState: undefined });
    const anonPage = await anonContext.newPage();

    try {
      const baseURL = test.info().project.use.baseURL;
      if (!baseURL) throw new Error('baseURL not configured in playwright.config.js');
      const response = await anonPage.goto(baseURL);
      const status = response?.status();

      // Should be 503 maintenance page
      expect(status).toBe(503);

      // Verify it's the maintenance page
      const bodyText = await anonPage.textContent('body');
      expect(bodyText).toContain('maintenance');
    } finally {
      await anonContext.close();
    }
  });

  test('login page is accessible during maintenance', async ({ context }) => {
    // Login should be accessible so admins can log in to disable maintenance
    const browser = context.browser();
    const anonContext = await browser.newContext({ storageState: undefined });
    const anonPage = await anonContext.newPage();

    try {
      const baseURL = process.env.E2E_BASE_URL || `http://localhost:${process.env.PORT || '2121'}`;
      const loginResponse = await anonPage.goto(baseURL + '/login');
      // Login should not be blocked by maintenance
      expect(loginResponse?.status()).not.toBe(503);
    } finally {
      await anonContext.close();
    }
  });

  test('admin can disable maintenance mode', async ({ page }) => {
    // Go to admin dashboard
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');

    // Find and click the disable maintenance button
    const disableButton = page.locator('button:has-text("Disable Maintenance"), a:has-text("Disable Maintenance")');

    if (await disableButton.count() > 0) {
      // Handle confirmation dialog
      page.on('dialog', dialog => dialog.accept());
      await disableButton.first().click();
      await page.waitForLoadState('domcontentloaded');

      // Verify maintenance mode is now disabled
      const pageContent = await page.content();
      const isDisabled = pageContent.includes('Enable Maintenance') ||
                         !pageContent.includes('ACTIVE');
      expect(isDisabled).toBe(true);
    }
  });

  test('normal access resumes after disabling maintenance', async ({ context }) => {
    // Create a new anonymous context to verify maintenance is off
    const browser = context.browser();
    const anonContext = await browser.newContext({ storageState: undefined });
    const anonPage = await anonContext.newPage();

    try {
      const baseURL = test.info().project.use.baseURL;
      if (!baseURL) throw new Error('baseURL not configured in playwright.config.js');
      const response = await anonPage.goto(baseURL);
      const status = response?.status();

      // Should NOT be 503 anymore
      expect(status).not.toBe(503);
    } finally {
      await anonContext.close();
    }
  });
});
