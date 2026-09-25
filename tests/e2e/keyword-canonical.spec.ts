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

  // The vocabulary term this spec snaps to is CREATED by the spec. The first
  // version used `artificial intelligence`, which exists on the author's
  // instance and on no fresh one — so it passed locally and failed in CI,
  // testing the instance's data rather than the behaviour. The term is unique
  // per run, and its display form is deliberately mixed case so that snapping
  // to it is visible.
  const stamp = Date.now();
  const catalogued = `Ngdpbase Test Kw ${stamp}`;
  const typedKeywords = `${catalogued.toLowerCase()}, ${catalogued.toLowerCase().replace(/ /g, '-')}, Backgammon`;
  let keywordId = '';
  let csrfToken = '';

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const p = await context.newPage();
    await p.goto('/user-keywords/create');
    csrfToken = await p.locator('input[name="_csrf"]').first().inputValue();
    const res = await p.request.post('/user-keywords/create', {
      form: { _csrf: csrfToken, label: catalogued, description: 'Created by an e2e test' }
    });
    expect(res.status(), 'the test vocabulary term must be created').toBeLessThan(400);
    // Its id is the normalised form of the label, which is what the map keys on.
    keywordId = catalogued.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    try {
      const p = await context.newPage();
      await deletePage(p, pageName);
      if (keywordId) {
        // Leave no term behind: this one exists only for the run that made it.
        // The delete is CSRF-gated like every other state change, and a token
        // has to be fetched from a rendered page — the first version of this
        // omitted it, swallowed the rejection, and left five test terms in a
        // real instance's vocabulary.
        // The token was taken in beforeAll, from a page that certainly has a
        // form. Hunting for one here hung the hook: /admin/keywords has no
        // `_csrf` input, so the locator waited out the timeout.
        const res = await p.request.delete(`/admin/keywords/${encodeURIComponent(keywordId)}`, {
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
          // An empty object, not nothing: the handler destructures `req.body`
          // unguarded and 500s on a bodyless DELETE (#1473).
          data: {}
        });
        if (!res.ok()) {
          // Say so rather than hiding it: a silent failure here is how the
          // leftovers happened.
          console.warn(`[keyword-canonical] could not remove test term ${keywordId}: HTTP ${res.status()}`);
        }
      }
    } catch {
      // Cleanup is not the assertion.
    } finally {
      await context.close().catch(() => undefined);
    }
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
    expect(stored).toContain(catalogued);

    // The two variants collapsed to one entry.
    const flat = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
    expect(stored.filter(k => flat(k) === flat(catalogued))).toHaveLength(1);
    expect(stored).not.toContain(catalogued.toLowerCase());

    // A keyword the vocabulary does not know is left exactly as the author typed it.
    expect(stored).toContain('Backgammon');
  });
});
