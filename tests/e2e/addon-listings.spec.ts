import { test, expect } from '@playwright/test';
import { TEST_PAGE_PREFIX, createPluginPage, deletePage, waitForServerReady } from './fixtures/helpers';

/**
 * #1965 — [{ConfigAccessor type='addons'}] and [{ConfigAccessor type='my-addons'}]
 * on one page, seen by the admin and by an anonymous visitor. What is listed
 * depends on the instance's enabled add-ons, so the checks are about who sees
 * what: version and status only for the admin, the sign-in prompt for the
 * visitor, and every About link a /view/ link.
 */
test.describe('Add-on listings (#1965)', () => {
  test.setTimeout(90000);
  const pageName = `${TEST_PAGE_PREFIX}-AddonListings-${Date.now()}`;
  const body = "[{ConfigAccessor type='addons'}]\n\n[{ConfigAccessor type='my-addons'}]";

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const page = await context.newPage();
    await waitForServerReady(page);
    await createPluginPage(page, pageName, body);
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    await deletePage(await context.newPage(), pageName).catch(() => undefined);
    await context.close();
  });

  test('the admin sees each listed add-on with its version and status', async ({ browser }) => {
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const page = await context.newPage();
    await page.goto(`/view/${encodeURIComponent(pageName)}`);
    const content = page.locator('#pagecontent, .page-content, main').first();
    await expect(content).toContainText(/Add-ons|This site has no add-ons turned on\./);
    const entries = page.locator('.config-accessor-addons .addon-list:not(.addon-mine):not(.addon-available) .addon-entry');
    const count = await entries.count();
    for (let i = 0; i < count; i++) {
      await expect(entries.nth(i).locator('.addon-version')).toHaveCount(1);
      await expect(entries.nth(i).locator('.addon-status')).toHaveCount(1);
    }
    for (const href of await page.locator('.addon-about').evaluateAll((links) => links.map((a) => a.getAttribute('href')))) {
      expect(href).toMatch(/^\/view\//);
    }
    // my-addons, for a signed-in person: their list or the site has none
    await expect(content).toContainText(/My add-ons|This site has no add-ons that you turn on for yourself\./);
    await context.close();
  });

  test('an anonymous visitor sees no version or status, and is asked to sign in for my-addons', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto(`/view/${encodeURIComponent(pageName)}`);
    const content = page.locator('#pagecontent, .page-content, main').first();
    await expect(content).toContainText('to see the add-ons you have turned on.');
    await expect(page.locator('.addon-version')).toHaveCount(0);
    await expect(page.locator('.addon-status')).toHaveCount(0);
    await context.close();
  });
});
