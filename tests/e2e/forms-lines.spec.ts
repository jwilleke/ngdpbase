import { test, expect, type Page } from '@playwright/test';
import { waitForServerReady, deletePage, TEST_PAGE_PREFIX, createPluginPage, instanceOrigin } from './fixtures/helpers';

/**
 * #1913 — a lines field submits an array of row objects.
 *
 * Puts a form with a required lines field on a page, fills two rows, adds a
 * third and leaves it empty, and reads the request the browser sends. The
 * submit route is intercepted and answered here, so nothing is stored. Skips
 * when the forms add-on is not enabled on this instance. Teardown removes only
 * this test's page and form.
 */

const PAGE_NAME = `${TEST_PAGE_PREFIX}-FormsLines`;
const FORM_ID = 'e2e-1913-lines';

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

test.describe('forms: a lines field submits an array of rows (#1913)', () => {
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
          title: 'E2E lines',
          fieldsJson: JSON.stringify([
            {
              name: 'lines', type: 'lines', label: 'Lines', required: true, minRows: 1, maxRows: 3,
              fields: [
                { name: 'amount', type: 'amount', label: 'Amount', required: true },
                { name: 'fund', type: 'dropdown', label: 'Fund', required: true, options: ['general', 'reserve'] },
                { name: 'memo', type: 'text', label: 'Note', required: false }
              ],
              amountField: 'amount', totalField: 'total'
            },
            { name: 'total', type: 'amount', label: 'Total', required: true }
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

  test('two filled rows and an empty third post an array of the two', async ({ page }) => {
    test.skip(!enabled, 'forms add-on not enabled on this instance');

    const bodies: unknown[] = [];
    await page.route('**/api/forms/submit/**', async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });

    await page.goto(`/view/${encodeURIComponent(PAGE_NAME)}`);
    const form = page.locator(`form[data-ngdp-form="${FORM_ID}"]`);
    await expect(form.locator('[data-lines-row]')).toHaveCount(1);

    await form.locator('button[type=submit]').click();
    await expect(form.locator('[data-field-error="lines"]')).toHaveText('Lines: add at least one line');
    expect(bodies).toEqual([]);

    await form.locator('[name="lines[0].amount"]').fill('50');
    await form.locator('[name="lines[0].fund"]').selectOption('general');
    await form.locator('[data-lines-add]').click();
    await form.locator('[name="lines[1].amount"]').fill('12.50');
    await form.locator('[name="lines[1].fund"]').selectOption('reserve');
    await form.locator('[name="lines[1].memo"]').fill('dues');
    await form.locator('[data-lines-add]').click();
    await expect(form.locator('[data-lines-row]')).toHaveCount(3);
    await expect(form.locator('[data-lines-add]')).toBeDisabled();
    await form.locator('[name="total"]').fill('62.50');
    await expect(form.locator('[data-lines-total]')).toHaveText('Lines: 2 · $62.50');
    await expect(form.locator('[data-lines-match]')).toHaveText('Matches the total of $62.50.');

    await form.locator('button[type=submit]').click();
    await expect(page.locator(`#form-result-${FORM_ID} .alert-success`)).toBeVisible();
    expect(bodies).toEqual([{
      lines: [{ amount: '50', fund: 'general', memo: '' }, { amount: '12.50', fund: 'reserve', memo: 'dues' }],
      total: '62.50'
    }]);
  });
});
