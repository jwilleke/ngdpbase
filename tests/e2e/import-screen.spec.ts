import { test, expect } from '@playwright/test';
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { deletePages, markTestArtifact, signInWithPassword } from './fixtures/helpers';

/**
 * #2021 — the import screen (/import) onto the ICE engine.
 *
 * - An editor (a user who may create pages) uploads one small Markdown file
 *   into Pages, sees the run's per-file status reach "Imported", and the page
 *   exists.
 * - A reader (a user who may use no receiver) gets the screen saying there is
 *   nothing they can import into, with no upload form.
 * - #2130: one file gets a name field pre-filled with its own name (a page's
 *   title, without the extension); a new name is the page's title, and the
 *   status and recent list show it with the file's own name beside it.
 *   Several files get no field.
 *
 * Everything this spec makes is its own: two test accounts (deleted at the
 * end, with their profile pages) and the imported page, marked test-artifact
 * as soon as it exists and deleted in afterAll.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

const RUN = randomUUID().slice(0, 8);
const TITLE = `E2E Import Screen ${RUN}`;
const FILE_NAME = `export_${RUN}.md`;
const GIVEN = `E2E Import Named ${RUN}`;
const EDITOR = `e2e-import-editor-${RUN}`;
const READER = `e2e-import-reader-${RUN}`;
const PASSWORD = `pw-${randomUUID()}`;

async function csrfFrom(request: APIRequestContext): Promise<string> {
  const html = await (await request.get('/login')).text();
  const token = (html.match(/<meta name="csrf-token" content="([^"]+)"/) ?? [])[1];
  if (!token) throw new Error('no csrf token');
  return token;
}

async function signIn(browser: Browser, username: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signInWithPassword(page, username, PASSWORD);
  return { context, page };
}

test.describe('Import screen (#2021)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    for (const [username, roles] of [[EDITOR, 'editor'], [READER, 'reader']]) {
      const made = await context.request.post('/admin/users', {
        form: { _csrf: await csrfFrom(context.request), username, email: `${username}@example.test`, displayName: username, password: PASSWORD, roles, isTest: 'true' }
      });
      expect(made.ok()).toBe(true);
      expect(made.url()).not.toContain('error=');
    }
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const page = await context.newPage();
    try {
      // #2008: loud — the imported page is this spec's to remove.
      await deletePages(page, [TITLE, GIVEN]);
    } finally {
      for (const username of [EDITOR, READER]) {
        const res = await context.request.delete(`/admin/users/${encodeURIComponent(username)}`, {
          headers: { 'X-CSRF-Token': await csrfFrom(context.request), Accept: 'application/json' }
        });
        expect(res.ok(), `delete ${username}`).toBe(true);
      }
      await context.close();
    }
  });

  test('a user who may create pages imports a Markdown file into Pages and sees it imported', async ({ browser, page: admin }) => {
    const { context, page } = await signIn(browser, EDITOR);
    try {
      await page.goto('/import?receiver=core.pages');
      await expect(page.locator('#importForm')).toBeVisible();
      await expect(page.locator('#importReceiver')).toHaveValue('core.pages');
      // Pages offers all three original choices; nothing kept is the default.
      await expect(page.locator('#importOriginal')).toBeVisible();
      await expect(page.locator('#original-none')).toBeChecked();

      await page.locator('#importFiles').setInputFiles({
        name: `${TITLE}.md`,
        mimeType: 'text/markdown',
        buffer: Buffer.from(`# Imported heading\n\nImported through the screen ${RUN}.\n`)
      });
      await page.locator('#importStart').click();

      const run = page.locator('#importRuns [data-run-state]').first();
      await expect(run).toHaveAttribute('data-run-state', 'done', { timeout: 60_000 });
      await expect(run.locator('[data-file-status]')).toHaveAttribute('data-file-status', 'imported');
      await expect(run).toContainText(`${TITLE}.md`);
      await expect(run).toContainText('Imported');
    } finally {
      await context.close();
    }

    await markTestArtifact(admin, TITLE);
    const view = await admin.goto(`/view/${encodeURIComponent(TITLE)}`);
    expect(view?.status()).toBe(200);
    await expect(admin.locator('#pagecontent, .page-content, main').first()).toContainText(`Imported through the screen ${RUN}`);
  });

  test('after a reload the file is under "Your recent imports", read from the ledger, with a link to the page (#2110)', async ({ browser }) => {
    const { context, page } = await signIn(browser, EDITOR);
    try {
      await page.goto('/import');
      const row = page.locator('#importRecent tbody tr', { hasText: `${TITLE}.md` });
      await expect(row).toHaveAttribute('data-file-status', 'imported');
      await expect(row).toContainText('Pages');
      await expect(row.locator('a', { hasText: 'Open' })).toHaveAttribute('href', `/view/${encodeURIComponent(TITLE)}`);
      // Shown in the viewer's local time, not the UTC fallback.
      await expect(row.locator('time[data-local-time]')).not.toContainText('UTC');
    } finally {
      await context.close();
    }
  });

  test('one file is named on the screen: pre-filled with its own name, and the page takes the new one (#2130)', async ({ browser, page: admin }) => {
    const { context, page } = await signIn(browser, EDITOR);
    try {
      await page.goto('/import?receiver=core.pages');
      const name = page.locator('#importName');
      // Several files: each keeps its own name, so no field.
      await page.locator('#importFiles').setInputFiles([
        { name: 'one.md', mimeType: 'text/markdown', buffer: Buffer.from('# one') },
        { name: 'two.md', mimeType: 'text/markdown', buffer: Buffer.from('# two') }
      ]);
      await expect(page.locator('#importNameRow')).toBeHidden();

      await page.locator('#importFiles').setInputFiles({ name: FILE_NAME, mimeType: 'text/markdown', buffer: Buffer.from(`Named through the screen ${RUN}.\n`) });
      await expect(name).toBeVisible();
      await expect(name).toHaveValue(`export_${RUN}`);
      await name.fill(GIVEN);
      await page.locator('#importStart').click();

      const run = page.locator('#importRuns [data-run-state]').first();
      await expect(run).toHaveAttribute('data-run-state', 'done', { timeout: 60_000 });
      await expect(run.locator('[data-file-status]')).toHaveAttribute('data-file-status', 'imported');
      await expect(run).toContainText(`${GIVEN} (from ${FILE_NAME})`);

      await page.goto('/import');
      await expect(page.locator('#importRecent tbody tr', { hasText: GIVEN })).toContainText(`(from ${FILE_NAME})`);
    } finally {
      await context.close();
    }

    await markTestArtifact(admin, GIVEN);
    const view = await admin.goto(`/view/${encodeURIComponent(GIVEN)}`);
    expect(view?.status()).toBe(200);
  });

  test('a user who may use no receiver is told so, with no upload form', async ({ browser }) => {
    const { context, page } = await signIn(browser, READER);
    try {
      await page.goto('/import?receiver=core.pages');
      await expect(page.locator('#importNothing')).toBeVisible();
      await expect(page.locator('#importForm')).toHaveCount(0);
      // Another user's runs are not theirs to see.
      await expect(page.locator('#importRuns [data-run-state]')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
