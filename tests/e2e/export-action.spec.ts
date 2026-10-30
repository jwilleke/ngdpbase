import { test, expect } from '@playwright/test';

/**
 * #2120 — the Export action on a page, through the ICE engine.
 *
 * Export starts from the page: its More menu links to the page's Export
 * action, which lists only the formats the engine can make from a page. The
 * shipped site has no PDF provider (`ngdpbase.export.pdf.provider: none`),
 * so PDF is not offered. Choosing HTML makes the file in the background and
 * downloads it. Nothing is created on the site: an export is held in memory
 * for its user and let go.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

test.describe('Export action (#2120)', () => {
  test('a page links to its own Export action', async ({ page }) => {
    await page.goto('/view/Main');
    await expect(page.locator('a[href="/export/page/Main"]')).toHaveCount(1);
  });

  test('only the page formats are offered, and HTML comes back as a download', async ({ page }) => {
    await page.goto('/export/page/Main');
    const labels = await page.locator('#exportForm .form-check-label').allTextContents();
    expect(labels).toEqual(['NCM (.md, as stored)', 'HTML (.html)', 'Markdown (.md)']);

    await page.getByLabel('HTML (.html)').check();
    const download = page.waitForEvent('download');
    await page.locator('#exportStart').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Main.html');
    await expect(page.locator('#exportDownload')).toBeVisible();
  });

  test('a page that is not there offers nothing', async ({ page }) => {
    const res = await page.goto('/export/page/No%20Such%20Page%20E2E');
    expect(res?.status()).toBe(404);
  });
});
