import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { instanceOrigin, signInWithPassword } from './fixtures/helpers';

/**
 * #1930 — contacts on the admin pages: add a person with no account, find
 * them, link them to an account by hand (never a second person), remove one,
 * and the "Is this you?" confirmation page for a link that is not valid.
 *
 * Everything this spec makes is its own and removed at the end: the test
 * account (flagged isTest) is deleted, which removes the person joined to it;
 * the unlinked contact is removed through the page.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

const RUN = randomUUID().slice(0, 8);

async function csrfFrom(page: Page): Promise<string> {
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) throw new Error('no csrf token on the page');
  return token;
}

async function addContact(page: Page, name: string, email: string): Promise<void> {
  await page.goto('/admin/contacts');
  await page.getByTestId('contacts-add-name').fill(name);
  await page.getByTestId('contacts-add-email').fill(email);
  await page.getByTestId('contacts-add-submit').click();
  await expect(page.getByTestId('contacts-success')).toContainText(`Added ${name}`);
}

function rowFor(page: Page, email: string) {
  return page.getByTestId('contacts-table').locator('tr', { hasText: email });
}

test.describe('Contacts (#1930)', () => {
  test('the dashboard links to Contacts, and the page lists people', async ({ page }) => {
    await page.goto('/admin');
    await page.getByTestId('admin-contacts-link').click();
    await expect(page).toHaveURL(/\/admin\/contacts/);
    await expect(page.locator('h1')).toContainText('Contacts');
    await expect(page.getByTestId('contacts-add-form')).toBeVisible();
  });

  test('add a person with no account, find them by email, and remove them', async ({ page }) => {
    const email = `e2e-contact-${RUN}@example.test`;
    await addContact(page, `E2E Contact ${RUN}`, email);

    await page.goto(`/admin/contacts?q=${encodeURIComponent(email)}`);
    await expect(rowFor(page, email)).toHaveCount(1);
    await expect(rowFor(page, email).getByTestId('contacts-link-username')).toBeVisible();

    await rowFor(page, email).getByTestId('contacts-remove').click();
    await expect(page.getByTestId('contacts-success')).toContainText('Removed');
    await page.goto(`/admin/contacts?q=${encodeURIComponent(email)}`);
    await expect(rowFor(page, email)).toHaveCount(0);
  });

  test('an admin links a person to an account by hand, and the account keeps one person', async ({ page }) => {
    const email = `e2e-donor-${RUN}@example.test`;
    const username = `e2e-link-${RUN}`;
    const name = `E2E Donor ${RUN}`;
    await addContact(page, name, email);

    // A test account with a different address: the case the admin link exists for.
    const csrf = await csrfFrom(page);
    const made = await page.request.post('/admin/users', {
      form: { _csrf: csrf, username, email: `e2e-account-${RUN}@example.test`, displayName: username, password: `pw-${randomUUID()}`, roles: 'reader', isTest: 'on' }
    });
    expect(made.ok()).toBe(true);
    expect(made.url()).not.toContain('error=');
    try {
      await page.goto(`/admin/contacts?q=${encodeURIComponent(email)}`);
      await rowFor(page, email).getByTestId('contacts-link-username').fill(username);
      await rowFor(page, email).getByTestId('contacts-link-submit').click();
      await expect(page.getByTestId('contacts-success')).toContainText(`Linked to the account ${username}`);

      // The contact now carries the account, and the account has no second person.
      await page.goto(`/admin/contacts?q=${encodeURIComponent(email)}`);
      await expect(rowFor(page, email)).toContainText(username);
      await page.goto(`/admin/contacts?q=${encodeURIComponent(RUN)}`);
      await expect(page.getByTestId('contacts-table').locator('tr', { hasText: username })).toHaveCount(1);
    } finally {
      const removed = await page.request.delete(`/admin/users/${encodeURIComponent(username)}`, {
        headers: { 'X-CSRF-Token': await csrfFrom(page), Accept: 'application/json' }
      });
      expect(removed.ok()).toBe(true);
    }
    // Deleting the account removed the person joined to it.
    await page.goto(`/admin/contacts?q=${encodeURIComponent(email)}`);
    await expect(rowFor(page, email)).toHaveCount(0);
  });

  test('a demo admin sees contacts and organizations, with every change control locked', async ({ page, browser }) => {
    const email = `e2e-demo-view-${RUN}@example.test`;
    await addContact(page, `E2E Demo View ${RUN}`, email);
    const username = `e2e-demo-${RUN}`;
    const password = `pw-${randomUUID()}`;
    const made = await page.request.post('/admin/users', {
      form: { _csrf: await csrfFrom(page), username, email: `${username}@example.test`, displayName: username, password, roles: 'demo-admin', isTest: 'on' }
    });
    expect(made.url()).not.toContain('error=');

    const demo = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const demoPage = await demo.newPage();
    try {
      await signInWithPassword(demoPage, username, password); // #1603: accepts the terms when asked

      // contact-read: the list and search work.
      await demoPage.goto(`/admin/contacts?q=${encodeURIComponent(email)}`);
      await expect(demoPage.locator('h1')).toContainText('Contacts');
      await expect(rowFor(demoPage, email)).toHaveCount(1);
      // No contact-manage: the change controls are locked and the link form is absent.
      await expect(demoPage.getByTestId('contacts-add-submit')).toBeDisabled();
      await expect(rowFor(demoPage, email).getByTestId('contacts-remove')).toBeDisabled();
      await expect(rowFor(demoPage, email).getByTestId('contacts-link-username')).toHaveCount(0);
      // A change sent anyway is refused by the door.
      const refused = await demoPage.request.post(`${await instanceOrigin(demoPage)}/admin/contacts`, {
        form: { _csrf: await csrfFrom(demoPage), name: `E2E Refused ${RUN}` },
        maxRedirects: 0
      });
      expect(refused.status()).toBe(403);

      await demoPage.goto('/admin/organizations');
      await expect(demoPage.locator('h1')).toContainText('Organization Management');
      await expect(demoPage.getByText("needs the 'contact-read' permission")).toHaveCount(0);
    } finally {
      await demo.close();
      await page.goto(`/admin/contacts?q=${encodeURIComponent(email)}`);
      await rowFor(page, email).getByTestId('contacts-remove').click();
      const removed = await page.request.delete(`/admin/users/${encodeURIComponent(username)}`, {
        headers: { 'X-CSRF-Token': await csrfFrom(page), Accept: 'application/json' }
      });
      expect(removed.ok()).toBe(true);
    }
    await page.goto(`/admin/contacts?q=${encodeURIComponent(`E2E Refused ${RUN}`)}`);
    await expect(page.getByTestId('contacts-table')).toHaveCount(0);
  });

  test('a sign-up link that is not valid says so and joins nothing', async ({ page }) => {
    await page.goto('/contacts/link/confirm?t=not-a-real-token');
    await expect(page.getByTestId('contact-link-expired')).toBeVisible();
    await expect(page.getByTestId('contact-link-join')).toHaveCount(0);
  });
});
