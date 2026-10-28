import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { signInWithPassword } from './fixtures/helpers';

/**
 * #2093 — the Executive Hub. /executive opens for a user holding the
 * executive role (executive-read) and is refused to everyone else, the
 * administrator included: running the site is /admin, the board's page is
 * a separate permission. The account menu offers the hub only to its holders.
 *
 * Everything this spec makes is its own: one test account (flagged isTest),
 * deleted at the end. It files and decides no request.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

const RUN = randomUUID().slice(0, 8);

async function csrfFrom(page: Page): Promise<string> {
  if (!(await page.locator('meta[name="csrf-token"]').count())) await page.goto('/');
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) throw new Error('no csrf token on the page');
  return token;
}

test.describe('Executive Hub (#2093)', () => {
  test('the administrator, who does not hold executive-read, is refused and not offered it', async ({ page }) => {
    const res = await page.request.get('/executive');
    expect(res.status()).toBe(403);
    await page.goto('/');
    await expect(page.locator('a[href="/executive"]')).toHaveCount(0);
  });

  test('a user with the executive role opens it and is offered it in the account menu', async ({ page, browser }) => {
    const username = `e2e-exec-${RUN}`;
    const password = `pw-${randomUUID()}`;
    const made = await page.request.post('/admin/users', {
      form: { _csrf: await csrfFrom(page), username, email: `${username}@example.test`, displayName: username, password, roles: 'executive', isTest: 'true' }
    });
    expect(made.ok()).toBe(true);
    expect(made.url()).not.toContain('error=');

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const exec = await context.newPage();
      await signInWithPassword(exec, username, password);
      await exec.goto('/executive');
      await expect(exec.getByTestId('executive-page')).toBeVisible();
      await expect(exec.getByTestId('executive-page').getByRole('heading', { level: 1, name: /Executive Hub/ })).toBeVisible();
      // No add-on registers a card yet (#2094); the pending list is empty or says reviews are off.
      await expect(exec.getByTestId('executive-cards-empty')).toBeVisible();
      await expect(exec.getByTestId('executive-pending-empty').or(exec.getByTestId('executive-reviews-unavailable'))).toBeVisible();
      expect(await exec.locator('a[href="/executive"]').count()).toBeGreaterThan(0);
      // Read-only: the administration screens stay closed to it.
      expect((await exec.request.get('/admin')).status()).toBe(403);
    } finally {
      await context.close();
      const removed = await page.request.delete(`/admin/users/${encodeURIComponent(username)}`, {
        headers: { 'X-CSRF-Token': await csrfFrom(page), Accept: 'application/json' }
      });
      expect(removed.status()).toBe(200);
    }
  });
});
