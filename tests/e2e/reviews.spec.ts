import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { waitForServerReady, instanceOrigin } from './fixtures/helpers';

/**
 * #2072 — one core way to review requests. A submission to a form that needs
 * review (shipped by the fixture add-on tests/e2e/fixtures/addons/review-e2e,
 * decided by holders of admin-system) is filed with core's reviews, appears on
 * /reviews for the admin, who approves one and rejects another.
 *
 * Needs, on the instance under test:
 *   "ngdpbase.database.provider": "sqlite" and NGDPBASE_DATABASE_KEY set
 *     (requests are kept only in the encrypted application database),
 *   "ngdpbase.addons.forms.enabled": true,
 *   "ngdpbase.addons.review-e2e.enabled": true,
 *   "ngdpbase.managers.addons-manager.addons-path": ["./addons", "<checkout>/tests/e2e/fixtures/addons"]
 * Skips when any is missing. Its changes: two submissions to the fixture's
 * form, decided, then cleared; the two decided requests stay until retention.
 */

const FORM = 'e2e-2072-review';
/** A page with no session: the project's storageState would otherwise sign it in as the admin. */
const NOBODY = { storageState: { cookies: [], origins: [] } };
const TITLE = 'E2E 2072 new owner';

async function csrfToken(page: Page): Promise<string> {
  const html = await (await page.request.get('/login')).text();
  const token = (html.match(/<meta name="csrf-token" content="([^"]+)"/) ?? [])[1];
  if (!token) throw new Error('could not obtain CSRF token from /login');
  return token;
}

/** One submission to the fixture's form, as whoever `page` is signed in as (or nobody). */
async function submit(page: Page, name: string): Promise<void> {
  const token = await csrfToken(page);
  const res = await page.request.post(`${await instanceOrigin(page)}/api/forms/submit/${FORM}`, {
    headers: { 'X-CSRF-Token': token },
    data: { name }
  });
  expect(res.status(), `submit ${FORM}`).toBe(201);
  expect((await res.json()).review).toBe('pending');
}

test.describe.configure({ mode: 'serial' });

test.describe('reviews: a request filed by a form that needs review (#2072)', () => {
  let enabled = true;
  const signedIn = { storageState: './tests/e2e/.auth/user.json' };
  const approveName = `E2E 2072 approve ${randomUUID().slice(0, 8)}`;
  const rejectName = `E2E 2072 reject ${randomUUID().slice(0, 8)}`;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage(signedIn);
    await waitForServerReady(page);
    const formThere = (await page.request.get(`/api/forms/schema/${FORM}`)).status() === 200;
    const reviewsOn = formThere && !(await (await page.request.get('/reviews')).text()).includes('data-testid="reviews-unavailable"');
    enabled = formThere && reviewsOn;
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!enabled) return;
    const page = await browser.newPage(signedIn);
    const token = await csrfToken(page);
    const res = await page.request.post(`${await instanceOrigin(page)}/addons/forms/${FORM}/submissions/clear`, {
      headers: { 'X-CSRF-Token': token }, form: { _csrf: token, confirm: FORM }, maxRedirects: 0
    });
    expect(res.status(), 'clear the fixture form\'s submissions').toBe(302);
    await page.close();
  });

  test('someone not signed in submits; the admin sees both requests on /reviews', async ({ browser, page }) => {
    test.skip(!enabled, 'reviews (an encrypted sqlite database), the forms add-on or the review-e2e fixture is not on this instance');
    const visitor = await browser.newPage(NOBODY);
    await submit(visitor, approveName);
    await submit(visitor, rejectName);
    await visitor.close();

    await page.goto('/reviews');
    for (const name of [approveName, rejectName]) {
      const card = page.getByTestId('review-request').filter({ hasText: name });
      await expect(card).toHaveCount(1);
      await expect(card).toContainText(TITLE);
      await expect(card).toContainText('someone not signed in');
      await expect(card.locator('time[data-local-time]').first()).toBeVisible();
    }
  });

  test('approving carries it out and takes it off the list', async ({ page }) => {
    test.skip(!enabled, 'reviews are not available on this instance');
    await page.goto('/reviews');
    const card = page.getByTestId('review-request').filter({ hasText: approveName });
    await card.locator('textarea[name="note"]').fill('Checked by the E2E run');
    await card.getByTestId('review-approve').click();
    await expect(page.getByTestId('reviews-success')).toContainText(`Approved: ${TITLE}`);
    await expect(page.getByTestId('review-request').filter({ hasText: approveName })).toHaveCount(0);
  });

  test('rejecting closes it', async ({ page }) => {
    test.skip(!enabled, 'reviews are not available on this instance');
    await page.goto('/reviews');
    await page.getByTestId('review-request').filter({ hasText: rejectName }).getByTestId('review-reject').click();
    await expect(page.getByTestId('reviews-success')).toContainText(`Rejected: ${TITLE}`);
    await expect(page.getByTestId('review-request').filter({ hasText: rejectName })).toHaveCount(0);
  });

  test('someone not signed in cannot open /reviews', async ({ browser }) => {
    test.skip(!enabled, 'reviews are not available on this instance');
    const visitor = await browser.newPage(NOBODY);
    const res = await visitor.request.get(`${await instanceOrigin(visitor)}/reviews`, { maxRedirects: 0 });
    expect([302, 401]).toContain(res.status());
    await visitor.close();
  });
});
