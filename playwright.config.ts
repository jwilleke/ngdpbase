import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load PORT from .env if not already set in the environment.
// Mirrors what server.sh does: source .env, then let shell exports override.
if (!process.env.PORT) {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*PORT\s*=\s*(\d+)/);
      if (m) { process.env.PORT = m[1]; break; }
    }
  }
}

const PORT = process.env.PORT ?? '3000';

/**
 * Playwright E2E Test Configuration for ngdpbase
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // All E2E files consolidated under tests/e2e/
  testDir: './tests/e2e',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // #622: the E2E analog of the unit full-suite-concurrency flake — under
  // the full parallel run, page.goto/waitForURL occasionally hit the 30s
  // timeout and pass on an isolated re-run. Local was `0`, so the local
  // release gate (run outside CI) had no self-heal and a single nav-timeout
  // aborted the whole gate. 1 local retry clears a flake; a real break
  // still fails both attempts. CI stays at 2.
  retries: process.env.CI ? 2 : 1,

  // Opt out of parallel tests on CI for stability
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration - consolidated under tests/e2e/.output/
  reporter: [
    ['html', { outputFolder: 'tests/e2e/.output/report' }],
    ['list']
  ],

  // Shared settings for all projects
  use: {
    // Base URL for the application — reads PORT from .env, falls back to 3000
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure'
  },

  // Configure the web server to start before running tests
  // Only starts a new server in CI - locally, use existing server on PORT
  webServer: process.env.CI ? {
    command: 'PORT=3099 NODE_ENV=test node dist/src/app.js',
    url: 'http://localhost:3099',
    reuseExistingServer: false,
    timeout: 60000,
    stdout: 'pipe',
    stderr: 'pipe'
  } : undefined,

  // Test projects for different browsers
  projects: [
    // Setup project for authentication (longer timeout to allow for engine initialization)
    {
      name: 'setup',
      testMatch: /.*\.setup\.(js|ts)/,
      timeout: 150000
    },

    // Chromium tests (main browser) - excludes files owned by dedicated viewport projects
    {
      name: 'chromium',
      testIgnore: /admin-maintenance\.spec\.(js|ts)|mobile-navigation\.spec\.(js|ts)/,
      use: {
        browserName: 'chromium',
        // Use setup project for authenticated tests
        storageState: './tests/e2e/.auth/user.json'
      },
      dependencies: ['setup']
    },

    // Mobile navigation tests — Pixel 5 viewport, no auth needed for layout checks
    {
      name: 'mobile-chrome',
      testMatch: /mobile-navigation\.spec\.(js|ts)/,
      use: {
        ...devices['Pixel 5'],
        storageState: './tests/e2e/.auth/user.json'
      },
      dependencies: ['setup']
    },

    // Admin maintenance tests run LAST since they toggle server-wide maintenance mode
    // which would cause other parallel tests to get 503 responses
    {
      name: 'chromium-maintenance',
      testMatch: /admin-maintenance\.spec\.(js|ts)/,
      use: {
        browserName: 'chromium',
        storageState: './tests/e2e/.auth/user.json'
      },
      dependencies: ['chromium']
    }
  ],

  // Output folder for test artifacts - consolidated under tests/e2e/.output/
  outputDir: 'tests/e2e/.output/results',

  // Global timeout for each test
  timeout: 30000,

  // Expect timeout
  expect: {
    timeout: 5000
  }
});
