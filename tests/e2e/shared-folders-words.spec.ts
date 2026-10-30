import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'fs';

/**
 * #2124, #2144 (epic #1775 decision 4) — the organization's shared-folders key
 * and recovery words on Admin → Backup: the key's fingerprint is shown; the
 * words are shown once with Download as a file and Print, saved only when all
 * 12 are typed back with "I have saved them" ticked (recorded as a consent),
 * and until the admin shown them confirms, administrators see a banner that
 * never holds them. A new set, with a fresh sign-in, is shown and typed back
 * the same way and replaces the old one.
 *
 * Making the words is once per site, so the steps that make them run only
 * with E2E_SHARED_FOLDERS_WORDS=1, on a throwaway instance. The banner step
 * raises the wording's version, so it also needs E2E_CONSENT_BUMP=1. Nothing
 * else is made, and nothing is left to delete: the words and the shipped
 * folders are the instance's own state.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

/** The 12 words on the words step. */
async function shownWords(page: Page): Promise<string[]> {
  await expect(page.locator('#shared-folders-words [data-word]')).toHaveCount(12);
  const words = (await page.locator('#shared-folders-words-copy').inputValue()).split(' ');
  expect(words).toHaveLength(12);
  return words;
}

/** Type `words` back on the confirm step. */
async function typeBack(page: Page, words: string[]): Promise<void> {
  for (let i = 0; i < words.length; i++) await page.fill(`#word${i + 1}`, words[i]);
}

/** A fresh sign-in, when the step-up asks for one (#1635). */
async function signInAgainIfAsked(page: Page): Promise<void> {
  if (new URL(page.url()).pathname !== '/auth/reauth') return;
  await page.fill('#reauthPassword', process.env.E2E_ADMIN_PASS || 'admin123');
  await page.getByRole('button', { name: 'Confirm with your password' }).click();
  await page.waitForURL((u) => u.pathname !== '/auth/reauth');
}

test.describe('Shared folders key and recovery words (#2124, #2144)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  test('Admin → Backup shows the shared-folders key\'s fingerprint, never the key', async ({ page }) => {
    await page.goto('/admin/backup');
    const card = page.locator('#shared-folders-key');
    await expect(card).toBeVisible();
    await expect(page.locator('#shared-folders-key-fingerprint')).toHaveText(/^[0-9a-f]{16}$/);
    await expect(page.locator('#shared-folders-unavailable')).toHaveCount(0);
  });

  test('the words: downloaded, printed, typed back; nothing saved without the tick or with wrong words; once saved the folders are made; a new set replaces them', async ({ page }) => {
    test.skip(process.env.E2E_SHARED_FOLDERS_WORDS !== '1', 'makes the site\'s shared-folders recovery words, once per site: set E2E_SHARED_FOLDERS_WORDS=1 on a throwaway instance');
    await page.goto('/admin/backup');
    await expect(page.locator('#shared-folders-words-none')).toBeVisible();

    // Shown once: 12 words, with Download and Print.
    await Promise.all([page.waitForURL(/\/admin\/backup\/shared-folders\/words$/), page.locator('#shared-folders-words-make button').click()]);
    const words = await shownWords(page);

    // Download as a file: the 12 numbered words, never kept on the server.
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download as a file' }).click()]);
    expect(download.suggestedFilename()).toMatch(/shared-folders-recovery-words\.txt$/);
    const text = fs.readFileSync(await download.path(), 'utf8');
    words.forEach((w, i) => expect(text).toContain(`${String(i + 1).padStart(2, ' ')}. ${w}`));
    expect(text).toContain('not stored on the server');

    // Print: a print view of the words only, in a new tab.
    const [printed] = await Promise.all([page.context().waitForEvent('page'), page.locator('form[action$="/words/print"] button').click()]);
    await printed.waitForLoadState();
    await expect(printed.locator('#recovery-words-print li')).toHaveCount(12);
    await expect(printed.locator('header, nav')).toHaveCount(0);
    await printed.close();

    // Type them back: the tick alone is not enough.
    await Promise.all([page.waitForURL(/\/words\/confirm$/), page.getByRole('link', { name: 'I have written them down' }).click()]);
    await expect(page.locator('#shared-folders-words [data-word]')).toHaveCount(0);
    await expect(page.locator('[data-recovery-words-consent]')).toContainText('only with these 12 words');
    const finish = page.getByRole('button', { name: 'I have saved them — finish' });

    // Without the tick, past the browser's own check: nothing saved, ask again.
    await typeBack(page, words);
    await page.locator('#recovery-words-saved').evaluate((el) => el.removeAttribute('required'));
    await finish.click();
    await expect(page.locator('#shared-folders-words-error')).toContainText('Nothing was saved');

    // Wrong words, ticked: nothing saved, say so, try again.
    await typeBack(page, [...words.slice(1), words[0]]);
    await page.check('#recovery-words-saved');
    await finish.click();
    await expect(page.locator('#shared-folders-words-error')).toContainText('not the ones shown');

    // The right words, ticked: saved, confirmed, and the shipped folders made.
    await typeBack(page, words);
    await page.check('#recovery-words-saved');
    await Promise.all([page.waitForURL(/\/admin\/backup\?success=/), finish.click()]);
    await expect(page.locator('#shared-folders-words-made')).toBeVisible();
    await expect(page.locator('#shared-folders-words-confirmed')).toBeVisible();
    await expect(page.locator('#shared-folders-words-make')).toHaveCount(0);
    await expect(page.locator('#shared-folders-list')).toContainText('/shared/default');
    await expect(page.locator('#shared-folders-list')).toContainText('/shared/executive');
    // The words are never on the page again.
    await expect(page.locator('body')).not.toContainText(words.join(' '));
    await expect(page.locator('[data-shared-folders-words-banner]')).toHaveCount(0);

    // A new set: a fresh sign-in, shown and typed back the same way.
    await page.locator('#shared-folders-words-new button').click();
    await signInAgainIfAsked(page);
    if (!/\/admin\/backup\/shared-folders\/words\/new$/.test(page.url())) {
      // Back from the fresh sign-in on Admin → Backup: ask again.
      await Promise.all([page.waitForURL(/\/words\/new$/), page.locator('#shared-folders-words-new button').click()]);
    }
    await expect(page.locator('#shared-folders-words-warning')).toContainText('the old words keep working');
    const next = await shownWords(page);
    expect(next).not.toEqual(words);
    await Promise.all([page.waitForURL(/\/words\/confirm$/), page.getByRole('link', { name: 'I have written them down' }).click()]);
    // The old words are not the new ones.
    await typeBack(page, words);
    await page.check('#recovery-words-saved');
    await finish.click();
    await expect(page.locator('#shared-folders-words-error')).toContainText('not the ones shown');
    await typeBack(page, next);
    await page.check('#recovery-words-saved');
    await Promise.all([page.waitForURL(/\/admin\/backup\?success=/), finish.click()]);
    await expect(page.locator('.alert-success')).toContainText('old words no longer open the shared folders');
    await expect(page.locator('#shared-folders-words-confirmed')).toBeVisible();

    test.skip(process.env.E2E_CONSENT_BUMP !== '1', 'raises the shared-folders recovery-words version: set E2E_CONSENT_BUMP=1 on a throwaway instance');

    await page.goto('/admin/edit-raw/shared-folders-recovery-words');
    const raw = await page.locator('#rawContent').inputValue();
    const current = Number(/^version:\s*'?(\d+)'?\s*$/m.exec(raw)?.[1]);
    expect(current).toBeGreaterThan(0);
    await page.locator('#rawContent').fill(raw.replace(/^version:.*$/m, `version: ${current + 1}`));
    await Promise.all([page.waitForURL(/\/view\//), page.getByRole('button', { name: /Save \(admin override\)/ }).click()]);

    // The banner on /admin, linking this admin to confirm; nothing is held.
    await page.goto('/admin');
    expect(new URL(page.url()).pathname).toBe('/admin');
    const banner = page.locator('[data-shared-folders-words-banner]');
    await expect(banner).toContainText('the only way to open its shared folders again');
    await page.goto('/profile');
    await expect(page.locator('[data-shared-folders-words-banner]')).toHaveCount(0);
    // The set protects folders, so it cannot be discarded; a new set replaces it.
    await page.goto('/admin/backup');
    await expect(page.locator('#shared-folders-words-unconfirmed')).toBeVisible();
    await expect(page.locator('#shared-folders-words-discard')).toHaveCount(0);
    await expect(page.locator('#shared-folders-words-new button')).toBeVisible();

    await page.goto('/admin');
    await Promise.all([page.waitForURL(/\/consent\?scope=shared-folders-recovery-words/), banner.getByRole('link', { name: 'I have saved them' }).click()]);
    await expect(page.locator('[data-consent-document="shared-folders-recovery-words"]')).toContainText(`Version ${current + 1}`);
    await page.check('#consent-accept');
    await Promise.all([page.waitForURL((u) => u.pathname === '/admin'), page.getByRole('button', { name: 'Confirm' }).click()]);
    await expect(page.locator('[data-shared-folders-words-banner]')).toHaveCount(0);
  });
});
