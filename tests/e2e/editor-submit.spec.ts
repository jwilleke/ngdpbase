import { test, expect } from '@playwright/test';
import { TEST_PAGE_PREFIX, deletePage } from './fixtures/helpers';

/**
 * #1369 / #1327 / #1333 — the editor saves in the page: its outcome shows in
 * the page-message banner, never as a raw browser response, and a save in
 * progress says so.
 *
 * The editor and create scripts bound their submit handlers with
 * `document.querySelector('form')`, which is the header's /search form. Every
 * save was then a plain browser POST: a title with `/` gave Express's bare
 * "Cannot POST /save/9/11", a validation failure showed its JSON.
 *
 * Only the saving-indicator test creates a page, and it deletes it.
 */
test.describe('Editor and create forms keep the outcome in the page', () => {
  test.use({ storageState: './tests/e2e/.auth/user.json' });
  test.setTimeout(60000);

  const savedPage = `${TEST_PAGE_PREFIX}-EditorSaving-${Date.now()}`;

  test.afterAll(async ({ browser }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const p = await context.newPage();
    await deletePage(p, savedPage);
    await context.close();
  });

  const banner = (level: 'danger' | 'info') => `#page-message .alert-${level}`;
  // Under a full parallel run the page can take several seconds to act on a
  // response it has already received (traced: the save left 900 ms after the
  // click), so in-page outcomes get more than the 5 s default.
  const inPage = { timeout: 15000 };

  test('a title with / stays in the editor with a message, not "Cannot POST"', async ({ page }) => {
    const name = `${TEST_PAGE_PREFIX}-Slash/${Date.now()}`;
    await page.goto(`/edit/${encodeURIComponent(name)}`);
    const form = page.locator('#editForm');
    await expect(form).toHaveAttribute('action', `/save/${encodeURIComponent(name)}`);
    await page.locator('textarea[name="content"]').fill('Some text.');

    let posted = false;
    page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/save/')) posted = true; });
    await form.locator('button[type="submit"]').first().click();

    await expect(page.locator(banner('danger'))).toContainText('not allowed', inPage);
    await expect(page).toHaveURL(/\/edit\//);
    expect(posted).toBe(false);
  });

  test('a save-time validation error lists the problems in the page, not raw JSON', async ({ page }) => {
    await page.goto(`/edit/${encodeURIComponent(`${TEST_PAGE_PREFIX}-EditorInvalid-${Date.now()}`)}`);
    await page.locator('textarea[name="content"]').fill('A link that never closes: [text](https://example.com\n');

    const saved = page.waitForResponse((r) => r.url().includes('/save/') && r.request().method() === 'POST');
    await page.locator('#editForm button[type="submit"]').first().click();
    expect((await saved).status()).toBe(400);

    await expect(page.locator(banner('danger'))).toContainText('unclosedMarkdownLink', inPage);
    await expect(page).toHaveURL(/\/edit\//);
    await expect(page.locator('#editForm button[type="submit"]').first()).toBeEnabled(inPage);
  });

  test('a save in progress says so, then goes to the page', async ({ page }) => {
    await page.goto(`/edit/${encodeURIComponent(savedPage)}`);
    await page.locator('textarea[name="content"]').fill('Saved by the editor-submit test.');

    // Hold the save so the in-progress state can be seen.
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/save/**', async (route) => { await held; await route.continue(); });

    const button = page.locator('#editForm button[type="submit"]').first();
    await button.click();
    await expect(button).toBeDisabled(inPage);
    await expect(button).toHaveText('Saving…', inPage);
    await expect(page.locator(banner('info'))).toContainText('Saving changes', inPage);

    release();
    await page.waitForURL(new RegExp(`/view/${encodeURIComponent(savedPage)}`), { timeout: 30000 });
    await page.unroute('**/save/**');

    // A save built on an old version still gets the #1061 conflict page,
    // with the text carried over for merging — the editor hands the 409 back
    // to a native submit instead of showing it as an error.
    await page.goto(`/edit/${encodeURIComponent(savedPage)}`);
    await page.locator('input[name="baseLastModified"]').evaluate((el) => {
      (el as HTMLInputElement).value = '2000-01-01T00:00:00.000Z';
    });
    await page.locator('textarea[name="content"]').fill('A second, stale edit.');
    await page.locator('#editForm button[type="submit"]').first().click();
    await expect(page.locator('#conflictForm')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#conflictContent')).toHaveValue('A second, stale edit.');
  });

  test('the header search on an edit page is an ordinary search', async ({ page }) => {
    await page.goto(`/edit/${encodeURIComponent(`${TEST_PAGE_PREFIX}-EditorSearch-${Date.now()}`)}`);
    const search = page.locator('#headerSearchInput');
    await search.fill('Sandbox');
    await Promise.all([page.waitForURL(/\/search\?q=Sandbox/), search.press('Enter')]);
  });

  test('a create name with / gives a message in the page, not a plain-text error page', async ({ page }) => {
    await page.goto('/create');
    await page.locator('#pageName').fill(`${TEST_PAGE_PREFIX}-Create/${Date.now()}`);
    await page.locator('#createForm button[type="submit"]').click();
    await expect(page.locator(banner('danger'))).toContainText('not allowed', inPage);
    await expect(page).toHaveURL(/\/create/);
  });
});
