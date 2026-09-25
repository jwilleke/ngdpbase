import { test, expect } from '@playwright/test';
import { TEST_PAGE_PREFIX, deletePage } from './fixtures/helpers';

/**
 * #1471 — the editor's preview pane, for a page whose title contains `'`.
 *
 * `_basicEditor.ejs` used to pass the page name into JavaScript through an
 * HTML-escaping output tag, inside a single-quoted literal. JavaScript does not
 * decode HTML entities, so the preview request carried `Molly&#39;s Cooking`
 * and everything downstream believed that was the page's name.
 *
 * Two symptoms, and the second is the one that matters: `[{$pagename}]` showed
 * the raw entity, and every plugin resolving `'current'` matched nothing — an
 * album that holds 82 items read `(0 items)` in the pane while the saved page
 * rendered it correctly. What the author saw while editing disagreed with what
 * they got after saving.
 *
 * The apostrophe is deliberate here, and so is asserting on the pane's TEXT:
 * the entity is invisible to a DOM query that unescapes it.
 */
test.describe('The preview pane and a title containing an apostrophe (#1471)', () => {
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  test.setTimeout(90000);

  const pageName = `${TEST_PAGE_PREFIX}-Apostrophe-${Date.now()}-Molly's Notes`;

  test.afterAll(async ({ browser }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const p = await context.newPage();
    await deletePage(p, pageName);
    await context.close();
  });

  test('the page name reaches the preview as an apostrophe, not as an entity', async ({ page }) => {
    await page.goto('/create');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('#pageName, input[name="pageName"]').first().fill(pageName);

    const templateSelect = page.locator('#templateName, select[name="templateName"]');
    if (await templateSelect.count() > 0 && await templateSelect.isVisible()) {
      for (const option of await templateSelect.locator('option').all()) {
        const value = await option.getAttribute('value');
        if (value) { await templateSelect.selectOption(value); break; }
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

    // The literal the page ships into its own script. A JS string literal holds
    // the apostrophe itself; the old escaping tag wrote `&#39;` here instead.
    const shipped = (await page.content()).match(/pageName:\s*(.*)/)?.[1] ?? '';
    expect(shipped).not.toContain('&#39;');

    // A variable, and a plugin resolving `'current'` — the two symptoms.
    await page.locator('#content').fill(
      "NAME [{$pagename}] ALBUM [{MediaPlugin format='album-link' keyword='current'}]"
    );
    await page.waitForTimeout(2500);

    const shown = (await page.locator('#preview').innerText()).trim();

    // The name is the name.
    expect(shown).toContain("Molly's Notes");

    // No HTML entity survives into what the author reads.
    expect(shown).not.toContain('&#39;');
    expect(shown).not.toContain('&amp;');

    // The plugin resolved `current` against a real page name rather than a
    // corrupted one. Deliberately NOT asserting the album's label: what
    // MediaPlugin renders depends on the instance's media, and on an empty one
    // it is just `ALBUM 0` — this spec is about the name reaching the preview,
    // and a corrupted name would show up as an entity in the checks above,
    // wherever it appeared.
    expect(shown).not.toMatch(/&#\d+;/);
  });
});
