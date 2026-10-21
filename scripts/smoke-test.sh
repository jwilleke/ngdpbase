#!/bin/bash
# Smoke Tests - Quick validation before committing
# Run with: npm run smoke

set -e

echo "🚬 Running smoke tests..."
echo ""

# 1. Check critical source files exist
echo "✓ Checking critical source files..."
test -f "src/app.ts"                  || (echo "❌ Missing src/app.ts" && exit 1)
test -f "src/WikiEngine.ts"           || (echo "❌ Missing src/WikiEngine.ts" && exit 1)
test -f "config/app-default-config.json" || (echo "❌ Missing config/app-default-config.json" && exit 1)
echo "  ✅ Critical source files present"
echo ""

# 2. Check compiled output exists
echo "✓ Checking compiled output..."
test -f "dist/src/app.js"            || (echo "❌ Missing dist/src/app.js — run npm run build" && exit 1)
test -f "dist/src/WikiEngine.js"     || (echo "❌ Missing dist/src/WikiEngine.js — run npm run build" && exit 1)
echo "  ✅ Compiled output present"
echo ""

# 3. Verify critical configuration properties
echo "✓ Verifying configuration..."
node -e "
  const config = require('./config/app-default-config.json');
  const required = [
    'ngdpbase.server.port',
    'ngdpbase.applicationName',
    'ngdpbase.page.provider.filesystem.storagedir'
  ];
  required.forEach(key => {
    if (!config[key]) throw new Error('Missing config: ' + key);
  });
" || (echo "❌ Configuration validation failed" && exit 1)
echo "  ✅ Configuration validated"
echo ""

# 4. Test WikiEngine initialization (quick check)
echo "✓ Testing WikiEngine initialization..."
# #631/#1953: the engine refuses to initialise without a system principal.
# This check loads no .env, so name one unless the caller already has.
NGDPBASE_SYSTEM_USER="${NGDPBASE_SYSTEM_USER:-system}" timeout 30 node -e "
  const WikiEngine = require('./dist/src/WikiEngine');
  const engine = new WikiEngine.default();
  engine.initialize().then(() => {
    const required = ['PageManager', 'RenderingManager', 'UserManager'];
    required.forEach(name => {
      if (!engine.getManager(name)) throw new Error('Manager not loaded: ' + name);
    });
    console.log('  ✅ WikiEngine initialized successfully');
    process.exit(0);
  }).catch(err => {
    console.error('❌ WikiEngine initialization failed:', err.message);
    process.exit(1);
  });
" || exit 1
echo ""

# 5. Verify package.json is valid
echo "✓ Verifying package.json..."
node -e "require('./package.json')" || (echo "❌ package.json is invalid" && exit 1)
echo "  ✅ package.json is valid"
echo ""

echo "✅ All smoke tests passed!"
echo ""
echo "Next steps:"
echo "  - Run full tests: npm test"
echo "  - Run with coverage: npm run test:coverage"
echo "  - Run integration tests: npm run test:integration"
