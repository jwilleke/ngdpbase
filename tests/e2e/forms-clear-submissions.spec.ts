import { test, expect, type Page, type APIResponse } from '@playwright/test';
import { waitForServerReady, instanceOrigin } from './fixtures/helpers';

/**
 * #1973 — Clear submissions on the forms admin, for a form built on the site.
 *
 * Creates a form, submits to it twice, and checks: delete is refused while it
 * has submissions; the card offers Clear submissions with the count, a CSV
 * download holding both, and a button that stays disabled until the form id
 * is typed; a POST without the CSRF token clears nothing; clearing leaves 0
 * and delete then works. Forms an add-on provides are covered in
 * forms-shipped.spec.ts. Skips when the forms add-on is not enabled.
 * Teardown deletes only this test's form and its submissions.
 */

const FORM_ID = 'e2e-1973-clear';

async function csrfToken(page: Page): Promise<string> {
  const html = await (await page.request.get('/login')).text();
  const token = (html.match(/<meta name="csrf-token" content="([^"]+)"/) ?? [])[1];
  if (!token) throw new Error('could not obtain CSRF token from /login');
  return token;
}

async function post(page: Page, path: string, form: Record<string, string>): Promise<APIResponse> {
  const token = await csrfToken(page);
  return page.request.post(`${await instanceOrigin(page)}${path}`, {
    headers: { 'X-CSRF-Token': token },
    form: { _csrf: token, ...form },
    maxRedirects: 0
  });
}

async function submit(page: Page, note: string): Promise<void> {
  const token = await csrfToken(page);
  const res = await page.request.post(`${await instanceOrigin(page)}/api/forms/submit/${FORM_ID}`, {
    headers: { 'X-CSRF-Token': token },
    data: { note }
  });
  expect(res.status(), `submit: ${(await res.text()).slice(0, 200)}`).toBe(201);
}

/** Clear any leftover submissions, then delete the form; tolerant of it not being there. */
async function removeForm(page: Page): Promise<void> {
  const exists = (await page.request.get(`/api/forms/schema/${FORM_ID}`)).status() === 200;
  if (!exists) return;
  await post(page, `/addons/forms/${FORM_ID}/submissions/clear`, { confirm: FORM_ID });
  const del = await post(page, `/addons/forms/builder/${FORM_ID}/delete`, {});
  if (del.status() !== 302) throw new Error(`delete form ${FORM_ID}: status ${del.status()}`);
}

function card(page: Page) {
  return page.locator('.card', { has: page.locator('code', { hasText: FORM_ID }) });
}

test.describe.configure({ mode: 'serial' });

test.describe('forms: clear submissions, then delete (#1973)', () => {
  let enabled = true;
  const signedIn = { storageState: './tests/e2e/.auth/user.json' };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage(signedIn);
    await waitForServerReady(page);
    enabled = (await page.request.get('/addons/forms/builder/new')).status() !== 404;
    if (enabled) {
      await removeForm(page); // a leftover from a failed run
      const created = await post(page, '/addons/forms/builder', {
        id: FORM_ID, title: 'E2E clear', notifyRole: 'admin', storeShown: '1', store: 'on', notifyShown: '1',
        fieldsJson: JSON.stringify([{ name: 'note', type: 'text', label: 'Note', required: false }])
      });
      expect(created.status(), 'create form').toBe(302);
    }
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!enabled) return;
    const page = await browser.newPage(signedIn);
    await removeForm(page);
    await page.close();
  });

  test('with submissions: delete is refused, and the card offers Clear with the count and a CSV copy', async ({ page }) => {
    test.skip(!enabled, 'forms add-on not enabled on this instance');
    await submit(page, 'first, with a comma');
    await submit(page, 'second');
    expect((await post(page, `/addons/forms/builder/${FORM_ID}/delete`, {})).status(), 'delete with submissions').toBe(409);

    await page.goto('/addons/forms');
    const c = card(page);
    await c.getByText('Clear submissions').click();
    await expect(c.getByTestId('clear-submissions')).toContainText('Removes all 2 stored submissions of E2E clear.');

    const csv = await page.request.get(await c.getByTestId('export-csv').getAttribute('href') ?? '');
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-disposition']).toBe(`attachment; filename="${FORM_ID}-submissions.csv"`);
    const lines = (await csv.text()).trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"first, with a comma"');
    expect(lines[2]).toContain('second');
  });

  test('a POST without the CSRF token clears nothing', async ({ page }) => {
    test.skip(!enabled, 'forms add-on not enabled on this instance');
    const res = await page.request.post(`${await instanceOrigin(page)}/addons/forms/${FORM_ID}/submissions/clear`, {
      form: { confirm: FORM_ID }, maxRedirects: 0
    });
    expect(res.status()).toBe(403);
    await page.goto('/addons/forms');
    await expect(card(page)).toContainText('2 submissions');
  });

  test('the button waits for the typed form id; clearing leaves 0, then delete works', async ({ page }) => {
    test.skip(!enabled, 'forms add-on not enabled on this instance');
    await page.goto('/addons/forms');
    const c = card(page);
    await c.getByText('Clear submissions').click();
    const button = c.getByRole('button', { name: 'Clear 2 submissions' });
    await expect(button).toBeDisabled();
    await c.getByLabel(`Type the form id, ${FORM_ID}, to confirm`).fill('e2e-1973');
    await expect(button).toBeDisabled();
    await c.getByLabel(`Type the form id, ${FORM_ID}, to confirm`).fill(FORM_ID);
    await expect(button).toBeEnabled();
    await button.click();

    await expect(page.getByTestId('flash-cleared')).toHaveText(`Cleared 2 submissions of ${FORM_ID}.`);
    await expect(card(page)).toContainText('0 submissions');
    await expect(card(page).getByTestId('clear-submissions')).toHaveCount(0);

    page.once('dialog', d => void d.accept());
    await card(page).getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.alert-info')).toContainText('Form definition deleted.');
    expect((await page.request.get(`/api/forms/schema/${FORM_ID}`)).status()).toBe(404);
  });
});
