import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { deletePage } from './fixtures/helpers';

/**
 * #1979 — /admin/import keeps working exactly as before now that today's
 * converters (JSPWiki, HTML, Markdown, DOCX) run as ICE shims into pages.
 *
 * The folder import reads a directory on the server. This spec writes one file
 * of each format into its own mkdtemp directory (the server is on this
 * machine), previews it, imports it through the page's own buttons, opens each
 * page, then deletes the pages it made and its own directory — nothing else.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

const RUN = randomUUID().slice(0, 8);
const TITLES = {
  markdown: `E2E Import Markdown ${RUN}`,
  html: `E2E Import HTML ${RUN}`,
  jspwiki: `E2E Import JSPWiki ${RUN}`,
  docx: `E2E Import DOCX ${RUN}`
};

let sourceDir = '';

test.describe('Admin folder import (#1979: converters as ICE shims)', () => {
  // The second test imports the folder the first one made, in the same worker.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-admin-import-'));
    fs.writeFileSync(path.join(sourceDir, `${TITLES.markdown}.md`), `# Markdown heading\n\nMarkdown body ${RUN}.\n`);
    fs.writeFileSync(
      path.join(sourceDir, `${TITLES.html}.html`),
      `<html><head><title>${TITLES.html}</title></head><body><h1>HTML heading</h1><p>HTML body ${RUN}.</p></body></html>`
    );
    // JSPWiki names encode spaces as '+'.
    fs.writeFileSync(path.join(sourceDir, `${TITLES.jspwiki.replace(/ /g, '+')}.txt`), `!!! JSPWiki heading\n\nJSPWiki body __${RUN}__.\n`);
    fs.copyFileSync(path.join(process.cwd(), 'src/converters/__tests__/fixtures/sample.docx'), path.join(sourceDir, `${TITLES.docx}.docx`));
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage({ storageState: './tests/e2e/.auth/user.json' });
    try {
      for (const title of Object.values(TITLES)) {
        await deletePage(page, title).catch(() => undefined);
      }
    } finally {
      await page.close();
      // Only this spec's own temporary directory.
      if (sourceDir.startsWith(path.join(os.tmpdir(), 'e2e-admin-import-'))) fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  test('preview, import, and open one page of each format', async ({ page }) => {
    await page.goto('/admin/import');
    await expect(page.locator('#import-form')).toBeVisible();
    // Every converter is still offered as a format.
    for (const formatId of ['jspwiki', 'html', 'markdown', 'docx']) {
      await expect(page.locator(`#format option[value="${formatId}"]`)).toHaveCount(1);
    }

    await page.locator('#sourceDir').fill(sourceDir);
    await page.locator('#preview-btn').click();
    await expect(page.locator('#preview-results')).toBeVisible();
    await expect(page.locator('#preview-count')).toHaveText('4 files');

    page.once('dialog', (dialog) => { void dialog.accept(); });
    await expect(page.locator('#execute-btn')).toBeEnabled();
    await page.locator('#execute-btn').click();
    await expect(page.locator('#import-results')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#result-converted')).toHaveText('4');
    await expect(page.locator('#result-failed')).toHaveText('0');

    const bodies: Record<keyof typeof TITLES, RegExp> = {
      markdown: new RegExp(`Markdown body ${RUN}`),
      html: new RegExp(`HTML body ${RUN}`),
      jspwiki: new RegExp(`JSPWiki body\\s+${RUN}`),
      docx: /\S/
    };
    for (const [format, title] of Object.entries(TITLES) as Array<[keyof typeof TITLES, string]>) {
      const res = await page.goto(`/view/${encodeURIComponent(title)}`);
      expect(res?.status(), `${format} page ${title}`).toBe(200);
      await expect(page.locator('#pagecontent, .page-content, main').first()).toContainText(bodies[format]);
    }
  });

  test('importing the same folder again skips every page as a duplicate', async ({ page }) => {
    await page.goto('/admin/import');
    await page.locator('#sourceDir').fill(sourceDir);
    await page.locator('#preview-btn').click();
    await expect(page.locator('#preview-count')).toHaveText('4 files');
    page.once('dialog', (dialog) => { void dialog.accept(); });
    await page.locator('#execute-btn').click();
    await expect(page.locator('#import-results')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#result-converted')).toHaveText('0');
    await expect(page.locator('#result-skipped')).toHaveText('4');
  });
});
