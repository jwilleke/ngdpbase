import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

/**
 * Admin → Backup (#1723, #1945): the download is one .tar per backup, and a
 * restore — of the whole site on every instance, of the databases only where
 * it keeps databases — is confirmed by typing the site name, staged, shown,
 * and cancellable.
 *
 * Staging a restore is only exercised when E2E_RESTORE=1 (the databases-only
 * one also needs an instance that keeps databases): on a real instance it
 * would stage a restore of real data.
 * The suite cancels it again (afterAll too), so nothing is left waiting for a
 * restart. Without E2E_RESTORE the confirmation is still checked, never sent.
 */
test.describe('Admin Backup', () => {
  // A full backup of a real instance takes as long as it takes (~49 s to 2 min
  // on jimstest: attachment files, encryption, NAS writes), and the tests after
  // it run while it finishes. They check what a backup contains, not its speed.
  test.setTimeout(240_000);

  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  const cancelStaged = async (page: Page): Promise<void> => {
    await page.goto('/admin/backup');
    // Whichever is staged (#1945): the whole site, or the databases only.
    for (const form of ['#cancel-staged-site-restore', '#cancel-staged-restore']) {
      const cancel = page.locator(`${form} button`);
      if ((await cancel.count()) > 0) {
        await cancel.click();
        await page.waitForLoadState('domcontentloaded');
      }
    }
  };

  test.afterAll(async ({ browser }) => {
    if (process.env.E2E_RESTORE !== '1') return;
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: './tests/e2e/.auth/user.json' });
    try {
      const page = await context.newPage();
      await cancelStaged(page);
      if ((await page.locator('#staged-restore, #staged-site-restore').count()) > 0) throw new Error('A restore is still staged after the suite — cancel it on /admin/backup before restarting (#1723)');
    } finally {
      await context.close();
    }
  });

  test('Create & Download Backup downloads one .tar', async ({ page }) => {
    await page.goto('/admin/backup');
    const downloadPromise = page.waitForEvent('download', { timeout: 170_000 });
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

  test('the backup key card shows its fingerprint, and the key is shown only on its own page, never cached (#1876)', async ({ page }) => {
    await page.goto('/admin/backup');
    const fingerprint = (await page.locator('#backup-key-card #backup-key-fingerprint').textContent())?.trim() ?? '';
    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
    // Saved or not, the card links nowhere else for the key; the key page is the one place it is shown.
    const response = await page.request.get('/admin/backup/key');
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
    await page.goto('/admin/backup/key');
    await expect(page.locator('#backup-key-value')).not.toHaveValue('');
    await expect(page.locator('#backup-key-fingerprint')).toHaveText(fingerprint);
    await expect(page.locator('#backup-key-confirm input[name="fingerprint"]')).toHaveValue(fingerprint);
    // (Confirming is left to the admin: it records a setting.)
  });

  test('Download .env sends the site\'s .env as an attachment, never cached, with the warning beside it (#1938)', async ({ page }) => {
    await page.goto('/admin/backup');
    await expect(page.locator('#backup-key-card #backup-env-warning')).toContainText('This file holds every secret of the site in plain text');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#backup-key-card #backup-env-download').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.env$/);
    expect(await download.failure()).toBeNull();

    const response = await page.request.get('/admin/backup/env');
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(response.headers()['content-disposition']).toMatch(/^attachment; filename=".+\.env"$/);
    const body = await response.body();
    // On an instance whose data folder this run can read (a throwaway one), byte for byte.
    const local = process.env.FAST_STORAGE ? path.join(process.env.FAST_STORAGE, '.env') : '';
    if (local && fs.existsSync(local)) expect(body.equals(fs.readFileSync(local))).toBe(true);
    else expect(body.toString('utf8')).toMatch(/^NGDPBASE_[A-Z_]+=/m);
  });

  test('the whole-site restore is on every instance, says what it puts back and what it needs, and waits for the site name (#1945)', async ({ page }) => {
    await page.goto('/admin/backup');
    const card = page.locator('#site-restore-card');
    await expect(card).toBeVisible();
    // It is the main card: before the databases-only one, where that is shown.
    if ((await page.locator('#restore-card').count()) > 0) {
      const order = await page.evaluate(() => {
        const site = document.getElementById('site-restore-card');
        const databases = document.getElementById('restore-card');
        return site && databases ? site.compareDocumentPosition(databases) & Node.DOCUMENT_POSITION_FOLLOWING : 0;
      });
      expect(order).toBeTruthy();
    }
    await expect(page.locator('#site-restore-restored li').first()).toBeVisible();
    await expect(page.locator('#site-restore-restored')).toContainText('only from an encrypted backup');
    // What is not put back: the notification's own words.
    await expect(page.locator('#site-restore-not-restored')).toContainText('user accounts');
    await expect(page.locator('#site-restore-not-restored')).toContainText('sign-in sessions');
    await expect(page.locator('#site-restore-how')).toContainText('the same backup key');
    await expect(page.locator('#site-restore-how')).toContainText('the site never restarts on its own');

    test.skip((await page.locator('#site-restore-form').count()) === 0, 'no backup is stored on this instance yet');
    await expect(page.locator('#site-restore-form input[name="scope"]')).toHaveValue('site');
    const input = page.locator('#siteRestoreConfirm');
    const button = page.locator('#site-restore-submit');
    await expect(button).toBeDisabled();
    await input.fill('not the site name');
    await expect(button).toBeDisabled();
    await input.fill((await input.getAttribute('data-expected')));
    await expect(button).toBeEnabled();
  });

  test('a whole-site restore is staged, shown with who staged it, and cancelled (#1945)', async ({ page }) => {
    test.skip(process.env.E2E_RESTORE !== '1', 'staging a restore runs only with E2E_RESTORE=1');
    await page.goto('/admin/backup');
    test.skip((await page.locator('#site-restore-form').count()) === 0, 'no backup is stored on this instance');
    await cancelStaged(page);
    const input = page.locator('#siteRestoreConfirm');
    await input.fill((await input.getAttribute('data-expected')));
    await page.locator('#site-restore-submit').click();
    await expect(page.locator('.alert-success')).toContainText('the whole site is staged');

    // A fresh backup of the instance is taken first, then every part is staged.
    await expect(async () => {
      await page.goto('/admin/backup');
      await expect(page.locator('#staged-site-restore')).toBeVisible();
    }).toPass({ timeout: 200_000 });
    await expect(page.locator('#staged-site-restore')).toContainText('A whole-site restore is staged and waits for the restart');
    await expect(page.locator('#staged-site-restore')).toContainText('Staged by');
    const safety = (await page.locator('#site-safety-backup code').textContent()).trim();
    expect(safety).toMatch(/-ngdpbase-backup\.json\.gz(\.enc)?$/);
    await expect(page.locator(`#stored-backups tr[data-backup="${safety}"]`)).toHaveCount(1);
    await expect(page.locator('#site-restore-submit')).toContainText('Replace it');
    // The databases-only restore waits for it, and is not shown as a second one.
    await expect(page.locator('#restore-form')).toHaveCount(0);
    await expect(page.locator('#staged-restore')).toHaveCount(0);

    await page.locator('#cancel-staged-site-restore button').click();
    await expect(page.locator('.alert-success')).toContainText("cancelled; the site's data stays as it is");
    await expect(page.locator('#staged-site-restore')).toHaveCount(0);
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
    expect(safety).toMatch(/-ngdpbase-backup\.json\.gz(\.enc)?$/);
    await expect(page.locator(`#stored-backups tr[data-backup="${safety}"]`)).toHaveCount(1);
    await expect(page.locator('#restore-submit')).toContainText('Replace it');

    await page.locator('#cancel-staged-restore button').click();
    await expect(page.locator('.alert-success')).toContainText('cancelled');
    await expect(page.locator('#staged-restore')).toHaveCount(0);
  });
});
