import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { signInWithPassword } from './fixtures/helpers';

/**
 * #1928 — "I've saved my recovery words": asked where the words are shown
 * (the encrypted vault's door, when a user's keys are first made), recorded
 * as a consent, and, for a user with an encrypted vault who has not
 * confirmed the current wording, reminded by a banner that never holds them.
 *
 * Needs an encrypted vault kind: runs only when E2E_SEALED_VAULT names a
 * system-category vault with `encrypt: true` in the instance's config. The
 * banner step raises the recovery-words page's version, which asks every
 * user with an encrypted vault again, so it runs only with
 * E2E_CONSENT_BUMP=1, on a throwaway instance.
 *
 * Everything it makes is its own: one test account, marked as one and
 * deleted at the end. Passwords are generated per run.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

const VAULT = process.env.E2E_SEALED_VAULT ?? '';
const RUN = randomUUID().slice(0, 8);

async function csrfFrom(page: Page): Promise<string> {
  if (!(await page.locator('meta[name="csrf-token"]').count())) await page.goto('/');
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) throw new Error('no csrf token on the page');
  return token;
}

async function freshContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

async function typeWords(page: Page, words: string[]): Promise<void> {
  for (let i = 0; i < words.length; i++) await page.fill(`#word${i + 1}`, words[i]);
}

test.describe('Save your recovery words (#1928)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120000);

  test('the door does not finish without the tick; once ticked it is recorded and no reminder shows; a new wording version brings the reminder back, naming the vault, until confirmed', async ({ page: admin, browser }) => {
    test.skip(!VAULT, 'needs an encrypted vault kind: set E2E_SEALED_VAULT to its id');
    const username = `e2e-rw-${RUN}`;
    const password = `pw-${randomUUID()}`;
    const made = await admin.request.post('/admin/users', {
      form: { _csrf: await csrfFrom(admin), username, email: `${username}@example.test`, displayName: username, password, roles: 'reader', isTest: 'true' }
    });
    expect(made.url()).not.toContain('error=');
    const { context, page } = await freshContext(browser);
    try {
      await signInWithPassword(page, username, password);
      await page.goto('/profile');
      await expect(page.locator('[data-recovery-words-banner]')).toHaveCount(0);

      // The door: password again, then the words, once.
      await page.goto(`/stores/${VAULT}`);
      await page.fill('#door-password', password);
      await page.getByRole('button', { name: 'Continue' }).click();
      const words = (await page.locator('#door-words').inputValue()).split(' ');
      expect(words).toHaveLength(12);
      await page.getByRole('link', { name: 'I have written them down' }).click();
      await expect(page.locator('[data-recovery-words-consent]')).toContainText('Nobody, not even an administrator, can open them');

      // Without the tick the step does not finish, even past the browser's own check.
      await typeWords(page, words);
      await page.locator('#recovery-words-saved').evaluate((el) => el.removeAttribute('required'));
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.locator('.alert-danger')).toContainText('Nothing has been saved yet');
      await expect(page.locator('#word1')).toBeVisible();

      // Ticked, it finishes.
      await typeWords(page, words);
      await page.check('#recovery-words-saved');
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.locator('.card-body')).toContainText('is ready');

      // Recorded: no reminder on the profile or the vault's door.
      await page.goto('/profile');
      await expect(page.locator('[data-recovery-words-banner]')).toHaveCount(0);
      await page.goto(`/stores/${VAULT}`);
      await expect(page.locator('[data-recovery-words-banner]')).toHaveCount(0);

      test.skip(process.env.E2E_CONSENT_BUMP !== '1', 'raises the recovery-words version, asking every user with an encrypted vault again: set E2E_CONSENT_BUMP=1 on a throwaway instance');

      // An administrator raises the wording's version with the raw editor.
      await admin.goto('/admin/edit-raw/recovery-words');
      const raw = await admin.locator('#rawContent').inputValue();
      const current = Number(/^version:\s*'?(\d+)'?\s*$/m.exec(raw)?.[1]);
      expect(current).toBeGreaterThan(0);
      await admin.locator('#rawContent').fill(raw.replace(/^version:.*$/m, `version: ${current + 1}`));
      await Promise.all([admin.waitForURL(/\/view\//), admin.getByRole('button', { name: /Save \(admin override\)/ }).click()]);

      // The reminder: on the profile and the vault's door, naming the vault; nothing is held.
      await page.goto('/profile');
      expect(new URL(page.url()).pathname).toBe('/profile');
      const banner = page.locator('[data-recovery-words-banner]');
      await expect(banner).toContainText(`"${VAULT}"`);
      await expect(banner).toContainText('without them those files are lost for good');
      await page.goto(`/stores/${VAULT}`);
      await expect(page.locator('[data-recovery-words-banner]')).toBeVisible();
      // On the home page too; not on an ordinary page.
      await page.goto('/');
      await expect(page.locator('[data-recovery-words-banner]')).toBeVisible();
      await page.goto('/my/edits');
      await expect(page.locator('[data-recovery-words-banner]')).toHaveCount(0);

      // Confirming from the banner clears it.
      await page.goto('/profile');
      await Promise.all([page.waitForURL(/\/consent\?scope=recovery-words/), banner.getByRole('link', { name: 'I have saved them' }).click()]);
      await expect(page.locator(`[data-recovery-words-vault="${VAULT}"]`)).toBeVisible();
      await expect(page.locator('[data-consent-document="recovery-words"]')).toContainText(`Version ${current + 1}`);
      await page.check('#consent-accept');
      await Promise.all([page.waitForURL((u) => u.pathname === '/profile'), page.getByRole('button', { name: 'Confirm' }).click()]);
      await expect(page.locator('[data-recovery-words-banner]')).toHaveCount(0);
    } finally {
      await context.close();
      await admin.request.delete(`/admin/users/${encodeURIComponent(username)}`, {
        headers: { 'X-CSRF-Token': await csrfFrom(admin), Accept: 'application/json' }
      });
    }
  });
});
