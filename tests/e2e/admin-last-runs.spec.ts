import { test, expect } from '@playwright/test';

/**
 * #2138 — the /admin dashboard shows when Reindex and Rebuild last ran, under
 * the Page Management and Media Management buttons: the local time, who ran
 * it, completed or failed; "never" when there is no run. A reindex started
 * from the dashboard updates its line without a reload, and the line is
 * still there after one.
 */
test.describe('#2138 — last Reindex and Rebuild runs on the dashboard', () => {
  test.use({ storageState: './tests/e2e/.auth/user.json' });
  test.setTimeout(180_000);

  test('every line is shown, and a reindex updates its line in place', async ({ page }) => {
    await page.goto('/admin');
    const reindex = page.locator('[data-job-last-run="pages.reindex"]');
    await expect(reindex).toContainText('Last reindex:');
    await expect(page.locator('[data-job-last-run="pages.rebuild"]')).toContainText('Last rebuild:');

    // The Media card is there only when media is enabled; then it has its three lines.
    if (await page.locator('[data-testid=media-last-runs]').count()) {
      await expect(page.locator('[data-job-last-run="media.rescan"]')).toContainText('Last reindex:');
      await expect(page.locator('[data-job-last-run="media.rebuild"]')).toContainText('Last rebuild:');
      await expect(page.locator('[data-job-last-run="media.folder-scan"]')).toContainText(/Last automatic folder scan:\s+(not run since the server started|\S)/);
    }

    page.on('dialog', (dialog) => { void dialog.accept(); });
    const clickedAt = Date.now();
    await page.locator('button[onclick="reindexPages()"]').click();

    const run = reindex.locator('[data-part=run]');
    await expect(run).toBeVisible({ timeout: 150_000 });
    const time = reindex.locator('time[data-local-time]');
    // On a site that has reindexed before, the line already shows the earlier
    // run: wait until it shows this one, which ended after the click.
    await expect.poll(async () => Date.parse((await time.getAttribute('datetime')) ?? ''), { timeout: 150_000 })
      .toBeGreaterThanOrEqual(clickedAt - 5_000);
    await expect(reindex.locator('[data-part=status]')).toHaveText('completed');
    await expect(reindex.locator('[data-part=who]')).toHaveText(/^ by \S+$/);
    await expect(reindex.locator('[data-part=never]')).toBeHidden();
    // Local time, never the UTC fallback text.
    await expect(time).not.toContainText('UTC');

    // Read back from the run history after a reload.
    await page.reload();
    await expect(reindex.locator('[data-part=run]')).toBeVisible();
    await expect(reindex.locator('[data-part=status]')).toHaveText(/completed|failed/);
    await expect(reindex.locator('time[data-local-time]')).not.toContainText('UTC');
  });
});
