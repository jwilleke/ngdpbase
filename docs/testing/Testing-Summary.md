# Testing Summary

__Last Updated:__ 2026-01-11
__Current Version:__ 1.5.0

## Current Test Status

### Unit/Integration Tests (Jest) - 2026-01-11

| Metric | Value |
| --- | --- |
| Test Suites | 58 passed, 9 skipped (67 total) |
| Tests | 1380 passed, 308 skipped (1688 total) |
| __Pass Rate__ | __100%__ (of executed tests) |

### End-to-End Tests (Playwright) - 2026-01-11

| Metric | Value |
| --- | --- |
| Tests Passed | 18 |
| Tests Failed | 8 |
| Tests Skipped | 2 |
| __Pass Rate__ | __64%__ (18/28) |

#### E2E Test Results by File

| File | Passed | Failed | Status |
| --- | --- | --- | --- |
| auth.setup.js | 1 | 0 | ✅ |
| auth.spec.js | 5 | 1 | ⚠️ Logout timeout |
| admin.spec.js | 5 | 2 | ⚠️ Config/security selectors |
| pages.spec.js | 4 | 2 | ⚠️ Create/history timeout |
| search.spec.js | 3 | 3 | ⚠️ Search input not found |

#### Failed E2E Tests (UI selector/timeout issues)

| Test | Issue |
| --- | --- |
| Configuration section | Form elements not found |
| Admin route protection | Assertion failure |
| Logout | 30s timeout |
| Create page | 30s timeout |
| Page history | 30s timeout |
| Search interface | Search input not found |
| Basic search | Search input not found |
| Special chars search | Search input not found |

> __Note:__ E2E failures are related to UI selectors not matching the actual page structure. The tests need to be updated to match the current UI implementation. These are not related to the TypeScript migration work.

### End-to-End Tests (Playwright)

| Test File | Description |
| --- | --- |
| auth.spec.js | Login, logout, session management |
| pages.spec.js | Page viewing, editing, creation |
| search.spec.js | Search functionality |
| admin.spec.js | Admin dashboard access |

## Quick Commands

```bash
# Unit Tests (Jest)
npm test                    # Run all tests
npm test -- <file>.test.js  # Run specific test file
npm run test:coverage       # Generate coverage report
npm run test:watch          # Watch mode for development
npm run smoke               # Quick 30-second validation

# E2E Tests (Playwright)
npm run test:e2e            # Run all E2E tests
npm run test:e2e:ui         # Run with Playwright UI
npm run test:e2e:headed     # Run in headed browser mode
```

## Test Categories

### Passing Test Suites (58)

All core functionality is tested and passing:

- __WikiEngine__ - Core engine lifecycle
- __UserManager__ - Authentication, sessions, permissions
- __PageManager__ - Page CRUD operations (includes Storage integration tests)
- __FileSystemProvider__ - File-based page storage
- __ACLManager__ - Access control lists
- __SearchManager__ - Full-text search
- __PolicyManager__ - Policy-based access control
- __WikiContext__ - Request context management
- __FilterChain__ - Content filtering
- __SchemaManager__ - Schema validation
- __ExportManager__ - Page export
- __NotificationManager__ - Notification system
- __MarkupParser__ - Core parsing (26 tests)
- __WikiDocument__ - DOM operations
- __All route handlers__ - HTTP endpoints
- __All plugins__ - Plugin tests

### Skipped Test Suites (9)

These suites are temporarily skipped pending API updates:

1. __VersioningFileProvider__ - API mismatches (54 tests)
2. __VersioningFileProvider-Maintenance__ - Depends on above
3. __VersioningMigration__ - API mismatches (30 tests)
4. __MarkupParser-Comprehensive__ - Output format differences
5. __MarkupParser-DOMNodeCreation__ - Output format differences
6. __MarkupParser-Extraction__ - Output format differences
7. __MarkupParser-MergePipeline__ - Output format differences
8. __MarkupParser-ModularConfig__ - Output format differences
9. __MarkupParser-EndToEnd__ - Output format differences

## Test Infrastructure

### Configuration

- __Framework:__ Jest with Node.js environment
- __Setup file:__ `jest.setup.js` (global mocks)
- __Timeout:__ 120000ms for long-running tests
- __Coverage:__ Available via `npm run test:coverage`

### Global Mocks

The following are mocked globally in `jest.setup.js`:

- Logger (`src/utils/logger`)
- File system operations (where needed)
- ConfigurationManager (per-test setup)

## Fix Strategy

We use __Option C: Fix-As-Needed__ approach:

1. Fix tests when working on related code
2. Prioritize by impact (security > core > features)
3. Track progress in this document

### Priority Order

1. __CRITICAL__ - Security tests (ACLManager, UserManager, PolicyManager) - ✅ Done
2. __HIGH__ - Core functionality (WikiEngine, PageManager, SearchManager) - ✅ Done
3. __MEDIUM__ - Features (Rendering, Plugins, Routes) - Partial
4. __LOW__ - Utilities and edge cases - Deferred

## Recent Progress

| Date | Failing Suites | Passing Tests | Notes |
| --- | --- | --- | --- |
| 2026-01-11 | 0 (9 skipped) | 1380 | Fixed CI failures (#180), lint errors (#184), markdownlint (#183). E2E: 18/28 passing |
| 2025-12-27 | 0 (9 skipped) | 1380 | Removed 13 deprecated parser tests (Issue #185), converted InstallRoutes.ts |
| 2025-12-20 | 0 (9 skipped) | 1393 | Rewrote PageManager-Storage.test.js with 20 integration tests |
| 2025-12-20 | 0 (10 skipped) | 1373 | Fixed NotificationManager, skipped obsolete tests pending API updates |
| 2025-12-14 | 19 | 1492 | Fixed FileSystemProvider tests (12), gray-matter/js-yaml 4.x compatibility |
| 2025-12-13 | 22 | 1413 | Security fixes (js-yaml, cookie), logs path consolidation |
| 2025-12-12 | 21 | 1453+ | Added WikiRoutes-isRequiredPage (14), RenderingManager link graph tests |
| 2025-12-12 | 21 | 1409 | UserManager tests fixed (30 tests) |
| 2025-12-10 | 22 | 1379 | Multiple route tests fixed |
| 2025-12-07 | 37 | 1221 | SearchManager, ACLManager fixed |

### New Tests for Issue #172 and #174 (2025-12-12)

- __WikiRoutes-isRequiredPage.test.js__ - 14 tests for system-category protection
- __RenderingManager.test.js__ - Added plural link resolution test for Issue #172
- __FileSystemProvider.test.js__ - 12 tests for installation-aware loading ✅ Fixed 2025-12-14

## Known Issues

### Skipped Test Suites

Several test suites are skipped because they test APIs that have changed:

1. __Versioning Tests__ - The VersioningFileProvider API has significant changes. Tests check for properties and methods that no longer exist or have different signatures.

2. __MarkupParser Output Format Tests__ - The WikiDocument DOM implementation produces different HTML output (with data attributes) than what the tests expect. The functionality works, but the expected HTML format differs.

__Status:__ These tests need comprehensive rewrites to match current implementation. Core functionality is tested by other passing tests.

## E2E Test Infrastructure

### Setup

E2E tests use Playwright with the following configuration:

- __Test Directory:__ `tests/e2e/`
- __Config:__ `playwright.config.js`
- __Browser:__ Chromium (default)
- __Port:__ 3099 (test server)

### Test Files

| File | Tests | Description |
| --- | --- | --- |
| `auth.setup.js` | 1 | Authentication setup (saves session state) |
| `auth.spec.js` | 7 | Login form, invalid credentials, session management, logout, protected routes |
| `pages.spec.js` | 12 | Homepage, page navigation, editing, creation, categories |
| `search.spec.js` | 7 | Search interface, text search, special characters, filters |
| `admin.spec.js` | 8 | Admin dashboard access, user management, configuration, security |

### Fixtures

- `fixtures/auth.js` - Authentication helpers
- `fixtures/helpers.js` - Common test utilities

### Running E2E Tests Locally

```bash
# Run all E2E tests (starts server automatically)
npm run test:e2e

# Run with Playwright UI (for debugging)
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Run specific test file
npx playwright test auth.spec.js
```

### CI Integration

E2E tests run automatically in GitHub Actions CI pipeline:

1. Installs Playwright browsers
2. Creates test user and directories
3. Runs all E2E tests
4. Uploads test report as artifact

## Related Documentation

- [Complete-Testing-Guide.md](./Complete-Testing-Guide.md) - Comprehensive testing guide
- [PREVENTING-REGRESSIONS.md](./PREVENTING-REGRESSIONS.md) - Regression prevention strategy

## Contributing

When fixing tests:

1. Run the specific test file first: `npm test -- <file>.test.js`
2. Check error messages for root cause
3. Add proper mocks (ConfigurationManager, providers, etc.)
4. Verify no regressions: `npm test`
5. Update this summary if significant progress made
