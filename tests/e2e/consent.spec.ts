import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { deletePage, markTestArtifact, signInWithPassword } from './fixtures/helpers';

/**
 * #1603 — the site's terms: accepted at sign-up, asked at the first sign-in
 * of an account that has not accepted them, and asked again at sign-in after
 * the version changes. A user signed in when it changes sees a banner on
 * every page until they accept (#2027). The profile's "Your consents" shows
 * each acceptance.
 *
 * Its own project, last in the run (playwright.config.ts): raising the terms
 * version asks every account again at its next sign-in. That step runs only
 * with E2E_CONSENT_BUMP=1, because on a real instance it would ask every
 * person there to accept again; run it on a throwaway instance.
 *
 * Everything this spec makes is its own: test accounts, each deleted at the
 * end. Passwords are generated per run.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });

const RUN = randomUUID().slice(0, 8);

async function csrfFrom(page: Page): Promise<string> {
  if (!(await page.locator('meta[name="csrf-token"]').count())) await page.goto('/');
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) throw new Error('no csrf token on the page');
  return token;
}

async function deleteAccount(admin: Page, username: string): Promise<void> {
  await admin.request.delete(`/admin/users/${encodeURIComponent(username)}`, {
    headers: { 'X-CSRF-Token': await csrfFrom(admin), Accept: 'application/json' }
  });
}

async function freshContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

/** The status of one document in "Your consents": its data attributes and its text. */
async function consentStatus(page: Page, id: string): Promise<{ accepted: string | null; text: string }> {
  await page.goto('/profile');
  const row = page.locator(`[data-consent-status="${id}"]`);
  await expect(row).toHaveCount(1);
  return { accepted: await row.getAttribute('data-consent-accepted'), text: (await row.innerText()).replace(/\s+/g, ' ') };
}

/** Sign in without accepting anything: where the sign-in landed. */
async function signInOnly(page: Page, username: string, password: string): Promise<URL> {
  await signInWithPassword(page, username, password, { acceptTerms: false });
  return new URL(page.url());
}

test.describe('Terms of service and privacy policy (#1603)', () => {
  // One at a time: the version bump below would otherwise ask the other tests' accounts again mid-test.
  test.describe.configure({ mode: 'serial' });

  test('sign-up accepts the terms; the first sign-in asks nothing; the profile shows the record', async ({ page: admin, browser }) => {
    const username = `e2e-con-${RUN}`;
    const password = `pw-${randomUUID()}`;
    const { context, page } = await freshContext(browser);
    try {
      await page.goto('/register');
      test.skip((await page.locator('form[action="/register"]').count()) === 0, 'password registration is off on this instance');
      const terms = page.locator('[data-consent-terms]');
      await expect(terms).toBeVisible();
      await expect(terms.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/view/terms-of-service');
      await expect(terms.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/view/privacy-policy');

      await page.fill('#username', username);
      await page.fill('#email', `${username}@example.test`);
      await page.fill('#displayName', username);
      await page.fill('#password', password);
      await page.fill('#confirmPassword', password);
      await page.check('#acceptTerms');
      await Promise.all([page.waitForURL(/\/login\?success/), page.getByRole('button', { name: 'Register' }).click()]);
      // #2008: a self-registered account cannot be a test account, so its
      // profile is not stamped for it: mark it here, and delete it below
      // (deleting an ordinary account keeps its profile page).
      await markTestArtifact(admin, `Profile: ${username}`);

      const landed = await signInOnly(page, username, password);
      expect(landed.pathname).not.toBe('/consent');

      const tos = await consentStatus(page, 'terms-of-service');
      expect(tos.accepted).toBe('yes');
      expect(tos.text).toMatch(/version \d+/);
      expect(tos.text).toContain('Accepted');
      expect((await consentStatus(page, 'privacy-policy')).accepted).toBe('yes');
    } finally {
      await context.close();
      await deleteAccount(admin, username);
      // 404 is fine: registration is off, or it failed before the page was made.
      await deletePage(admin, `Profile: ${username}`);
    }
  });

  test('an account that has not accepted is asked at sign-in, can go nowhere else, and is recorded once it accepts', async ({ page: admin, browser }) => {
    const username = `e2e-ask-${RUN}`;
    const password = `pw-${randomUUID()}`;
    const made = await admin.request.post('/admin/users', {
      form: { _csrf: await csrfFrom(admin), username, email: `${username}@example.test`, displayName: username, password, roles: 'reader', isTest: 'true' }
    });
    expect(made.url()).not.toContain('error=');
    const { context, page } = await freshContext(browser);
    try {
      const landed = await signInOnly(page, username, password);
      expect(landed.pathname).toBe('/consent');
      await expect(page.locator('[data-consent-document="terms-of-service"]')).toBeVisible();
      await expect(page.locator('[data-consent-document="privacy-policy"]')).toBeVisible();

      // Held to the prompt: another page sends it back, with where it was going.
      await page.goto('/profile');
      expect(new URL(page.url()).pathname).toBe('/consent');
      // The documents themselves stay readable.
      await page.goto('/view/terms-of-service');
      expect(new URL(page.url()).pathname).toBe('/view/terms-of-service');

      await page.goto('/consent?returnTo=%2Fprofile');
      await page.check('#consent-accept');
      await Promise.all([page.waitForURL(/\/profile/), page.getByRole('button', { name: 'Accept and continue' }).click()]);
      expect((await consentStatus(page, 'terms-of-service')).accepted).toBe('yes');

      // The next sign-in asks nothing.
      const again = await freshContext(browser);
      try {
        expect((await signInOnly(again.page, username, password)).pathname).not.toBe('/consent');
      } finally {
        await again.context.close();
      }
    } finally {
      await context.close();
      await deleteAccount(admin, username);
    }
  });

  test('a version change asks again at the next sign-in, for the changed document only; a user already signed in sees the banner (#2027)', async ({ page: admin, browser }) => {
    test.skip(process.env.E2E_CONSENT_BUMP !== '1', 'raises the terms version, asking every account again: set E2E_CONSENT_BUMP=1 on a throwaway instance');
    const username = `e2e-bump-${RUN}`;
    const password = `pw-${randomUUID()}`;
    const made = await admin.request.post('/admin/users', {
      form: { _csrf: await csrfFrom(admin), username, email: `${username}@example.test`, displayName: username, password, roles: 'reader', isTest: 'true' }
    });
    expect(made.url()).not.toContain('error=');
    // #2027: a second account, signed in before the change and still signed in after it.
    const early = `e2e-early-${RUN}`;
    const earlyPassword = `pw-${randomUUID()}`;
    const madeEarly = await admin.request.post('/admin/users', {
      form: { _csrf: await csrfFrom(admin), username: early, email: `${early}@example.test`, displayName: early, password: earlyPassword, roles: 'reader', isTest: 'true' }
    });
    expect(madeEarly.url()).not.toContain('error=');
    let earlySession: { context: BrowserContext; page: Page } | null = null;
    try {
      const first = await freshContext(browser);
      await signInWithPassword(first.page, username, password);
      const before = await consentStatus(first.page, 'terms-of-service');
      expect(before.accepted).toBe('yes');
      await first.context.close();

      earlySession = await freshContext(browser);
      await signInWithPassword(earlySession.page, early, earlyPassword);
      await earlySession.page.goto('/profile');
      await expect(earlySession.page.locator('[data-consent-banner]')).toHaveCount(0);

      // An administrator raises the version with the raw editor (an ordinary edit would not).
      await admin.goto('/admin/edit-raw/terms-of-service');
      const raw = await admin.locator('#rawContent').inputValue();
      const current = Number(/^version:\s*'?(\d+)'?\s*$/m.exec(raw)?.[1]);
      expect(current).toBeGreaterThan(0);
      await admin.locator('#rawContent').fill(raw.replace(/^version:.*$/m, `version: ${current + 1}`));
      await Promise.all([admin.waitForURL(/\/view\//), admin.getByRole('button', { name: /Save \(admin override\)/ }).click()]);

      const second = await freshContext(browser);
      try {
        expect((await signInOnly(second.page, username, password)).pathname).toBe('/consent');
        await expect(second.page.locator('[data-consent-document="terms-of-service"]')).toContainText(`Version ${current + 1}`);
        // #2027: held, a request that is not a page is told what to accept and where.
        const refused = await second.page.request.get('/profile', { headers: { Accept: 'application/json' } });
        expect(refused.status()).toBe(403);
        const said = await refused.json() as { error: string; consent: string };
        expect(said.error).toBe(`You have terms to accept: Terms of Service, version ${current + 1}.`);
        expect(said.consent).toMatch(/^\/consent\?returnTo=/);
        await expect(second.page.locator('[data-consent-document="privacy-policy"]')).toHaveCount(0);
        await second.page.check('#consent-accept');
        await Promise.all([second.page.waitForURL((u) => u.pathname !== '/consent'), second.page.getByRole('button', { name: 'Accept and continue' }).click()]);
        const after = await consentStatus(second.page, 'terms-of-service');
        expect(after.accepted).toBe('yes');
        expect(after.text).toContain(`version ${current + 1}`);
      } finally {
        await second.context.close();
      }

      // #2027: still signed in from before the change, the banner says what changed on every page, and its link accepts and comes back.
      const { page } = earlySession;
      await page.goto('/profile');
      expect(new URL(page.url()).pathname).toBe('/profile');
      const banner = page.locator('[data-consent-banner]');
      await expect(banner).toContainText(`Terms of Service, version ${current + 1}`);
      await expect(banner.getByRole('link', { name: 'Read and accept' })).toHaveAttribute('href', '/consent?returnTo=%2Fprofile');
      await page.goto('/');
      await expect(page.locator('[data-consent-banner]')).toBeVisible();
      await page.goto('/profile');
      await Promise.all([page.waitForURL(/\/consent\?/), page.locator('[data-consent-banner]').getByRole('link', { name: 'Read and accept' }).click()]);
      await page.check('#consent-accept');
      await Promise.all([page.waitForURL((u) => u.pathname === '/profile'), page.getByRole('button', { name: 'Accept and continue' }).click()]);
      await expect(page.locator('[data-consent-banner]')).toHaveCount(0);
    } finally {
      await earlySession?.context.close();
      await deleteAccount(admin, username);
      await deleteAccount(admin, early);
    }
  });
});
