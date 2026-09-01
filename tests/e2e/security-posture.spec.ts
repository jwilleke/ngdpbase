import { test, expect } from '@playwright/test';

/**
 * #1145 / #1162 — the security posture, shown as one subject.
 *
 * Moved from the dashboard to /admin/configuration by #1162, where an operator
 * deciding what to change is already looking.
 *
 * An operator could not otherwise see what their instance's security settings
 * are: they sit in config/app-default-config.json among ~500 other keys with
 * nothing presenting them together.
 */
test.describe('#1145 — the Security Posture section', () => {
  test('an admin sees the posture with its settings and values', async ({ page }) => {
    await page.goto('/admin/configuration');
    const section = page.getByText('Security Posture', { exact: false }).first();
    await expect(section).toBeVisible();

    // Open it — collapsed by default, because it is a reference rather than an
    // alert and the banners above are what need attention.
    await section.click();
    // Scoped to the section: /admin/configuration also lists every key in its
    // Current Configuration and Default Values panels, so an unscoped locator
    // matches five elements and proves nothing about THIS section.
    const posture = page.locator('#security-posture');
    await expect(posture.getByText('ngdpbase.session.secure')).toBeVisible();
    await expect(posture.getByText('ngdpbase.filters.security.enabled')).toBeVisible();
  });

  test('it says which settings need a restart', async ({ page }) => {
    // The honest half of #1155/D6: a value shown without saying it is not yet
    // in force would be a lie an operator acts on.
    await page.goto('/admin/configuration');
    await page.getByText('Security Posture', { exact: false }).first().click();
    const posture = page.locator('#security-posture');
    await expect(posture.getByText('after a restart').first()).toBeVisible();
    await expect(posture.getByText('immediately').first()).toBeVisible();
  });

  test('an operator can add and remove what is watched (#1159)', async ({ page }) => {
    // D4: the set is not fixed. Until #1159 the only way to change it was
    // hand-editing app-custom-config.json.
    await page.goto('/admin/configuration');
    await page.getByText('Security Posture', { exact: false }).first().click();
    await expect(page.getByLabel(/Watch another setting/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Stop watching/i }).first()).toBeVisible();
  });

  test('the wording does not imply removing turns something off', async ({ page }) => {
    // Removing changes NO value — the key keeps what it is set to and the code
    // keeps reading it. An operator reading "remove" as "disable" would be a
    // dangerous misunderstanding of a security screen.
    await page.goto('/admin/configuration');
    await page.getByText('Security Posture', { exact: false }).first().click();
    await expect(page.getByText(/does not change any value/i)).toBeVisible();
  });

  test('no secret value is rendered anywhere on the page', async ({ page }) => {
    // The section must not reintroduce, through a different route, the
    // disclosure ngdpbase.config.secret-keys exists to prevent.
    await page.goto('/admin/configuration');
    const body = (await page.content()).toLowerCase();
    expect(body).not.toContain('ngdpbase-session-secret-change-in-production');
    expect(body).not.toContain('amdwiki-salt');
  });
});
