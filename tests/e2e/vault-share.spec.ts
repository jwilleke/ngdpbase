import { test, expect } from '@playwright/test';
import { TEST_PAGE_PREFIX, createPrivatePage, deletePage } from './fixtures/helpers';

/**
 * #1388 — the owner of a vault shares a page by read-only link.
 *
 * Signed in, the owner makes a private page and a link to it. Signed out,
 * anyone with the link reads the page; a sibling page in the same vault stays
 * shut. After the owner revokes it, the link opens nothing.
 */
test.describe('Vault links', () => {
  test.use({ storageState: './tests/e2e/.auth/user.json' });
  test.setTimeout(90000);

  const stamp = Date.now();
  const shared = `${TEST_PAGE_PREFIX}-VaultShared-${stamp}`;
  const sibling = `${TEST_PAGE_PREFIX}-VaultSibling-${stamp}`;
  const created: string[] = [];

  test.afterAll(async ({ browser }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const p = await context.newPage();
    for (const name of created) await deletePage(p, name).catch(() => undefined);
    await context.close();
  });

  test('a page link opens that page signed out, not its sibling, and stops when revoked', async ({ page, browser }) => {
    const sharedName = await createPrivatePage(page, shared, 'Shared body text');
    created.push(sharedName);
    const siblingName = await createPrivatePage(page, sibling, 'Sibling body text');
    created.push(siblingName);

    // Share this page, from its menu's target: the old address sends a named
    // page to the Shared links page, which holds the form.
    await page.goto(`/my/vaults/links?page=${encodeURIComponent(sharedName)}`);
    await expect(page).toHaveURL(/\/my\/shares\?share=vault&page=/);
    const form = page.locator('form[action="/my/shares/vault-links"]').filter({ has: page.locator('input[name="scope"][value="pages"]') });
    await expect(form.locator('input[name="pages"]:checked')).toHaveCount(1);
    await form.locator('input[name="label"]').fill('For the E2E visitor');
    await Promise.all([
      page.waitForURL(/created=/),
      form.locator('button[type="submit"]').click()
    ]);
    const url = await page.locator('#sharedLinksTable tr', { hasText: 'For the E2E visitor' }).locator('input[readonly]').inputValue();
    expect(url).toMatch(/\/share\/[0-9a-f]{64}$/);
    const token = url.split('/share/')[1];

    // Signed out: the link is the whole of the access.
    const anon = await browser.newContext();
    const visitor = await anon.newPage();
    const list = await visitor.goto(`/share/${token}`);
    expect(list?.status()).toBe(200);
    await expect(visitor.getByText(shared)).toBeVisible();
    await expect(visitor.getByText(sibling)).toHaveCount(0);

    const opened = await visitor.goto(`/share/${token}/page/${encodeURIComponent(sharedName)}`);
    expect(opened?.status()).toBe(200);
    await expect(visitor.getByText('Shared body text')).toBeVisible();

    const refused = await visitor.goto(`/share/${token}/page/${encodeURIComponent(siblingName)}`);
    expect(refused?.status()).toBe(404);

    // The owner sees the label and the visits.
    await page.goto('/my/vaults/links');
    const row = page.locator('tr', { has: page.locator(`input[value$="${token}"]`) });
    await expect(row).toContainText('For the E2E visitor');
    await expect(row.locator('details summary')).toContainText(/^\d+ — last /);

    // Revoked: the same link opens nothing, at once.
    await Promise.all([
      page.waitForURL(/notice=revoked/),
      row.locator('form[action$="/revoke"] button').click()
    ]);
    const after = await visitor.goto(`/share/${token}`);
    expect(after?.status()).toBe(404);
    await anon.close();
  });
});
