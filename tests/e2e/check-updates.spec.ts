import { test, expect } from '@playwright/test';

/**
 * #1140 — /api/check-updates was reachable with no session at all, and its
 * outbound fetch had no deadline.
 *
 * The unit tests cover the handler; these two cover the thing the unit tests
 * cannot: that the real permission model reaches the same verdict, and that
 * the admin dashboard's update card — the route's only caller — still works
 * after the gate was added.
 */
test.describe('#1140 — /api/check-updates is gated', () => {
  test('an admin still gets the update check', async ({ page }) => {
    const res = await page.request.get('/api/check-updates');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('currentVersion');
    expect(body).toHaveProperty('updateAvailable');
  });

  test('the dashboard indicator still renders for an admin', async ({ page }) => {
    // The on-load script does `if (!resp.ok) return`, so a broken gate shows up
    // as an EMPTY element rather than an error — indistinguishable by eye from
    // "GitHub was unreachable". Assert the rendered text instead.
    await page.goto('/admin');
    const indicator = page.locator('#update-check-result');
    await expect(indicator).toContainText(/Up to date|available/, { timeout: 15000 });
  });

  test('an anonymous caller is refused and learns nothing about the instance', async ({ browser }) => {
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const res = await anon.request.get('/api/check-updates');
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body).not.toHaveProperty('currentVersion');
      expect(body).not.toHaveProperty('releaseUrl');
    } finally {
      await anon.close();
    }
  });
});
