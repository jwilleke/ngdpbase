import { test, expect } from '@playwright/test';
import { waitForServerReady, deletePage, TEST_PAGE_PREFIX } from './fixtures/helpers';

/**
 * #1301 — plugin surfaces render the canonical pagination control.
 *
 * `formatPaginationLinks` used to emit a `.plugin-pagination` div of prev/next
 * text links, and that class had no CSS anywhere in the repo — so the three
 * plugins using it rendered as bare inline text beside a styled Bootstrap pager
 * elsewhere in the application. Unlike #1300 this is a visible change, so it is
 * checked in a browser rather than only in string assertions.
 */

/**
 * Create a page carrying plugin markup.
 *
 * Not `helpers.createPage`: that one posts to `/edit?new=true` and fills
 * `#title`, neither of which the create flow uses any more — `pages.spec.ts`
 * hand-rolls `/create` with `#pageName` for the same reason.
 */
async function createPluginPage(page, name: string, content: string): Promise<void> {
  await page.goto('/create');
  await page.waitForLoadState('domcontentloaded');

  const nameInput = page.locator('#pageName, input[name="pageName"]').first();
  await nameInput.waitFor({ state: 'visible', timeout: 10000 });
  await nameInput.fill(name);

  const createButton = page
    .locator('button:has-text("Create Page"), form[action="/create"] button[type="submit"]')
    .first();
  await createButton.click();
  await page.waitForLoadState('domcontentloaded');

  // Land in the editor. Reached directly rather than by asserting where create
  // redirected, so this also works when the page already exists from an earlier
  // run that failed before its cleanup.
  await page.goto(`/edit/${encodeURIComponent(name)}`);
  await page.waitForLoadState('domcontentloaded');
  const editor = page.locator('textarea[name="content"], #content, textarea').first();
  await editor.waitFor({ state: 'visible', timeout: 10000 });
  await editor.fill(content);

  // Save posts to /save/{name} and redirects on to /view/{name}. Waiting for
  // the /view/ URL races that redirect, so wait for the navigation to settle
  // and then go to the view explicitly.
  const save = page.locator('button[type="submit"]:has-text("Save"), button:has-text("Save")').first();
  await save.click();
  await page.waitForLoadState('domcontentloaded');
  await page.goto(`/view/${encodeURIComponent(name)}`);
}

const PAGE_NAME = `${TEST_PAGE_PREFIX}-PluginPagination`;

test.describe.configure({ mode: 'serial' });

test.describe('plugin pagination (#1301)', () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await deletePage(page, PAGE_NAME).catch(() => {});
    await page.close();
  });

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await waitForServerReady(page);
    await createPluginPage(page, PAGE_NAME, "[{UndefinedPages pageSize='2'}]");
    await page.close();
  });

  test('a paginated plugin renders the canonical control', async ({ page }) => {
    await waitForServerReady(page);
    await page.goto(`/view/${encodeURIComponent(PAGE_NAME)}`);

    const pager = page.locator('[data-pagination]').first();
    test.skip(await pager.count() === 0, 'no undefined pages on this instance to paginate');

    await expect(pager).toBeVisible();
    await expect(pager).toHaveAttribute('data-current-page', '1');

    // The old control had no page numbers at all — only « Prev and Next ».
    await expect(pager.locator('li.page-item')).not.toHaveCount(0);
    await expect(pager.locator('.page-item.active .page-link')).toHaveAttribute('aria-current', 'page');

    // Bootstrap actually styles this, which the old class never was.
    const display = await pager.locator('ul.pagination').evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe('flex');

    // The links point where they should...
    const secondPage = pager.locator('a.page-link', { hasText: '2' }).first();
    test.skip(await secondPage.count() === 0, 'only one page of results');
    await expect(secondPage).toHaveAttribute(
      'href',
      `/view/${encodeURIComponent(PAGE_NAME)}?page=2`
    );

    // ...and following one actually changes the page (#1307). Before that fix
    // the /view/ render cache keyed on page uuid and roles only, so every query
    // variant served the same cached HTML and the pager could never leave
    // page 1 — a control that looked right and did nothing.
    await secondPage.click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.locator('[data-pagination]').first()).toHaveAttribute('data-current-page', '2');
  });

  test('a query-bearing view is not served from another page number\'s cache', async ({ page }) => {
    // The regression this guards is the one that made the control decorative:
    // ?page=3 and ?page=5 both hitting a single cache entry.
    await waitForServerReady(page);
    await page.goto(`/view/${encodeURIComponent(PAGE_NAME)}?page=3`);
    await expect(page.locator('[data-pagination]').first()).toHaveAttribute('data-current-page', '3');

    await page.goto(`/view/${encodeURIComponent(PAGE_NAME)}?page=5`);
    await expect(page.locator('[data-pagination]').first()).toHaveAttribute('data-current-page', '5');

    // And the plain view is still page 1 — bypassing the cache for query URLs
    // must not corrupt what the uncached view shows.
    await page.goto(`/view/${encodeURIComponent(PAGE_NAME)}`);
    await expect(page.locator('[data-pagination]').first()).toHaveAttribute('data-current-page', '1');
  });
});
