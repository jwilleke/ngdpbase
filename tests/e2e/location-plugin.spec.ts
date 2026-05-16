import { test, expect } from '@playwright/test';
import { TEST_PAGE_PREFIX, waitForPageReady, deletePages } from './fixtures/helpers';

/**
 * LocationPlugin E2E Tests
 *
 * Tests for the Location plugin rendering in wiki pages.
 * These tests create pages with Location plugin syntax and verify
 * the rendered output contains expected map links and embeds.
 */

test.describe('LocationPlugin', () => {
  // Use authenticated state from setup
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  // Run serially - each test creates a page which triggers a search index rebuild
  // on large wikis (14K+ pages). Parallel execution overwhelms the server.
  test.describe.configure({ mode: 'serial' });

  // Increase timeout for page creation + save + index rebuild
  test.setTimeout(60000);

  const testPageName = `${TEST_PAGE_PREFIX}-LocationTest-${Date.now()}`;

  // Suffixes used across all tests in this describe block
  const PAGE_SUFFIXES = ['-name', '-coords', '-google', '-geo', '-embed', '-noembed', '-error', '-invalid', '-attrs', '-icon'];

  test.afterAll(async ({ browser }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ storageState: './tests/e2e/.auth/user.json' });
    const p = await context.newPage();
    await deletePages(p, PAGE_SUFFIXES.map((suffix) => `${testPageName}${suffix}`));
    await context.close();
  });

  test.describe('Basic Location Links', () => {
    test('should render location link with name parameter', async ({ page }) => {
      // Create a page with Location plugin
      await page.goto('/create');
      await page.waitForLoadState('domcontentloaded');

      const pageNameInput = page.locator('#pageName, input[name="pageName"]');
      await pageNameInput.first().waitFor({ state: 'visible', timeout: 10000 });
      await pageNameInput.first().fill(`${testPageName}-name`);

      // Select a template if required
      const templateSelect = page.locator('#templateName, select[name="templateName"]');
      if (await templateSelect.count() > 0 && await templateSelect.isVisible()) {
        const options = await templateSelect.locator('option').all();
        for (const option of options) {
          const value = await option.getAttribute('value');
          if (value && value !== '') {
            await templateSelect.selectOption(value);
            break;
          }
        }
      }

      // Submit create form
      const createButton = page.locator('button:has-text("Create Page"), form[action="/create"] button[type="submit"]');
      await Promise.all([
        page.waitForURL(/\/(edit|view)\//, { timeout: 30000 }),
        createButton.first().click()
      ]);

      // If redirected to edit, add content and save
      if (page.url().includes('/edit/')) {
        const contentArea = page.locator('textarea#editorContent, textarea[name="content"], .CodeMirror textarea');
        await contentArea.first().waitFor({ state: 'visible', timeout: 10000 });

        // Fill content with Location plugin
        const content = "[{Location name='Paris, France'}]";
        await contentArea.first().fill(content);

        // Save
        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]:has-text("Save")');
        await Promise.all([
          page.waitForURL(/\/view\//, { timeout: 30000 }),
          saveButton.first().click()
        ]);
      }

      // Verify rendered output
      await waitForPageReady(page);

      // Should have a location link
      const locationLink = page.locator('.location-link, a[href*="openstreetmap"], a[href*="maps"]');
      await expect(locationLink.first()).toBeVisible({ timeout: 5000 });

      // Should contain the location name
      const pageContent = await page.content();
      expect(pageContent).toContain('Paris');
    });

    test('should render location link with coordinates', async ({ page }) => {
      await page.goto('/create');
      await page.waitForLoadState('domcontentloaded');

      const pageNameInput = page.locator('#pageName, input[name="pageName"]');
      await pageNameInput.first().waitFor({ state: 'visible', timeout: 10000 });
      await pageNameInput.first().fill(`${testPageName}-coords`);

      const templateSelect = page.locator('#templateName, select[name="templateName"]');
      if (await templateSelect.count() > 0 && await templateSelect.isVisible()) {
        const options = await templateSelect.locator('option').all();
        for (const option of options) {
          const value = await option.getAttribute('value');
          if (value && value !== '') {
            await templateSelect.selectOption(value);
            break;
          }
        }
      }

      const createButton = page.locator('button:has-text("Create Page"), form[action="/create"] button[type="submit"]');
      await Promise.all([
        page.waitForURL(/\/(edit|view)\//, { timeout: 30000 }),
        createButton.first().click()
      ]);

      if (page.url().includes('/edit/')) {
        const contentArea = page.locator('textarea#editorContent, textarea[name="content"], .CodeMirror textarea');
        await contentArea.first().waitFor({ state: 'visible', timeout: 10000 });

        const content = "[{Location coords='48.8566,2.3522' label='Eiffel Tower'}]";
        await contentArea.first().fill(content);

        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]:has-text("Save")');
        await Promise.all([
          page.waitForURL(/\/view\//, { timeout: 30000 }),
          saveButton.first().click()
        ]);
      }

      await waitForPageReady(page);

      // Should have location link with coordinates in URL
      const locationLink = page.locator('.location-link, a[href*="48.8566"], a[href*="2.3522"]');
      await expect(locationLink.first()).toBeVisible({ timeout: 5000 });

      // Should show custom label
      const pageContent = await page.content();
      expect(pageContent).toContain('Eiffel Tower');
    });
  });

  test.describe('Map Providers', () => {
    test('should use Google Maps when provider=google', async ({ page }) => {
      await page.goto('/create');
      await page.waitForLoadState('domcontentloaded');

      const pageNameInput = page.locator('#pageName, input[name="pageName"]');
      await pageNameInput.first().waitFor({ state: 'visible', timeout: 10000 });
      await pageNameInput.first().fill(`${testPageName}-google`);

      const templateSelect = page.locator('#templateName, select[name="templateName"]');
      if (await templateSelect.count() > 0 && await templateSelect.isVisible()) {
        const options = await templateSelect.locator('option').all();
        for (const option of options) {
          const value = await option.getAttribute('value');
          if (value && value !== '') {
            await templateSelect.selectOption(value);
            break;
          }
        }
      }

      const createButton = page.locator('button:has-text("Create Page"), form[action="/create"] button[type="submit"]');
      await Promise.all([
        page.waitForURL(/\/(edit|view)\//, { timeout: 30000 }),
        createButton.first().click()
      ]);

      if (page.url().includes('/edit/')) {
        const contentArea = page.locator('textarea#editorContent, textarea[name="content"], .CodeMirror textarea');
        await contentArea.first().waitFor({ state: 'visible', timeout: 10000 });

        const content = "[{Location coords='40.7128,-74.0060' provider='google' label='NYC'}]";
        await contentArea.first().fill(content);

        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]:has-text("Save")');
        await Promise.all([
          page.waitForURL(/\/view\//, { timeout: 30000 }),
          saveButton.first().click()
        ]);
      }

      await waitForPageReady(page);

      // Should have Google Maps link
      const googleLink = page.locator('a[href*="google.com/maps"]');
      await expect(googleLink.first()).toBeVisible({ timeout: 5000 });
    });

    test('should use geo: URI when provider=geo', async ({ page }) => {
      await page.goto('/create');
      await page.waitForLoadState('domcontentloaded');

      const pageNameInput = page.locator('#pageName, input[name="pageName"]');
      await pageNameInput.first().waitFor({ state: 'visible', timeout: 10000 });
      await pageNameInput.first().fill(`${testPageName}-geo`);

      const templateSelect = page.locator('#templateName, select[name="templateName"]');
      if (await templateSelect.count() > 0 && await templateSelect.isVisible()) {
        const options = await templateSelect.locator('option').all();
        for (const option of options) {
          const value = await option.getAttribute('value');
          if (value && value !== '') {
            await templateSelect.selectOption(value);
            break;
          }
        }
      }

      const createButton = page.locator('button:has-text("Create Page"), form[action="/create"] button[type="submit"]');
      await Promise.all([
        page.waitForURL(/\/(edit|view)\//, { timeout: 30000 }),
        createButton.first().click()
      ]);

      if (page.url().includes('/edit/')) {
        const contentArea = page.locator('textarea#editorContent, textarea[name="content"], .CodeMirror textarea');
        await contentArea.first().waitFor({ state: 'visible', timeout: 10000 });

        const content = "[{Location coords='51.5074,-0.1278' provider='geo' label='London'}]";
        await contentArea.first().fill(content);

        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]:has-text("Save")');
        await Promise.all([
          page.waitForURL(/\/view\//, { timeout: 30000 }),
          saveButton.first().click()
        ]);
      }

      await waitForPageReady(page);

      // Should have geo: URI link
      const geoLink = page.locator('a[href^="geo:"]');
      await expect(geoLink.first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Embedded Maps', () => {
    test('should show embedded map with embed=true', async ({ page }) => {
      await page.goto('/create');
      await page.waitForLoadState('domcontentloaded');

      const pageNameInput = page.locator('#pageName, input[name="pageName"]');
      await pageNameInput.first().waitFor({ state: 'visible', timeout: 10000 });
      await pageNameInput.first().fill(`${testPageName}-embed`);

      const templateSelect = page.locator('#templateName, select[name="templateName"]');
      if (await templateSelect.count() > 0 && await templateSelect.isVisible()) {
        const options = await templateSelect.locator('option').all();
        for (const option of options) {
          const value = await option.getAttribute('value');
          if (value && value !== '') {
            await templateSelect.selectOption(value);
            break;
          }
        }
      }

      const createButton = page.locator('button:has-text("Create Page"), form[action="/create"] button[type="submit"]');
      await Promise.all([
        page.waitForURL(/\/(edit|view)\//, { timeout: 30000 }),
        createButton.first().click()
      ]);

      if (page.url().includes('/edit/')) {
        const contentArea = page.locator('textarea#editorContent, textarea[name="content"], .CodeMirror textarea');
        await contentArea.first().waitFor({ state: 'visible', timeout: 10000 });

        const content = "[{Location coords='35.6762,139.6503' embed=true label='Tokyo'}]";
        await contentArea.first().fill(content);

        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]:has-text("Save")');
        await Promise.all([
          page.waitForURL(/\/view\//, { timeout: 30000 }),
          saveButton.first().click()
        ]);
      }

      await waitForPageReady(page);

      // Should have embedded map container
      const container = page.locator('.location-plugin-container');
      await expect(container.first()).toBeVisible({ timeout: 5000 });

      // Should have iframe with OSM embed
      const iframe = page.locator('.location-map iframe, iframe[src*="openstreetmap"]');
      await expect(iframe.first()).toBeVisible({ timeout: 5000 });
    });

    test('should show unavailable message for non-embeddable providers', async ({ page }) => {
      await page.goto('/create');
      await page.waitForLoadState('domcontentloaded');

      const pageNameInput = page.locator('#pageName, input[name="pageName"]');
      await pageNameInput.first().waitFor({ state: 'visible', timeout: 10000 });
      await pageNameInput.first().fill(`${testPageName}-noembed`);

      const templateSelect = page.locator('#templateName, select[name="templateName"]');
      if (await templateSelect.count() > 0 && await templateSelect.isVisible()) {
        const options = await templateSelect.locator('option').all();
        for (const option of options) {
          const value = await option.getAttribute('value');
          if (value && value !== '') {
            await templateSelect.selectOption(value);
            break;
          }
        }
      }

      const createButton = page.locator('button:has-text("Create Page"), form[action="/create"] button[type="submit"]');
      await Promise.all([
        page.waitForURL(/\/(edit|view)\//, { timeout: 30000 }),
        createButton.first().click()
      ]);

      if (page.url().includes('/edit/')) {
        const contentArea = page.locator('textarea#editorContent, textarea[name="content"], .CodeMirror textarea');
        await contentArea.first().waitFor({ state: 'visible', timeout: 10000 });

        const content = "[{Location coords='48.8566,2.3522' embed=true provider='google'}]";
        await contentArea.first().fill(content);

        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]:has-text("Save")');
        await Promise.all([
          page.waitForURL(/\/view\//, { timeout: 30000 }),
          saveButton.first().click()
        ]);
      }

      await waitForPageReady(page);

      // Should show unavailable message
      const unavailable = page.locator('.location-map-unavailable');
      await expect(unavailable.first()).toBeVisible({ timeout: 5000 });

      const pageContent = await page.content();
      expect(pageContent).toContain('not available');
    });
  });

  test.describe('Error Handling', () => {
    test('should show error for missing parameters', async ({ page }) => {
      await page.goto('/create');
      await page.waitForLoadState('domcontentloaded');

      const pageNameInput = page.locator('#pageName, input[name="pageName"]');
      await pageNameInput.first().waitFor({ state: 'visible', timeout: 10000 });
      await pageNameInput.first().fill(`${testPageName}-error`);

      const templateSelect = page.locator('#templateName, select[name="templateName"]');
      if (await templateSelect.count() > 0 && await templateSelect.isVisible()) {
        const options = await templateSelect.locator('option').all();
        for (const option of options) {
          const value = await option.getAttribute('value');
          if (value && value !== '') {
            await templateSelect.selectOption(value);
            break;
          }
        }
      }

      const createButton = page.locator('button:has-text("Create Page"), form[action="/create"] button[type="submit"]');
      await Promise.all([
        page.waitForURL(/\/(edit|view)\//, { timeout: 30000 }),
        createButton.first().click()
      ]);

      if (page.url().includes('/edit/')) {
        const contentArea = page.locator('textarea#editorContent, textarea[name="content"], .CodeMirror textarea');
        await contentArea.first().waitFor({ state: 'visible', timeout: 10000 });

        // Missing both name and coords
        const content = '[{Location zoom=15}]';
        await contentArea.first().fill(content);

        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]:has-text("Save")');
        await Promise.all([
          page.waitForURL(/\/view\//, { timeout: 30000 }),
          saveButton.first().click()
        ]);
      }

      await waitForPageReady(page);

      // Should show error message
      const error = page.locator('.location-error');
      await expect(error.first()).toBeVisible({ timeout: 5000 });

      const pageContent = await page.content();
      expect(pageContent).toContain('Missing name or coords');
    });

    test('should show error for invalid coordinates', async ({ page }) => {
      await page.goto('/create');
      await page.waitForLoadState('domcontentloaded');

      const pageNameInput = page.locator('#pageName, input[name="pageName"]');
      await pageNameInput.first().waitFor({ state: 'visible', timeout: 10000 });
      await pageNameInput.first().fill(`${testPageName}-invalid`);

      const templateSelect = page.locator('#templateName, select[name="templateName"]');
      if (await templateSelect.count() > 0 && await templateSelect.isVisible()) {
        const options = await templateSelect.locator('option').all();
        for (const option of options) {
          const value = await option.getAttribute('value');
          if (value && value !== '') {
            await templateSelect.selectOption(value);
            break;
          }
        }
      }

      const createButton = page.locator('button:has-text("Create Page"), form[action="/create"] button[type="submit"]');
      await Promise.all([
        page.waitForURL(/\/(edit|view)\//, { timeout: 30000 }),
        createButton.first().click()
      ]);

      if (page.url().includes('/edit/')) {
        const contentArea = page.locator('textarea#editorContent, textarea[name="content"], .CodeMirror textarea');
        await contentArea.first().waitFor({ state: 'visible', timeout: 10000 });

        // Invalid coordinates
        const content = "[{Location coords='invalid,coords'}]";
        await contentArea.first().fill(content);

        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]:has-text("Save")');
        await Promise.all([
          page.waitForURL(/\/view\//, { timeout: 30000 }),
          saveButton.first().click()
        ]);
      }

      await waitForPageReady(page);

      // Should show error message
      const error = page.locator('.location-error');
      await expect(error.first()).toBeVisible({ timeout: 5000 });

      const pageContent = await page.content();
      expect(pageContent).toContain('Invalid coords format');
    });
  });

  test.describe('Link Attributes', () => {
    test('should open links in new tab with noopener', async ({ page }) => {
      await page.goto('/create');
      await page.waitForLoadState('domcontentloaded');

      const pageNameInput = page.locator('#pageName, input[name="pageName"]');
      await pageNameInput.first().waitFor({ state: 'visible', timeout: 10000 });
      await pageNameInput.first().fill(`${testPageName}-attrs`);

      const templateSelect = page.locator('#templateName, select[name="templateName"]');
      if (await templateSelect.count() > 0 && await templateSelect.isVisible()) {
        const options = await templateSelect.locator('option').all();
        for (const option of options) {
          const value = await option.getAttribute('value');
          if (value && value !== '') {
            await templateSelect.selectOption(value);
            break;
          }
        }
      }

      const createButton = page.locator('button:has-text("Create Page"), form[action="/create"] button[type="submit"]');
      await Promise.all([
        page.waitForURL(/\/(edit|view)\//, { timeout: 30000 }),
        createButton.first().click()
      ]);

      if (page.url().includes('/edit/')) {
        const contentArea = page.locator('textarea#editorContent, textarea[name="content"], .CodeMirror textarea');
        await contentArea.first().waitFor({ state: 'visible', timeout: 10000 });

        const content = "[{Location name='Sydney, Australia'}]";
        await contentArea.first().fill(content);

        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]:has-text("Save")');
        await Promise.all([
          page.waitForURL(/\/view\//, { timeout: 30000 }),
          saveButton.first().click()
        ]);
      }

      await waitForPageReady(page);

      // Check link attributes
      const link = page.locator('.location-link');
      await expect(link.first()).toHaveAttribute('target', '_blank');
      await expect(link.first()).toHaveAttribute('rel', 'noopener');
    });

    test('should have map marker icon', async ({ page }) => {
      await page.goto('/create');
      await page.waitForLoadState('domcontentloaded');

      const pageNameInput = page.locator('#pageName, input[name="pageName"]');
      await pageNameInput.first().waitFor({ state: 'visible', timeout: 10000 });
      await pageNameInput.first().fill(`${testPageName}-icon`);

      const templateSelect = page.locator('#templateName, select[name="templateName"]');
      if (await templateSelect.count() > 0 && await templateSelect.isVisible()) {
        const options = await templateSelect.locator('option').all();
        for (const option of options) {
          const value = await option.getAttribute('value');
          if (value && value !== '') {
            await templateSelect.selectOption(value);
            break;
          }
        }
      }

      const createButton = page.locator('button:has-text("Create Page"), form[action="/create"] button[type="submit"]');
      await Promise.all([
        page.waitForURL(/\/(edit|view)\//, { timeout: 30000 }),
        createButton.first().click()
      ]);

      if (page.url().includes('/edit/')) {
        const contentArea = page.locator('textarea#editorContent, textarea[name="content"], .CodeMirror textarea');
        await contentArea.first().waitFor({ state: 'visible', timeout: 10000 });

        const content = "[{Location name='Berlin, Germany'}]";
        await contentArea.first().fill(content);

        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]:has-text("Save")');
        await Promise.all([
          page.waitForURL(/\/view\//, { timeout: 30000 }),
          saveButton.first().click()
        ]);
      }

      await waitForPageReady(page);

      // Check for map marker icon
      const icon = page.locator('.location-link .fa-map-marker-alt, .location-link i');
      await expect(icon.first()).toBeVisible({ timeout: 5000 });
    });
  });
});
