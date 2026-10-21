import { test, expect, type Page } from '@playwright/test';

/**
 * #1563 — backups never fail silently: a site with no recent good backup
 * shows Backup as NOT working on the /admin dashboard, with "never" on a site
 * that has none, and the first good backup clears it.
 *
 * The first test needs an instance with no backup at all — a throwaway one,
 * freshly seeded. It is named to run before admin-backup.spec.ts, which makes
 * backups; on an instance that already has one it is skipped, and says why.
 */
test.describe('#1563 — backups not working is an outage on the dashboard', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: './tests/e2e/.auth/user.json' });
  test.setTimeout(240_000);

  const backupRow = (page: Page) => page.locator('#subsystems-down li', { hasText: 'BackupManager' });

  test('no backup at all: Backup is listed as not working, "No good backup since: never"', async ({ page }) => {
    await page.goto('/admin/backup');
    const lastGood = page.locator('#backup-health [data-testid=backup-last-good]');
    await expect(lastGood).toBeVisible();
    test.skip(!/never/.test(await lastGood.innerText()), 'this instance already has a backup; run on a freshly seeded throwaway instance');

    await page.goto('/admin');
    await expect(page.locator('#subsystems-down')).toBeVisible();
    await expect(backupRow(page)).toContainText('No good backup since: never');
    await expect(backupRow(page)).toContainText('(degraded)');
    // The dashboard's own backup lines say the same, with the next run and free space.
    await expect(page.locator('#backup-health [data-testid=backup-health-fault]')).toContainText('Backups are not working');
    await expect(page.locator('#backup-health [data-testid=backup-last-good]')).toContainText('never');
    await expect(page.locator('#backup-health [data-testid=backup-free-space]')).not.toContainText('unknown');
  });

  test('a good backup clears it, and the dashboard shows when it was made', async ({ page }) => {
    await page.goto('/admin/backup');
    const downloadPromise = page.waitForEvent('download', { timeout: 170_000 });
    await page.locator('form[action="/admin/backup/create"] button[type="submit"]').click();
    expect(await (await downloadPromise).failure()).toBeNull();

    await page.goto('/admin');
    await expect(backupRow(page)).toHaveCount(0);
    await expect(page.locator('#backup-health [data-testid=backup-health-fault]')).toHaveCount(0);
    await expect(page.locator('#backup-health [data-testid=backup-last-good] time[data-local-time]')).toBeVisible();
  });
});
