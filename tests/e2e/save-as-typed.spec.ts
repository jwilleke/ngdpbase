import { test, expect } from '@playwright/test';
import { TEST_PAGE_PREFIX, deletePage, waitForPageReady } from './fixtures/helpers';

/**
 * #1332 — an ordinary save writes exactly what was typed.
 *
 * Converting page text, JSPWiki syntax included, happens only in the NCM
 * funnel (import, ingest, Convert to NCM, migrations); a save never rewrites
 * it and never adds a notice (decision 2026-09-12; saves must stay fast, #1333).
 */
test.describe('Save keeps the text as typed', () => {
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  // Page creation + edit + save + index update, as in location-plugin.spec.ts.
  test.setTimeout(60000);

  const pageName = `${TEST_PAGE_PREFIX}-SaveAsTyped-${Date.now()}`;
  const typed = '* Laboratory tests:\n** Skin testing\n\n{{{\n** Example.One\n}}}';

  test.afterAll(async ({ browser }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const p = await context.newPage();
    await deletePage(p, pageName);
    await context.close();
  });

  test('JSPWiki ** bullets and {{{ }}} are saved unchanged, with no notice', async ({ page }) => {
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
    await contentArea.first().fill(typed);

    const saveButton = page.locator('button:has-text("Save"), button[type="submit"]:has-text("Save")');
    await Promise.all([
      page.waitForURL(/\/view\//, { timeout: 30000 }),
      saveButton.first().click()
    ]);
    await waitForPageReady(page);
    expect(page.url()).not.toContain('fixed=');

    // The stored text is what was typed.
    await page.goto(`/edit/${encodeURIComponent(pageName)}`);
    const editor = page.locator('textarea#editorContent, textarea[name="content"]');
    await editor.first().waitFor({ state: 'attached', timeout: 10000 });
    expect((await editor.first().inputValue()).replace(/\r\n/g, '\n').trim()).toBe(typed);
  });
});
