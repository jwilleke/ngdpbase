import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { signInWithPassword } from './fixtures/helpers';

/**
 * #2126 — the Shared folders screen under /admin. It opens for an
 * administrator (`admin-system`), never cached, with or without the
 * shared folders' recovery words; a signed-in account without `admin-system`
 * is refused it and refused changing a folder's access; a visitor signed out
 * is sent to sign in.
 *
 * Makes no folder and writes no policy, so it runs on every instance. The one
 * test account it makes (flagged isTest) is deleted at the end. Ticking roles
 * and opening the folder as that role needs the words, and is
 * shared-folders.spec.ts's, gated on E2E_SHARED_FOLDERS.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

const RUN = randomUUID().slice(0, 8);

async function csrfFrom(page: Page): Promise<string> {
  if (!(await page.locator('meta[name="csrf-token"]').count())) await page.goto('/');
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) throw new Error('no csrf token on the page');
  return token;
}

test.describe('Admin → Shared folders (#2126)', () => {
  test('an administrator opens the screen, never cached', async ({ page }) => {
    const res = await page.goto('/admin/shared-folders');
    expect(res?.status()).toBe(200);
    expect(res?.headers()['cache-control']).toContain('no-store');
    await expect(page.getByRole('heading', { level: 1, name: /Shared folders/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Make a shared folder/ })).toBeVisible();
    // Either the words still to be made, or the form to make a folder.
    await expect(page.locator('#shared-folders-words-needed').or(page.locator('#shared-folders-make'))).toBeVisible();
    await page.goto('/admin');
    await expect(page.locator('a[href="/admin/shared-folders"]').first()).toBeVisible();
  });

  test('a signed-in account without admin-system is refused the screen and the access change', async ({ page, browser }) => {
    const username = `e2e-sfadmin-${RUN}`;
    const password = `pw-${randomUUID()}`;
    const made = await page.request.post('/admin/users', {
      form: { _csrf: await csrfFrom(page), username, email: `${username}@example.test`, displayName: username, password, roles: 'reader', isTest: 'true' }
    });
    expect(made.ok()).toBe(true);
    expect(made.url()).not.toContain('error=');

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const reader = await context.newPage();
      await signInWithPassword(reader, username, password);
      const screen = await reader.goto('/admin/shared-folders');
      expect(screen?.status()).toBe(403);
      await expect(reader.locator('form.shared-folder-access')).toHaveCount(0);
      const change = await reader.request.post('/admin/shared-folders/default/access', {
        form: { _csrf: await csrfFrom(reader), read: 'reader' },
        maxRedirects: 0
      });
      expect(change.status()).toBe(403);
    } finally {
      await context.close();
      const removed = await page.request.delete(`/admin/users/${encodeURIComponent(username)}`, {
        headers: { 'X-CSRF-Token': await csrfFrom(page), Accept: 'application/json' }
      });
      expect(removed.ok()).toBe(true);
    }
  });

  test('signed out: sent to sign in', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const visitor = await context.newPage();
    await visitor.goto('/admin/shared-folders');
    await expect(visitor).toHaveURL(/\/login/);
    await context.close();
  });
});
