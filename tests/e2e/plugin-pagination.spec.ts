import { test, expect } from '@playwright/test';
import { waitForServerReady, deletePage, TEST_PAGE_PREFIX, createPluginPage } from './fixtures/helpers';

/**
 * #1301 — plugin surfaces render the canonical pagination control.
 *
 * `formatPaginationLinks` used to emit a `.plugin-pagination` div of prev/next
 * text links, and that class had no CSS anywhere in the repo — so the three
 * plugins using it rendered as bare inline text beside a styled Bootstrap pager
 * elsewhere in the application. Unlike #1300 this is a visible change, so it is
 * checked in a browser rather than only in string assertions.
 */

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

/**
 * #1305 — the two plugins that rendered everything.
 *
 * These run against the shipped `PageIndex` and `Recent Changes` pages rather
 * than a fixture, because the defect was that those pages, as shipped and with
 * no parameters, emitted their whole data set — 17,742 rows on the instance
 * that reported it. A fixture with parameters would not have caught that.
 */
test.describe('bounded plugin output (#1305)', () => {
  test('PageIndex renders one page of the index, not all of it', async ({ page }) => {
    await waitForServerReady(page);
    await page.goto('/view/PageIndex');

    const links = page.locator('.index-plugin a.wikipage');
    const shown = await links.count();
    const pager = page.locator('.index-plugin nav[data-pagination]');
    test.skip(await pager.count() === 0, 'this instance has fewer pages than one index page');

    // The default bound. Before this the same page emitted every row it had.
    expect(shown).toBeLessThanOrEqual(250);

    // The count states the whole index, so the bound is visible rather than
    // implied — a bounded list reporting only what it drew reads as a smaller wiki.
    await expect(page.locator('.index-plugin').first()).toContainText(/of \d+ pages/);

    await pager.getByRole('link', { name: '2', exact: true }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.locator('.index-plugin nav[data-pagination]')).toHaveAttribute('data-current-page', '2');
  });

  test('Recent Changes is capped rather than unbounded', async ({ page }) => {
    await waitForServerReady(page);
    await page.goto('/view/Recent%20Changes');

    const rows = page.locator('.recent-changes-plugin a.wikipage');
    test.skip(await rows.count() === 0, 'no recent changes on this instance');

    // Each [{RecentChangesPlugin}] call on the page is capped at its own limit;
    // none of them may render the whole change set.
    for (const plugin of await page.locator('.recent-changes-plugin').all()) {
      expect(await plugin.locator('a.wikipage').count()).toBeLessThanOrEqual(50);
    }
  });
});

/**
 * #1302 — the log viewer is the one adopted list surface with enough rows on a
 * running instance to page through in a browser. Page history and trash hold
 * fewer rows than a page here, so their behaviour is pinned in unit tests
 * instead; asserting a skip in a browser proves nothing.
 */
test.describe('list surface pagination (#1302)', () => {
  test('the log viewer walks backwards through the file', async ({ page }) => {
    await waitForServerReady(page);
    await page.goto('/admin/logs');

    const pager = page.locator('nav[data-pagination]');
    test.skip(await pager.count() === 0, 'this log file is shorter than one page');

    const firstPage = await page.locator('pre').innerText();

    await pager.getByRole('link', { name: '2', exact: true }).click();
    await expect(page).toHaveURL(/[?&]page=2/);

    const secondPage = await page.locator('pre').innerText();
    expect(secondPage).not.toBe(firstPage);

    // Page 1 was the newest lines and stays that way — the change is that the
    // rest of the file is now reachable, not that the default moved.
    await expect(page.locator('nav[data-pagination]')).toHaveAttribute('data-current-page', '2');
  });
});
