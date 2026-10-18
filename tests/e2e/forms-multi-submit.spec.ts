import { test, expect, type Page } from '@playwright/test';
import { waitForServerReady, deletePage, TEST_PAGE_PREFIX, createPluginPage } from './fixtures/helpers';

/**
 * #1893 — on a page with several forms, one submit is one request.
 *
 * FormsPlugin writes the submit script once per form, and every copy bound
 * every form, so a page with N forms posted each submit N times. This puts
 * three forms on one page and counts the requests. The submit route is
 * intercepted and answered here, so nothing is stored. Skips when the forms
 * add-on is not enabled on this instance.
 */

const PAGE_NAME = `${TEST_PAGE_PREFIX}-FormsMultiSubmit`;
const FORM_IDS = ['e2e-1893-a', 'e2e-1893-b', 'e2e-1893-c'];

async function csrfToken(page: Page): Promise<string> {
  const html = await (await page.request.get('/login')).text();
  const token = (html.match(/<meta name="csrf-token" content="([^"]+)"/) ?? [])[1];
  if (!token) throw new Error('could not obtain CSRF token from /login');
  return token;
}

async function deleteDefinitions(page: Page): Promise<void> {
  const token = await csrfToken(page);
  for (const id of FORM_IDS) {
    const res = await page.request.post(`/addons/forms/builder/${id}/delete`, {
      headers: { 'X-CSRF-Token': token },
      form: { _csrf: token },
      maxRedirects: 0
    });
    // 302 = deleted, 404 = not there
    if (![302, 404].includes(res.status())) throw new Error(`delete form ${id}: status ${res.status()} ${(await res.text()).slice(0, 300)}`);
  }
}

test.describe.configure({ mode: 'serial' });

test.describe('forms: one submit, one request (#1893)', () => {
  let enabled = true;

  // browser.newPage() does not take the project's signed-in storageState.
  const signedIn = { storageState: './tests/e2e/.auth/user.json' };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage(signedIn);
    await waitForServerReady(page);
    const probe = await page.request.get('/addons/forms/builder/new');
    enabled = probe.status() !== 404;
    if (enabled) {
      await deleteDefinitions(page); // a leftover from a failed run
      const token = await csrfToken(page);
      for (const id of FORM_IDS) {
        const res = await page.request.post('/addons/forms/builder', {
          headers: { 'X-CSRF-Token': token },
          form: {
            _csrf: token,
            id,
            title: `E2E ${id}`,
            fieldsJson: JSON.stringify([{ name: 'note', type: 'text', label: 'Note', required: false }])
          },
          maxRedirects: 0
        });
        expect(res.status(), `create form ${id}`).toBe(302);
      }
      await createPluginPage(page, PAGE_NAME, FORM_IDS.map((id) => `[{Form id='${id}'}]`).join('\n\n'));
    }
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!enabled) return;
    const page = await browser.newPage(signedIn);
    await deletePage(page, PAGE_NAME);
    await deleteDefinitions(page);
    await page.close();
  });

  test('each submit posts once, and a double click posts once', async ({ page }) => {
    test.skip(!enabled, 'forms add-on not enabled on this instance');

    const posts: string[] = [];
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/forms/submit/**', async (route) => {
      posts.push(new URL(route.request().url()).pathname);
      // Hold the first answer so the double click below lands while it is in flight.
      if (posts.length === 1) await held;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });

    await page.goto(`/view/${encodeURIComponent(PAGE_NAME)}`);
    const forms = page.locator('form[data-ngdp-form]');
    await expect(forms).toHaveCount(FORM_IDS.length);
    // The plugin writes one script tag per form; the script runs once.
    expect(await page.locator('script[src="/addons/forms/js/forms-submit.js"]').count()).toBe(FORM_IDS.length);

    const first = page.locator(`form[data-ngdp-form="${FORM_IDS[0]}"] button[type=submit]`);
    await first.dblclick();
    await expect.poll(() => posts.length).toBe(1);
    release();
    await expect(page.locator(`#form-result-${FORM_IDS[0]} .alert-success`)).toBeVisible();

    await page.locator(`form[data-ngdp-form="${FORM_IDS[1]}"] button[type=submit]`).click();
    await expect(page.locator(`#form-result-${FORM_IDS[1]} .alert-success`)).toBeVisible();

    expect(posts).toEqual([`/api/forms/submit/${FORM_IDS[0]}`, `/api/forms/submit/${FORM_IDS[1]}`]);
  });
});
