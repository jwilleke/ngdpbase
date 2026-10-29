import { test, expect } from '@playwright/test';

/**
 * #2124 (epic #1775 decision 4) — the organization's shared-folders key and
 * recovery words on Admin → Backup: the key's fingerprint is shown; the words
 * are shown once, saved only with "I have saved them" (recorded as a
 * consent), and until the admin shown them confirms, administrators see a
 * banner that never holds them.
 *
 * Making the words is once per site (a second set is refused), so the step
 * that makes them runs only with E2E_SHARED_FOLDERS_WORDS=1, on a throwaway
 * instance. The banner step raises the wording's version, so it also needs
 * E2E_CONSENT_BUMP=1. Nothing else is made, and nothing is left to delete:
 * the words are the instance's own state.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

test.describe('Shared folders key and recovery words (#2124)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  test('Admin → Backup shows the shared-folders key\'s fingerprint, never the key', async ({ page }) => {
    await page.goto('/admin/backup');
    const card = page.locator('#shared-folders-key');
    await expect(card).toBeVisible();
    await expect(page.locator('#shared-folders-key-fingerprint')).toHaveText(/^[0-9a-f]{16}$/);
    await expect(page.locator('#shared-folders-unavailable')).toHaveCount(0);
  });

  test('the words are not saved without the tick; once ticked they are saved and confirmed, and no banner shows; a new wording version brings the banner back until confirmed', async ({ page }) => {
    test.skip(process.env.E2E_SHARED_FOLDERS_WORDS !== '1', 'makes the site\'s shared-folders recovery words, once per site: set E2E_SHARED_FOLDERS_WORDS=1 on a throwaway instance');
    await page.goto('/admin/backup');
    await expect(page.locator('#shared-folders-words-none')).toBeVisible();

    // Shown once: 12 words, with the tick.
    await Promise.all([page.waitForURL(/\/admin\/backup\/shared-folders\/words$/), page.locator('#shared-folders-words-make button').click()]);
    await expect(page.locator('#shared-folders-words [data-word]')).toHaveCount(12);
    await expect(page.locator('[data-recovery-words-consent]')).toContainText('only with these 12 words');

    // Without the tick, past the browser's own check: nothing saved, the words discarded.
    await page.locator('#recovery-words-saved').evaluate((el) => el.removeAttribute('required'));
    await Promise.all([page.waitForURL(/\/admin\/backup\?error=/), page.getByRole('button', { name: 'Save the recovery words' }).click()]);
    await expect(page.locator('#shared-folders-words-none')).toBeVisible();

    // A new set, ticked: saved, made by this admin, confirmed.
    await Promise.all([page.waitForURL(/\/admin\/backup\/shared-folders\/words$/), page.locator('#shared-folders-words-make button').click()]);
    const words = await page.locator('#shared-folders-words-copy').inputValue();
    expect(words.split(' ')).toHaveLength(12);
    await page.check('#recovery-words-saved');
    await Promise.all([page.waitForURL(/\/admin\/backup\?success=/), page.getByRole('button', { name: 'Save the recovery words' }).click()]);
    await expect(page.locator('#shared-folders-words-made')).toBeVisible();
    await expect(page.locator('#shared-folders-words-confirmed')).toBeVisible();
    await expect(page.locator('#shared-folders-words-make')).toHaveCount(0);
    // The words are never on the page again.
    await expect(page.locator('body')).not.toContainText(words);
    await expect(page.locator('[data-shared-folders-words-banner]')).toHaveCount(0);

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
    // While unconfirmed (and protecting no folder), any admin may discard the set and make a new one.
    await page.goto('/admin/backup');
    await expect(page.locator('#shared-folders-words-unconfirmed')).toBeVisible();
    await expect(page.locator('#shared-folders-words-discard button')).toBeVisible();

    await page.goto('/admin');
    await Promise.all([page.waitForURL(/\/consent\?scope=shared-folders-recovery-words/), banner.getByRole('link', { name: 'I have saved them' }).click()]);
    await expect(page.locator('[data-consent-document="shared-folders-recovery-words"]')).toContainText(`Version ${current + 1}`);
    await page.check('#consent-accept');
    await Promise.all([page.waitForURL((u) => u.pathname === '/admin'), page.getByRole('button', { name: 'Confirm' }).click()]);
    await expect(page.locator('[data-shared-folders-words-banner]')).toHaveCount(0);
  });
});
