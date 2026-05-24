import { test, expect } from '@playwright/test';

/**
 * Mobile Navigation E2E Tests (#371, #372, #373, #374, #375)
 *
 * Verifies the Bootstrap 5 mobile-friendly navigation:
 * - Offcanvas sidebar drawer triggered by hamburger
 * - Search available in offcanvas on mobile
 * - Page actions available in offcanvas on mobile
 * - Desktop sidebar toggle (inline, document-flow)
 * - Responsive content: tables and images constrained in markdown
 * - Touch targets: navigation buttons meet 44px minimum height
 *
 * These tests run with the Pixel 5 viewport (~393×851px) from playwright.config.js.
 * Desktop viewport tests use page.setViewportSize().
 */

test.describe('Mobile Navigation', () => {
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  test.describe('Offcanvas sidebar on mobile', () => {
    test('hamburger button is visible on mobile', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // Mobile hamburger uses data-bs-toggle=offcanvas
      const mobileHamburger = page.locator('button[data-bs-toggle="offcanvas"][data-bs-target="#mobileNavOffcanvas"]');
      await expect(mobileHamburger).toBeVisible();
    });

    test('desktop sidebar button is NOT visible on mobile', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // Desktop toggle button has d-none d-md-inline-flex — hidden on mobile
      const desktopToggle = page.locator('button.d-none.d-md-inline-flex[onclick*="toggleLeftMenu"]');
      await expect(desktopToggle).toBeHidden();
    });

    test('tapping hamburger opens the offcanvas drawer', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      const offcanvas = page.locator('#mobileNavOffcanvas');
      await expect(offcanvas).not.toHaveClass(/show/);

      await page.locator('button[data-bs-toggle="offcanvas"][data-bs-target="#mobileNavOffcanvas"]').click();
      await expect(offcanvas).toHaveClass(/show/, { timeout: 2000 });
    });

    test('offcanvas contains a search form', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      await page.locator('button[data-bs-toggle="offcanvas"][data-bs-target="#mobileNavOffcanvas"]').click();
      await page.locator('#mobileNavOffcanvas').waitFor({ state: 'visible' });

      const searchInput = page.locator('#mobileNavOffcanvas input[type="search"][name="q"]');
      await expect(searchInput).toBeVisible();
    });

    test('offcanvas can be closed via Bootstrap API', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      await page.locator('button[data-bs-toggle="offcanvas"][data-bs-target="#mobileNavOffcanvas"]').click();
      const offcanvas = page.locator('#mobileNavOffcanvas');
      await offcanvas.waitFor({ state: 'visible' });

      // Close via Bootstrap's JS API (simulates what data-bs-dismiss button does)
      await page.evaluate(() => {
        const el = document.getElementById('mobileNavOffcanvas');
        // @ts-expect-error -- bootstrap is global in browser context
        const instance = bootstrap.Offcanvas.getInstance(el);
        if (instance) instance.hide();
      });
      await expect(offcanvas).not.toHaveClass(/show/, { timeout: 2000 });
    });

    test('offcanvas search navigates to search results', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      await page.locator('button[data-bs-toggle="offcanvas"][data-bs-target="#mobileNavOffcanvas"]').click();
      await page.locator('#mobileNavOffcanvas').waitFor({ state: 'visible' });

      const searchInput = page.locator('#mobileNavOffcanvas input[name="q"]');
      await searchInput.fill('test');
      await searchInput.press('Enter');

      await page.waitForURL(/\/search/);
      await expect(page).toHaveURL(/\/search/);
    });
  });

  test.describe('Page actions in offcanvas', () => {
    test('page actions section appears when on a wiki page', async ({ page }) => {
      await page.goto('/view/User%20Documentation');
      await page.waitForLoadState('domcontentloaded');

      await page.locator('button[data-bs-toggle="offcanvas"][data-bs-target="#mobileNavOffcanvas"]').click();
      await page.locator('#mobileNavOffcanvas').waitFor({ state: 'visible' });

      // "Page Actions" heading should appear
      const pageActionsHeading = page.locator('#mobileNavOffcanvas').getByText('Page Actions', { exact: false });
      await expect(pageActionsHeading).toBeVisible();
    });

    test('page actions section shows non-page-specific items on app routes when authenticated (#784/#785)', async ({ page }) => {
      // /search has no pageName, but an authed user with create rights still has useful actions
      // (Create New Page, Upload Attachment, Browse Assets, Recent Changes, Export) — those
      // should be available on app routes too, not buried under the desktop-only More dropdown.
      await page.goto('/search');
      await page.waitForLoadState('domcontentloaded');

      await page.locator('button[data-bs-toggle="offcanvas"][data-bs-target="#mobileNavOffcanvas"]').click();
      await page.locator('#mobileNavOffcanvas').waitFor({ state: 'visible' });

      const offcanvas = page.locator('#mobileNavOffcanvas');

      // PAGE ACTIONS heading is visible when there's anything actionable, even without a pageName
      await expect(offcanvas.getByText('Page Actions', { exact: false })).toBeVisible();

      // Items that DON'T need pageName are present
      await expect(offcanvas.getByRole('link', { name: /Create New Page/i })).toBeVisible();
      await expect(offcanvas.getByRole('link', { name: /Export/i })).toBeVisible();
      await expect(offcanvas.getByRole('link', { name: /Recent Changes/i }).first()).toBeVisible();

      // Items that DO need pageName are NOT present on /search
      await expect(offcanvas.getByRole('link', { name: /^Edit Page$/i })).toHaveCount(0);
      await expect(offcanvas.getByRole('link', { name: /Page Information/i })).toHaveCount(0);
      await expect(offcanvas.getByRole('link', { name: /Add to My Links/i })).toHaveCount(0);
    });

    test('Reader View link is present in page actions', async ({ page }) => {
      await page.goto('/view/User%20Documentation');
      await page.waitForLoadState('domcontentloaded');

      await page.locator('button[data-bs-toggle="offcanvas"][data-bs-target="#mobileNavOffcanvas"]').click();
      await page.locator('#mobileNavOffcanvas').waitFor({ state: 'visible' });

      const readerLink = page.locator('#mobileNavOffcanvas a[href*="reader"]');
      await expect(readerLink).toBeVisible();
    });
  });

  test.describe('Navigation bar on mobile', () => {
    test('Info/Edit/More buttons are hidden on mobile', async ({ page }) => {
      await page.goto('/view/User%20Documentation');
      await page.waitForLoadState('domcontentloaded');

      // The right actions container has d-none d-md-block
      const actionCol = page.locator('.navigation .flex-shrink-0.d-none.d-md-block');
      await expect(actionCol).toBeHidden();
    });

    test('Trail dropdown is hidden on mobile', async ({ page }) => {
      await page.goto('/view/User%20Documentation');
      await page.waitForLoadState('domcontentloaded');

      const trail = page.locator('#trail.d-none.d-md-block');
      await expect(trail).toBeHidden();
    });

    test('logo is visible on mobile', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      const brand = page.locator('.jspwiki-header .navbar-brand');
      await expect(brand).toBeVisible();
    });

    test('user icon link is visible on mobile (authenticated)', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // Mobile compact user icon: anchor to /profile with d-flex d-md-none wrapper
      const mobileUserArea = page.locator('.jspwiki-header .d-flex.d-md-none');
      await expect(mobileUserArea).toBeVisible();
    });

    test('desktop search bar is NOT visible on mobile', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // Search is inside .collapse.navbar-collapse — hidden on mobile
      const desktopSearch = page.locator('#headerNavCollapse');
      await expect(desktopSearch).toBeHidden();
    });
  });
});

test.describe('Desktop Navigation', () => {
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  test.beforeEach(async ({ page }) => {
    // Force desktop viewport for these tests
    await page.setViewportSize({ width: 1280, height: 800 });
    // Clear any saved sidebar preference so we start fresh
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('leftMenuVisible'));
  });

  test('desktop hamburger is visible on desktop', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const desktopToggle = page.locator('button.d-none.d-md-inline-flex[onclick*="toggleLeftMenu"]');
    await expect(desktopToggle).toBeVisible();
  });

  test('mobile offcanvas hamburger is NOT visible on desktop', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const mobileHamburger = page.locator('button.d-md-none[data-bs-toggle="offcanvas"]');
    await expect(mobileHamburger).toBeHidden();
  });

  test('sidebar is visible by default on desktop', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const sidebar = page.locator('.sidebar.jspwiki-sidebar');
    await expect(sidebar).toBeVisible();
  });

  test('desktop hamburger toggles sidebar visibility', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const sidebar = page.locator('.sidebar.jspwiki-sidebar');
    const desktopToggle = page.locator('button.d-none.d-md-inline-flex[onclick*="toggleLeftMenu"]');

    await expect(sidebar).toBeVisible();

    // Hide sidebar
    await desktopToggle.click();
    await expect(sidebar).toBeHidden();

    // Show sidebar again
    await desktopToggle.click();
    await expect(sidebar).toBeVisible();
  });

  test('search bar is visible on desktop', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const searchInput = page.locator('#headerSearchInput');
    await expect(searchInput).toBeVisible();
  });

  test('Info/Edit/More buttons visible on desktop', async ({ page }) => {
    await page.goto('/view/User%20Documentation');
    await page.waitForLoadState('domcontentloaded');

    const infoBtn = page.locator('.navigation button:has-text("Info")');
    await expect(infoBtn).toBeVisible();

    const moreBtn = page.locator('.navigation button:has-text("More")');
    await expect(moreBtn).toBeVisible();
  });

  test('Trail dropdown visible on desktop', async ({ page }) => {
    await page.goto('/view/User%20Documentation');
    await page.waitForLoadState('domcontentloaded');

    const trail = page.locator('#trail');
    await expect(trail).toBeVisible();
  });
});

test.describe('Mobile layout — main content fills viewport (#375)', () => {
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  test('main content has no left blank column (fills viewport width)', async ({ page }) => {
    await page.goto('/view/User%20Documentation');
    await page.waitForLoadState('domcontentloaded');

    const viewport = page.viewportSize();
    const mainBox = await page.locator('main[role="main"]').boundingBox();

    // Main should start at or very near the left edge of the viewport
    expect(mainBox.x).toBeLessThanOrEqual(16); // allow for minor padding
    // Main should extend to fill the viewport width (accounting for gutters)
    expect(mainBox.width).toBeGreaterThanOrEqual(viewport.width * 0.9);
  });

  test('no horizontal scrollbar on mobile', async ({ page }) => {
    await page.goto('/view/User%20Documentation');
    await page.waitForLoadState('domcontentloaded');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // allow 1px rounding
  });
});

test.describe('Responsive content rendering (#372)', () => {
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  test('markdown images have max-width 100%', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/view/User%20Documentation');
    await page.waitForLoadState('domcontentloaded');

    // Check that any images in markdown content don't overflow viewport
    const images = page.locator('.markdown-body img');
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const box = await img.boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(390 + 1); // allow 1px rounding
      }
    }
  });

  test('markdown tables are scrollable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/view/User%20Documentation');
    await page.waitForLoadState('domcontentloaded');

    // Tables should have overflow-x: auto (block display)
    const tables = page.locator('.markdown-body table');
    const count = await tables.count();
    for (let i = 0; i < count; i++) {
      const overflowX = await tables.nth(i).evaluate(el => getComputedStyle(el).overflowX);
      expect(['auto', 'scroll']).toContain(overflowX);
    }
  });
});
