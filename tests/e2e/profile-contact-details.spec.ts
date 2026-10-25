import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { signInWithPassword } from './fixtures/helpers';

/**
 * #2073 — a user edits their own details in the "Contact details" card on
 * /profile and sees them after a reload: name, phones (each with its
 * own country, shown back in local form), an extension, the emergency
 * contact, the mailing address and languages. A bad phone is refused in the
 * card, naming the box and never the value, and nothing is saved. A new email
 * is never saved by the form: it waits for its link, or is refused where the
 * site cannot send email (#2073).
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
  test('a user edits their details and sees them after reload; a bad phone is refused naming the box', async ({ page, browser }) => {
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
      await expect(card.getByLabel('Country for home phone')).toHaveValue('US');

      await card.getByLabel('Name', { exact: true }).fill(`Pat ${RUN}`);
      await card.getByLabel('Home phone', { exact: true }).fill('415.555.2671');
      await card.getByLabel('Country for mobile phone').selectOption('GB');
      await card.getByLabel('Mobile phone', { exact: true }).fill('020 7946 0958');
      await card.getByLabel('Work phone', { exact: true }).fill('212 555 0123');
      await card.getByLabel('Work phone extension').fill('7');
      await card.getByLabel('Emergency contact name').fill('Sam Sibling');
      await card.getByLabel('Emergency contact phone', { exact: true }).fill('+1 415 555 2672');
      await card.getByLabel('Emergency contact email').fill('sam@example.test');
      await card.getByLabel('Mailing address street').fill('PO Box 9');
      await card.getByLabel('Mailing address city or town').fill('Town');
      await card.getByLabel('Languages').fill('English, Spanish');
      await card.getByRole('button', { name: 'Save contact details' }).click();
      await expect(user.locator('[data-contact-details-saved]')).toContainText('Contact details saved');

      await user.reload();
      const again = user.locator('#contact-details');
      await expect(again.getByLabel('Name', { exact: true })).toHaveValue(`Pat ${RUN}`);
      await expect(again.getByLabel('Email', { exact: true })).toHaveValue(`${username}@example.test`);
      await expect(again.getByLabel('Home phone', { exact: true })).toHaveValue('(415) 555-2671');
      await expect(again.getByLabel('Mobile phone', { exact: true })).toHaveValue('020 7946 0958');
      await expect(again.getByLabel('Country for mobile phone')).toHaveValue('GB');
      await expect(again.getByLabel('Work phone', { exact: true })).toHaveValue('(212) 555-0123');
      await expect(again.getByLabel('Work phone extension')).toHaveValue('7');
      await expect(again.getByLabel('Other phone', { exact: true })).toHaveValue('');
      await expect(again.getByLabel('Emergency contact name')).toHaveValue('Sam Sibling');
      await expect(again.getByLabel('Emergency contact phone', { exact: true })).toHaveValue('(415) 555-2672');
      await expect(again.getByLabel('Mailing address street')).toHaveValue('PO Box 9');
      await expect(again.getByLabel('Languages')).toHaveValue('English, Spanish');

      // A bad phone: refused in the card, naming the box, never the value; what was saved stays.
      await again.getByLabel('Mobile phone', { exact: true }).fill('call me 0042');
      await again.getByRole('button', { name: 'Save contact details' }).click();
      const error = user.locator('[data-contact-details-error]');
      await expect(error).toContainText('Mobile phone is not a phone number');
      await expect(error).toContainText('Nothing was saved');
      await expect(error).not.toContainText('0042');
      expect(user.url()).not.toContain('0042');
      await expect(user.locator('#contact-details').getByLabel('Mobile phone', { exact: true })).toHaveValue('020 7946 0958');

      // #2073: a new email is never saved by the form: a link goes to it, or a site without email refuses it.
      const card2 = user.locator('#contact-details');
      await card2.getByLabel('Email', { exact: true }).fill(`${username}.new@example.test`);
      await card2.getByRole('button', { name: 'Save contact details' }).click();
      await expect(user.locator('[data-pending-email], [data-contact-details-error]')).toContainText(/We sent a link to|An administrator can change it/);
      expect(user.url()).not.toContain('.new@');
      await user.reload();
      await expect(user.locator('#contact-details').getByLabel('Email', { exact: true })).toHaveValue(`${username}@example.test`);
    } finally {
      await context.close();
      await page.request.delete(`/admin/users/${encodeURIComponent(username)}`, {
        headers: { 'X-CSRF-Token': await csrfFrom(page), Accept: 'application/json' }
      });
    }
  });
});
