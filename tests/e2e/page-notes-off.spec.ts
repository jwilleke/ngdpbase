import { test, expect, type Page } from '@playwright/test';
import { TEST_PAGE_PREFIX, deletePage, instanceOrigin, markTestArtifact } from './fixtures/helpers';

/**
 * #1951 — a page, or its system-category, turns off core's Comments and
 * Footnotes. The page shows neither tab, and a direct write is refused by the
 * server; a page beside it keeps both.
 *
 * The page flag is set through the admin raw editor, the only place the
 * frontmatter line can be written by hand. The system-category case runs only
 * when the instance names a system-category whose entry sets
 * `"comments": false, "footnotes": false`, in E2E_NOTES_OFF_CATEGORY; it is
 * skipped otherwise, because it needs the instance's configuration.
 */
test.describe('Comments and Footnotes turned off (#1951)', () => {
  test.use({ storageState: './tests/e2e/.auth/user.json' });
  test.setTimeout(90000);

  const stamp = Date.now();
  const offPage = `${TEST_PAGE_PREFIX}-NotesOff-${stamp}`;
  const onPage = `${TEST_PAGE_PREFIX}-NotesOn-${stamp}`;
  const categoryPage = `${TEST_PAGE_PREFIX}-NotesOffCategory-${stamp}`;
  const created: string[] = [];

  test.afterAll(async ({ browser }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const p = await context.newPage();
    for (const name of created) await deletePage(p, name).catch(() => undefined);
    await context.close();
  });

  /** Create a page through the create form and save its body, as a person does. */
  async function createPage(page: Page, title: string, body: string): Promise<void> {
    await page.goto('/create');
    await page.locator('#pageName, input[name="pageName"]').first().fill(title);
    await Promise.all([
      page.waitForURL(/\/edit\//, { timeout: 30000 }),
      page.locator('button:has-text("Create Page"), form[action="/create"] button[type="submit"]').first().click()
    ]);
    const editor = page.locator('textarea#editorContent, textarea[name="content"], .CodeMirror textarea');
    await editor.first().waitFor({ state: 'visible', timeout: 15000 });
    await editor.first().fill(body);
    await Promise.all([
      page.waitForURL((u) => u.pathname.startsWith('/view/'), { timeout: 30000 }),
      page.locator('button[type="submit"]:has-text("Save"), #saveButton').first().click()
    ]);
    await markTestArtifact(page, title);
  }

  /** Rewrite the page's frontmatter through the raw editor; returns its uuid. */
  async function editFrontmatter(page: Page, name: string, edit: (frontmatter: string) => string): Promise<string> {
    await page.goto(`/admin/edit-raw/${encodeURIComponent(name)}`);
    const box = page.locator('textarea#rawContent');
    const raw = await box.inputValue();
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    expect(m, 'the page has frontmatter').not.toBeNull();
    await box.fill(`---\n${edit(m[1])}\n---\n${m[2]}`);
    await Promise.all([
      page.waitForURL((u) => u.pathname.startsWith('/view/'), { timeout: 30000 }),
      page.locator('form[action^="/admin/edit-raw/"] button[type="submit"]').first().click()
    ]);
    const uuid = (m[1].match(/^uuid:\s*['"]?([0-9a-f-]{36})/m) ?? [])[1];
    expect(uuid, 'the page has a uuid').toBeTruthy();
    return uuid;
  }

  async function tabNames(page: Page, name: string): Promise<string[]> {
    await page.goto(`/view/${encodeURIComponent(name)}`);
    await page.locator('body').waitFor();
    return (await page.locator('.ngdp-tabs [role="tab"]').allInnerTexts()).map((t) => t.trim());
  }

  async function csrf(page: Page): Promise<string> {
    const html = await (await page.request.get('/login')).text();
    return (html.match(/<meta name="csrf-token" content="([^"]+)"/) ?? [])[1] ?? '';
  }

  test('a page with comments: false and footnotes: false shows neither tab, and a direct POST is refused', async ({ page }) => {
    await createPage(page, offPage, 'A page whose readers must not leave shared notes.');
    created.push(offPage);
    await createPage(page, onPage, 'An ordinary page beside it.');
    created.push(onPage);

    const uuid = await editFrontmatter(page, offPage, (fm) => `${fm}\ncomments: false\nfootnotes: false`);

    const offTabs = await tabNames(page, offPage);
    expect(offTabs).toContain('Referring Pages');
    expect(offTabs).not.toContain('Comments');
    expect(offTabs).not.toContain('Footnotes');

    // The page beside it, rendered from the same shared template, keeps both.
    const onTabs = await tabNames(page, onPage);
    expect(onTabs).toEqual(expect.arrayContaining(['Comments', 'Footnotes']));

    const origin = await instanceOrigin(page);
    const token = await csrf(page);
    const q = `?page=${encodeURIComponent(offPage)}`;
    const comment = await page.request.post(`${origin}/api/comments/${uuid}${q}`, {
      headers: { Accept: 'application/json', 'X-CSRF-Token': token },
      data: { content: 'ask Dr. X about my A1c' }
    });
    expect(comment.status()).toBe(403);
    expect((await comment.json()).error).toBe('Comments are turned off for this page.');

    const footnote = await page.request.post(`${origin}/api/footnotes/${uuid}${q}`, {
      headers: { Accept: 'application/json', 'X-CSRF-Token': token },
      data: { display: 'Source', url: 'https://example.com' }
    });
    expect(footnote.status()).toBe(403);
    expect((await footnote.json()).error).toBe('Footnotes are turned off for this page.');
  });

  test('a page in a system-category that turns them off shows neither tab, and a direct POST is refused', async ({ page }) => {
    const category = process.env.E2E_NOTES_OFF_CATEGORY;
    test.skip(!category, 'E2E_NOTES_OFF_CATEGORY names no system-category with comments and footnotes off on this instance');

    await createPage(page, categoryPage, 'A page of a category without shared notes.');
    created.push(categoryPage);
    const uuid = await editFrontmatter(page, categoryPage, (fm) => fm.replace(/^system-category:.*$/m, `system-category: ${category}`));

    const tabs = await tabNames(page, categoryPage);
    expect(tabs).not.toContain('Comments');
    expect(tabs).not.toContain('Footnotes');

    const res = await page.request.post(`${await instanceOrigin(page)}/api/comments/${uuid}?page=${encodeURIComponent(categoryPage)}`, {
      headers: { Accept: 'application/json', 'X-CSRF-Token': await csrf(page) },
      data: { content: 'should not land' }
    });
    expect(res.status()).toBe(403);
  });
});
