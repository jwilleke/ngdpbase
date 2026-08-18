# Complete Testing Guide

__Last Updated:__ 2025-12-27
__Version:__ 1.5.0

This guide consolidates all testing documentation for ngdpbase into a single comprehensive reference.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Framework](#test-framework)
3. [Running Tests](#running-tests)
4. [Writing Tests](#writing-tests)
5. [Mocking Patterns](#mocking-patterns)
6. [Test Categories](#test-categories)
7. [E2E Testing (Playwright)](#e2e-testing-playwright)
8. [Debugging Tests](#debugging-tests)
9. [CI/CD Integration](#cicd-integration)
10. [Manual QA Testing](#manual-qa-testing)
11. [Best Practices](#best-practices)

---

## Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run specific test file
npm test -- src/managers/__tests__/UserManager.test.js

# Run tests matching pattern
npm test -- --testPathPattern="Manager"

# Watch mode (re-runs on file changes)
npm run test:watch

# Generate coverage report
npm run test:coverage

# Quick smoke test (30 seconds)
npm run smoke
```

---

## Test Framework

### Stack

- __Jest__ - Test runner and assertion library
- __Supertest__ - HTTP endpoint testing
- __Mock functions__ - Jest built-in mocking

### Configuration

__package.json scripts:__

```json
{
  "test": "NODE_ENV=test jest",
  "test:watch": "NODE_ENV=test jest --watch",
  "test:coverage": "NODE_ENV=test jest --coverage",
  "test:changed": "NODE_ENV=test jest --changedSince=HEAD --bail",
  "smoke": "./scripts/smoke-test.sh"
}
```

__Jest configuration__ (in package.json):

```json
{
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/__tests__/**/*.js", "**/*.test.js"],
    "setupFilesAfterEnv": ["./jest.setup.js"],
    "testTimeout": 120000
  }
}
```

### Directory Structure

```
src/
├── managers/
│   └── __tests__/           # Manager unit tests
├── providers/
│   └── __tests__/           # Provider tests
├── routes/
│   └── __tests__/           # Route/API tests
├── parsers/
│   └── __tests__/           # Parser tests
├── utils/
│   └── __tests__/           # Utility tests
└── __tests__/               # Integration tests
```

---

## Running Tests

### All Tests

```bash
npm test
```

### Specific Test File

```bash
npm test -- src/managers/__tests__/UserManager.test.js
```

### Tests Matching Pattern

```bash
npm test -- --testPathPattern="Manager"
npm test -- --testNamePattern="should authenticate"
```

### Watch Mode

```bash
npm run test:watch
```

### With Coverage

```bash
npm run test:coverage
# Coverage report generated in ./coverage/
```

### Changed Files Only

```bash
npm run test:changed
```

### Debug Mode

```bash
npm test -- --runInBand --verbose
```

---

## Writing Tests

### Basic Test Structure

```javascript
const { describe, test, expect, beforeEach } = require('@jest/globals');

describe('ComponentName', () => {
  let component;

  beforeEach(() => {
    // Setup before each test
    component = new Component();
  });

  describe('methodName', () => {
    test('should do expected behavior', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = component.method(input);

      // Assert
      expect(result).toBe('expected');
    });

    test('should handle edge case', () => {
      expect(() => component.method(null)).toThrow();
    });
  });
});
```

### Async Tests

```javascript
test('should fetch data asynchronously', async () => {
  const result = await component.fetchData();
  expect(result).toBeDefined();
});
```

### Testing Managers

Managers require engine and ConfigurationManager mocks:

```javascript
const UserManager = require('../managers/UserManager');

describe('UserManager', () => {
  let userManager;
  let mockEngine;
  let mockConfigManager;

  beforeEach(() => {
    mockConfigManager = {
      getProperty: jest.fn((key, defaultValue) => {
        const config = {
          'ngdpbase.user.provider': 'fileuserprovider',
          'ngdpbase.user.security.passwordsalt': 'test-salt'
        };
        return config[key] !== undefined ? config[key] : defaultValue;
      })
    };

    mockEngine = {
      getManager: jest.fn((name) => {
        if (name === 'ConfigurationManager') return mockConfigManager;
        return null;
      })
    };

    userManager = new UserManager(mockEngine);
  });

  test('should initialize', async () => {
    await userManager.initialize();
    expect(userManager.provider).toBeDefined();
  });
});
```

### Testing Routes

```javascript
const request = require('supertest');
const express = require('express');

describe('WikiRoutes', () => {
  let app;

  beforeEach(() => {
    app = express();
    // Setup routes and middleware
  });

  test('GET /wiki/:page returns page content', async () => {
    const response = await request(app)
      .get('/wiki/TestPage')
      .expect(200);

    expect(response.text).toContain('TestPage');
  });
});
```

---

## Mocking Patterns

### Mock Logger (Global)

Already configured in `jest.setup.js`:

```javascript
jest.mock('./src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));
```

### Mock ConfigurationManager

```javascript
const mockConfigManager = {
  getProperty: jest.fn((key, defaultValue) => defaultValue),
  setProperty: jest.fn(),
  getAllProperties: jest.fn(() => ({}))
};
```

### Mock Provider

```javascript
jest.mock('../providers/FileUserProvider', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    getProviderInfo: jest.fn().mockReturnValue({
      name: 'FileUserProvider',
      version: '1.0.0'
    }),
    getAllUsers: jest.fn().mockResolvedValue(new Map()),
    getUser: jest.fn().mockResolvedValue(null),
    createUser: jest.fn().mockResolvedValue(undefined),
    updateUser: jest.fn().mockResolvedValue(undefined),
    deleteUser: jest.fn().mockResolvedValue(undefined)
  }));
});
```

### Mock File System

```javascript
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn().mockResolvedValue('{}'),
    writeFile: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockResolvedValue(undefined)
  }
}));
```

### Mock WikiEngine

```javascript
const mockEngine = {
  getManager: jest.fn((name) => {
    const managers = {
      'ConfigurationManager': mockConfigManager,
      'PageManager': mockPageManager,
      'UserManager': mockUserManager
    };
    return managers[name] || null;
  }),
  initialize: jest.fn().mockResolvedValue(undefined),
  shutdown: jest.fn().mockResolvedValue(undefined)
};
```

---

## Test Categories

### Unit Tests

Test individual functions/methods in isolation:

```javascript
// src/utils/__tests__/SecurityUtils.test.js
describe('SecurityUtils', () => {
  test('hashPassword creates consistent hash', () => {
    const hash1 = SecurityUtils.hashPassword('test', 'salt');
    const hash2 = SecurityUtils.hashPassword('test', 'salt');
    expect(hash1).toBe(hash2);
  });
});
```

### Integration Tests

Test multiple components working together:

```javascript
// src/__tests__/WikiEngine.integration.test.js
describe('WikiEngine Integration', () => {
  test('managers communicate correctly', async () => {
    const engine = new WikiEngine();
    await engine.initialize();

    const pageManager = engine.getManager('PageManager');
    const searchManager = engine.getManager('SearchManager');

    await pageManager.savePage('Test', 'content');
    const results = await searchManager.search('content');

    expect(results.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests with Actual Providers

When testing manager-provider integration (not just mocked delegation), bypass the global mocks using `jest.unmock()`:

```javascript
// src/managers/__tests__/PageManager-Storage.test.js
/**
 * Integration tests using actual FileSystemProvider
 */

// Unmock providers BEFORE requires
jest.unmock('../../providers/FileSystemProvider');
jest.unmock('../../utils/PageNameMatcher');

const path = require('path');
const fs = require('fs-extra');
const PageManager = require('../PageManager');

// Create unique test directories per test
let TEST_DIR;
let TEST_PAGES_DIR;

beforeEach(async () => {
  TEST_DIR = path.join(__dirname, `../../temp-test-${Date.now()}`);
  TEST_PAGES_DIR = path.join(TEST_DIR, 'pages');
  await fs.ensureDir(TEST_PAGES_DIR);
});

afterEach(async () => {
  await fs.remove(TEST_DIR);
});

test('should save and retrieve page via actual provider', async () => {
  const pageManager = new PageManager(mockEngine);
  await pageManager.initialize();

  await pageManager.savePage('Test', '# Content', {});
  const page = await pageManager.getPage('Test');

  expect(page.title).toBe('Test');
  expect(page.content).toContain('Content');
});
```

This pattern is used for:

- __PageManager-Storage.test.js__ - Tests full save/retrieve/delete flow
- __FileSystemProvider.test.js__ - Tests installation-aware loading

### Route/API Tests

Test HTTP endpoints:

```javascript
describe('API Routes', () => {
  test('POST /api/page creates page', async () => {
    const response = await request(app)
      .post('/api/page')
      .send({ name: 'TestPage', content: 'Hello' })
      .expect(201);

    expect(response.body.success).toBe(true);
  });
});
```

---

## E2E Testing (Playwright)

End-to-End tests use Playwright to test the full application stack in a real browser. These tests catch issues that unit tests miss: UI bugs, API failures, cross-feature interactions, and real user workflows.

### Why E2E Tests?

- __Unit tests (Jest)__: Test individual functions in isolation
- __E2E tests (Playwright)__: Test the full stack as a user would

E2E tests are critical for regression prevention - they run on every code change to ensure new features don't break existing functionality.

### Directory Structure

```
tests/e2e/
├── .auth/                    # Session state (gitignored)
│   └── user.json             # Saved authentication
├── .output/                  # Test artifacts (gitignored)
│   ├── report/               # HTML reports
│   └── results/              # Test results
├── fixtures/                 # Reusable test helpers
│   ├── auth.js               # Authentication utilities
│   └── helpers.js            # Common test utilities
├── auth.setup.js             # Authentication setup (runs first)
├── auth.spec.js              # Authentication tests
├── pages.spec.js             # Page operation tests
├── search.spec.js            # Search functionality tests
├── admin.spec.js             # Admin dashboard tests
└── .gitignore                # Excludes .auth/ and .output/
```

### About Fixtures

__Yes, fixtures are needed.__ The `fixtures/` directory contains reusable test helpers:

- __`auth.js`__: Authentication helpers for login/logout
- __`helpers.js`__: Common utilities like waiting for elements, generating test data

Fixtures help:

1. __DRY principle__ - Avoid repeating login code in every test
2. __Consistency__ - Same authentication flow across all tests
3. __Maintainability__ - Update once when UI changes

### Running E2E Tests

```bash
# Run all E2E tests (starts server automatically on port 3099)
npm run test:e2e

# Run with Playwright UI (visual debugging)
npm run test:e2e:ui

# Run in headed mode (see the browser)
npm run test:e2e:headed

# Run specific test file
npx playwright test auth.spec.js

# Run tests matching pattern
npx playwright test --grep "login"

# Generate HTML report
npx playwright show-report tests/e2e/.output/report
```

### Configuration

`playwright.config.js`:

```javascript
module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  use: {
    baseURL: 'http://localhost:3099',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Auto-start server before tests
  webServer: {
    command: 'PORT=3099 NODE_ENV=test node app.js',
    url: 'http://localhost:3099',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },

  projects: [
    { name: 'setup', testMatch: /.*\.setup\.js/ },
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      dependencies: ['setup'],
    },
  ],
});
```

### Writing E2E Tests

#### Basic Test Structure

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Feature Name', () => {
  // Use saved authentication state
  test.use({ storageState: './tests/e2e/.auth/user.json' });

  test('should do expected behavior', async ({ page }) => {
    // Navigate
    await page.goto('/some-page');
    await page.waitForLoadState('networkidle');

    // Interact
    await page.fill('input[name="field"]', 'value');
    await page.click('button[type="submit"]');

    // Assert
    await expect(page).toHaveURL(/expected-url/);
    await expect(page.locator('.success')).toBeVisible();
  });
});
```

#### Authentication Setup

```javascript
// auth.setup.js - Runs before all tests
const { test: setup } = require('@playwright/test');

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'admin');
  await page.click('button[type="submit"]');

  // Save session state for other tests
  await page.context().storageState({ path: './tests/e2e/.auth/user.json' });
});
```

### Testing

- Write tests for all public functions
- Use test naming convention: `describe()` for groups, `it()` for specs
- Aim for >80% code coverage
- Test behavior, not implementation details

#### Testing Protected Routes

```javascript
test('should protect admin routes', async ({ browser }) => {
  // Create fresh context without authentication
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/admin');

  // Should redirect to login
  expect(page.url()).toContain('login');

  await context.close();
});
```

### E2E Test Coverage

| Test File | Tests | Description |
| --- | --- | --- |
| auth.setup.js | 1 | Authentication state setup |
| auth.spec.js | 7 | Login, logout, sessions, protected routes |
| pages.spec.js | 12 | Page viewing, editing, creation, categories |
| search.spec.js | 7 | Search interface, text search, filters |
| admin.spec.js | 8 | Dashboard, user management, configuration |
| __Total__ | __35__ | Core user journeys |

### E2E Best Practices

__DO:__

- Use `waitForLoadState('networkidle')` after navigation
- Use flexible selectors (`[name="field"]`, `.class`, `text=Label`)
- Test real user workflows, not implementation details
- Save authentication state to avoid logging in repeatedly
- Use `test.skip()` for features that may not exist

__DON'T:__

- Hardcode test data that may change
- Rely on specific timing (use proper waits)
- Test every edge case (that's for unit tests)
- Run E2E tests for simple logic validation

---

## Debugging Tests

### Verbose Output

```bash
npm test -- --verbose
```

### Run Single Test

```bash
npm test -- --testNamePattern="should authenticate user"
```

### Run In Band (No Parallel)

```bash
npm test -- --runInBand
```

### Debug with Node Inspector

```bash
node --inspect-brk node_modules/.bin/jest --runInBand <test-file>
```

### Check for Memory Leaks

```bash
npm test -- --detectLeaks
```

### Clear Cache

```bash
npm test -- --clearCache
```

---

## CI/CD Integration

### GitHub Actions

`.github/workflows/ci.yml`:

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Run smoke tests
        run: npm run smoke
```

### Pre-Commit Hooks

With Husky:

```bash
npm install --save-dev husky
npx husky install
npx husky add .husky/pre-commit "npm run test:changed"
```

---

## Manual QA Testing

### Test Environment Setup

1. Start server: `npm start` or `./server.sh start`
2. Open browser to `http://localhost:3000`
3. Open browser developer console
4. Monitor server logs: `pm2 logs`

### Core Test Scenarios

#### Page Operations

- [ ] Create new page
- [ ] Edit existing page
- [ ] Delete page
- [ ] View page history
- [ ] Restore previous version

#### User Operations

- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Logout
- [ ] View user profile
- [ ] Change password

#### Search

- [ ] Search for existing content
- [ ] Search with no results
- [ ] Search with special characters

#### Rendering

- [ ] Markdown renders correctly
- [ ] JSPWiki variables expand (`[{$username}]`)
- [ ] Plugins execute (`[{TableOfContents}]`)
- [ ] Wiki links work (`[PageName]`)
- [ ] Code blocks preserve syntax

### Performance Checks

- [ ] Page load < 200ms
- [ ] Search results < 500ms
- [ ] No memory leaks (monitor over time)

---

## Best Practices

### DO

- __Write tests first__ (TDD) for new features
- __Use descriptive test names__ that explain expected behavior
- __Mock external dependencies__ (file system, network, database)
- __Clean up after tests__ (reset state, remove temp files)
- __Test edge cases__ (null, empty, invalid input)
- __Keep tests fast__ (< 100ms per test ideally)
- __Use `beforeEach`__ for common setup
- __Test both success and failure cases__

### DON'T

- __Don't test implementation details__ - test behavior
- __Don't share state between tests__ - each test should be isolated
- __Don't use real file system__ in unit tests - mock it
- __Don't skip tests__ without good reason and TODO
- __Don't write tests that depend on order__ - they should run in any order
- __Don't hardcode paths__ - use `path.join()` and `__dirname`

### Test Naming Convention

```javascript
// Good: Describes behavior
test('should return null when user does not exist', () => {});
test('should throw error when password is empty', () => {});

// Bad: Vague
test('works', () => {});
test('test1', () => {});
```

### Assertion Guidelines

```javascript
// Be specific
expect(result).toBe('exact value');          // Exact match
expect(result).toEqual({ key: 'value' });    // Deep equality
expect(result).toContain('substring');        // Contains
expect(result).toHaveLength(3);               // Array/string length
expect(result).toBeDefined();                 // Not undefined
expect(result).toBeNull();                    // Is null
expect(fn).toThrow('error message');          // Throws error
```

---

## Troubleshooting

### Common Issues

#### "Cannot find module"

Check import paths - use relative paths from test file location.

#### "Timeout exceeded"

- Increase timeout: `jest.setTimeout(30000)`
- Check for unresolved promises
- Check for infinite loops

#### "Jest worker crashed"

- Run with `--runInBand` to debug
- Check for memory leaks
- Reduce parallel workers: `--maxWorkers=2`

#### Mock not working

- Ensure mock is defined before import
- Use `jest.mock()` at top of file
- Check mock path matches actual module path

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/ladjs/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

## Related Documentation

- [Testing-Summary.md](./Testing-Summary.md) - Current test status
- [PREVENTING-REGRESSIONS.md](./PREVENTING-REGRESSIONS.md) - Regression prevention strategy
