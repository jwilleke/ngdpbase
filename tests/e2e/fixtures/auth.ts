import { test as base, expect } from '@playwright/test';

/**
 * Authentication fixtures for E2E tests
 *
 * Provides helper functions for authentication-related operations.
 */

/**
 * Extended test with authentication helpers
 */
const test = base.extend({
  /**
   * Login helper - performs login with given credentials
   */
  login: async ({ page }, use) => {
    const loginFn = async (username, password) => {
      await page.goto('/login');
      await page.getByLabel(/username/i).fill(username);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole('button', { name: /login/i }).click();
      await page.waitForLoadState('domcontentloaded');
    };
    await use(loginFn);
  },

  /**
   * Logout helper - performs logout
   */
  logout: async ({ page }, use) => {
    const logoutFn = async () => {
      // Try to find and click logout button/link
      const logoutLink = page.locator('a[href*="logout"], button:has-text("Logout"), a:has-text("Logout")');
      if (await logoutLink.count() > 0) {
        await logoutLink.first().click();
        await page.waitForLoadState('domcontentloaded');
      } else {
        // Fallback: the confirm page a typed /logout shows (#1631)
        await page.goto('/logout');
        await page.getByRole('button', { name: 'Sign out' }).click();
      }
    };
    await use(logoutFn);
  },

  /**
   * Check if user is logged in
   */
  isLoggedIn: async ({ page }, use) => {
    const checkFn = async () => {
      // Check for login-specific elements
      const loginLink = page.locator('a[href*="login"]:visible');
      const logoutLink = page.locator('a[href*="logout"]:visible, button:has-text("Logout"):visible');

      const loginVisible = await loginLink.count() > 0;
      const logoutVisible = await logoutLink.count() > 0;

      return logoutVisible && !loginVisible;
    };
    await use(checkFn);
  }
});

export default { test, expect };
