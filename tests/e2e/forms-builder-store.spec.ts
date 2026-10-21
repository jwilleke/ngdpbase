import { test, expect, type Page } from '@playwright/test';
import { waitForServerReady, instanceOrigin } from './fixtures/helpers';

/**
 * #1921 — the form builder's "Store submissions" box (and #1954's "Send
 * notices" box, the same pattern), and the properties the
 * builder has no input for.
 *
 * Creates a form in the builder with the box unticked, saves it again
 * unchanged (it stays store:false, and a checklist's optionsSource and
 * totalField and a lines field's sub-fields and row settings survive the
 * page's round trip), then ticks the box. Skips when
 * the forms add-on is not enabled on this instance. Teardown deletes only this
 * test's form.
 */

const FORM_ID = 'e2e-1921-store';

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

async function definition(page: Page): Promise<Record<string, unknown>> {
  const res = await page.request.get(`/api/forms/schema/${FORM_ID}`);
  expect(res.status(), 'schema').toBe(200);
  return res.json();
}

/** Open the builder for the form and press Save Changes, watching for CSP refusals. */
async function saveInBuilder(page: Page, before?: (p: Page) => Promise<void>): Promise<string[]> {
  const csp: string[] = [];
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
  await page.goto(`/addons/forms/builder/${FORM_ID}`);
  if (before) await before(page);
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.locator('.alert-success')).toContainText('Form definition saved');
  return csp;
}

test.describe.configure({ mode: 'serial' });

test.describe('forms: the builder keeps store and what it has no input for (#1921)', () => {
  let enabled = true;
  const signedIn = { storageState: './tests/e2e/.auth/user.json' };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage(signedIn);
    await waitForServerReady(page);
    const probe = await page.request.get('/addons/forms/builder/new');
    enabled = probe.status() !== 404;
    if (enabled) await deleteDefinition(page); // a leftover from a failed run
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!enabled) return;
    const page = await browser.newPage(signedIn);
    await deleteDefinition(page);
    await page.close();
  });

  test('a new form created with the box unticked does not store', async ({ page }) => {
    test.skip(!enabled, 'forms add-on not enabled on this instance');
    await page.goto('/addons/forms/builder/new');
    await expect(page.locator('#store')).toBeChecked();
    await page.locator('input[name="id"]').fill(FORM_ID);
    await page.locator('input[name="title"]').fill('E2E store');
    await page.locator('#add-field').click();
    await page.locator('[data-key="name"]').fill('total');
    await page.locator('[data-key="label"]').fill('Total');
    await page.locator('#store').uncheck();
    await page.getByRole('button', { name: 'Create Form' }).click();
    await expect(page.locator('.alert-success')).toContainText('Form definition saved');
    expect((await definition(page))['store']).toBe(false);
  });

  test('an unchanged save keeps store:false and every property the builder has no input for', async ({ page }) => {
    test.skip(!enabled, 'forms add-on not enabled on this instance');
    // Properties the builder shows no input for, written as a definition file would carry them.
    const token = await csrfToken(page);
    const seeded = await page.request.post(`${await instanceOrigin(page)}/addons/forms/builder/${FORM_ID}`, {
      headers: { 'X-CSRF-Token': token },
      form: {
        _csrf: token, title: 'E2E store', notifyRole: 'admin', confirmationUrl: '/view/e2e', proxySubmission: 'on', storeShown: '1',
        fieldsJson: JSON.stringify([
          { name: 'total', type: 'amount', label: 'Total', required: true },
          { name: 'picks', type: 'checklist', label: 'Picks', required: false, optionsSource: 'config:e2e.none', totalField: 'total' },
          { name: 'items', type: 'lines', label: 'Items', required: false, minRows: 1, maxRows: 5, amountField: 'cost', totalField: 'total',
            fields: [{ name: 'what', type: 'text', label: 'What', required: true }, { name: 'cost', type: 'amount', label: 'Cost', required: true }] }
        ])
      },
      maxRedirects: 0
    });
    expect(seeded.status(), 'seed').toBe(302);
    const before = await definition(page);
    expect(before['store']).toBe(false);

    const csp = await saveInBuilder(page, async p => { await expect(p.locator('#store')).not.toBeChecked(); });
    expect(csp, 'CSP refusals on the builder').toEqual([]);
    expect(await definition(page)).toEqual(before);
  });

  test('ticking the box turns storing on', async ({ page }) => {
    test.skip(!enabled, 'forms add-on not enabled on this instance');
    await saveInBuilder(page, async p => { await p.locator('#store').check(); });
    expect((await definition(page))['store']).toBe(true);
  });

  test('#1954: unticking Send notices saves notify:false, and an unchanged save keeps it', async ({ page }) => {
    test.skip(!enabled, 'forms add-on not enabled on this instance');
    await saveInBuilder(page, async p => {
      await expect(p.locator('#notify')).toBeChecked();
      await p.locator('#notify').uncheck();
    });
    const quiet = await definition(page);
    expect(quiet['notify']).toBe(false);

    await saveInBuilder(page, async p => { await expect(p.locator('#notify')).not.toBeChecked(); });
    expect(await definition(page)).toEqual(quiet);
  });
});
