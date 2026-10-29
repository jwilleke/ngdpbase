import { test, expect, type APIResponse, type BrowserContext } from '@playwright/test';
import { TEST_PAGE_PREFIX, createPrivatePage, deletePage, signInWithPassword } from './fixtures/helpers';

/**
 * #2117 — everything a share view loads from the site is under /share/, so a
 * tunnel or proxy that carries only /share/… carries it.
 *
 * The viewer for a link to an encrypted vault is served at
 * /share/_assets/share-viewer.js, to anyone, and `_assets` is never a token.
 *
 * The locked-link case runs only when E2E_SEALED_VAULT names the admin's
 * default vault and that vault is encrypted (its system-category sets
 * `"encrypt": true` in the instance's configuration); it is skipped otherwise,
 * because it needs the instance's configuration. It opens the vault's door
 * with the admin's password when the vault is not made yet, makes a link to a
 * page, and opens the link signed out. When E2E_SHARE_PUBLIC_BASE_URL is set
 * (the instance's ngdpbase.share.public-base-url), the link must start with it.
 */
/**
 * GET a path without following redirects, except the one hop an instance that
 * serves HTTPS itself answers plain http with: the same path over https (#1163).
 * A redirect anywhere else (a sign-in page, another path) is returned as is, so
 * it still fails the caller's assertion.
 */
async function getOverHttps(context: BrowserContext, path: string): Promise<APIResponse> {
  const res = await context.request.get(path, { maxRedirects: 0 });
  const location = res.headers()['location'] ?? '';
  if ([301, 302, 307, 308].includes(res.status()) && /^https:\/\/[^/]+(\/.*)$/.exec(location)?.[1] === path) {
    return context.request.get(location, { maxRedirects: 0, ignoreHTTPSErrors: true });
  }
  return res;
}

test.describe('Share view assets under /share/ (#2117)', () => {
  test('the encrypted-vault viewer is served under /share/_assets to anyone', async ({ browser }) => {
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const res = await getOverHttps(anon, '/share/_assets/share-viewer.js');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/javascript/);
    expect(await res.text()).toContain('/lockbox/');

    const miss = await getOverHttps(anon, '/share/_assets/no-such-file.js');
    expect(miss.status()).toBe(404);
    // A share link's answer carries noindex; this one never reached the token resolver.
    expect(miss.headers()['x-robots-tag']).toBeUndefined();
    await anon.close();
  });

  test.describe('a link to an encrypted vault', () => {
    test.use({ storageState: './tests/e2e/.auth/user.json' });
    test.setTimeout(120000);

    const vault = process.env.E2E_SEALED_VAULT;
    const title = `${TEST_PAGE_PREFIX}-SealedShare-${Date.now()}`;
    const created: string[] = [];

    test.afterAll(async ({ browser }) => {
      const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
      const p = await context.newPage();
      for (const name of created) await deletePage(p, name);
      await context.close();
    });

    test('opens signed out, loading its viewer from under /share/', async ({ browser }) => {
      test.skip(!vault, 'E2E_SEALED_VAULT names no encrypted default vault on this instance');

      // An encrypted vault opens only in a session signed in with the password.
      const owner = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await owner.newPage();
      const password = process.env.E2E_ADMIN_PASS || 'admin123';
      await signInWithPassword(page, process.env.E2E_ADMIN_USER || 'admin', password);

      // Make the encrypted vault if this admin has not yet: password, words, words back.
      await page.goto(`/stores/${vault}`);
      const door = page.locator('#door-password');
      if (await door.count()) {
        await door.fill(password);
        await page.locator('form:has(#door-password) button[type="submit"]').click();
        const words = (await page.locator('#door-words').inputValue()).trim().split(/\s+/);
        await page.goto(`/stores/${vault}/confirm`);
        for (let i = 0; i < words.length; i++) await page.locator(`#word${i + 1}`).fill(words[i]);
        await page.locator('form[action$="/confirm"] button[type="submit"]').click();
        await expect(page.getByText('is ready')).toBeVisible();
      }

      const name = await createPrivatePage(page, title, 'Sealed shared body');
      created.push(name);
      expect(name.split('/')[2]).toBe(vault);

      // The owner's browser makes the link; it is shown once.
      await page.goto(`/my/vaults/links?page=${encodeURIComponent(name)}`);
      const form = page.locator('form[data-vault-link]').filter({ has: page.locator('input[name="scope"][value="pages"]') });
      await form.locator('button[type="submit"]').click();
      await expect(page.locator('#lockedLinkUrl')).toHaveValue(/\/share\/[0-9a-f]{64}#/, { timeout: 15000 });
      const link = await page.locator('#lockedLinkUrl').inputValue();
      const publicBase = process.env.E2E_SHARE_PUBLIC_BASE_URL;
      if (publicBase) expect(link.startsWith(`${publicBase.replace(/\/$/, '')}/share/`)).toBe(true);

      // Signed out, on this instance: the path and the key, not the minted origin.
      const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const visitor = await anon.newPage();
      const loaded: string[] = [];
      visitor.on('response', (r) => {
        const url = new URL(r.url());
        if (url.pathname.endsWith('.js') && url.origin === new URL(page.url()).origin) loaded.push(`${r.status()} ${url.pathname}`);
      });
      const target = new URL(link);
      await visitor.goto(`${target.pathname}${target.hash}`);
      await expect(visitor.locator('#pageList')).toContainText(title, { timeout: 15000 });
      expect(loaded).toContain('200 /share/_assets/share-viewer.js');
      expect(loaded.every((l) => l.split(' ')[1].startsWith('/share/'))).toBe(true);
      await anon.close();
      await owner.close();
    });
  });
});
