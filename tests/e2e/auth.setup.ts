import { test as setup, type Page } from '@playwright/test';
import { waitForServerReady, TEST_PAGE_PREFIX } from './fixtures/helpers';

const STORAGE_STATE = './tests/e2e/.auth/user.json';

/**
 * Authentication Setup
 *
 * This setup runs before the main tests to authenticate and save session state.
 * The saved state is reused by authenticated tests to avoid logging in repeatedly.
 */
setup('authenticate', async ({ page }) => {
  // Wait for server to finish initializing (may show maintenance page during engine startup)
  await waitForServerReady(page);

  // Test credentials from env or defaults
  const adminUser = process.env.E2E_ADMIN_USER || 'admin';
  // playwright.config.ts resolves E2E_ADMIN_PASS (E2E_ADMIN_PASS, else
  // NGDPBASE_ADMIN_PASSWORD). With neither set, the instance's admin is on the
  // shipped bootstrap password, admin123. See testing-developer-guide.md (#1895).
  const adminPass = process.env.E2E_ADMIN_PASS || 'admin123';

  // Navigate to admin login page (always shows password form regardless of OAuth config)
  await page.goto('/admin/login');
  await page.waitForSelector('form');

  // Fill in credentials - target inputs inside the login form specifically
  const loginForm = page.locator('form:has(input[type="password"])');
  const usernameInput = loginForm.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="password"])').first();
  const passwordInput = loginForm.locator('input[type="password"]');

  await usernameInput.fill(adminUser);
  await passwordInput.fill(adminPass);

  // Submit login form and wait for the answer: a refused sign-in redirects to
  // /login?error=…, an accepted one away from the login pages.
  await page.getByRole('button', { name: /login/i }).click();
  await page.waitForURL((url) => url.pathname !== '/admin/login', { timeout: 15000 }).catch(() => undefined);
  // Use domcontentloaded — networkidle never fires because admin dashboard
  // keeps persistent polling connections open (#460)
  await page.waitForLoadState('domcontentloaded');

  // #1895: the URL is not the signal. `/login?error=…` slipped past a
  // `/login$` check, and every signed-in spec then failed with a 401.
  await assertSignedIn(page, adminUser, 'password sign-in');

  // #448: admin requires AAL2, so a password session acts without admin.
  // Upgrade it with a passkey from a virtual authenticator, then save that.
  await upgradeToPasskeySession(page, adminUser);

  // Whatever the passkey step did, the session saved for every spec must act
  // as admin: the admin dashboard answers 200 only to admin-read.
  const admin = await page.request.get('/admin', { maxRedirects: 0 });
  if (admin.status() !== 200) {
    throw new Error(
      `[auth.setup] signed in as '${adminUser}', but GET /admin answered ${admin.status()}, not 200: ` +
      'the session does not act as admin. Is the account an admin, and did the passkey upgrade (AAL2) complete?'
    );
  }

  // Save authentication state
  await page.context().storageState({ path: STORAGE_STATE });

  // #947: sweep away soft-deleted test pages left by earlier runs.
  //
  // deletePage() purges each page it deletes, so a current run cleans up after
  // itself. This catches the back-catalogue: runs from before that landed, and
  // any run where the purge step failed. Without it those tombstones and their
  // version directories sit in storage for the whole retention window — the
  // same slow accumulation as #724, one level down where nobody looks.
  //
  // Scoped strictly to the NGDPBASE-test prefix. It must never purge anything
  // else: the suite runs against real instances, and a blanket trash-empty
  // would destroy genuinely deleted pages an operator was still holding.
  //
  // #970: delete LIVE leftovers first, then purge tombstones — in that order,
  // so pages deleted a moment ago are purged in the same run rather than
  // waiting for the next one.
  await deleteStaleLiveTestPages(page);
  await purgeStaleTestPages(page);
});

const E2E_PASSKEY_LABEL = 'e2e-virtual';

/**
 * #1895: fail the setup, naming the likely cause, unless the browser session
 * is signed in. Asks the server (`/profile` answers 200 to a signed-in user
 * and redirects anyone else to /login) rather than trusting the URL.
 */
async function assertSignedIn(page: Page, adminUser: string, step: string): Promise<void> {
  const profile = await page.request.get('/profile', { maxRedirects: 0 });
  if (profile.status() === 200) return;

  const landed = new URL(page.url());
  const refusal = landed.searchParams.get('error');
  const target = process.env.E2E_BASE_URL ?? `port ${process.env.PORT ?? '3000'}`;
  throw new Error(
    `[auth.setup] ${step} as '${adminUser}' did not sign in: landed on ${landed.pathname}` +
    (refusal ? ` with "${refusal}"` : '') +
    `, and GET /profile answered ${profile.status()}, not 200. ` +
    `Likely cause: E2E_ADMIN_PASS does not match the admin password of the instance under test (${target}). ` +
    'E2E_ADMIN_PASS defaults to NGDPBASE_ADMIN_PASSWORD, else admin123; a seeded instance\'s admin gets ' +
    'NGDPBASE_ADMIN_PASSWORD only when it was set at seed time. ' +
    'See docs/guides/testing-developer-guide.md, "Run E2E on a throwaway instance".'
  );
}

/** Remove every passkey this suite enrolled — leftovers from a crashed run, or this run's. */
async function removeE2EPasskeys(page: Page): Promise<void> {
  // The label is an editable input since passkeys could be renamed (#1591); a
  // cell-text match found nothing from then on, so every run's passkey stayed
  // until the account passed WebAuthn's 64-entry excludeCredentials limit and
  // enrolment failed. Matched on the input's value. The bound clears a
  // backlog, not just one leftover.
  for (let i = 0; i < 100; i++) {
    await page.goto('/profile');
    const row = page.locator('tr', { has: page.locator(`input[name="label"][value="${E2E_PASSKEY_LABEL}"]`) }).first();
    if ((await row.count()) === 0) return;
    await row.getByRole('button', { name: 'Remove' }).click();
    await page.waitForURL(/\/profile\?/);
  }
}

/**
 * #448: admin and user-admin require AAL2, and a password sign-in is AAL1, so
 * the admin acts without those roles until they sign in with a passkey. Where
 * the instance offers passkeys, enrol one on a Chromium virtual authenticator,
 * sign out, sign back in with it, then REMOVE it: the session keeps its AAL2
 * sign-in record, so nothing stays in the instance's credentials store — the
 * suite also runs against real instances. Where passkeys are off, the admin's
 * AAL2 default is unreachable and acts at AAL1, so the password session stands.
 *
 * Skipping is the one optional path, taken only when the signed-in profile
 * page has no enrol control. Once the step signs out it must sign back in: a
 * passkey sign-in that did not take fails the setup (#1895).
 */
async function upgradeToPasskeySession(page: Page, adminUser: string): Promise<void> {
  await page.goto('/profile');
  await assertSignedIn(page, adminUser, 'password sign-in (before the passkey upgrade)');
  const enrol = page.locator('[data-passkey-enrol]');
  if ((await enrol.count()) === 0) {
    console.log('[auth.setup] Passkeys are off on this instance: keeping the password session (admin acts at AAL1).');
    return;
  }

  await removeE2EPasskeys(page);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true }
  });
  try {
    await page.goto('/profile');
    await page.fill('#passkey-label', E2E_PASSKEY_LABEL);
    await page.locator('[data-passkey-enrol]').click();
    await page.waitForURL(/\/profile\?success=Passkey/);

    await page.goto('/logout');
    await page.getByRole('button', { name: 'Sign out' }).click(); // #1631: GET asks, POST signs out
    await page.goto('/login');
    await page.locator('[data-passkey-signin]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => undefined);
    await page.waitForLoadState('domcontentloaded');
    await assertSignedIn(page, adminUser, 'passkey sign-in');

    await removeE2EPasskeys(page);
  } finally {
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }).catch(() => undefined);
  }
}

/**
 * Delete live pages left behind by a run that crashed before its cleanup (#970).
 *
 * The existing tombstone sweep below only ever saw pages a run had *already*
 * deleted. A run that died earlier — a thrown assertion, a timeout, a killed
 * process — left its pages fully live in the index, visible in listings and
 * search and indistinguishable from real content, with nothing to remove them
 * ever. Four `NGDPBASE-test-LocationTest-*` pages from weeks earlier were found
 * that way on 2026-07-26, alongside two from a failed run the same day.
 *
 * This is #724's failure mode in the one form neither existing protection
 * reached: #724 hardened `deletePage()` to fail loudly, which only helps when
 * the test gets as far as `afterAll`.
 *
 * Runs at SETUP rather than teardown deliberately — it cleans the *previous*
 * run's mess, so it still works when the current run is the one that crashes.
 *
 * Deleting is cheap and reversible now that delete is a soft delete (#947): a
 * mistake sits in the trash for the retention window, and the tombstone sweep
 * that follows clears the storage. Strictly prefix-scoped, and best-effort —
 * storage hygiene must never fail the suite.
 *
 * @param {import('@playwright/test').Page} page - Authenticated page
 */
async function deleteStaleLiveTestPages(page) {
  try {
    // `/api/page-suggestions` matches on substring, so filter to a real prefix
    // match below — never trust it to have scoped this for us.
    const res = await page.request.get(
      `/api/page-suggestions?q=${encodeURIComponent(TEST_PAGE_PREFIX)}&limit=500`
    );
    if (res.status() !== 200) return;

    const body = await res.json();
    const stale = (body.suggestions || [])
      .map((s) => String(s.name ?? s.title ?? ''))
      .filter((name) => name.startsWith(TEST_PAGE_PREFIX));
    if (stale.length === 0) return;

    const tokenRes = await page.request.get('/login');
    const match = (await tokenRes.text()).match(/<meta name="csrf-token" content="([^"]+)"/);
    if (!match) return;

    for (const name of stale) {
      await page.request.post(`/delete/${encodeURIComponent(name)}`, {
        headers: { Accept: 'application/json', 'X-CSRF-Token': match[1] }
      });
    }
    console.log(`[auth.setup] Deleted ${stale.length} stale live ${TEST_PAGE_PREFIX}-* page(s)`);
  } catch {
    // Never fail the suite over cleanup of prior runs.
  }
}

/**
 * Purge soft-deleted pages matching the E2E test prefix (#947).
 *
 * Best-effort: a provider without soft delete answers 501, and a failure here
 * is storage hygiene, not correctness — it must never block the suite.
 *
 * @param {import('@playwright/test').Page} page - Authenticated page
 */
async function purgeStaleTestPages(page) {
  try {
    const listRes = await page.request.get('/api/admin/deleted-pages');
    if (listRes.status() !== 200) return;

    const body = await listRes.json();
    const stale = (body.pages || []).filter((p) => String(p.title).startsWith(TEST_PAGE_PREFIX));
    if (stale.length === 0) return;

    const tokenRes = await page.request.get('/login');
    const match = (await tokenRes.text()).match(/<meta name="csrf-token" content="([^"]+)"/);
    if (!match) return;

    for (const entry of stale) {
      await page.request.delete(`/api/admin/deleted-pages/${encodeURIComponent(entry.uuid)}`, {
        headers: { Accept: 'application/json', 'X-CSRF-Token': match[1] }
      });
    }
    console.log(`[auth.setup] Purged ${stale.length} stale ${TEST_PAGE_PREFIX}-* tombstone(s)`);
  } catch {
    // Never fail the suite over cleanup of prior runs.
  }
}
