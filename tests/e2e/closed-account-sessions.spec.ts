import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { instanceOrigin } from './fixtures/helpers';

/**
 * #1937 — an account an admin deletes or turns off loses every signed-in
 * session at once: the person's next request is not signed in, the session is
 * gone from the session store (the admin sessions list), and the end is
 * audited as `authentication-logout` with the reason. A new account later
 * created with the same username does not inherit the old session.
 *
 * Everything this spec makes is its own: test accounts (flagged isTest), each
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

async function createAccount(admin: Page, username: string, password: string): Promise<void> {
  const made = await admin.request.post('/admin/users', {
    form: { _csrf: await csrfFrom(admin), username, email: `${username}@example.test`, displayName: username, password, roles: 'reader', isTest: 'on' }
  });
  expect(made.ok()).toBe(true);
  expect(made.url()).not.toContain('error=');
}

async function deleteAccount(admin: Page, username: string): Promise<number> {
  const removed = await admin.request.delete(`/admin/users/${encodeURIComponent(username)}`, {
    headers: { 'X-CSRF-Token': await csrfFrom(admin), Accept: 'application/json' }
  });
  return removed.status();
}

async function signIn(browser: Browser, username: string, password: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/admin/login');
  const form = page.locator('form:has(input[type="password"])');
  await form.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="password"])').first().fill(username);
  await form.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /login/i }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 });
  return { context, page };
}

/** Whether this browser's session is signed in: /profile answers 200 only to a signed-in person. */
async function signedIn(page: Page): Promise<boolean> {
  const res = await page.request.get(`${await instanceOrigin(page)}/profile`, { maxRedirects: 0 });
  return res.status() === 200;
}

async function storeHolds(admin: Page, username: string): Promise<boolean> {
  const res = await admin.request.get('/api/sessions/list');
  expect(res.ok()).toBe(true);
  const body = await res.json() as { sessions: Array<{ username: string | null }> };
  return body.sessions.some((s) => s.username === username);
}

async function expectLogoutAudited(admin: Page, username: string, reason: string): Promise<void> {
  await expect.poll(async () => {
    const res = await admin.request.get(`/admin/audit/api?user=${encodeURIComponent(username)}&eventType=authentication-logout`);
    if (!res.ok()) return [];
    const body = await res.json() as { results?: Array<{ reason?: string }> };
    return (body.results ?? []).map((r) => r.reason);
  }, { timeout: 15000 }).toContain(reason);
}

test.describe('Sessions of a closed account (#1937)', () => {
  test('deleting an account ends its session: refused next request, gone from the store, audited', async ({ page, browser }) => {
    const username = `e2e-closed-del-${RUN}`;
    const password = `pw-${randomUUID()}`;
    await createAccount(page, username, password);
    const person = await signIn(browser, username, password);
    let deleted = false;
    try {
      expect(await signedIn(person.page)).toBe(true);
      expect(await storeHolds(page, username)).toBe(true);

      expect(await deleteAccount(page, username)).toBe(200);
      deleted = true;

      // Gone from the store before the person makes another request: closing the account removed it.
      expect(await storeHolds(page, username)).toBe(false);
      expect(await signedIn(person.page)).toBe(false);
      await expectLogoutAudited(page, username, 'account-deleted');
    } finally {
      await person.context.close();
      if (!deleted) await deleteAccount(page, username);
    }
  });

  test('turning an account off ends its session the same way', async ({ page, browser }) => {
    const username = `e2e-closed-off-${RUN}`;
    const password = `pw-${randomUUID()}`;
    await createAccount(page, username, password);
    const person = await signIn(browser, username, password);
    try {
      expect(await signedIn(person.page)).toBe(true);

      const off = await page.request.put(`/admin/users/${encodeURIComponent(username)}`, {
        headers: { 'X-CSRF-Token': await csrfFrom(page), Accept: 'application/json' },
        data: { isActive: false }
      });
      expect(off.ok()).toBe(true);

      // Gone from the store before the person makes another request: closing the account removed it.
      expect(await storeHolds(page, username)).toBe(false);
      expect(await signedIn(person.page)).toBe(false);
      await expectLogoutAudited(page, username, 'account-disabled');
    } finally {
      await person.context.close();
      await deleteAccount(page, username);
    }
  });

  test('a new account with the same username does not inherit the old session; other sessions carry on', async ({ page, browser }) => {
    const username = `e2e-closed-reuse-${RUN}`;
    const password = `pw-${randomUUID()}`;
    await createAccount(page, username, password);
    const old = await signIn(browser, username, password);
    let made = true;
    try {
      expect(await signedIn(old.page)).toBe(true);
      expect(await deleteAccount(page, username)).toBe(200);
      made = false;
      await createAccount(page, username, `pw-${randomUUID()}`);
      made = true;

      expect(await signedIn(old.page)).toBe(false);
      // The admin's own session, untouched by any of it.
      expect(await signedIn(page)).toBe(true);
    } finally {
      await old.context.close();
      if (made) await deleteAccount(page, username);
    }
  });
});
