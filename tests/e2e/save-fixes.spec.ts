import { test, expect } from '@playwright/test';
import { TEST_PAGE_PREFIX, deletePage, waitForPageReady } from './fixtures/helpers';

/**
 * #1332 — an ordinary save fixes JSPWiki `{{{ }}}` code and `**` bullets and
 * tells the author.
 *
 * Neither is Markdown: `** item` renders as literal stars and `{{{` as literal
 * braces. The save rewrites them (the steps safe on any save), and the page
 * the author lands on says so. The `**` inside the code block stays as typed,
 * and valid Markdown on the same page is left as written.
 */
test.describe('Save-time Markdown fixes', () => {
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  // Page creation + edit + save + index update, as in location-plugin.spec.ts.
  test.setTimeout(60000);

  const pageName = `${TEST_PAGE_PREFIX}-SaveFixes-${Date.now()}`;

  test.afterAll(async ({ browser }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const p = await context.newPage();
    await deletePage(p, pageName);
    await context.close();
  });

  test('JSPWiki ** bullets become a nested list, with a notice', async ({ page }) => {
    await page.goto('/create');
    await page.waitForLoadState('domcontentloaded');

    const pageNameInput = page.locator('#pageName, input[name="pageName"]');
    await pageNameInput.first().waitFor({ state: 'visible', timeout: 10000 });
    await pageNameInput.first().fill(pageName);

    const templateSelect = page.locator('#templateName, select[name="templateName"]');
    if (await templateSelect.count() > 0 && await templateSelect.isVisible()) {
      const options = await templateSelect.locator('option').all();
      for (const option of options) {
        const value = await option.getAttribute('value');
        if (value && value !== '') {
          await templateSelect.selectOption(value);
          break;
        }
      }
    }

    const createButton = page.locator('button:has-text("Create Page"), form[action="/create"] button[type="submit"]');
    await Promise.all([
      page.waitForURL(/\/(edit|view)\//, { timeout: 30000 }),
      createButton.first().click()
    ]);
    if (!page.url().includes('/edit/')) {
      await page.goto(`/edit/${encodeURIComponent(pageName)}`);
    }

    const contentArea = page.locator('textarea#editorContent, textarea[name="content"], .CodeMirror textarea');
    await contentArea.first().waitFor({ state: 'visible', timeout: 10000 });
    await contentArea.first().fill('* Laboratory tests:\n** Skin testing\n** Blood tests\n\n* Other\n\n{{{\n** Example.One\n}}}');

    const saveButton = page.locator('button:has-text("Save"), button[type="submit"]:has-text("Save")');
    await Promise.all([
      page.waitForURL(/\/view\/.*[?&]fixed=jspwiki-code-markers(?:,|%2C)jspwiki-bullets/, { timeout: 30000 }),
      saveButton.first().click()
    ]);
    await waitForPageReady(page);

    const notice = page.getByTestId('fix-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('JSPWiki {{{ }}} code markers became Markdown code');
    await expect(notice).toContainText('JSPWiki ** bullets became nested - bullets');

    // Rendered as a list nested under "Laboratory tests", not literal stars.
    await expect(page.locator('li li', { hasText: 'Skin testing' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('** Skin testing');

    // The {{{ }}} block is a code block, and the ** inside it stays as typed.
    await expect(page.locator('pre code', { hasText: '** Example.One' })).toBeVisible();
    await expect(page.locator('article.markdown-body')).not.toContainText('{{{');
  });
});
