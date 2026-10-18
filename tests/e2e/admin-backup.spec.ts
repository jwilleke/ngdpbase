import { test, expect, type Page } from '@playwright/test';

/**
 * Admin → Backup (#1723): the download is one .tar per backup, and a
 * database restore is confirmed by typing the site name, staged, shown, and
 * cancellable.
 *
 * Staging a restore is only exercised when E2E_RESTORE=1 and the instance
 * keeps databases: on a real instance it would stage a restore of real data.
 * The suite cancels it again (afterAll too), so nothing is left waiting for a
 * restart. Without E2E_RESTORE the confirmation is still checked, never sent.
 */
test.describe('Admin Backup', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  const cancelStaged = async (page: Page): Promise<void> => {
    await page.goto('/admin/backup');
    const cancel = page.locator('#cancel-staged-restore button');
    if ((await cancel.count()) > 0) {
      await cancel.click();
      await page.waitForLoadState('domcontentloaded');
    }
  };

  test.afterAll(async ({ browser }) => {
    if (process.env.E2E_RESTORE !== '1') return;
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: './tests/e2e/.auth/user.json' });
    try {
      const page = await context.newPage();
      await cancelStaged(page);
      if ((await page.locator('#staged-restore').count()) > 0) throw new Error('A restore is still staged after the suite — cancel it on /admin/backup before restarting (#1723)');
    } finally {
      await context.close();
    }
  });

  test('Create & Download Backup downloads one .tar', async ({ page }) => {
    await page.goto('/admin/backup');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('form[action="/admin/backup/create"] button[type="submit"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/-ngdpbase-backup\.tar$/);
    expect(await download.failure()).toBeNull();
  });

  test('each stored backup downloads as a .tar, and a made-up name is not found', async ({ page }) => {
    await page.goto('/admin/backup');
    const link = page.locator('#stored-backups a:has-text("Download")').first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    const response = await page.request.get(href);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/x-tar');
    expect(response.headers()['content-disposition']).toMatch(/\.tar"/);
    const missing = await page.request.get('/admin/backup/download/no-such-backup.json.gz');
    expect(missing.status()).toBe(404);
  });

  test('the restore button waits for the site name', async ({ page }) => {
    await page.goto('/admin/backup');
    test.skip((await page.locator('#restore-card').count()) === 0, 'this instance keeps no databases');
    test.skip((await page.locator('#restore-form').count()) === 0, 'no backup on this instance holds databases yet');
    await expect(page.locator('#restore-scope')).toHaveText('Restores the databases only. Pages, users and settings are not changed.');
    const input = page.locator('#restoreConfirm');
    const button = page.locator('#restore-submit');
    await expect(button).toBeDisabled();
    await input.fill('not the site name');
    await expect(button).toBeDisabled();
    await input.fill((await input.getAttribute('data-expected')));
    await expect(button).toBeEnabled();
  });

  test('a restore is staged, shown with who staged it, and cancelled', async ({ page }) => {
    test.skip(process.env.E2E_RESTORE !== '1', 'staging a restore runs only with E2E_RESTORE=1');
    await page.goto('/admin/backup');
    test.skip((await page.locator('#restore-form').count()) === 0, 'no backup on this instance holds databases');
    await cancelStaged(page);
    const input = page.locator('#restoreConfirm');
    await input.fill((await input.getAttribute('data-expected')));
    await page.locator('#restore-submit').click();
    await expect(page.locator('.alert-success')).toContainText('Restart the site to apply it');

    // Staging runs in the background; the page shows it once it is done.
    await expect(async () => {
      await page.goto('/admin/backup');
      await expect(page.locator('#staged-restore')).toBeVisible();
    }).toPass({ timeout: 60000 });
    await expect(page.locator('#staged-restore')).toContainText('Staged by');
    // D6: the safety backup taken first is named, and is in the stored list.
    const safety = (await page.locator('#safety-backup code').textContent()).trim();
    expect(safety).toMatch(/-ngdpbase-backup\.json\.gz$/);
    await expect(page.locator(`#stored-backups tr[data-backup="${safety}"]`)).toHaveCount(1);
    await expect(page.locator('#restore-submit')).toContainText('Replace it');

    await page.locator('#cancel-staged-restore button').click();
    await expect(page.locator('.alert-success')).toContainText('cancelled');
    await expect(page.locator('#staged-restore')).toHaveCount(0);
  });
});
