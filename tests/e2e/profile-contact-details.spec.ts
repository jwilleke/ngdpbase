import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { signInWithPassword } from './fixtures/helpers';

/**
 * #2073 — a user edits their own phones and emergency contact in the
 * "Contact details" card on /profile, and sees them after a reload. A bad
 * phone is refused in the card, naming the box, and nothing is saved.
 *
 * Everything this spec makes is its own: one test account (flagged isTest),
 * deleted at the end.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

const RUN = randomUUID().slice(0, 8);

async function csrfFrom(page: Page): Promise<string> {
  if (!(await page.locator('meta[name="csrf-token"]').count())) await page.goto('/');
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) throw new Error('no csrf token on the page');
  return token;
}

test.describe('Contact details on /profile (#2073)', () => {
  test('a user edits their phones and emergency contact and sees them after reload', async ({ page, browser }) => {
    const username = `e2e-contact-${RUN}`;
    const password = `pw-${randomUUID()}`;
    const made = await page.request.post('/admin/users', {
      form: { _csrf: await csrfFrom(page), username, email: `${username}@example.test`, displayName: username, password, roles: 'reader', isTest: 'true' }
    });
    expect(made.ok()).toBe(true);
    expect(made.url()).not.toContain('error=');

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const user = await context.newPage();
    try {
      await signInWithPassword(user, username, password);
      await user.goto('/profile');
      const card = user.locator('#contact-details');
      await expect(card.getByRole('heading', { name: /Contact details/ })).toBeVisible();

      await card.getByLabel('Home phone').fill('+1 555 0100');
      await card.getByLabel('Mobile phone').fill('(555) 010-0199');
      await card.getByLabel('Name').fill('Sam Sibling');
      await card.getByLabel('Phone', { exact: true }).fill('+1 555 0103');
      await card.getByLabel('Email').fill('sam@example.test');
      await card.getByRole('button', { name: 'Save contact details' }).click();
      await expect(user.locator('[data-contact-details-saved]')).toContainText('Contact details saved');

      await user.reload();
      const again = user.locator('#contact-details');
      await expect(again.getByLabel('Home phone')).toHaveValue('+1 555 0100');
      await expect(again.getByLabel('Mobile phone')).toHaveValue('(555) 010-0199');
      await expect(again.getByLabel('Work phone')).toHaveValue('');
      await expect(again.getByLabel('Name')).toHaveValue('Sam Sibling');
      await expect(again.getByLabel('Phone', { exact: true })).toHaveValue('+1 555 0103');
      await expect(again.getByLabel('Email')).toHaveValue('sam@example.test');

      // A bad phone: refused in the card, naming the box; what was saved stays.
      await again.getByLabel('Mobile phone').fill('call me');
      await again.getByRole('button', { name: 'Save contact details' }).click();
      await expect(user.locator('[data-contact-details-error]')).toContainText('Mobile phone');
      await expect(user.locator('[data-contact-details-error]')).toContainText('Nothing was saved');
      await expect(user.locator('#contact-details').getByLabel('Mobile phone')).toHaveValue('(555) 010-0199');
    } finally {
      await context.close();
      await page.request.delete(`/admin/users/${encodeURIComponent(username)}`, {
        headers: { 'X-CSRF-Token': await csrfFrom(page), Accept: 'application/json' }
      });
    }
  });
});
