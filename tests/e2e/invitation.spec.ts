import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { acceptTermsIfAsked, instanceOrigin, signInWithPassword } from './fixtures/helpers';

/**
 * #2049 — invite a new user. An admin creates an account without a password
 * and sends an invitation; the user opens the emailed link, signs in once,
 * accepts the terms, chooses a password and then signs in with it. A second
 * open of the link is refused.
 *
 * The email is read from the server log: the instance runs with
 * `ngdpbase.mail.enabled: true` and the `console` mail provider, which writes
 * each message to the log, and `ngdpbase.application.base-url` set. Set
 * `E2E_MAIL_LOG` to that log file (the instance's `logs/app.log`, or its
 * captured output); without it the spec is skipped, because there is no
 * other way to receive the link.
 *
 * Everything this spec makes is its own: one test account (flagged isTest),
 * deleted at the end.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

const MAIL_LOG = process.env.E2E_MAIL_LOG;
const RUN = randomUUID().slice(0, 8);

async function csrfFrom(page: Page): Promise<string> {
  if (!(await page.locator('meta[name="csrf-token"]').count())) await page.goto('/');
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) throw new Error('no csrf token on the page');
  return token;
}

/** The invitation link the log shows for `username`, waiting a little for it to be written. */
async function invitationLinkFor(username: string): Promise<string> {
  const marker = `with the username ${username}.`;
  for (let i = 0; i < 40; i++) {
    const log = fs.existsSync(MAIL_LOG) ? fs.readFileSync(MAIL_LOG, 'utf8') : '';
    const at = log.lastIndexOf(marker);
    const link = at >= 0 ? /(https?:\/\/[^\s"\\]+\/invitation\?t=[\w-]+)/.exec(log.slice(at)) : null;
    if (link) return link[1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no invitation for ${username} in ${MAIL_LOG}`);
}

test.describe('invite a new user (#2049)', () => {
  test.skip(!MAIL_LOG, 'needs E2E_MAIL_LOG: the log of an instance with mail on and the console mail provider');

  test('admin invites; the user sets a password, accepts the terms and signs in; the link then refuses', async ({ page, browser }) => {
    const username = `e2einv${RUN}`;
    try {
      // The admin makes the account without a password, choosing an invitation instead.
      await page.goto('/admin/users');
      await page.getByRole('button', { name: /Create New User/ }).click();
      const modal = page.locator('#createUserModal');
      await modal.locator('#username').fill(username);
      await modal.locator('#displayName').fill(`Invited ${RUN}`);
      await modal.locator('#email').fill(`${username}@example.test`);
      await modal.locator('#invite').check();
      await expect(modal.locator('#password')).toBeHidden();
      await modal.locator('#isTest').check();
      await modal.locator('#role_reader').check();
      await modal.getByRole('button', { name: /Create User/ }).click();
      await expect(page.locator('.alert-success')).toContainText(`invitation sent to ${username}`);
      const row = page.locator(`tr[data-username="${username}"]`);
      await expect(row.locator('[data-invited]')).toBeVisible();

      const link = await invitationLinkFor(username);
      // The link points at the configured site address; the browser goes to the instance under test.
      const path = new URL(link).pathname + new URL(link).search;

      // The new user, in a browser of their own.
      const userContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const user = await userContext.newPage();
      await user.goto(path);
      await expect(user.getByTestId('invitation')).toContainText(username);
      await Promise.all([
        user.waitForURL((url) => url.pathname !== '/invitation', { timeout: 15000 }),
        user.getByTestId('invitation-continue').click()
      ]);
      await acceptTermsIfAsked(user);
      await expect(user).toHaveURL(/\/account\/setup/);

      const password = `pw-${randomUUID()}`;
      await user.locator('#newPassword').fill(password);
      await user.locator('#confirmPassword').fill(password);
      await user.getByTestId('setup-password-submit').click();
      await expect(user.getByTestId('setup-success')).toContainText('Your password is set');
      await userContext.close();

      // A second open of the same link is refused.
      const againContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const again = await againContext.newPage();
      await again.goto(path);
      await expect(again.getByTestId('invitation-dead')).toBeVisible();
      await expect(again.getByTestId('invitation-continue')).toHaveCount(0);

      // The new password signs in.
      await signInWithPassword(again, username, password);
      const profile = await again.request.get(`${await instanceOrigin(again)}/profile`, { maxRedirects: 0 });
      expect(profile.status()).toBe(200);
      await againContext.close();

      // Signed in once: the admin list no longer shows the invitation.
      await page.goto('/admin/users');
      await expect(page.locator(`tr[data-username="${username}"] [data-invited]`)).toHaveCount(0);
    } finally {
      await page.request.delete(`/admin/users/${encodeURIComponent(username)}`, {
        headers: { 'X-CSRF-Token': await csrfFrom(page), Accept: 'application/json' }
      });
    }
  });
});
