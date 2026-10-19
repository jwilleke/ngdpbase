import { test, expect, type Page } from '@playwright/test';
import { waitForServerReady, deletePage, TEST_PAGE_PREFIX, createPluginPage, instanceOrigin } from './fixtures/helpers';

/**
 * #1904 — a checklist field submits the ticked values as an array.
 *
 * Puts a form with a required checklist on a page, ticks two of three boxes,
 * and reads the request the browser sends. The submit route is intercepted
 * and answered here, so nothing is stored. Skips when the forms add-on is not
 * enabled on this instance. Teardown removes only this test's page and form.
 */

const PAGE_NAME = `${TEST_PAGE_PREFIX}-FormsChecklist`;
const FORM_ID = 'e2e-1904-checklist';

async function csrfToken(page: Page): Promise<string> {
  const html = await (await page.request.get('/login')).text();
  const token = (html.match(/<meta name="csrf-token" content="([^"]+)"/) ?? [])[1];
  if (!token) throw new Error('could not obtain CSRF token from /login');
  return token;
}

async function deleteDefinition(page: Page): Promise<void> {
  const token = await csrfToken(page);
  const res = await page.request.post(`${await instanceOrigin(page)}/addons/forms/builder/${FORM_ID}/delete`, {
    headers: { 'X-CSRF-Token': token },
    form: { _csrf: token },
    maxRedirects: 0
  });
  // 302 = deleted, 404 = not there
  if (![302, 404].includes(res.status())) throw new Error(`delete form ${FORM_ID}: status ${res.status()} ${(await res.text()).slice(0, 300)}`);
}

test.describe.configure({ mode: 'serial' });

test.describe('forms: a checklist submits an array (#1904)', () => {
  let enabled = true;

  // browser.newPage() does not take the project's signed-in storageState.
  const signedIn = { storageState: './tests/e2e/.auth/user.json' };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage(signedIn);
    await waitForServerReady(page);
    const probe = await page.request.get('/addons/forms/builder/new');
    enabled = probe.status() !== 404;
    if (enabled) {
      await deleteDefinition(page); // a leftover from a failed run
      const token = await csrfToken(page);
      const res = await page.request.post(`${await instanceOrigin(page)}/addons/forms/builder`, {
        headers: { 'X-CSRF-Token': token },
        form: {
          _csrf: token,
          id: FORM_ID,
          title: 'E2E checklist',
          fieldsJson: JSON.stringify([
            { name: 'picks', type: 'checklist', label: 'Picks', required: true, options: ['alpha', 'beta', 'gamma'] }
          ])
        },
        maxRedirects: 0
      });
      expect(res.status(), 'create form').toBe(302);
      await createPluginPage(page, PAGE_NAME, `[{Form id='${FORM_ID}'}]`);
    }
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!enabled) return;
    const page = await browser.newPage(signedIn);
    await deletePage(page, PAGE_NAME);
    await deleteDefinition(page);
    await page.close();
  });

  test('nothing ticked is refused on the page; two ticked post an array of both', async ({ page }) => {
    test.skip(!enabled, 'forms add-on not enabled on this instance');

    const bodies: unknown[] = [];
    await page.route('**/api/forms/submit/**', async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });

    await page.goto(`/view/${encodeURIComponent(PAGE_NAME)}`);
    const form = page.locator(`form[data-ngdp-form="${FORM_ID}"]`);
    await expect(form.locator('input[type=checkbox][name="picks"]')).toHaveCount(3);

    await form.locator('button[type=submit]').click();
    await expect(form.locator('[data-field-error="picks"]')).toHaveText('Picks: tick at least one');
    expect(bodies).toEqual([]);

    await form.getByLabel('alpha').check();
    await form.getByLabel('gamma').check();
    await form.locator('button[type=submit]').click();
    await expect(page.locator(`#form-result-${FORM_ID} .alert-success`)).toBeVisible();
    expect(bodies).toEqual([{ picks: ['alpha', 'gamma'] }]);
  });
});
