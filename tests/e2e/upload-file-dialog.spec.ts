/**
 * The Upload file dialog (#2149): opened from the user menu, it offers only
 * the places this user may upload to (FileManager's `placesWritableBy`), with
 * where they are working selected; the file goes through ICE, which cleans an
 * SVG's script before it is kept, and the dialog says what was removed.
 *
 * Runs as the suite's admin (holds asset-upload). The file it uploads is
 * deleted in afterAll through the file door; nothing else is touched.
 */
import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { TEST_PAGE_PREFIX } from './fixtures/helpers';

const NAME = `e2e-upload-${randomUUID().slice(0, 8)}.svg`;
const SCRIPTED_SVG = `<svg xmlns="http://www.w3.org/2000/svg"><title>${NAME}</title><script>alert(1)</script><rect width="4" height="4" onload="steal()"/></svg>`;
const uploadedIds: string[] = [];

async function csrfFrom(page: Page): Promise<string> {
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) throw new Error('no csrf token on the page');
  return token;
}

async function openDialog(page: Page): Promise<void> {
  await page.locator('#userDropdown').click();
  await page.locator('#userMenuUploadFile').click();
  await expect(page.locator('#uploadFileModal')).toBeVisible();
  // The places have loaded once the select is enabled.
  await expect(page.locator('#uploadFilePlace')).toBeEnabled();
}

test.describe('Upload file dialog (#2149)', () => {
  test.afterAll(async ({ browser }) => {
    if (uploadedIds.length === 0) return;
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const page = await context.newPage();
    await page.goto('/');
    for (const id of uploadedIds) {
      const res = await page.request.delete(`/attachments/${encodeURIComponent(id)}`, {
        headers: { 'X-CSRF-Token': await csrfFrom(page), Accept: 'application/json' }
      });
      expect(res.ok(), `deleting the uploaded test file answered ${res.status()}`).toBe(true);
    }
    await context.close();
  });

  test('Upload file is in the user menu, and not among the page actions', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#userMenuUploadFile')).toHaveText(/Upload file/);
    await expect(page.locator('text=Upload Attachment')).toHaveCount(0);
  });

  test('offers only the places the user may upload to, with no Private or Attach to this page', async ({ page }) => {
    await page.goto('/');
    await openDialog(page);
    const dialog = page.locator('#uploadFileModal');
    await expect(dialog.locator('.modal-title')).toHaveText(/Upload file/);
    await expect(dialog).not.toContainText(/Attach to this page|Private \(/);

    const offered = await page.request.get('/files/places?path=%2F', { headers: { Accept: 'application/json' } });
    const body = await offered.json() as { places: Array<{ key: string; label: string }>; defaultKey: string };
    expect(body.places.map(p => p.key)).toContain('public');
    // The select is exactly the server's offer, with its default selected.
    await expect(page.locator('#uploadFilePlace option')).toHaveText(body.places.map(p => p.label));
    await expect(page.locator('#uploadFilePlace')).toHaveValue(body.defaultKey);
  });

  test('a place the user was not offered is refused', async ({ page }) => {
    await page.goto('/');
    const res = await page.request.post('/files/upload', {
      headers: { 'X-CSRF-Token': await csrfFrom(page), Accept: 'application/json' },
      multipart: { place: 'vault:../someone-else', file: { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('x') } }
    });
    expect(res.status()).toBe(403);
  });

  test('an SVG with a script is cleaned, kept, and the user told what was removed', async ({ page }) => {
    await page.goto('/');
    await openDialog(page);
    await page.locator('#uploadFileInput').setInputFiles({ name: NAME, mimeType: 'image/svg+xml', buffer: Buffer.from(SCRIPTED_SVG) });
    await page.locator('#uploadFilePlace').selectOption('public');
    const answer = page.waitForResponse(r => r.url().endsWith('/files/upload') && r.request().method() === 'POST');
    await page.locator('#uploadFileSubmit').click();
    const result = await (await answer).json() as { success: boolean; attachmentId: string; url: string; cleaned: string[] };
    expect(result.success).toBe(true);
    uploadedIds.push(result.attachmentId);

    const status = page.locator('#uploadFileStatus');
    await expect(status).toContainText(`Uploaded ${NAME} to Public files.`);
    await expect(status).toContainText('This file was cleaned before it was kept:');
    await expect(status).toContainText('removed 1 script element');
    await expect(status).toContainText('removed 1 event handler');
    await expect(status.locator('code')).toHaveText(`[{ATTACH src='${NAME}'}]`);

    const kept = await page.request.get(result.url);
    expect(kept.ok()).toBe(true);
    const text = await kept.text();
    expect(text).not.toMatch(/<script|onload|steal/i);
    expect(text).toContain('<rect');
  });

  test('from the editor: the Upload button opens the same dialog, and Insert into page puts the link at the cursor', async ({ page }) => {
    // A new page's editor; nothing is saved.
    await page.goto(`/edit/${encodeURIComponent(`${TEST_PAGE_PREFIX}-UploadDialog-${Date.now()}`)}`);
    await page.locator('textarea[name="content"]').fill('Before. ');
    await page.locator('button[onclick="showUploadFile()"]').click();
    await expect(page.locator('#uploadFilePlace')).toBeEnabled();
    const name = `e2e-upload-${randomUUID().slice(0, 8)}.txt`;
    await page.locator('#uploadFileInput').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(`plain text ${name}`) });
    const answer = page.waitForResponse(r => r.url().endsWith('/files/upload') && r.request().method() === 'POST');
    await page.locator('#uploadFileSubmit').click();
    const result = await (await answer).json() as { success: boolean; attachmentId: string; cleaned: string[] };
    expect(result.success).toBe(true);
    uploadedIds.push(result.attachmentId);
    // Nothing to clean in plain text: no cleaning notice.
    expect(result.cleaned).toEqual([]);
    await expect(page.locator('#uploadFileStatus')).not.toContainText('cleaned');

    await page.locator('#uploadFileStatus button', { hasText: 'Insert into page' }).click();
    await expect(page.locator('#uploadFileModal')).toBeHidden();
    await expect(page.locator('textarea[name="content"]')).toHaveValue(new RegExp(`\\[\\{ATTACH src='${name.replace('.', '\\.')}'\\}\\]`));
  });
});
