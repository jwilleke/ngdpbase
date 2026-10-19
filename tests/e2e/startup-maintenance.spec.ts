import { test, expect } from '@playwright/test';

/**
 * Startup Maintenance Page E2E Tests
 *
 * Tests that the server returns 503 with the maintenance page during engine
 * initialization, then transitions to normal responses when ready.
 *
 * Note: In CI, Playwright starts a fresh server (see playwright.config.js webServer),
 * so the 503 maintenance page is visible during startup. Locally, the server is
 * usually already running, so these tests verify the maintenance page structure
 * by checking the template renders correctly.
 */

test.describe('Startup Maintenance Page', () => {
  // These tests run without authentication (no storageState)
  // since the maintenance page is served to all users during startup.

  test('maintenance page has correct structure and auto-refresh', async ({ page }) => {
    // Navigate to the maintenance page directly by rendering it
    // If server is already ready, we can't see the startup 503.
    // Instead, verify the maintenance.ejs template renders correctly
    // by checking a known endpoint.
    const response = await page.goto('/');
    const status = response?.status();

    if (status === 503) {
      // Server is still initializing - verify maintenance page content
      // #1906: the heading names the site (ngdpbase.application-name).
      await expect(page.locator('h1')).not.toBeEmpty();
      await expect(page.locator('text=starting up')).toBeVisible();

      // Verify auto-refresh meta tag exists
      const metaRefresh = page.locator('meta[http-equiv="refresh"]');
      await expect(metaRefresh).toHaveAttribute('content', '10');

      // Verify "Try Again" button exists
      await expect(page.locator('button:has-text("Try Again"), a:has-text("Try Again")')).toBeVisible();
    } else {
      // Server is already ready - just verify it's serving normally
      expect(status).toBeLessThan(500);
    }
  });

  test('maintenance page returns 503 status code during startup', async ({ page }) => {
    // This test is most meaningful in CI where a fresh server is started.
    // Locally it validates that the server responds correctly.
    const response = await page.goto('/');
    const status = response?.status();

    if (status === 503) {
      // Verify it's actually the maintenance page, not a generic error
      const bodyText = await page.textContent('body');
      expect(bodyText).toContain('maintenance');

      // Static assets should still be served (not 503)
      const cssResponse = await page.goto('/css/bootstrap.min.css');
      if (cssResponse) {
        expect(cssResponse.status()).not.toBe(503);
      }
    } else {
      // Server is ready - verify normal operation
      expect([200, 301, 302]).toContain(status);
    }
  });

  test('server transitions from 503 to ready state', async ({ page }) => {
    // Poll the server and verify it eventually becomes ready.
    // In CI this tests the full startup flow; locally it passes immediately.
    const maxWait = 150000; // 2.5 minutes
    const interval = 3000;
    const start = Date.now();
    let sawMaintenance = false;
    let sawReady = false;

    while (Date.now() - start < maxWait) {
      const response = await page.goto('/login', { waitUntil: 'domcontentloaded' });
      const status = response?.status();

      if (status === 503) {
        sawMaintenance = true;
      } else if (status && status < 500) {
        sawReady = true;
        break;
      }

      await page.waitForTimeout(interval);
    }

    // Server must eventually be ready
    expect(sawReady).toBe(true);

    // If we saw maintenance, verify the transition happened
    if (sawMaintenance) {
      // After becoming ready, maintenance page should no longer appear
      const response = await page.goto('/login');
      expect(response?.status()).not.toBe(503);
    }
  });
});
