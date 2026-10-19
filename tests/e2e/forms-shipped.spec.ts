import { test, expect, type Page, type Locator } from '@playwright/test';
import { waitForServerReady, instanceOrigin } from './fixtures/helpers';

/**
 * #1880 — a form an add-on ships: first install, shown as outdated, Sync of an
 * unedited copy, an edited copy protected, the explicit overwrite, and a copy
 * saved before #1880 (no stamp).
 *
 * Needs the forms add-on and the fixture add-on in
 * tests/e2e/fixtures/addons/shipped-forms-e2e on the instance under test:
 *   "ngdpbase.addons.forms.enabled": true,
 *   "ngdpbase.addons.shipped-forms-e2e.enabled": true,
 *   "ngdpbase.managers.addons-manager.addons-path": ["./addons", "<checkout>/tests/e2e/fixtures/addons"]
 * Skips when either is missing. The fixture's reset route puts its four forms
 * back first; teardown deletes only those four.
 */

const IDS = ['e2e-1880-fresh', 'e2e-1880-outdated', 'e2e-1880-edited', 'e2e-1880-legacy'];

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

async function schema(page: Page, id: string): Promise<{ title: string; fields: Array<{ name: string; label: string }> }> {
  const res = await page.request.get(`/api/forms/schema/${id}`);
  expect(res.status(), `schema ${id}`).toBe(200);
  return res.json();
}

function card(page: Page, id: string): Locator {
  return page.locator('.card', { has: page.locator('code', { hasText: new RegExp(`^${id}$`) }) });
}

test.describe.configure({ mode: 'serial' });

test.describe('forms: definitions an add-on ships (#1880)', () => {
  let enabled = true;
  const signedIn = { storageState: './tests/e2e/.auth/user.json' };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage(signedIn);
    await waitForServerReady(page);
    const res = await post(page, '/e2e/shipped-forms/reset', {});
    enabled = res.status() === 200;
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!enabled) return;
    const page = await browser.newPage(signedIn);
    for (const id of IDS) await post(page, `/addons/forms/builder/${id}/delete`, {});
    await page.close();
  });

  test('first install saves what the add-on ships, and it is up to date', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    await page.goto('/addons/forms');
    const c = card(page, 'e2e-1880-fresh');
    await expect(c.getByText('from shipped-forms-e2e')).toBeVisible();
    await expect(c.locator('[data-shipped-status="current"]')).toBeVisible();
    await expect(c.locator('[data-action="sync"]')).toHaveCount(0);
    expect((await schema(page, 'e2e-1880-fresh')).fields.map(f => f.label)).toEqual(['Reference']);
  });

  test('an unedited copy from the previous release is outdated, and Sync updates it', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    expect((await schema(page, 'e2e-1880-outdated')).fields).toHaveLength(2);
    await page.goto('/addons/forms');
    const c = card(page, 'e2e-1880-outdated');
    await expect(c.locator('[data-shipped-status="outdated"]')).toBeVisible();
    await c.locator('[data-action="sync"]').click();
    await expect(page.locator('.alert-success')).toContainText('Form updated');
    await expect(card(page, 'e2e-1880-outdated').locator('[data-shipped-status="current"]')).toBeVisible();
    expect((await schema(page, 'e2e-1880-outdated')).fields.map(f => f.label)).toEqual(['Reference']);
  });

  test('a copy edited in the form builder is protected: Sync without the overwrite leaves it', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    const live = await schema(page, 'e2e-1880-edited');
    const edit = await post(page, '/addons/forms/builder/e2e-1880-edited', { title: 'Edited on this site', fieldsJson: JSON.stringify(live.fields) });
    expect(edit.status(), 'builder save').toBe(302);

    await page.goto('/addons/forms');
    const c = card(page, 'e2e-1880-edited');
    await expect(c.locator('[data-shipped-status="edited"]')).toContainText('update available');
    await expect(c.locator('[data-action="sync"]')).toHaveCount(0);

    const plain = await post(page, '/addons/forms/e2e-1880-edited/sync', {});
    expect(plain.status()).toBe(302);
    expect(plain.headers()['location']).toBe('/addons/forms?flash=sync-edited');
    expect((await schema(page, 'e2e-1880-edited')).title).toBe('Edited on this site');
  });

  test('the explicit overwrite asks first, then replaces the edited copy', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    await page.goto('/addons/forms');
    const button = card(page, 'e2e-1880-edited').locator('[data-action="overwrite"]');

    page.once('dialog', d => { expect(d.message()).toContain('Those edits are lost'); void d.dismiss(); });
    await button.click();
    expect((await schema(page, 'e2e-1880-edited')).title).toBe('Edited on this site');

    page.once('dialog', d => { void d.accept(); });
    await button.click();
    await expect(page.locator('.alert-success')).toContainText('Form updated');
    const synced = await schema(page, 'e2e-1880-edited');
    expect(synced.title).toBe('E2E e2e-1880-edited');
    expect(synced.fields.map(f => f.label)).toEqual(['Reference']);
  });

  test('a copy saved before #1880 is outdated, unstamped, and Sync replaces it after a warning', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    await page.goto('/addons/forms');
    const c = card(page, 'e2e-1880-legacy');
    await expect(c.locator('[data-shipped-status="outdated"]')).toBeVisible();
    page.once('dialog', d => { expect(d.message()).toContain('saved before edits were tracked'); void d.accept(); });
    await c.locator('[data-action="sync"]').click();
    await expect(page.locator('.alert-success')).toContainText('Form updated');
    await expect(card(page, 'e2e-1880-legacy').locator('[data-shipped-status="current"]')).toBeVisible();
    expect((await schema(page, 'e2e-1880-legacy')).fields.map(f => f.label)).toEqual(['Reference']);
  });
});
