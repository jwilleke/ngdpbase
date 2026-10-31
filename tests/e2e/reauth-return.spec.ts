import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, CDPSession, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { signInWithPassword } from './fixtures/helpers';

/**
 * #2145 — after "Confirm it is you" with a passkey the browser goes where the
 * step-up said, and never stalls there. A download (Admin → Backup → Download
 * .env) used to name the file itself: the passkey succeeded, the browser saved
 * the file, and the page stayed on the prompt with its button greyed. Now a
 * download and a script's request come back to the page they were started
 * from, which says "Confirmed — you can do it now"; a page GET opens the page;
 * a form POST is sent again by itself, once (#2154); a failure is shown and
 * the button works again.
 *
 * Its own project, after maintenance and before consent (playwright.config.ts).
 * The tests that wait for a sign-in to go stale shorten the site's step-up
 * window (`ngdpbase.auth.step-up.max-age-minutes`) for the time they run, then
 * put it back, so they run only with E2E_STEP_UP_WINDOW=1 (CI sets it): on a
 * real instance it would ask everyone there to confirm again. Run them on a
 * throwaway instance.
 *
 * Everything this spec makes is its own: a test account holding admin, with a
 * passkey on a virtual authenticator, deleted at the end.
 */

test.use({ storageState: './tests/e2e/.auth/user.json' });
test.describe.configure({ mode: 'serial' });

const RUN = randomUUID().slice(0, 8);
const USERNAME = `e2e-reauth-${RUN}`;
const PASSWORD = `pw-${randomUUID()}`;
const STEP_UP_KEY = 'ngdpbase.auth.step-up';
/** The shortened window, and how long to wait for a sign-in to go stale under it. */
const SHORT_MINUTES = 0.15;
const STALE_MS = SHORT_MINUTES * 60_000 + 2_000;

async function csrfFrom(page: Page): Promise<string> {
  if (!(await page.locator('meta[name="csrf-token"]').count())) await page.goto('/');
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!token) throw new Error('no csrf token on the page');
  return token;
}

let person: { context: BrowserContext; page: Page; cdp: CDPSession } | null = null;

/** The test account's browser, signed in with its passkey in beforeAll. */
function me(): { context: BrowserContext; page: Page; cdp: CDPSession } {
  if (!person) throw new Error('the test account did not sign in (beforeAll)');
  return person;
}

/** A test account holding admin, signed in with a passkey from a virtual authenticator. */
async function signInWithPasskey(browser: Browser): Promise<{ context: BrowserContext; page: Page; cdp: CDPSession }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, acceptDownloads: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true }
  });
  await signInWithPassword(page, USERNAME, PASSWORD);
  await page.goto('/profile');
  await page.fill('#passkey-label', `e2e-reauth-${RUN}`);
  await page.locator('[data-passkey-enrol]').click();
  await page.waitForURL(/\/profile\?success=Passkey/);
  await page.goto('/logout');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/login');
  await page.locator('[data-passkey-signin]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
  return { context, page, cdp };
}

/** Press "Confirm with a passkey" on the prompt the page is on. */
async function confirmWithPasskey(page: Page): Promise<void> {
  const button = page.locator('[data-passkey-reauth]');
  await expect(button).toBeVisible();
  await button.click();
}

const noted = (page: Page) => page.locator('[data-step-up-confirmed]');

test.beforeAll(async ({ browser }) => {
  const admin = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
  const adminPage = await admin.newPage();
  const made = await adminPage.request.post('/admin/users', {
    form: { _csrf: await csrfFrom(adminPage), username: USERNAME, email: `${USERNAME}@example.test`, displayName: USERNAME, password: PASSWORD, roles: 'admin', isTest: 'true' }
  });
  expect(made.ok()).toBe(true);
  expect(made.url()).not.toContain('error=');
  await admin.close();
  person = await signInWithPasskey(browser);
});

test.afterAll(async ({ browser }) => {
  await person?.context.close();
  const admin = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
  const adminPage = await admin.newPage();
  const removed = await adminPage.request.delete(`/admin/users/${encodeURIComponent(USERNAME)}`, {
    headers: { 'X-CSRF-Token': await csrfFrom(adminPage), Accept: 'application/json' }
  });
  await admin.close();
  expect(removed.status()).toBe(200);
});

test.describe('Coming back from "Confirm it is you" (#2145)', () => {
  test('a page GET opens the page itself, with no note', async () => {
    const page = me().page;
    await page.goto('/auth/reauth?next=%2Fadmin%2Fbackup%2Fkey');
    await confirmWithPasskey(page);
    await page.waitForURL(/\/admin\/backup\/key$/);
    await expect(noted(page)).toHaveCount(0);
  });

  test('an answer that is not the confirmation is shown, and the button works again', async () => {
    const page = me().page;
    await page.route('**/auth/passkey/reauth/verify', (route) => route.fulfill({ status: 500, contentType: 'text/plain', body: 'Session save failed' }));
    try {
      await page.goto('/auth/reauth?next=%2Fadmin%2Fbackup');
      await confirmWithPasskey(page);
      await expect(page.locator('#reauth-passkey-error')).toHaveText('The server answered 500. Try again.');
      await expect(page.locator('[data-passkey-reauth]')).toBeEnabled();
      expect(new URL(page.url()).pathname).toBe('/auth/reauth');
    } finally {
      await page.unroute('**/auth/passkey/reauth/verify');
    }
  });

  test.describe('after the sign-in goes stale', () => {
    let original: string | null = null;

    /** Set the step-up window; the session must be fresh, which a confirmation just made it. */
    async function setWindow(page: Page, value: string): Promise<void> {
      const saved = await page.request.post('/admin/configuration', {
        headers: { 'X-CSRF-Token': await csrfFrom(page), 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
        form: { property: STEP_UP_KEY, value }
      });
      expect(saved.status(), await saved.text()).toBe(200);
    }

    test.beforeAll(async () => {
      test.skip(process.env.E2E_STEP_UP_WINDOW !== '1', 'shortens the site\'s step-up window: only with E2E_STEP_UP_WINDOW=1, on a throwaway instance');
      const page = me().page;
      await page.goto('/admin/configuration');
      original = await page.locator(`form:has(input[name="property"][value="${STEP_UP_KEY}"]) input[name="value"]`).first().inputValue();
      const current = JSON.parse(original) as Record<string, unknown>;
      await setWindow(page, JSON.stringify({ ...current, 'max-age-minutes': SHORT_MINUTES }));
    });

    test.afterAll(async () => {
      if (original === null || !person) return;
      // Stale by now under the short window: confirm once more, then put it back at once.
      const page = person.page;
      await page.goto('/auth/reauth?next=%2Fprofile');
      await confirmWithPasskey(page);
      await page.waitForURL(/\/profile$/);
      await setWindow(page, original);
    });

    test('Download .env comes back to Admin → Backup, which says it can be done now — not a stall on the prompt', async () => {
      const page = me().page;
      const downloads: string[] = [];
      page.on('download', (d) => downloads.push(d.suggestedFilename()));
      await page.goto('/admin/backup');
      await page.waitForTimeout(STALE_MS);
      await page.locator('#backup-env-download').click();
      await page.waitForURL(/\/auth\/reauth\?/);
      expect(new URL(page.url()).searchParams.get('next')).toBe('/admin/backup');
      await confirmWithPasskey(page);
      await page.waitForURL(/\/admin\/backup$/, { timeout: 10000 });
      await expect(noted(page)).toHaveText(/Confirmed — you can do it now\./);
      expect(downloads).toEqual([]);
      page.removeAllListeners('download');
      // Said once: the next page view has no note.
      await page.reload();
      await expect(noted(page)).toHaveCount(0);
    });

    test('a form POST carries on by itself after the passkey, once (#2154)', async () => {
      const page = me().page;
      const renamed = `e2e-reauth-renamed-${RUN}`;
      await page.goto('/profile');
      await page.waitForTimeout(STALE_MS);
      const form = page.locator(`form[action$="/rename"]:has(input[name="label"][value="e2e-reauth-${RUN}"])`);
      await form.locator('input[name="label"]').fill(renamed);
      await form.locator('button[type="submit"]').click();
      await page.waitForURL(/\/auth\/reauth\?/);
      const next = new URL(page.url()).searchParams.get('next') ?? '';
      expect(next).toMatch(/^\/auth\/reauth\/continue\?replay=[0-9a-f]{32}$/);
      await confirmWithPasskey(page);
      // No second press: the continue page posts the form, and the rename is done.
      await page.waitForURL(/\/profile\?success=Renamed$/, { timeout: 10000 });
      await expect(page.locator(`input[name="label"][value="${renamed}"]`)).toHaveCount(1);
      await expect(noted(page)).toHaveCount(0);
      // Single-use: the same continue address again redoes nothing.
      const again = await page.goto(next);
      expect(again?.status()).toBe(410);
    });

    test('the same button in two tabs: confirming the first prompt carries out its own POST, then the second\'s (#2176)', async () => {
      const { context, page } = me();
      const second = await context.newPage();
      try {
        const rename = (p: Page) => p.locator('form[action$="/rename"]:has(input[name="label"][value^="e2e-reauth-"])').first();
        const first = `e2e-reauth-tab1-${RUN}`;
        const other = `e2e-reauth-tab2-${RUN}`;
        await page.goto('/profile');
        await second.goto('/profile');
        await page.waitForTimeout(STALE_MS);
        // Tab 1 presses, then tab 2 presses the same button: two prompts.
        await rename(page).locator('input[name="label"]').fill(first);
        await rename(page).locator('button[type="submit"]').click();
        await page.waitForURL(/\/auth\/reauth\?/);
        const firstNext = new URL(page.url()).searchParams.get('next') ?? '';
        await rename(second).locator('input[name="label"]').fill(other);
        await rename(second).locator('button[type="submit"]').click();
        await second.waitForURL(/\/auth\/reauth\?/);
        const secondNext = new URL(second.url()).searchParams.get('next') ?? '';
        expect(secondNext).toMatch(/^\/auth\/reauth\/continue\?replay=[0-9a-f]{32}$/);
        expect(secondNext).not.toBe(firstNext);
        // Tab 1 confirms its (older) prompt: its own POST is carried out.
        await confirmWithPasskey(page);
        await page.waitForURL(/\/profile\?success=Renamed$/, { timeout: 10000 });
        await expect(page.locator(`input[name="label"][value="${first}"]`)).toHaveCount(1);
        // Tab 2's prompt, confirmed (the passkey is on tab 1's page, so it is confirmed there), carries out tab 2's POST.
        await page.goto(second.url());
        await confirmWithPasskey(page);
        await page.waitForURL(/\/profile\?success=Renamed$/, { timeout: 10000 });
        await expect(page.locator(`input[name="label"][value="${other}"]`)).toHaveCount(1);
        // Each once.
        expect((await page.goto(firstNext))?.status()).toBe(410);
        expect((await page.goto(secondNext))?.status()).toBe(410);
      } finally {
        await second.close();
      }
    });

    test('a script\'s request comes back to its page, which says it can be done now', async () => {
      const page = me().page;
      await page.goto('/profile');
      await page.waitForTimeout(STALE_MS);
      await page.fill('#passkey-label', `e2e-reauth-b-${RUN}`);
      // Adding a passkey asks account-security for its options as JSON; the answer names the prompt.
      await page.locator('[data-passkey-enrol]').click();
      await page.waitForURL(/\/auth\/reauth\?/);
      expect(new URL(page.url()).searchParams.get('next')).toBe('/profile');
      await confirmWithPasskey(page);
      await page.waitForURL(/\/profile$/, { timeout: 10000 });
      await expect(noted(page)).toBeVisible();
    });
  });
});
