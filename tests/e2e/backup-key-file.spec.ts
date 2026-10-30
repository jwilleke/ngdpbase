import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { instanceOrigin, signInWithPassword } from './fixtures/helpers';

/**
 * #2134 — Download key file on the backup-key page: the backup key alone as a
 * small text file, named after the site and the key's fingerprint, never
 * cached, refused to a user without config-manage, and recorded with who took
 * it and the fingerprint, never the key.
 *
 * The fresh sign-in (step-up) is not exercised here: the suite's admin signed
 * in moments ago. The route's unit tests cover a stale sign-in.
 */
const RUN = randomUUID().slice(0, 8);
const READER = `e2e-keyfile-reader-${RUN}`;
const PASSWORD = `pw-${randomUUID()}`;

async function csrfFrom(request: APIRequestContext): Promise<string> {
  const html = await (await request.get('/login')).text();
  const token = (html.match(/<meta name="csrf-token" content="([^"]+)"/) ?? [])[1];
  if (!token) throw new Error('no csrf token');
  return token;
}

test.describe('Backup key file (#2134)', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const made = await context.request.post('/admin/users', {
      form: { _csrf: await csrfFrom(context.request), username: READER, email: `${READER}@example.test`, displayName: READER, password: PASSWORD, roles: 'reader', isTest: 'true' }
    });
    expect(made.ok()).toBe(true);
    expect(made.url()).not.toContain('error=');
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const res = await context.request.delete(`/admin/users/${encodeURIComponent(READER)}`, {
      headers: { 'X-CSRF-Token': await csrfFrom(context.request), Accept: 'application/json' }
    });
    expect(res.ok(), `delete ${READER}`).toBe(true);
    await context.close();
  });

  test('the button downloads the key alone, its line read back as the key, never cached', async ({ page }) => {
    await page.goto('/admin/backup/key');
    const key = await page.locator('#backup-key-value').inputValue();
    const fingerprint = (await page.locator('#backup-key-fingerprint').textContent())?.trim() ?? '';
    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
    await expect(page.locator('#backup-key-file-note')).toContainText('This file holds only the backup key');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#backup-key-file-download').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(new RegExp(`^.+-backup-key-${fingerprint}\\.txt$`));
    const saved = await download.path();
    const text = fs.readFileSync(saved, 'utf8');
    // Read the way the boot reads .env: the one name it sets is the key.
    expect(dotenv.parse(text)).toEqual({ NGDPBASE_BACKUP_KEY: key });
    expect(text).toContain(`# Fingerprint: ${fingerprint}`);

    const response = await page.request.get('/admin/backup/key/file');
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(response.headers()['content-type']).toBe('text/plain; charset=utf-8');
    expect(response.headers()['content-disposition']).toBe(`attachment; filename="${download.suggestedFilename()}"`);

    // The confirmation is the page's, unchanged.
    await expect(page.locator('#backup-key-confirm input[name="fingerprint"]')).toHaveValue(fingerprint);
  });

  test('each download is recorded with who took it and the fingerprint, never the key', async ({ page }) => {
    await page.goto('/admin/backup/key');
    const key = await page.locator('#backup-key-value').inputValue();
    const fingerprint = (await page.locator('#backup-key-fingerprint').textContent())?.trim() ?? '';
    // backup-key-download is on-failure refuse: flushed before the file is sent.
    const res = await page.request.get('/admin/audit/api?eventType=backup-key-download');
    expect(res.ok()).toBe(true);
    const body = await res.text();
    const results = (JSON.parse(body) as { results?: Array<{ user?: string; metadata?: { fingerprint?: string } }> }).results ?? [];
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].user).toBeTruthy();
    expect(results[0].metadata?.fingerprint).toBe(fingerprint);
    expect(body).not.toContain(key);
  });

  test('a signed-in user without config-manage is refused and gets no key', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      await signInWithPassword(page, READER, PASSWORD);
      const res = await page.request.get('/admin/backup/key/file');
      expect(res.status()).toBe(403);
      expect(res.headers()['content-disposition']).toBeUndefined();
      expect(await res.text()).not.toContain('NGDPBASE_BACKUP_KEY=');
    } finally {
      await context.close();
    }
  });

  test('an anonymous visitor is refused', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      const res = await page.request.get(`${await instanceOrigin(page)}/admin/backup/key/file`, { maxRedirects: 0 });
      expect(res.status()).not.toBe(200);
      expect(res.headers()['content-disposition']).toBeUndefined();
    } finally {
      await context.close();
    }
  });
});
