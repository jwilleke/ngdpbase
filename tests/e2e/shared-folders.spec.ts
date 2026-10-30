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
 * names is read, added to, edited and deleted in by an admin (the shipped
 * `shared-folder-admin` policy, #2095), and opens to no ordinary account (404).
 *
 * #2095: `/shared/executive` is made with `/shared/default` once the words are
 * confirmed. An account holding the executive role reads every folder (the
 * shipped `shared-folder-executive-read`), adds, edits and deletes in
 * `/shared/executive` (`shared-folder-executive-file`), and nowhere else but
 * default; an ordinary account cannot open it.
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
  const execName = `e2e-exec-${RUN}`;
  const execPassword = `pw-${randomUUID()}`;
  const EXEC_TITLE = `E2E Board ${RUN}`;

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const admin = await context.newPage();
    await admin.goto('/shared/default');
    const csrf = await csrfFrom(admin);
    await admin.request.post(`/shared/default/${encodeURIComponent(TITLE)}/delete`, { form: { _csrf: csrf } });
    await admin.request.post(`/shared/executive/${encodeURIComponent(EXEC_TITLE)}/delete`, { form: { _csrf: csrf } });
    for (const name of [username, execName]) {
      await admin.request.delete(`/admin/users/${encodeURIComponent(name)}`, { headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' } });
    }
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
    // #2095: made with default, with no one asking for it.
    await expect(page.locator('#shared-folders-list a[href="/shared/executive"]')).toBeVisible();

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
  });

  test('an admin reads, adds, edits and deletes in a folder no policy names (#2095)', async ({ page }) => {
    // Listed and opened: shared-folder-admin gives every admin shared-folder-read and shared-folder-file on shared/*.
    await page.goto('/shared');
    await expect(page.locator(`[data-testid="shared-folders-list"] a[href="/shared/${CLOSED}"]`)).toBeVisible();
    await page.goto(`/shared/${CLOSED}`);
    await expect(page.locator('[data-testid="shared-folder-empty"]')).toBeVisible();
    await expect(page.locator('[data-testid="shared-folder-new"]')).toBeVisible();
    const pagePath = `/shared/${CLOSED}/${encodeURIComponent(TITLE)}`;
    const csrf = await csrfFrom(page);
    const saved = await page.request.post(`${pagePath}/save`, { form: { _csrf: csrf, content: `The ${WORD} closed note.`, 'system-category': 'general' } });
    expect(saved.ok()).toBe(true);
    await page.goto(pagePath);
    await expect(page.getByText(`The ${WORD} closed note.`)).toBeVisible();
    const edited = await page.request.post(`${pagePath}/save`, { form: { _csrf: await csrfFrom(page), content: `The ${WORD} closed note, edited.`, 'system-category': 'general' } });
    expect(edited.ok()).toBe(true);
    await page.goto(pagePath);
    await expect(page.getByText(`The ${WORD} closed note, edited.`)).toBeVisible();
    const up = await page.request.post(`/attachments/upload/${encodeURIComponent(`shared/${CLOSED}/${TITLE}`)}`, {
      headers: { 'X-CSRF-Token': await csrfFrom(page) },
      multipart: { file: { name: `closed-${RUN}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`file ${WORD}`) } }
    });
    expect(up.ok()).toBe(true);
    const deleted = await page.request.post(`${pagePath}/delete`, { form: { _csrf: await csrfFrom(page) } });
    expect(deleted.ok()).toBe(true);
    await page.goto(`/shared/${CLOSED}`);
    await expect(page.locator('[data-testid="shared-folder-empty"]')).toBeVisible();
  });

  test('an executive reads every folder, files in /shared/executive, and is refused filing elsewhere (#2095)', async ({ page, browser }) => {
    const made = await page.request.post('/admin/users', {
      form: { _csrf: await csrfFrom(page), username: execName, email: `${execName}@example.test`, displayName: execName, password: execPassword, roles: 'executive', isTest: 'true' }
    });
    expect(made.ok()).toBe(true);
    const exec = await signIn(browser, execName, execPassword);
    try {
      const p = exec.page;
      // Reads every folder: all three listed and opened.
      await p.goto('/shared');
      for (const name of ['default', 'executive', CLOSED]) {
        await expect(p.locator(`[data-testid="shared-folders-list"] a[href="/shared/${name}"]`)).toBeVisible();
      }
      expect(await statusOf(p, `/shared/${CLOSED}`)).toBe(200);
      await p.goto(`/shared/default/${encodeURIComponent(TITLE)}`);
      await expect(p.getByText(`The ${WORD} minutes.`)).toBeVisible();

      // Refused filing in a folder it only reads: no new-page form, writes answered as a missing page.
      await p.goto(`/shared/${CLOSED}`);
      await expect(p.locator('[data-testid="shared-folder-new"]')).toHaveCount(0);
      const closedPath = `/shared/${CLOSED}/${encodeURIComponent(EXEC_TITLE)}`;
      expect(await statusOf(p, `${closedPath}/edit`)).toBe(404);
      const refused = await p.request.post(`${closedPath}/save`, { form: { _csrf: await csrfFrom(p), content: 'not here', 'system-category': 'general' }, maxRedirects: 0 });
      expect(refused.status()).toBe(404);
      const upRefused = await p.request.post(`/attachments/upload/${encodeURIComponent(`shared/${CLOSED}/${EXEC_TITLE}`)}`, {
        headers: { 'X-CSRF-Token': await csrfFrom(p) },
        multipart: { file: { name: `exec-closed-${RUN}.txt`, mimeType: 'text/plain', buffer: Buffer.from('not here') } }
      });
      expect(upRefused.ok()).toBe(false);

      // Adds, edits and deletes in /shared/executive.
      await p.goto('/shared/executive');
      await expect(p.locator('[data-testid="shared-folder-new"]')).toBeVisible();
      const execPath = `/shared/executive/${encodeURIComponent(EXEC_TITLE)}`;
      const added = await p.request.post(`${execPath}/save`, { form: { _csrf: await csrfFrom(p), content: `The ${WORD} board pack.`, 'system-category': 'general' } });
      expect(added.ok()).toBe(true);
      const edited = await p.request.post(`${execPath}/save`, { form: { _csrf: await csrfFrom(p), content: `The ${WORD} board pack, edited.`, 'system-category': 'general' } });
      expect(edited.ok()).toBe(true);
      await p.goto(execPath);
      await expect(p.getByText(`The ${WORD} board pack, edited.`)).toBeVisible();
      const up = await p.request.post(`/attachments/upload/${encodeURIComponent(`shared/executive/${EXEC_TITLE}`)}`, {
        headers: { 'X-CSRF-Token': await csrfFrom(p) },
        multipart: { file: { name: `board-${RUN}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`board ${WORD}`) } }
      });
      expect(up.ok()).toBe(true);
      const scratch = `/shared/executive/${encodeURIComponent(`${EXEC_TITLE} scratch`)}`;
      expect((await p.request.post(`${scratch}/save`, { form: { _csrf: await csrfFrom(p), content: 'scratch', 'system-category': 'general' } })).ok()).toBe(true);
      expect((await p.request.post(`${scratch}/delete`, { form: { _csrf: await csrfFrom(p) } })).ok()).toBe(true);
      expect(await statusOf(p, scratch)).toBe(404);
    } finally {
      await exec.context.close();
    }
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

    // From a page not saved yet, the file still goes into the folder: served to its readers, to nobody signed out.
    const early = await page.request.post(`/attachments/upload/${encodeURIComponent(`shared/default/${TITLE} draft`)}`, {
      headers: { 'X-CSRF-Token': await csrfFrom(page) },
      multipart: { file: { name: `draft-${RUN}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`draft ${WORD}`) } }
    });
    expect(early.ok()).toBe(true);
    const earlyBody = await early.json() as { attachment?: { id?: string; identifier?: string } };
    const earlyId = earlyBody.attachment?.identifier ?? earlyBody.attachment?.id;
    expect(earlyId).toBeTruthy();
    const earlyGot = await page.request.get(`/attachments/${earlyId}`);
    expect(earlyGot.status()).toBe(200);
    expect(await earlyGot.text()).toBe(`draft ${WORD}`);
    expect([403, 404]).toContain(await statusOf(visitor, `/attachments/${earlyId}`));
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
      // An ordinary account: the closed folder and /shared/executive are neither listed nor opened.
      expect(await statusOf(person.page, `/shared/${CLOSED}`)).toBe(404);
      expect(await statusOf(person.page, '/shared/executive')).toBe(404);
      expect(await statusOf(person.page, `/shared/executive/${encodeURIComponent(EXEC_TITLE)}`)).toBe(404);
      await person.page.goto('/shared');
      await expect(person.page.locator('body')).not.toContainText(CLOSED);
      await expect(person.page.locator('[data-testid="shared-folders-list"] a[href="/shared/executive"]')).toHaveCount(0);
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
