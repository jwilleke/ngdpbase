# Preventing Regressions - Comprehensive Strategy

__Last Updated:__ 2025-12-12
__Version:__ 1.5.0

__Problem:__ Changes can break previously working services despite documentation.

__Solution:__ Automated testing with enforcement at multiple levels.

## Current Status

__✅ Implemented:__

- Jest test framework with 1692 tests (83.3% pass rate)
- GitHub Actions CI/CD workflow
- Smoke test script (`npm run smoke`)
- Global test mocks (logger, providers)
- Pre-commit hooks available (Husky)

__⏳ In Progress:__

- Fixing remaining 277 failing tests
- Integration test coverage

__📋 Future:__

- Coverage thresholds enforcement
- Contract testing between managers

## Recommended Improvements

### 1. __Automated Testing Pipeline__ (CRITICAL - Do This First)

#### 1.1 GitHub Actions CI/CD

Create `.github/workflows/ci.yml`:

```yaml
name: CI - Prevent Regressions

on:
  push:
    branches: [master, develop]
  pull_request:
    branches: [master, develop]

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

      - name: Run all tests
        run: npm test -- --coverage --maxWorkers=2

      - name: Check coverage thresholds
        run: |
          # Fail if coverage drops below thresholds
          npm test -- --coverage --coverageThreshold='{"global":{"branches":80,"functions":80,"lines":80,"statements":80}}'

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  integration:
    runs-on: ubuntu-latest
    needs: test

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 20.x

      - name: Install dependencies
        run: npm ci

      - name: Run integration tests
        run: npm run test:integration

      - name: Test installation flow
        run: |
          npm start &
          sleep 10
          curl -f http://localhost:3000/install || exit 1

  lint:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Markdown lint
        run: npm run lint:md

      - name: Check for TODOs in code
        run: |
          if grep -r "TODO:" src/ --exclude-dir=node_modules; then
            echo "Warning: TODOs found in code"
          fi
```

__Impact:__ Catches breaks BEFORE merge, not after deployment.

#### 1.2 Pre-commit Hooks (Git Hooks)

Create `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "🔍 Running pre-commit checks..."

# Run tests for changed files only
npm run test:changed

# Run linting
npm run lint

# Check for console.logs in committed code
if git diff --cached --name-only | xargs grep -n "console.log" --exclude-dir=node_modules 2>/dev/null; then
  echo "❌ console.log() found in staged files. Remove before committing."
  exit 1
fi

echo "✅ Pre-commit checks passed"
```

__Setup:__

```bash
npm install --save-dev husky
npx husky install
npx husky add .husky/pre-commit "npm test"
```

__Impact:__ Prevents committing broken code.

### 2. __Integration Test Suite__ (HIGH PRIORITY)

Create `src/__tests__/critical-paths.integration.test.js`:

```javascript
/**
 * Critical Path Integration Tests
 *
 * Tests complete user workflows to catch breaking changes
 * that unit tests might miss.
 *
 * Run with: npm run test:integration
 */

const WikiEngine = require('../WikiEngine');

describe('Critical User Paths', () => {
  let engine;

  beforeAll(async () => {
    engine = new WikiEngine();
    await engine.initialize();
  });

  afterAll(async () => {
    await engine.shutdown();
  });

  describe('Page Lifecycle', () => {
    test('Create → Read → Update → Delete page', async () => {
      const pageManager = engine.getManager('PageManager');
      const renderingManager = engine.getManager('RenderingManager');

      // Create
      const pageName = 'TestPage_' + Date.now();
      const content = '## Test\n\nContent with [{$applicationname}]';
      await pageManager.savePage(pageName, content, { author: 'test' });

      // Read
      const page = await pageManager.getPage(pageName);
      expect(page).toBeDefined();
      expect(page.content).toBe(content);

      // Render (variables resolved)
      const html = await renderingManager.renderPage(pageName);
      expect(html).toContain('ngdpbase'); // Variable resolved
      expect(html).toContain('<h2'); // Markdown rendered

      // Update
      const newContent = '## Updated\n\nNew content';
      await pageManager.savePage(pageName, newContent, { author: 'test' });
      const updated = await pageManager.getPage(pageName);
      expect(updated.content).toBe(newContent);

      // Delete
      await pageManager.deletePage(pageName);
      const deleted = await pageManager.getPage(pageName);
      expect(deleted).toBeNull();
    });

    test('Page with attachments', async () => {
      // Test attachment upload → reference in page → delete
      // This catches PageManager + AttachmentManager integration breaks
    });

    test('Page with plugins', async () => {
      // Test plugin execution in rendered pages
      // This catches PluginManager + RenderingManager integration breaks
    });
  });

  describe('User Workflows', () => {
    test('User creation → login → page edit → logout', async () => {
      // Full authentication flow
    });

    test('ACL enforcement across managers', async () => {
      // Create restricted page
      // Verify UserManager + ACLManager + PageManager integration
    });
  });

  describe('Search and Discovery', () => {
    test('Create page → index → search → find', async () => {
      // Tests SearchManager + PageManager integration
    });
  });

  describe('Versioning', () => {
    test('Page edit creates version → retrieve version → compare', async () => {
      // Tests VersioningProvider integration
    });
  });
});
```

__Add to package.json:__

```json
{
  "scripts": {
    "test:integration": "jest --testPathPattern=integration.test.js --runInBand",
    "test:unit": "jest --testPathIgnorePatterns=integration.test.js",
    "test:changed": "jest --changedSince=HEAD --bail"
  }
}
```

__Impact:__ Catches manager integration breaks that unit tests miss.

### 3. __Contract Testing Between Managers__

Create `docs/development/MANAGER-CONTRACTS.md`:

```markdown
# Manager Contracts

Defines the interface contracts between managers to prevent breaking changes.

## PageManager Contract

### Required Methods (DO NOT REMOVE OR CHANGE SIGNATURES)

```javascript
async getPage(pageName: string): Promise<Page|null>
async savePage(pageName: string, content: string, metadata: Object): Promise<void>
async deletePage(pageName: string): Promise<boolean>
async listPages(): Promise<string[]>
```

### Consumers

- RenderingManager (calls getPage)
- SearchManager (calls listPages, getPage)
- VersioningProvider (calls savePage, getPage)
- WikiRoutes (calls all methods)

### Breaking Change Policy

If you need to change a method signature:

1. Add new method with new signature
2. Deprecate old method (keep for 2 versions)
3. Update all consumers to use new method
4. Remove old method after 2 versions

## RenderingManager Contract

... (similar documentation for each manager)

```

**Create contract tests:**

```javascript
// src/managers/__tests__/contracts/PageManager.contract.test.js
describe('PageManager Contract', () => {
  test('implements required interface', () => {
    const manager = new PageManager(engine);

    // Verify required methods exist
    expect(typeof manager.getPage).toBe('function');
    expect(typeof manager.savePage).toBe('function');
    expect(typeof manager.deletePage).toBe('function');
    expect(typeof manager.listPages).toBe('function');
  });

  test('getPage accepts string, returns Promise', async () => {
    const manager = new PageManager(engine);
    const result = manager.getPage('TestPage');

    expect(result).toBeInstanceOf(Promise);
  });
});
```

__Impact:__ Prevents breaking changes to manager APIs.

### 4. __Smoke Test Suite__ (QUICK WINS)

Create `scripts/smoke-test.sh`:

```bash
#!/bin/bash
# Quick smoke tests - run after any change before committing

set -e

echo "🚬 Running smoke tests..."

# 1. Server starts
echo "  ✓ Testing server startup..."
timeout 15 npm start &
PID=$!
sleep 10
kill $PID 2>/dev/null || true

# 2. Critical pages exist
echo "  ✓ Checking required pages..."
test -f "required-pages/Main.md" || exit 1
test -f "required-pages/LeftMenu.md" || exit 1

# 3. Critical config properties exist
echo "  ✓ Verifying configuration..."
node -e "
  const config = require('./config/app-default-config.json');
  const required = [
    'ngdpbase.server.port',
    'ngdpbase.application-name',
    'ngdpbase.page.provider.filesystem.storagedir'
  ];
  required.forEach(key => {
    if (!config[key]) throw new Error('Missing config: ' + key);
  });
" || exit 1

# 4. Critical managers load
echo "  ✓ Testing manager initialization..."
node -e "
  const WikiEngine = require('./src/WikiEngine');
  const engine = new WikiEngine();
  engine.initialize().then(() => {
    const required = ['PageManager', 'RenderingManager', 'UserManager'];
    required.forEach(name => {
      if (!engine.getManager(name)) throw new Error('Manager not loaded: ' + name);
    });
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
" || exit 1

echo "✅ All smoke tests passed"
```

__Add to package.json:__

```json
{
  "scripts": {
    "smoke": "./scripts/smoke-test.sh"
  }
}
```

__Impact:__ 30-second sanity check before committing.

### 5. __Agent Workflow Integration__ (PROCESS IMPROVEMENT)

Update `AGENTS.md` with __mandatory checklist__:

```markdown
## Agent Pre-Work Checklist

Before making ANY code changes:

- [ ] Read AGENTS.md current status
- [ ] Read relevant manager contract (docs/development/MANAGER-CONTRACTS.md)
- [ ] Run smoke tests: `npm run smoke`
- [ ] Run affected tests: `npm test -- <relevant-file>.test.js`

## Agent During-Work Checklist

While working:

- [ ] Write tests BEFORE changing code (TDD approach)
- [ ] Run tests after each change: `npm test -- --watch`
- [ ] Update contract docs if changing manager APIs

## Agent Post-Work Checklist

After completing work:

- [ ] Run full test suite: `npm test`
- [ ] Run integration tests: `npm run test:integration`
- [ ] Run smoke tests: `npm run smoke`
- [ ] Check coverage didn't drop: `npm test -- --coverage`
- [ ] Update project_log.md
- [ ] Update AGENTS.md current status
- [ ] Create commit with semantic message (feat/fix/chore)

**If ANY step fails, do NOT commit. Fix first.**
```

### 6. __Automated Documentation Validation__

Create `.github/workflows/docs-check.yml`:

```yaml
name: Documentation Validation

on: [push, pull_request]

jobs:
  check-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Check AGENTS.md is updated
        run: |
          # Verify AGENTS.md was modified if src/ changed
          git diff --name-only HEAD~1 | grep "^src/" && \
          git diff --name-only HEAD~1 | grep "AGENTS.md" || \
          (echo "❌ src/ changed but AGENTS.md not updated" && exit 1)

      - name: Validate project_log.md format
        run: |
          # Check for session entry in last 20 lines
          tail -20 docs/project_log.md | grep -E "## [0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}" || \
          (echo "❌ project_log.md missing recent session entry" && exit 1)

      - name: Check for broken markdown links
        uses: gaurav-nelson/github-action-markdown-link-check@v1
```

### 7. __Coverage Ratcheting__ (PREVENT COVERAGE REGRESSION)

Create `jest.config.js` with coverage thresholds:

```javascript
module.exports = {
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Critical files must have higher coverage
    './src/managers/PageManager.js': {
      branches: 90,
      functions: 95,
      lines: 90,
      statements: 90
    },
    './src/managers/RenderingManager.js': {
      branches: 90,
      functions: 95,
      lines: 90,
      statements: 90
    }
  }
};
```

__Impact:__ Coverage can only go up, never down.

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 days)

1. ✅ Fix existing test failures
2. ✅ Add smoke test script
3. ✅ Setup pre-commit hooks
4. ✅ Document manager contracts

### Phase 2: CI/CD (2-3 days)

1. ✅ Create GitHub Actions workflow
2. ✅ Setup coverage reporting
3. ✅ Add badge to README.md

### Phase 3: Integration Tests (3-5 days)

1. ✅ Create critical path tests
2. ✅ Add contract tests
3. ✅ Setup test:integration script

### Phase 4: Process Integration (1 day)

1. ✅ Update AGENTS.md with checklists
2. ✅ Create CONTRIBUTING.md section on testing
3. ✅ Train team on new workflow

## Monitoring Regression Prevention

### Metrics to Track

1. __Test Pass Rate:__ Should be 100%
2. __Coverage:__ Should never decrease
3. __Breaking Changes:__ Track via contract test failures
4. __Time to Detect Regression:__ How quickly CI catches breaks

### Success Criteria

- ✅ All PRs have passing tests
- ✅ Coverage ≥ 80% globally
- ✅ Critical managers ≥ 90% coverage
- ✅ Zero production regressions after implementation
- ✅ Integration tests run in < 60 seconds

## Alternative/Complementary Approaches

### A. Snapshot Testing (for rendering)

```javascript
test('page renders consistently', () => {
  const html = renderingManager.renderPage('TestPage');
  expect(html).toMatchSnapshot();
  // Fails if rendering changes unexpectedly
});
```

### B. Visual Regression Testing

- Use Percy.io or Chromatic
- Captures UI screenshots
- Detects unintended visual changes

### C. API Contract Testing (Pact)

- Define API contracts
- Test provider/consumer independently
- Prevents breaking API changes

### D. Canary Deployment

- Deploy to 5% of users first
- Monitor for errors
- Rollback if issues detected

## Comparison: Before vs After

| Aspect | Before | After |
| -------- | -------- | ------- |
| Regression Detection | Manual testing | Automated in CI |
| Time to Detect | Days/weeks | Minutes |
| Prevention | Documentation only | Automated enforcement |
| Test Coverage | Unknown | Tracked, must be ≥ 80% |
| Breaking Changes | Discovered in production | Caught in PR |
| Developer Confidence | Low | High |

## FAQ

__Q: Will this slow down development?__
A: Initial setup takes time, but after that:

- Pre-commit: +30 seconds per commit
- CI: Runs in parallel, doesn't block development
- Net result: Faster because fewer regressions to fix

__Q: What if tests are flaky?__
A: Fix flaky tests immediately. They erode confidence. Use `jest --detectLeaks` to find issues.

__Q: What about manual testing?__
A: Still needed for UX validation, but not for regression prevention.

__Q: Can we add tests gradually?__
A: Yes! Start with critical paths, then expand. Use coverage ratcheting to prevent backsliding.

## Resources

- [Jest Documentation](https://jestjs.io/)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Husky (Git Hooks)](https://typicode.github.io/husky/)
- [Contract Testing Guide](https://martinfowler.com/bliki/ContractTest.html)

---

__Bottom Line:__ AGENTS.md and project_log.md are great for knowledge transfer, but they don't prevent regressions. You need __automated testing with enforcement__ to catch breaks before they reach production.

__Recommended First Step:__ Create GitHub Actions CI workflow (takes 1 hour, prevents weeks of debugging).
