import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { instanceOrigin, signInWithPassword } from './fixtures/helpers';

/**
 * #2125 (epic #1775) — shared folders hold pages and files, by permission.
 *
 * `/shared/default` is open to every signed-in user (the shipped
 * `shared-folder-default` policy) and to nobody signed out. A page made there
 * is read and changed through the page door, sealed with the folder's key; a
 * file uploaded onto it is served only to a reader of the folder; site search
 * finds it for a reader of the folder and for nobody else. A folder no policy
 * names opens to nobody, not even the admin, and is found by no search.
 *
 * Shared folders need the organization's recovery words confirmed, which is
 * once per site, and a folder cannot be deleted yet (slice 10 of the epic,
 * trash and purge), so this runs only with E2E_SHARED_FOLDERS=1, on a
 * throwaway instance. The pages it makes are deleted at the end; the test
 * account is a test account, deleted at the end; the folders stay, as the
 * instance's own state.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

const RUN = randomUUID().slice(0, 8);
const WORD = `zebrafolder${RUN}`;
const TITLE = `E2E Shared ${RUN}`;
const CLOSED = `e2e-closed-${RUN}`;

async function csrfFrom(page: Page): Promise<string> {
  if (!(await page.locator('meta[name="csrf-token"]').count())) await page.goto('/');
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) throw new Error('no csrf token on the page');
  return token;
}

async function signIn(browser: Browser, username: string, password: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signInWithPassword(page, username, password);
  return { context, page };
}

/** The status `page` gets for `path`, without following a redirect. */
async function statusOf(page: Page, path: string): Promise<number> {
  return (await page.request.get(`${await instanceOrigin(page)}${path}`, { maxRedirects: 0 })).status();
}

test.describe('Shared folders hold pages and files (#2125)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);
  test.skip(process.env.E2E_SHARED_FOLDERS !== '1', 'makes the site\'s shared-folders recovery words and folders, once per site: set E2E_SHARED_FOLDERS=1 on a throwaway instance');

  const username = `e2e-shared-${RUN}`;
  const password = `pw-${randomUUID()}`;

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const admin = await context.newPage();
    await admin.goto('/shared/default');
    const csrf = await csrfFrom(admin);
    await admin.request.post(`/shared/default/${encodeURIComponent(TITLE)}/delete`, { form: { _csrf: csrf } });
    await admin.request.delete(`/admin/users/${encodeURIComponent(username)}`, { headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' } });
    await context.close();
  });

  test('the words confirmed, /shared/default exists; a new folder can be made', async ({ page }) => {
    await page.goto('/admin/backup');
    if (await page.locator('#shared-folders-words-none').count()) {
      await Promise.all([page.waitForURL(/\/admin\/backup\/shared-folders\/words$/), page.locator('#shared-folders-words-make button').click()]);
      await page.check('#recovery-words-saved');
      await Promise.all([page.waitForURL(/\/admin\/backup\?success=/), page.getByRole('button', { name: 'Save the recovery words' }).click()]);
    }
    await expect(page.locator('#shared-folders-words-confirmed')).toBeVisible();
    if (!(await page.locator('#shared-folders-list a[href="/shared/default"]').count())) {
      await page.locator('#shared-folders-create input[name="name"]').fill('default');
      await Promise.all([page.waitForURL(/\/admin\/backup\?success=/), page.locator('#shared-folders-create button').click()]);
    }
    await expect(page.locator('#shared-folders-list a[href="/shared/default"]')).toBeVisible();

    await page.locator('#shared-folders-create input[name="name"]').fill(CLOSED);
    await Promise.all([page.waitForURL(/\/admin\/backup\?success=/), page.locator('#shared-folders-create button').click()]);
    await expect(page.locator(`#shared-folders-list a[href="/shared/${CLOSED}"]`)).toBeVisible();
  });

  test('a page made in /shared/default is read and changed through the page door', async ({ page }) => {
    await page.goto('/shared/default');
    await page.locator('[data-testid="shared-folder-new"] input[name="new"]').fill(TITLE);
    await Promise.all([page.waitForURL(/\/shared\/default\/[^/]+\/edit$/), page.locator('[data-testid="shared-folder-new"] button').click()]);
    const editor = page.locator('textarea#editorContent, textarea[name="content"], .CodeMirror textarea');
    await editor.first().waitFor({ state: 'visible', timeout: 15000 });
    await editor.first().fill(`The ${WORD} minutes.`);
    await Promise.all([
      page.waitForURL((u) => u.pathname === `/shared/default/${encodeURIComponent(TITLE)}`, { timeout: 30000 }),
      page.locator('button[type="submit"]:has-text("Save"), #saveButton').first().click()
    ]);
    await expect(page.getByText(`The ${WORD} minutes.`)).toBeVisible();

    await page.goto('/shared/default');
    await expect(page.locator('[data-testid="shared-folder-pages"]')).toContainText(TITLE);
    await page.goto('/shared');
    await expect(page.locator('[data-testid="shared-folders-list"]')).toContainText('default');
    // The closed folder is not listed even to the admin: no policy names it.
    await expect(page.locator('[data-testid="shared-folders-list"]')).not.toContainText(CLOSED);
    expect(await statusOf(page, `/shared/${CLOSED}`)).toBe(404);
  });

  test('a file uploaded onto the page is the folder\'s, served to its readers only', async ({ page, browser }) => {
    await page.goto(`/shared/default/${encodeURIComponent(TITLE)}`);
    const up = await page.request.post(`/attachments/upload/${encodeURIComponent(`shared/default/${TITLE}`)}`, {
      headers: { 'X-CSRF-Token': await csrfFrom(page) },
      multipart: { file: { name: `notes-${RUN}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`file ${WORD}`) } }
    });
    expect(up.ok()).toBe(true);
    const body = await up.json() as { attachment?: { id?: string; identifier?: string; url?: string } };
    const id = body.attachment?.identifier ?? body.attachment?.id;
    expect(id).toBeTruthy();
    const got = await page.request.get(`/attachments/${id}`);
    expect(got.status()).toBe(200);
    expect(await got.text()).toBe(`file ${WORD}`);

    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const visitor = await anon.newPage();
    await visitor.goto('/');
    expect([403, 404]).toContain(await statusOf(visitor, `/attachments/${id}`));
    await anon.close();
  });

  test('signed out: no folder, no page, no search hit', async ({ browser }) => {
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const visitor = await anon.newPage();
    await visitor.goto('/');
    expect(await statusOf(visitor, '/shared/default')).toBe(404);
    expect(await statusOf(visitor, `/shared/default/${encodeURIComponent(TITLE)}`)).toBe(404);
    await visitor.goto(`/search?q=${RUN}`);
    await expect(visitor.locator('body')).not.toContainText(TITLE);
    await anon.close();
  });

  test('another signed-in user opens /shared/default, and search finds its page for them', async ({ page, browser }) => {
    const made = await page.request.post('/admin/users', {
      form: { _csrf: await csrfFrom(page), username, email: `${username}@example.test`, displayName: username, password, roles: 'reader', isTest: 'true' }
    });
    expect(made.ok()).toBe(true);
    const person = await signIn(browser, username, password);
    try {
      await person.page.goto(`/shared/default/${encodeURIComponent(TITLE)}`);
      await expect(person.page.getByText(`The ${WORD} minutes.`)).toBeVisible();
      await person.page.goto(`/search?q=${RUN}`);
      await expect(person.page.locator('body')).toContainText(TITLE);
      expect(await statusOf(person.page, `/shared/${CLOSED}`)).toBe(404);
    } finally {
      await person.context.close();
    }
  });

  test('every read is recorded with who read it', async ({ page }) => {
    // shared-folder-read is on-failure continue: queued, and searchable once flushed (ngdpbase.audit.flushinterval, 30 s shipped).
    await expect.poll(async () => {
      const res = await page.request.get(`/admin/audit/api?user=${encodeURIComponent(username)}&eventType=shared-folder-read`);
      if (!res.ok()) return 0;
      return ((await res.json()) as { results?: unknown[] }).results?.length ?? 0;
    }, { timeout: 45000 }).toBeGreaterThan(0);
  });
});
