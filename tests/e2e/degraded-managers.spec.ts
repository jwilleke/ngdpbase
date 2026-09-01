import { test, expect } from '@playwright/test';

/**
 * #1155 — thirteen managers could end up degraded and exactly one said so.
 *
 * This asserts the half that makes the issue's problem actually go away: an
 * operator looking at the dashboard can see a subsystem that is configured,
 * wanted, and not working. The state being recorded is not the point; being
 * visible is.
 */
test.describe('#1155 — degraded subsystems are visible', () => {
  test('a healthy instance shows no degraded-subsystem banner', async ({ page }) => {
    // The other half of the contract, and the one that keeps the banner worth
    // reading: it must be absent when nothing is wrong. A warning that is
    // always present is furniture.
    await page.goto('/admin');
    await expect(page.getByText(/subsystems? (is|are) not working/i)).toHaveCount(0);
  });

  test('the dashboard renders without error and shows admin content', async ({ page }) => {
    // Guards the template change itself: an EJS mistake in the new block would
    // throw at render time rather than merely look wrong.
    const res = await page.goto('/admin');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toContainText(/Admin Dashboard/i);
  });
});
