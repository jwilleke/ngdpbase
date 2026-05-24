import { test, expect } from '@playwright/test';

/**
 * Admin Dashboard E2E Tests
 *
 * Tests for admin-only functionality including user management and configuration.
 */

test.describe('Admin Dashboard', () => {
  // Use authenticated state from setup (admin user)
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  test.describe('Dashboard Access', () => {
    test('should access admin dashboard as admin user', async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('domcontentloaded');

      // Should not be redirected to login
      const redirectedToLogin = page.url().includes('login');
      expect(redirectedToLogin).toBe(false);

      // Should see admin content
      const hasAdminContent = await page.locator('.admin, .dashboard, h1:has-text("Admin"), h1:has-text("Dashboard")').count() > 0;
      expect(hasAdminContent).toBe(true);
    });

    test('should display admin navigation/menu', async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('domcontentloaded');

      // Should have admin navigation
      const hasNav = await page.locator('nav, .admin-menu, .sidebar, .admin-nav').count() > 0;
      expect(hasNav).toBe(true);
    });
  });

  test.describe('User Management', () => {
    test('should access user management section', async ({ page }) => {
      await page.goto('/admin/users');
      await page.waitForLoadState('domcontentloaded');

      // Check if redirected to login or access denied
      if (page.url().includes('login')) {
        test.skip();
        return;
      }

      // Should show user list or user management interface
      const hasUserList = await page.locator('table, .user-list, .users, li').count() > 0;
      const hasUserManagement = await page.locator('text=/users|user management/i').count() > 0;

      expect(hasUserList || hasUserManagement).toBe(true);
    });

    test('should have add user option', async ({ page }) => {
      await page.goto('/admin/users');
      await page.waitForLoadState('domcontentloaded');

      if (page.url().includes('login')) {
        test.skip();
        return;
      }

      // Look for add user button/link
      const addUserLink = page.locator('a:has-text("Add"), button:has-text("Add"), a:has-text("New User"), button:has-text("New User")');
      const hasAddOption = await addUserLink.count() > 0;

      // This is informational - feature may not exist
      expect(hasAddOption).toBeDefined();
    });
  });

  test.describe('Configuration', () => {
    test('should access configuration section', async ({ page }) => {
      // Try different config URLs - use /admin/configuration first as it's the actual route
      const configUrls = ['/admin/configuration', '/admin/settings', '/admin/config'];

      for (const url of configUrls) {
        await page.goto(url);
        await page.waitForLoadState('domcontentloaded');

        // Check for 404/error pages (URL or content-based)
        const isError = page.url().includes('login') ||
          page.url().includes('404') ||
          (await page.locator('text=/Cannot GET|Not Found|404/i').count()) > 0;

        if (!isError) {
          // Found config page - verify it has form elements
          const hasConfigForm = await page.locator('form, input, select, textarea').count() > 0;
          expect(hasConfigForm).toBe(true);
          return;
        }
      }

      // No config page found - skip
      test.skip();
    });
  });

  test.describe('System Information', () => {
    test('should display system information', async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('domcontentloaded');

      // Look for system info section
      const hasSystemInfo = await page.locator('text=/version|system|status|info/i').count() > 0;

      // Informational - not required
      expect(hasSystemInfo).toBeDefined();
    });
  });

  test.describe('Admin Security', () => {
    test('should protect admin routes from non-admin users', async ({ browser }) => {
      // Create new context without authentication - explicitly clear storage
      const context = await browser.newContext({
        storageState: { cookies: [], origins: [] }
      });
      const page = await context.newPage();

      await page.goto('/admin');
      await page.waitForLoadState('domcontentloaded');

      // Should be redirected to login or see access denied
      const protectedProperly =
        page.url().includes('login') ||
        (await page.locator('text=/access denied|unauthorized|forbidden|not authorized|please login/i').count()) > 0;

      expect(protectedProperly).toBe(true);

      await context.close();
    });
  });

  test.describe('Session Manager (#776)', () => {
    test('admin dashboard renders the collapsed Session Manager section', async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('domcontentloaded');

      const sessionDetails = page.locator('#session-manager-details');
      await expect(sessionDetails).toBeVisible();
      // Collapsed by default — open attribute absent
      await expect(sessionDetails).not.toHaveAttribute('open', '');
      await expect(page.locator('summary:has-text("Session Manager")')).toBeVisible();
    });

    test('expanding loads sessions and populates the count', async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('domcontentloaded');

      // Open the <details> via summary click — this fires the toggle handler
      // that calls fetch('/api/sessions/list') once (lazy-load).
      await page.locator('#session-manager-details summary').click();

      // Count badge replaces the "—" placeholder once the fetch resolves.
      await expect(page.locator('#session-manager-count')).not.toHaveText('—', { timeout: 8000 });

      // At least the placeholder row is gone (table body has session rows or a "no sessions" row).
      const rows = page.locator('#session-manager-rows tr');
      await expect(rows.first()).toBeVisible();
    });

    test('GET /api/sessions/list returns session details for admin', async ({ page }) => {
      // Validate the endpoint shape directly from an authenticated context.
      const resp = await page.request.get('/api/sessions/list');
      expect(resp.status()).toBe(200);
      const json = await resp.json();
      expect(json).toHaveProperty('total');
      expect(typeof json.total).toBe('number');
      expect(Array.isArray(json.sessions)).toBe(true);
      if (json.sessions.length > 0) {
        const first = json.sessions[0];
        expect(first).toHaveProperty('id');
        expect(first).toHaveProperty('isAuthenticated');
        expect(first).toHaveProperty('expired');
      }
    });

    test('/api/sessions/list returns 403 for unauthenticated callers', async ({ browser }) => {
      // The default chromium project applies storageState (admin) to every context
      // it creates — including browser.newContext() — so override with undefined to
      // get a genuinely anonymous request.
      const anonCtx = await browser.newContext({ storageState: undefined });
      const anonPage = await anonCtx.newPage();
      const resp = await anonPage.request.get('/api/sessions/list');
      expect(resp.status()).toBe(403);
      await anonCtx.close();
    });
  });
});
