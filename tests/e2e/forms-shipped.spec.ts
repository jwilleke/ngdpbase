import { test, expect, type Page, type Locator } from '@playwright/test';
import { waitForServerReady, instanceOrigin } from './fixtures/helpers';

/**
 * #1973 — a form an add-on provides: stored with the add-on and its version,
 * a copy from before #1973 (no providedBy) replaced at start, shown on the
 * forms admin as "Provided by <addon> <version>" with no Edit or Delete, and
 * refused by the form builder on the server.
 *
 * Needs the forms add-on and the fixture add-on in
 * tests/e2e/fixtures/addons/shipped-forms-e2e on the instance under test:
 *   "ngdpbase.addons.forms.enabled": true,
 *   "ngdpbase.addons.shipped-forms-e2e.enabled": true,
 *   "ngdpbase.managers.addons-manager.addons-path": ["./addons", "<checkout>/tests/e2e/fixtures/addons"]
 * Skips when either is missing. It changes nothing: the fixture's forms are
 * the fixture's, and every write it tries is refused.
 */

const IDS = ['e2e-1973-provided', 'e2e-1973-legacy'];
const ADDON = 'shipped-forms-e2e';
const VERSION = '1.0.0'; // the fixture's package.json version

async function csrfToken(page: Page): Promise<string> {
  const html = await (await page.request.get('/login')).text();
  const token = (html.match(/<meta name="csrf-token" content="([^"]+)"/) ?? [])[1];
  if (!token) throw new Error('could not obtain CSRF token from /login');
  return token;
}

async function post(page: Page, path: string, form: Record<string, string>): Promise<import('@playwright/test').APIResponse> {
  const token = await csrfToken(page);
  return page.request.post(`${await instanceOrigin(page)}${path}`, {
    headers: { 'X-CSRF-Token': token },
    form: { _csrf: token, ...form },
    maxRedirects: 0
  });
}

async function schema(page: Page, id: string): Promise<{ title: string; notify: boolean; providedBy?: { addon: string; version: string }; fields: Array<{ name: string; label: string }> }> {
  const res = await page.request.get(`/api/forms/schema/${id}`);
  expect(res.status(), `schema ${id}`).toBe(200);
  return res.json();
}

/** The form's card on the forms admin. */
function card(page: Page, id: string): Locator {
  return page.locator('.card', { has: page.locator('code', { hasText: id }) });
}

test.describe.configure({ mode: 'serial' });

test.describe('forms: definitions an add-on provides (#1973)', () => {
  let enabled = true;
  const signedIn = { storageState: './tests/e2e/.auth/user.json' };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage(signedIn);
    await waitForServerReady(page);
    enabled = (await page.request.get(`/api/forms/schema/${IDS[0]}`)).status() === 200;
    await page.close();
  });

  test('each form is stored with the add-on and its version; the pre-#1973 copy was replaced', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    for (const id of IDS) {
      const form = await schema(page, id);
      expect(form.providedBy).toEqual({ addon: ADDON, version: VERSION });
      expect(form.fields.map(f => f.label)).toEqual(['Reference']);
      expect(form.notify).toBe(false);
    }
  });

  test('the forms admin says who provides it, links to Add-ons, and offers no Edit or Delete', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    await page.goto('/addons/forms');
    for (const id of IDS) {
      const c = card(page, id);
      await expect(c.getByTestId('provided-by')).toHaveText(`Provided by ${ADDON} ${VERSION}; it updates this form.`);
      await expect(c.getByTestId('provided-by').locator('a')).toHaveAttribute('href', '/admin/addons');
      await expect(c.getByRole('link', { name: 'Edit' })).toHaveCount(0);
      await expect(c.getByRole('button', { name: 'Delete' })).toHaveCount(0);
      await expect(c.getByRole('link', { name: 'View Submissions' })).toBeVisible();
    }
    await expect(page.locator('[data-action="sync"], [data-action="force-sync"]')).toHaveCount(0);
  });

  test('the form builder refuses to open, save or delete it on the server', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    const id = IDS[0];
    const before = await schema(page, id);

    const open = await page.request.get(`/addons/forms/builder/${id}`);
    expect(open.status()).toBe(403);
    expect(await open.text()).toContain(`provided by ${ADDON} ${VERSION}`);

    const save = await post(page, `/addons/forms/builder/${id}`, { title: 'Edited on this site', fieldsJson: JSON.stringify(before.fields) });
    expect(save.status(), 'builder save').toBe(403);
    const del = await post(page, `/addons/forms/builder/${id}/delete`, {});
    expect(del.status(), 'builder delete').toBe(403);

    expect(await schema(page, id)).toEqual(before);
  });
});
