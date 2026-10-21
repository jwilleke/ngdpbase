import { test, expect, type Page, type Locator } from '@playwright/test';
import { waitForServerReady, instanceOrigin } from './fixtures/helpers';

/**
 * #1880 — a form an add-on ships: first install, shown as outdated, Sync of an
 * unedited copy, an edited copy protected, the explicit overwrite, and a copy
 * saved before #1880 (no stamp).
 *
 * #1918 — they read and sync as Admin → Required Pages does (its status words,
 * Sync / Force Sync, through core's shared partials); a change the add-on
 * marks required is flagged; and a copy left behind raises one admin notice
 * per form and shipped version, critical when required.
 *
 * Needs the forms add-on and the fixture add-on in
 * tests/e2e/fixtures/addons/shipped-forms-e2e on the instance under test:
 *   "ngdpbase.addons.forms.enabled": true,
 *   "ngdpbase.addons.shipped-forms-e2e.enabled": true,
 *   "ngdpbase.managers.addons-manager.addons-path": ["./addons", "<checkout>/tests/e2e/fixtures/addons"]
 * Skips when either is missing. The fixture's reset route puts its forms back
 * first; teardown deletes only those forms.
 */

const IDS = ['e2e-1880-fresh', 'e2e-1880-outdated', 'e2e-1880-edited', 'e2e-1880-legacy', 'e2e-1918-required', 'e2e-1918-required-edited'];
const ADDON = 'shipped-forms-e2e';

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

/** The form's row in Shipped Forms (#1918). */
function card(page: Page, id: string): Locator {
  return page.locator(`#shippedForms tr[data-form-id="${id}"]`);
}

/** The words its status cell shows, from the shared _sync-status partial. */
async function statuses(row: Locator): Promise<string[]> {
  return row.locator('[data-sync-status]').evaluateAll(els => els.map(e => e.getAttribute('data-sync-status') ?? ''));
}

/** Every notification with this title in Admin → Notifications' All tab. */
function notices(page: Page, title: string): Locator {
  return page.locator('#all .alert', { has: page.locator('h6', { hasText: title }) });
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
    await expect(c.getByText('shipped-forms-e2e')).toBeVisible();
    expect(await statuses(c)).toEqual(['current']);
    await expect(c.locator('[data-action="sync"]')).toHaveCount(0);
    expect((await schema(page, 'e2e-1880-fresh')).fields.map(f => f.label)).toEqual(['Reference']);
  });

  test('an unedited copy from the previous release is outdated, and Sync updates it', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    expect((await schema(page, 'e2e-1880-outdated')).fields).toHaveLength(2);
    await page.goto('/addons/forms');
    const c = card(page, 'e2e-1880-outdated');
    expect(await statuses(c)).toEqual(['modified']);
    await c.locator('[data-action="sync"]').click();
    await expect(page.locator('.alert-success')).toContainText('Form updated');
    expect(await statuses(card(page, 'e2e-1880-outdated'))).toEqual(['current']);
    expect((await schema(page, 'e2e-1880-outdated')).fields.map(f => f.label)).toEqual(['Reference']);
  });

  test('a copy edited in the form builder is protected: Sync without the overwrite leaves it', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    const live = await schema(page, 'e2e-1880-edited');
    const edit = await post(page, '/addons/forms/builder/e2e-1880-edited', { title: 'Edited on this site', fieldsJson: JSON.stringify(live.fields) });
    expect(edit.status(), 'builder save').toBe(302);

    await page.goto('/addons/forms');
    const c = card(page, 'e2e-1880-edited');
    expect(await statuses(c)).toEqual(['modified', 'user-edited']);
    await expect(c.locator('[data-action="sync"]')).toHaveCount(0);

    const plain = await post(page, '/addons/forms/e2e-1880-edited/sync', {});
    expect(plain.status()).toBe(302);
    expect(plain.headers()['location']).toBe('/addons/forms?flash=sync-edited');
    expect((await schema(page, 'e2e-1880-edited')).title).toBe('Edited on this site');
  });

  test('the explicit overwrite asks first, then replaces the edited copy', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    await page.goto('/addons/forms');
    const button = card(page, 'e2e-1880-edited').locator('[data-action="force-sync"]');

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
    expect(await statuses(c)).toEqual(['modified']);
    page.once('dialog', d => { expect(d.message()).toContain('saved before edits were tracked'); void d.accept(); });
    await c.locator('[data-action="sync"]').click();
    await expect(page.locator('.alert-success')).toContainText('Form updated');
    expect(await statuses(card(page, 'e2e-1880-legacy'))).toEqual(['current']);
    expect((await schema(page, 'e2e-1880-legacy')).fields.map(f => f.label)).toEqual(['Reference']);
  });

  test('#1918: a copy behind an ordinary change raised one info notice naming add-on, form and Sync', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    await page.goto('/admin/notifications');
    const n = notices(page, `Form update available: "E2E e2e-1880-outdated" (e2e-1880-outdated) from ${ADDON}`);
    await expect(n).toHaveCount(1);
    await expect(n).toHaveClass(/alert-info/);
    await expect(n).toContainText('choose Sync');
  });

  test('#1918: a required change is flagged, raised one critical notice, and survives a re-registration without a second', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    const title = `Critical: form "E2E e2e-1918-required" (e2e-1918-required) from ${ADDON} needs syncing`;
    await page.goto('/admin/notifications');
    await expect(notices(page, title)).toHaveCount(1);
    await expect(notices(page, title)).toHaveClass(/alert-danger/);
    await expect(notices(page, title)).toContainText(`${ADDON} needs this update to work`);

    // What a restart does: the add-on registers its forms again.
    expect((await post(page, '/e2e/shipped-forms/reset', {})).status()).toBe(200);
    await page.goto('/admin/notifications');
    await expect(notices(page, title)).toHaveCount(1);

    await page.goto('/addons/forms');
    await expect(page.locator('[data-testid="shipped-required"]')).toContainText('2 shipped forms need an update');
    const c = card(page, 'e2e-1918-required');
    expect(await statuses(c)).toEqual(['modified', 'required']);
    await c.locator('[data-action="sync"]').click();
    await expect(page.locator('.alert-success')).toContainText('Form updated');
    expect(await statuses(card(page, 'e2e-1918-required'))).toEqual(['current']);
    await expect(page.locator('[data-testid="shipped-required"]')).toContainText('1 shipped form needs an update');
  });

  test('#1918: an edited copy behind a required change says so, and only Force Sync takes it', async ({ page }) => {
    test.skip(!enabled, 'forms add-on or the shipped-forms fixture is not enabled on this instance');
    await page.goto('/admin/notifications');
    const n = notices(page, `Critical: form "E2E e2e-1918-required-edited" (e2e-1918-required-edited) from ${ADDON} needs syncing`);
    await expect(n).toHaveCount(1);
    await expect(n).toContainText('It was edited on this site, so Sync does not replace it');
    await expect(n).toContainText('Force Sync');

    await page.goto('/addons/forms');
    const c = card(page, 'e2e-1918-required-edited');
    expect(await statuses(c)).toEqual(['modified', 'user-edited', 'required']);
    await expect(c.locator('[data-action="sync"]')).toHaveCount(0);
    page.once('dialog', d => { expect(d.message()).toContain('Those edits are lost'); void d.accept(); });
    await c.locator('[data-action="force-sync"]').click();
    await expect(page.locator('.alert-success')).toContainText('Form updated');
    expect(await statuses(card(page, 'e2e-1918-required-edited'))).toEqual(['current']);
    expect((await schema(page, 'e2e-1918-required-edited')).title).toBe('E2E e2e-1918-required-edited');
    await expect(page.locator('[data-testid="shipped-required"]')).toHaveCount(0);
  });
});
