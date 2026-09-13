import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * #1355 — test pages are admin-only.
 *
 * Every required page with the system keyword `test-page` carries
 * `audience: [admin]`. An admin can open it; anyone else is refused.
 * Listings and search apply the same rule (`src/utils/frontmatterAccess.ts`,
 * #1054, unit-tested there). They are not asserted here: on jimstest these
 * pages reach neither search nor the page index even for an admin, so a
 * "not listed" check would pass without proving anything.
 *
 * The pages reach an instance by install seeding or Admin → Required Pages
 * Sync. A missing page fails here on purpose: it means the instance under
 * test is not carrying what ships.
 */
function testPageTitles(): string[] {
  const dir = path.join(process.cwd(), 'required-pages');
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .filter((src) => /^system-keywords:\s*\n(?:\s+-\s.*\n)*?\s+-\s+test-page\s*$/m.test(src))
    .map((src) => (src.match(/^title:\s*'?(.*?)'?\s*$/m) ?? [])[1])
    .filter((t): t is string => Boolean(t));
}

const titles = testPageTitles();

test.describe('Test pages are admin-only (#1355)', () => {
  test('there are test pages to check', () => {
    expect(titles.length).toBeGreaterThan(0);
  });

  test.describe('as an admin', () => {
    test.use({ storageState: './tests/e2e/.auth/user.json' });

    for (const title of titles) {
      test(`opens ${title}`, async ({ page }) => {
        const res = await page.goto(`/view/${encodeURIComponent(title)}`);
        expect(res?.status(), `${title} is missing — sync required pages to this instance`).toBe(200);
        await expect(page.locator('article').first()).toContainText('Each section is one');
      });
    }
  });

  test.describe('as an anonymous visitor', () => {
    // The chromium project signs every test in as the admin; start empty.
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const title of titles) {
      test(`cannot open ${title}`, async ({ page }) => {
        const res = await page.goto(`/view/${encodeURIComponent(title)}`);
        expect(res?.status()).toBe(403);
        await expect(page.locator('body')).not.toContainText('Each section is one');
      });
    }

  });
});
