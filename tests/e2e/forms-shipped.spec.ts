import { test, expect, type Page, type Locator } from '@playwright/test';
import { waitForServerReady, instanceOrigin } from './fixtures/helpers';

/**
 * #1973 — a form an add-on provides: stored with the add-on and its version,
 * a copy from before #1973 (no providedBy) replaced at start, shown on the
 * forms admin as "Provided by <addon> <version>" with no Edit or Delete, and
 * refused by the form builder on the server. A form whose add-on is not on
 * the site any more says "No longer provided by <addon>" and may be deleted.
 *
 * Needs the forms add-on and the fixture add-on in
 * tests/e2e/fixtures/addons/shipped-forms-e2e on the instance under test:
 *   "ngdpbase.addons.forms.enabled": true,
 *   "ngdpbase.addons.shipped-forms-e2e.enabled": true,
 *   "ngdpbase.managers.addons-manager.addons-path": ["./addons", "<checkout>/tests/e2e/fixtures/addons"]
 * Skips when either is missing. The changes it makes: a submission to the
 * provided form, then cleared; a submission to the orphaned form, cleared,
 * then the form deleted, which the fixture writes again at the next start.
 */

const IDS = ['e2e-1973-provided', 'e2e-1973-legacy'];
const ADDON = 'shipped-forms-e2e';
const VERSION = '1.0.0'; // the fixture's package.json version
const ORPHAN = 'e2e-1973-orphan';
const GONE = 'shipped-forms-e2e-removed'; // an add-on this site does not have

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

/** One submission to a form, through the forms API. */
async function submit(page: Page, id: string): Promise<void> {
  const token = await csrfToken(page);
  const res = await page.request.post(`${await instanceOrigin(page)}/api/forms/submit/${id}`, {
    headers: { 'X-CSRF-Token': token },
    data: { check: 'e2e-1973' }
  });
  expect(res.status(), `submit ${id}`).toBe(201);
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

  test('a form its add-on still provides can have its submissions cleared, and stays provided (#1973)', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    const id = IDS[0];
    await submit(page, id);
    await page.goto('/addons/forms');
    await expect(card(page, id).getByTestId('clear-submissions')).toHaveCount(1);
    const clear = await post(page, `/addons/forms/${id}/submissions/clear`, { confirm: id });
    expect(clear.status()).toBe(302);
    expect(clear.headers()['location']).toMatch(new RegExp(`^/addons/forms\\?flash=cleared&form=${id}&count=[1-9]`));
    await page.goto('/addons/forms');
    await expect(card(page, id)).toContainText('0 submissions');
    expect((await schema(page, id)).providedBy).toEqual({ addon: ADDON, version: VERSION });
    expect((await post(page, `/addons/forms/builder/${id}/delete`, {})).status(), 'still provided: no delete').toBe(403);
  });

  test('a form its add-on no longer provides says so, cannot be edited, and can be deleted', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    test.skip((await page.request.get(`/api/forms/schema/${ORPHAN}`)).status() !== 200, 'the orphaned form was deleted earlier this boot');
    await page.goto('/addons/forms');
    const c = card(page, ORPHAN);
    await expect(c.getByTestId('no-longer-provided')).toHaveText(`No longer provided by ${GONE} (last written by version 0.9.0). It can be deleted, not edited.`);
    await expect(c.getByRole('link', { name: 'Edit' })).toHaveCount(0);
    await expect(c.getByRole('button', { name: 'Delete' })).toBeVisible();
    // A form its add-on still provides keeps no Delete.
    await expect(card(page, IDS[0]).getByRole('button', { name: 'Delete' })).toHaveCount(0);

    expect((await page.request.get(`/addons/forms/builder/${ORPHAN}`)).status(), 'builder open').toBe(403);
    // With a submission it is kept until the submissions are cleared (#1973).
    await submit(page, ORPHAN);
    expect((await post(page, `/addons/forms/builder/${ORPHAN}/delete`, {})).status(), 'delete with a submission').toBe(409);
    const clear = await post(page, `/addons/forms/${ORPHAN}/submissions/clear`, { confirm: ORPHAN });
    expect(clear.headers()['location']).toBe(`/addons/forms?flash=cleared&form=${ORPHAN}&count=1`);
    const del = await post(page, `/addons/forms/builder/${ORPHAN}/delete`, {});
    expect(del.status(), 'builder delete').toBe(302);
    expect((await page.request.get(`/api/forms/schema/${ORPHAN}`)).status()).toBe(404);
  });
});
