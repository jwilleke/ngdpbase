import { test, expect } from '@playwright/test';
import { TEST_PAGE_PREFIX, deletePage, waitForPageReady, markTestArtifact } from './fixtures/helpers';

/**
 * #1467 — the SERVER snaps a saved page's keywords to the catalogued form.
 *
 * This spec deliberately does not drive the editor. `keyword-typeahead.js`
 * canonicalises the field in the browser on blur, so a UI-driven save proves
 * nothing about the server: it passed unchanged against the broken code, which
 * is how the bug survived. The path that matters is the one with no browser in
 * it — a form POST straight to `/save/:page`, as an API client, a script or a
 * JS-less browser would send it.
 *
 * `artificial intelligence` is a term of the shipped user-keywords vocabulary.
 * Posted with capitals, and again as a hyphenated variant, it must come back as
 * ONE keyword in the catalogued form. `Backgammon` is in no vocabulary and must
 * survive exactly as posted.
 */
test.describe('Saved keywords snap to the catalogued form (#1467)', () => {
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  test.setTimeout(60000);

  const pageName = `${TEST_PAGE_PREFIX}-KeywordCanonical-${Date.now()}`;
  const typedKeywords = 'Artificial Intelligence, artificial-intelligence, Backgammon';

  test.afterAll(async ({ browser }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const p = await context.newPage();
    await deletePage(p, pageName);
    await context.close();
  });

  test('a catalogued keyword is stored in its display form, an uncatalogued one as typed', async ({ page }) => {
    await page.goto('/create');
    await page.waitForLoadState('domcontentloaded');

    const pageNameInput = page.locator('#pageName, input[name="pageName"]');
    await pageNameInput.first().waitFor({ state: 'visible', timeout: 10000 });
    await pageNameInput.first().fill(pageName);

    const templateSelect = page.locator('#templateName, select[name="templateName"]');
    if (await templateSelect.count() > 0 && await templateSelect.isVisible()) {
      for (const option of await templateSelect.locator('option').all()) {
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

    // Everything the edit form would post, taken from the form itself so the
    // request is the one the server expects — then sent WITHOUT the browser,
    // which is what leaves the server's own canonicalisation as the only thing
    // standing between the posted keywords and the stored page.
    const action = await page.locator('#editForm').getAttribute('action');
    expect(action, 'the edit form must post somewhere').toBeTruthy();

    // Serialise the real form, so every hidden field the save expects is
    // present and this is a genuine save rather than a hand-built request.
    const fields = await page.evaluate(() => {
      const form = document.getElementById('editForm') as HTMLFormElement;
      const out: Record<string, string> = {};
      for (const [k, v] of new FormData(form).entries()) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    });

    const response = await page.request.post(action, {
      form: {
        ...fields,
        content: 'Keyword canonicalisation check.',
        'user-keywords': typedKeywords
      }
    });
    expect(response.status(), 'the save must be accepted').toBeLessThan(400);

    await page.goto(`/view/${encodeURIComponent(pageName)}`);
    await markTestArtifact(page, pageName);
    await waitForPageReady(page);

    // Read the keywords back off the STORED page, not off the form we filled.
    await page.goto(`/edit/${encodeURIComponent(pageName)}`);
    const storedInput = page.locator('#userKeywordsInput, input[name="user-keywords"]');
    await storedInput.first().waitFor({ state: 'attached', timeout: 10000 });
    const stored = (await storedInput.first().inputValue())
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);

    // Snapped to the vocabulary's display form — this is what never happened
    // before #1467, because the map was empty on every save.
    expect(stored).toContain('artificial intelligence');

    // The two variants collapsed to one entry.
    expect(stored.filter(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'artificialintelligence')).toHaveLength(1);
    expect(stored).not.toContain('Artificial Intelligence');
    expect(stored).not.toContain('artificial-intelligence');

    // A keyword the vocabulary does not know is left exactly as the author typed it.
    expect(stored).toContain('Backgammon');
  });
});
