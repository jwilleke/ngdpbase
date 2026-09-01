import { test, expect } from '@playwright/test';

/**
 * #1145 — the security posture, shown as one subject.
 *
 * An operator could not otherwise see what their instance's security settings
 * are: they sit in config/app-default-config.json among ~500 other keys with
 * nothing presenting them together.
 */
test.describe('#1145 — the Security Posture section', () => {
  test('an admin sees the posture with its settings and values', async ({ page }) => {
    await page.goto('/admin');
    const section = page.getByText('Security Posture', { exact: false }).first();
    await expect(section).toBeVisible();

    // Open it — collapsed by default, because it is a reference rather than an
    // alert and the banners above are what need attention.
    await section.click();
    await expect(page.getByText('ngdpbase.session.secure')).toBeVisible();
    await expect(page.getByText('ngdpbase.filters.security.enabled')).toBeVisible();
  });

  test('it says which settings need a restart', async ({ page }) => {
    // The honest half of #1155/D6: a value shown without saying it is not yet
    // in force would be a lie an operator acts on.
    await page.goto('/admin');
    await page.getByText('Security Posture', { exact: false }).first().click();
    await expect(page.getByText('after a restart').first()).toBeVisible();
    await expect(page.getByText('immediately').first()).toBeVisible();
  });

  test('no secret value is rendered anywhere on the page', async ({ page }) => {
    // The section must not reintroduce, through a different route, the
    // disclosure ngdpbase.config.secret-keys exists to prevent.
    await page.goto('/admin');
    const body = (await page.content()).toLowerCase();
    expect(body).not.toContain('ngdpbase-session-secret-change-in-production');
    expect(body).not.toContain('amdwiki-salt');
  });
});
