import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { instanceOrigin } from './fixtures/helpers';

/**
 * #2389 slice 2, Keep edited version, on /admin/required-pages.
 *
 * Edits the shipped page "Using Tokens" as admin, keeps it, and checks that
 * Sync All leaves its text alone. It puts the page back at the end (Use shipped
 * version), so the instance ends as it began.
 *
 * "Kept, needs your review" needs a shipped page whose plugin calls differ from
 * the ones recorded when it was kept. A run cannot change the shipped folder of
 * the instance under test, so that case runs only when the instance was set up
 * that way: set E2E_KEPT_REVIEW_TITLE to the title of a page an admin kept
 * before its shipped copy gained a plugin call.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

const TITLE = 'Using Tokens';
const UUID = '02c9bbc8-97ef-4595-be3a-bdab3fff724d';
const MARK = 'Our office hours for questions about this page are Tuesdays at 10am.';
const REVIEW_TITLE = process.env.E2E_KEPT_REVIEW_TITLE;

const row = (page: Page, uuid: string) => page.locator(`tr[data-uuid="${uuid}"]`).first();

async function editWithMark(page: Page): Promise<void> {
  await page.goto(`/edit/${encodeURIComponent(TITLE)}`);
  const body = page.locator('textarea[name="content"], #content').first();
  await body.waitFor({ state: 'attached' });
  const current = await body.inputValue();
  await body.fill(`${current}\n\n${MARK}\n`);
  await page.getByRole('button', { name: /save/i }).first().click();
  await page.waitForURL((url) => url.pathname.startsWith('/view/'), { timeout: 15000 });
}

async function liveBody(page: Page): Promise<string> {
  const res = await page.request.get(`${await instanceOrigin(page)}/api/page-source/${encodeURIComponent(TITLE)}`);
  expect(res.status()).toBe(200);
  return res.text();
}

test.describe.serial('Keep edited version (#2389)', () => {
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const page = await context.newPage();
    await page.goto('/admin/required-pages');
    const useShipped = row(page, UUID).locator(`button[data-sync-id="${UUID}"]`);
    if (await useShipped.count()) {
      page.once('dialog', (dialog) => void dialog.accept());
      await useShipped.click();
      await expect(row(page, UUID).locator('[data-sync-status="same-as-shipped"]')).toBeVisible({ timeout: 15000 });
    }
    await context.close();
  });

  test('an edited page reads Edited here, then Kept for this site once Keep is ticked, and Sync All leaves it', async ({ page }) => {
    await editWithMark(page);

    await page.goto('/admin/required-pages');
    await expect(row(page, UUID).locator('[data-sync-status="edited-not-confirmed"]')).toBeVisible();

    await row(page, UUID).getByRole('button', { name: /review/i }).click();
    const keep = page.getByTestId('review-keep');
    await expect(keep).toBeVisible();
    await keep.check();
    await expect(page.locator('#reviewKeepStatus')).toContainText(/kept/i);
    await page.locator('#diffModal .btn-close').click();

    // The page reloads after the dialog closes; the row now reads Kept.
    await expect(row(page, UUID).locator('[data-sync-status="kept-for-site"]')).toBeVisible({ timeout: 15000 });

    const before = await liveBody(page);
    expect(before).toContain(MARK);

    const syncAll = page.getByTestId('sync-all-outdated');
    if (await syncAll.isEnabled()) {
      page.once('dialog', (dialog) => void dialog.accept());
      await syncAll.click();
      await page.waitForLoadState('domcontentloaded');
    }
    await page.goto('/admin/required-pages');
    await expect(row(page, UUID).locator('[data-sync-status="kept-for-site"]')).toBeVisible();
    expect(await liveBody(page)).toBe(before);
  });

  test('a kept page whose shipped copy gained a plugin call reads Kept, needs your review, and lists the change', async ({ page }) => {
    test.skip(!REVIEW_TITLE, 'set E2E_KEPT_REVIEW_TITLE to a page kept before its shipped copy gained a plugin call');
    await page.goto('/admin/required-pages');
    const kept = page.locator('tr', { hasText: REVIEW_TITLE }).first();
    await expect(kept.locator('[data-sync-status="kept-needs-review"]')).toBeVisible();
    await expect(kept.locator('[data-sync-note="working-changes"] li').first()).toContainText(/calls/);
  });
});
