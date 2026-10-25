import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { signInWithPassword } from './fixtures/helpers';

/**
 * #2073 — two accounts may share one email. An administrator creating the
 * second is told; the user list marks both. A user who saves another
 * account's email on their profile is told emailed sign-in links will ask
 * which account.
 *
 * Everything this spec makes is its own: three test accounts (flagged
 * isTest), deleted at the end.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

const RUN = randomUUID().slice(0, 8);
const NOTE = 'Another account uses this email too. Emailed sign-in links will ask which account.';

async function csrfFrom(page: Page): Promise<string> {
  if (!(await page.locator('meta[name="csrf-token"]').count())) await page.goto('/');
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) throw new Error('no csrf token on the page');
  return token;
}

async function createAccount(admin: Page, username: string, email: string, password: string): Promise<string> {
  const made = await admin.request.post('/admin/users', {
    form: { _csrf: await csrfFrom(admin), username, email, displayName: username, password, roles: 'reader', isTest: 'true' }
  });
  expect(made.ok()).toBe(true);
  expect(made.url()).not.toContain('error=');
  return decodeURIComponent(made.url());
}

test.describe('Shared emails (#2073)', () => {
  test('two accounts share an email: the admin is told and the list marks both; a user saving it is told', async ({ page, browser }) => {
    const shared = `couple-${RUN}@example.test`;
    const ann = `e2e-share-ann-${RUN}`;
    const bob = `e2e-share-bob-${RUN}`;
    const cal = `e2e-share-cal-${RUN}`;
    const password = `pw-${randomUUID()}`;
    try {
      expect(await createAccount(page, ann, shared, password)).not.toContain(NOTE);
      expect(await createAccount(page, bob, shared.toUpperCase(), password)).toContain(NOTE);
      await createAccount(page, cal, `${cal}@example.test`, password);

      await page.goto('/admin/users');
      await expect(page.locator(`tr[data-username="${ann}"] [data-shared-email]`)).toBeVisible();
      await expect(page.locator(`tr[data-username="${bob}"] [data-shared-email]`)).toBeVisible();
      await expect(page.locator(`tr[data-username="${cal}"] [data-shared-email]`)).toHaveCount(0);

      // cal takes the shared email on their own profile: saved, with the note.
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const user = await context.newPage();
      try {
        await signInWithPassword(user, cal, password);
        await user.goto('/profile');
        const card = user.locator('#contact-details');
        await card.getByLabel('Email', { exact: true }).fill(shared);
        await card.getByRole('button', { name: 'Save contact details' }).click();
        await expect(user.locator('[data-contact-details-saved]')).toContainText(NOTE);
        await user.reload();
        await expect(user.locator('#contact-details').getByLabel('Email', { exact: true })).toHaveValue(shared);
      } finally {
        await context.close();
      }
      await page.goto('/admin/users');
      await expect(page.locator(`tr[data-username="${cal}"] [data-shared-email]`)).toBeVisible();
    } finally {
      for (const username of [ann, bob, cal]) {
        await page.request.delete(`/admin/users/${encodeURIComponent(username)}`, {
          headers: { 'X-CSRF-Token': await csrfFrom(page), Accept: 'application/json' }
        });
      }
    }
  });
});
