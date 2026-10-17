import { test, expect, type Page } from '@playwright/test';

/**
 * #1706 — add-on views work with listeners in place of inline handlers.
 *
 * The forms builder and the journal reminder toggles used `on*=` attributes,
 * which a strict script policy never runs. They now use data attributes and
 * listeners; this drives each control in a browser to show it still works.
 * Nothing is saved. A test skips when its add-on is not enabled here.
 */

/** Open `path`, or skip the test when the add-on serving it is not enabled. */
async function openOrSkip(page: Page, path: string): Promise<void> {
  const res = await page.goto(path);
  test.skip(res?.status() === 404, `${path} not served (add-on not enabled on this instance)`);
  expect(res?.ok()).toBe(true);
}

test.describe('#1706 — add-on views without inline handlers', () => {
  test('forms builder: add, edit, reorder and remove fields', async ({ page }) => {
    await openOrSkip(page, '/addons/forms/builder/new');
    const rows = page.locator('#fields-container .field-row');

    await page.locator('#add-field').click();
    await page.locator('#add-field').click();
    await expect(rows).toHaveCount(2);

    await rows.nth(0).locator('[data-key="name"]').fill('first');
    await rows.nth(1).locator('[data-key="name"]').fill('second');
    await rows.nth(1).locator('[data-key="required"]').check();

    // Changing the type re-renders: a dropdown row gains its options box.
    await rows.nth(0).locator('[data-key="type"]').selectOption('dropdown');
    await expect(rows.nth(0).locator('[data-key="options"]')).toBeVisible();
    await rows.nth(0).locator('[data-key="options"]').fill('a\nb');

    // Move the second row up: the edits travel with it.
    await rows.nth(1).locator('[data-action="move-up"]').click();
    await expect(rows.nth(0).locator('[data-key="name"]')).toHaveValue('second');
    await expect(rows.nth(0).locator('[data-key="required"]')).toBeChecked();
    await expect(rows.nth(1).locator('[data-key="name"]')).toHaveValue('first');
    await expect(rows.nth(1).locator('[data-key="options"]')).toHaveValue('a\nb');

    await rows.nth(0).locator('[data-action="remove"]').click();
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0).locator('[data-key="name"]')).toHaveValue('first');
  });

  test('journal settings: the reminder checkbox shows and hides the time', async ({ page }) => {
    await openOrSkip(page, '/journal/settings');
    const box = page.locator('#reminderEnabled');
    const row = page.locator('#reminderTimeRow');
    await box.setChecked(false);
    await expect(row).toBeHidden();
    await box.setChecked(true);
    await expect(row).toBeVisible();
    await box.setChecked(false);
    await expect(row).toBeHidden();
  });

  test('profile: the journal section reminder checkbox shows and hides the time', async ({ page }) => {
    await page.goto('/profile');
    const box = page.locator('#journal_reminderEnabled');
    test.skip(await box.count() === 0, 'journal profile section not shown (add-on not enabled on this instance)');
    const row = page.locator('#journal_reminderTimeRow');
    // The section sits in a collapsed preferences panel on some layouts.
    await box.scrollIntoViewIfNeeded();
    await box.setChecked(false, { force: true });
    await expect(row).toBeHidden();
    await box.setChecked(true, { force: true });
    await expect(row).not.toHaveCSS('display', 'none');
  });
});
