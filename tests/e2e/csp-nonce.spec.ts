import { test, expect } from '@playwright/test';

/**
 * #1703 — every inline script in a rendered page carries that response's
 * nonce, and the nonce is new on every response.
 *
 * The unit guard reads the templates; this reads what the server actually
 * sends, so a view rendered without the request's locals (where the nonce
 * would come out as `nonce=""`) is caught too.
 */
test.describe('#1703 — inline scripts carry the response nonce', () => {
  // The nonce on each script tag that has one. Scripts that plugins write into
  // page content do not carry it yet (they are cached with the page, so they
  // move to static files instead, #1704); the views' own scripts all do.
  const inlineScriptNonces = (html: string): string[] =>
    [...html.matchAll(/<script\b[^>]*\bnonce="([^"]*)"[^>]*>/g)].map(([, nonce]) => nonce);

  test('one non-empty nonce per page, different on the next request', async ({ page }) => {
    const first = await (await page.request.get('/')).text();
    const second = await (await page.request.get('/')).text();
    const a = inlineScriptNonces(first);
    const b = inlineScriptNonces(second);

    expect(a.length).toBeGreaterThan(0);
    expect(new Set(a).size).toBe(1);
    expect(a[0]).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(b[0]).not.toBe(a[0]);
  });

  test('the editor page too', async ({ page }) => {
    // A new page name opens the editor without saving anything.
    const html = await (await page.request.get(`/edit/${encodeURIComponent(`E2E-CspNonce-${Date.now()}`)}`)).text();
    const nonces = inlineScriptNonces(html);
    expect(nonces.length).toBeGreaterThan(0);
    expect(nonces.every((n) => n !== '')).toBe(true);
    expect(new Set(nonces).size).toBe(1);
  });
});
