import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, CDPSession, Page, Request } from '@playwright/test';
import { randomUUID } from 'crypto';
import { signInWithPassword, createPluginPage, deletePage, instanceOrigin, TEST_PAGE_PREFIX } from './fixtures/helpers';

/**
 * #2145 — after "Confirm it is you" with a passkey the browser goes where the
 * step-up said, and never stalls there. A download (Admin → Backup → Download
 * .env) used to name the file itself: the passkey succeeded, the browser saved
 * the file, and the page stayed on the prompt with its button greyed. Now a
 * download and a script's request come back to the page they were started
 * from, which says "Confirmed — you can do it now"; a page GET opens the page;
 * a form POST is sent again by itself, once (#2154); a failure is shown and
 * the button works again. A form the forms add-on shows keeps its page: the
 * prompt opens in a popup (or a new tab when the popup is blocked), and the
 * form is sent once its own prompt is confirmed, once, with what was typed;
 * its Cancel, in a popup or a new tab, sends nothing (#2193).
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

interface Person { context: BrowserContext; page: Page; cdp: CDPSession; authenticatorId: string }
let person: Person | null = null;

/** The test account's browser, signed in with its passkey in beforeAll. */
function me(): Person {
  if (!person) throw new Error('the test account did not sign in (beforeAll)');
  return person;
}

const AUTHENTICATOR = { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } as const;

/** A test account holding admin, signed in with a passkey from a virtual authenticator. */
async function signInWithPasskey(browser: Browser): Promise<Person> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, acceptDownloads: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: AUTHENTICATOR });
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
  return { context, page, cdp, authenticatorId };
}

/**
 * #2193: the passkey in another window of the test account's browser (a
 * popup or a tab). A virtual authenticator belongs to one page, so the
 * credential is copied there. The site refuses a passkey whose counter does
 * not move forward, so the copy counts on from well past the original, and the
 * original then from well past the copy.
 */
async function lendPasskey(window: Page): Promise<void> {
  const { context, cdp, authenticatorId } = me();
  const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  const there = await context.newCDPSession(window);
  await there.send('WebAuthn.enable');
  const { authenticatorId: lent } = await there.send('WebAuthn.addVirtualAuthenticator', { options: AUTHENTICATOR });
  for (const credential of credentials) {
    await there.send('WebAuthn.addCredential', { authenticatorId: lent, credential: { ...credential, signCount: credential.signCount + 1000 } });
    await cdp.send('WebAuthn.removeCredential', { authenticatorId, credentialId: credential.credentialId });
    await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: { ...credential, signCount: credential.signCount + 2000 } });
  }
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

    test.describe('a form the forms add-on shows, its permission marked "step-up" (#2193)', () => {
      const FORM_ID = `e2e-2193-${RUN}`;
      const PAGE_NAME = `${TEST_PAGE_PREFIX}-FormsStepUp-${RUN}`;
      const DEFINITIONS_KEY = 'ngdpbase.permissions.definitions';
      const SUBMIT = `/api/forms/submit/${FORM_ID}`;
      /** Whether this run marked form-submit "step-up", so the teardown takes it out again. */
      let marked = false;
      let formsOn = true;
      /** The site has its own permission definitions: they are left alone, and these cases skipped. */
      let ownDefinitions = false;

      /** An administrator's page from the shared sign-in, which the builder and the editor need. */
      async function asAdmin<T>(browser: Browser, work: (page: Page) => Promise<T>): Promise<T> {
        const admin = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
        try {
          return await work(await admin.newPage());
        } finally {
          await admin.close();
        }
      }

      /** Set the definitions; `null` takes the key out of app-custom-config.json, so the shipped and add-on entries are in force again. */
      async function setDefinitions(page: Page, value: string | null): Promise<void> {
        const saved = await page.request.post('/admin/configuration', {
          headers: { 'X-CSRF-Token': await csrfFrom(page), 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
          form: value === null ? { property: DEFINITIONS_KEY } : { property: DEFINITIONS_KEY, value }
        });
        expect(saved.status(), await saved.text()).toBe(200);
      }

      /** Confirm on the prompt, so a change to the configuration (config-manage, step-up) goes through. */
      async function confirmNow(page: Page): Promise<void> {
        await page.goto('/auth/reauth?next=%2Fprofile');
        await confirmWithPasskey(page);
        await page.waitForURL(/\/profile$/);
      }

      /** Each POST of the form, its body and the status it was answered with. */
      function watchSubmits(page: Page): Array<{ body: string; status: number }> {
        const seen: Array<{ body: string; status: number }> = [];
        page.on('requestfinished', (request: Request) => {
          if (request.method() !== 'POST' || new URL(request.url()).pathname !== SUBMIT) return;
          void request.response().then((r) => seen.push({ body: request.postData() ?? '', status: r?.status() ?? 0 }));
        });
        return seen;
      }

      const form = (page: Page) => page.locator(`form[data-ngdp-form="${FORM_ID}"]`);
      const result = (page: Page) => page.locator(`#form-result-${FORM_ID}`);
      const TYPED = `typed before the prompt ${RUN}`;

      test.beforeAll(async ({ browser }) => {
        formsOn = await asAdmin(browser, async (page) => {
          if ((await page.request.get('/addons/forms/builder/new')).status() === 404) return false;
          const token = await csrfFrom(page);
          const made = await page.request.post(`${await instanceOrigin(page)}/addons/forms/builder`, {
            headers: { 'X-CSRF-Token': token },
            form: { _csrf: token, id: FORM_ID, title: `E2E ${FORM_ID}`, fieldsJson: JSON.stringify([{ name: 'note', type: 'text', label: 'Note', required: true }]) },
            maxRedirects: 0
          });
          expect(made.status(), 'create the form').toBe(302);
          await createPluginPage(page, PAGE_NAME, `[{Form id='${FORM_ID}'}]`);
          return true;
        });
        if (!formsOn) return;
        // The forms add-on's own permission, form-submit, marked "step-up" in its entry.
        const page = me().page;
        await confirmNow(page);
        await page.goto('/admin/configuration');
        // The Current tab shows the merged map as JSON in the key's row, and a
        // write of it lands whole in app-custom-config.json. Only a key the site
        // has set itself gets a form, in the Custom tab. A site with none of its
        // own gets the key taken out again afterwards; one with its own is not touched.
        const current = page.locator('#nav-current tbody tr').filter({ has: page.getByText(DEFINITIONS_KEY, { exact: true }) });
        await expect(current, 'the Current tab lists the permission definitions').toHaveCount(1);
        ownDefinitions = (await page.locator(`#nav-custom form:has(input[name="property"][value="${DEFINITIONS_KEY}"])`).count()) > 0;
        if (ownDefinitions) return;
        const definitions = (await current.locator('td:nth-child(2) code').textContent()) ?? '';
        const entries = JSON.parse(definitions) as Record<string, Record<string, unknown>>;
        expect(entries['form-submit'], 'the forms add-on declares form-submit').toBeTruthy();
        marked = true;
        await setDefinitions(page, JSON.stringify({ ...entries, 'form-submit': { ...entries['form-submit'], 'step-up': true } }));
      });

      test.afterAll(async ({ browser }) => {
        if (!formsOn) return;
        if (marked && person) {
          await confirmNow(person.page);
          await setDefinitions(person.page, null);
        }
        await asAdmin(browser, async (page) => {
          await deletePage(page, PAGE_NAME);
          const token = await csrfFrom(page);
          await page.request.post(`${await instanceOrigin(page)}/addons/forms/builder/${FORM_ID}/delete`, { headers: { 'X-CSRF-Token': token }, form: { _csrf: token }, maxRedirects: 0 });
        });
      });

      test('confirmed in the popup, the form is sent once more, once, with what was typed', async () => {
        test.skip(!formsOn, 'forms add-on not enabled on this instance');
        test.skip(ownDefinitions, 'this site has its own permission definitions; they are not changed');
        const page = me().page;
        const submits = watchSubmits(page);
        try {
          await page.goto(`/view/${encodeURIComponent(PAGE_NAME)}`);
          await page.waitForTimeout(STALE_MS);
          await form(page).locator('[name="note"]').fill(TYPED);
          const opened = page.waitForEvent('popup');
          await form(page).locator('[type="submit"]').click();
          const popup = await opened;
          await popup.waitForURL(/\/auth\/reauth\?.*prompt=[0-9a-f]{32}/);
          expect(page.url()).toContain('/view/');
          await lendPasskey(popup);
          await confirmWithPasskey(popup);
          // The page closes the popup once its prompt is confirmed, and sends the form.
          await popup.waitForEvent('close', { timeout: 15000 });
          await expect(result(page).locator('.alert-success')).toBeVisible({ timeout: 10000 });
          await expect.poll(() => submits.length).toBe(2);
          // The forms API answers a stored submission with 201 (addons/forms/routes/api.ts).
          expect(submits.map((s) => s.status)).toEqual([403, 201]);
          expect(JSON.parse(submits[0].body)).toEqual({ note: TYPED });
          expect(submits[1].body).toBe(submits[0].body);
          // Nothing more is sent afterwards.
          await page.waitForTimeout(3000);
          expect(submits).toHaveLength(2);
        } finally {
          page.removeAllListeners('requestfinished');
        }
      });

      test('a cancelled prompt sends nothing and leaves the form as typed', async () => {
        test.skip(!formsOn, 'forms add-on not enabled on this instance');
        test.skip(ownDefinitions, 'this site has its own permission definitions; they are not changed');
        const page = me().page;
        const submits = watchSubmits(page);
        try {
          await page.goto(`/view/${encodeURIComponent(PAGE_NAME)}`);
          await page.waitForTimeout(STALE_MS);
          await form(page).locator('[name="note"]').fill(TYPED);
          const opened = page.waitForEvent('popup');
          await form(page).locator('[type="submit"]').click();
          const popup = await opened;
          await popup.getByRole('button', { name: 'Cancel', exact: true }).click();
          await popup.waitForEvent('close', { timeout: 15000 });
          await expect(result(page)).toContainText('not confirmed, so nothing was sent');
          await expect(form(page).locator('[name="note"]')).toHaveValue(TYPED);
          await expect(form(page).locator('[type="submit"]')).toBeEnabled();
          expect(submits.map((s) => s.status)).toEqual([403]);
        } finally {
          page.removeAllListeners('requestfinished');
        }
      });

      test('with the popup blocked, the prompt opens in a new tab and the form is sent once it is confirmed', async () => {
        test.skip(!formsOn, 'forms add-on not enabled on this instance');
        test.skip(ownDefinitions, 'this site has its own permission definitions; they are not changed');
        const { context } = me();
        const page = await context.newPage();
        try {
          // A popup blocker answers window.open with null.
          await page.addInitScript(() => { window.open = () => null; });
          const submits = watchSubmits(page);
          await page.goto(`/view/${encodeURIComponent(PAGE_NAME)}`);
          await page.waitForTimeout(STALE_MS);
          await form(page).locator('[name="note"]').fill(TYPED);
          await form(page).locator('[type="submit"]').click();
          const link = result(page).getByRole('link', { name: 'Confirm it is you in a new tab' });
          await expect(link).toBeVisible();
          const opened = context.waitForEvent('page');
          await link.click();
          const tab = await opened;
          await tab.waitForURL(/\/auth\/reauth\?/);
          await lendPasskey(tab);
          await confirmWithPasskey(tab);
          await expect(result(page).locator('.alert-success')).toBeVisible({ timeout: 15000 });
          await expect.poll(() => submits.length).toBe(2);
          expect(submits.map((s) => s.status)).toEqual([403, 201]);
          expect(submits[1].body).toBe(submits[0].body);
          expect(JSON.parse(submits[1].body)).toEqual({ note: TYPED });
          await tab.close();
        } finally {
          await page.close();
        }
      });

      test('with the popup blocked, Cancel in the new tab ends the wait and sends nothing', async () => {
        test.skip(!formsOn, 'forms add-on not enabled on this instance');
        test.skip(ownDefinitions, 'this site has its own permission definitions; they are not changed');
        const { context } = me();
        const page = await context.newPage();
        try {
          await page.addInitScript(() => { window.open = () => null; });
          const submits = watchSubmits(page);
          await page.goto(`/view/${encodeURIComponent(PAGE_NAME)}`);
          await page.waitForTimeout(STALE_MS);
          await form(page).locator('[name="note"]').fill(TYPED);
          await form(page).locator('[type="submit"]').click();
          const opened = context.waitForEvent('page');
          await result(page).getByRole('link', { name: 'Confirm it is you in a new tab' }).click();
          const tab = await opened;
          await tab.waitForURL(/\/auth\/reauth\?/);
          await tab.getByRole('button', { name: 'Cancel', exact: true }).click();
          await expect(result(page)).toContainText('not confirmed, so nothing was sent', { timeout: 10000 });
          await expect(form(page).locator('[name="note"]')).toHaveValue(TYPED);
          expect(submits.map((s) => s.status)).toEqual([403]);
          await tab.close();
        } finally {
          await page.close();
        }
      });
    });
  });
});
