import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { instanceOrigin } from './fixtures/helpers';

/**
 * #2100 — Update for add-ons installed from npm, on /admin/addons.
 *
 * Always: the Update POST is refused without the CSRF token, and an Update of
 * an add-on the install map does not name is refused with a plain message.
 *
 * With `E2E_ADDON_UPDATE_SLUG` set: the instance has that add-on installed
 * (in `ngdpbase.addons.install` and the lock file) and its registry
 * (`ngdpbase.managers.addons-manager.install.registry`) cannot be reached, so
 * the page shows the add-on with "npm couldn't be reached" and an Update
 * changes nothing. This spec changes nothing on the instance.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

async function csrfFrom(page: Page): Promise<string> {
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) throw new Error('no csrf token on the page');
  return token;
}

const SLUG = process.env.E2E_ADDON_UPDATE_SLUG;

test.describe('Add-on Update (#2100)', () => {
  test('the Update POST is refused without the CSRF token', async ({ page }) => {
    await page.goto('/admin/addons');
    const res = await page.request.post(`${await instanceOrigin(page)}/admin/addons/e2e-no-such-addon/update`, {
      form: { version: '9.9.9' },
      maxRedirects: 0
    });
    expect(res.status()).toBe(403);
  });

  test('an add-on not in the install map is not updated, and the page says why', async ({ page }) => {
    await page.goto('/admin/addons');
    const res = await page.request.post(`${await instanceOrigin(page)}/admin/addons/e2e-no-such-addon/update`, {
      form: { version: '9.9.9', _csrf: await csrfFrom(page) },
      maxRedirects: 0
    });
    expect(res.status()).toBe(302);
    expect(decodeURIComponent(res.headers().location ?? '')).toContain('e2e-no-such-addon was not updated: e2e-no-such-addon is not in ngdpbase.addons.install');
  });

  test('an installed add-on is listed, and npm being unreachable is said plainly', async ({ page }) => {
    test.skip(!SLUG, 'set E2E_ADDON_UPDATE_SLUG on an instance with that add-on installed and its registry unreachable');
    await page.goto('/admin/addons');
    const row = page.locator(`#installed-addons tr[data-addon="${SLUG}"]`);
    await expect(row).toBeVisible();
    await expect(page.locator('#registry-unreachable')).toContainText("npm couldn't be reached");
    await expect(row).toContainText('unknown (npm unreachable)');
    await expect(row.getByRole('button', { name: /Update to/ })).toHaveCount(0);
    await expect(page.locator('#installed-addons a[href="/view/updating-add-ons"]')).toBeVisible();
  });

  test('an Update while npm is unreachable changes nothing, and says so', async ({ page }) => {
    test.skip(!SLUG, 'set E2E_ADDON_UPDATE_SLUG on an instance with that add-on installed and its registry unreachable');
    await page.goto('/admin/addons');
    const installed = (await page.locator(`#installed-addons tr[data-addon="${SLUG}"] td`).nth(2).innerText()).trim();
    // The next patch release: in a caret or tilde range and newer, so only the registry can answer.
    const [major, minor, patch] = installed.split('.').map(Number);
    const res = await page.request.post(`${await instanceOrigin(page)}/admin/addons/${SLUG}/update`, {
      form: { version: `${major}.${minor}.${patch + 1}`, _csrf: await csrfFrom(page) },
      maxRedirects: 0
    });
    expect(res.status()).toBe(302);
    expect(decodeURIComponent(res.headers().location ?? '')).toContain(`error=npm couldn't be reached, so ${SLUG} was not updated and stays on its current version`);
    await page.goto('/admin/addons');
    await expect(page.locator(`#installed-addons tr[data-addon="${SLUG}"] td`).nth(2)).toHaveText(installed);
  });
});
