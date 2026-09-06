import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Strip `module.exports = X` CJS compat shims from TypeScript source files.
// These shims cause "Cannot set property default" errors in Vitest's ESM module
// system when a file has both `export default X` and `module.exports = X`.
const stripCjsShims: Plugin = {
  name: 'strip-cjs-shims',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('.ts') || id.includes('node_modules') || id.includes('__tests__')) {
      return;
    }
    // Only strip CJS shims from files that already have a TypeScript ESM default export.
    // Files with ONLY module.exports (no export default) are left untouched so Vitest's
    // CJS interop layer can handle them correctly.
    const hasEsmDefaultExport = /^export\s+default\s/m.test(code) || /^export\s*=/m.test(code);
    if (!hasEsmDefaultExport) {
      return;
    }
    // Strip all module.exports CJS compat assignments:
    //   module.exports = X;
    //   (module.exports as ...).default = X;
    //   Object.assign(module.exports, { ... });
    let stripped = code.replace(/^\s*(?:\(module\.exports[^)]*\)|module\.exports)[^\n]*\n/gm, '\n');
    stripped = stripped.replace(/^\s*Object\.assign\(module\.exports[^\n]*\n/gm, '\n');
    if (stripped !== code) {
      return { code: stripped, map: null };
    }
  }
};

/**
 * #1230 — the SOURCE wins over the compiled `.js` beside it.
 *
 * Every bundled addon compiles in place, so `Foo.js` sits next to `Foo.ts`,
 * and an ESM import of `'./Foo.js'` — the spelling TypeScript requires — found
 * the compiled file, because it exists. (Vite's own `.js`→`.ts` fallback only
 * fires when the `.js` is MISSING, which is why `src/` never noticed.) The
 * addon suites were therefore testing the previous build, and a sabotage of
 * the `.ts` stayed green until `npx tsc` ran.
 *
 * This resolver maps a relative `.js` import to its `.ts` sibling whenever
 * that sibling exists. `dist/` imports are untouched — there is no `.ts`
 * beside them — so `vi.mock('../../../dist/src/http/guardedFetch.js')` keeps
 * its id. `resolve.extensions` below does the same for extensionless imports.
 */
const sourceOverCompiled: Plugin = {
  name: 'source-over-compiled',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || importer.includes('node_modules')) return null;
    if (!source.startsWith('.') || !source.endsWith('.js')) return null;
    const ts = path.resolve(path.dirname(importer), source.slice(0, -3) + '.ts');
    return existsSync(ts) ? ts : null;
  }
};

export default defineConfig({
  plugins: [sourceOverCompiled, stripCjsShims],
  resolve: {
    // #1230: an EXTENSIONLESS import (`'../src/FeedManager'`) beside compiled
    // output must find the source. Vite's default order tries `.js` first.
    // (An `extensionAlias` key used to sit here; Vite has no such option and
    // it did nothing — `src/` only worked because it has no `.js` files.)
    extensions: ['.ts', '.mts', '.tsx', '.js', '.mjs', '.jsx', '.json']
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'src/**/__tests__/**/*.ts',
      'src/**/*.test.ts',
      'addons/**/__tests__/**/*.ts',
      'addons/**/*.test.ts',
      'scripts/**/__tests__/**/*.ts'
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/e2e/**',
      // #638: shared test fixtures (importable helpers, not test cases)
      '**/__tests__/__fixtures__/**'
    ],
    // #622: 30s ceiling absorbs cold-start parallel-pool variance. The
    // flake is a real cold-start race — experiments with `pool: 'threads'`
    // and `maxWorkers: 2/4/6` all still reproduced it occasionally. Pool
    // config doesn't deterministically fix it; only this timeout does.
    testTimeout: 30000,
    // #622: self-heal the proven full-suite-concurrency flake. Affected
    // supertest route tests (coverage3/coverage15/contact …) hang or
    // "socket hang up" ~25-40% of cold full-suite runs and pass on every
    // isolated re-run (11 datapoints over many releases). `retry` re-runs
    // ONLY the failed test: a flake clears, a real regression fails the
    // original plus all retries (vitest greens a test only if a retry
    // succeeds) — so signal integrity is preserved and a genuine bug still
    // fails the suite. Codifies the manual "re-run once" release practice.
    retry: 2,
    // #622 perf tuning: on a 14-core machine vitest's default of 7 workers
    // (half-cpus) over-provisions and inflates per-component overhead
    // (transform / import / setup). Capping at 4 cuts those phases by ~3x
    // (transform 6s → 2s, import 14s → 6s) at the cost of slightly slower
    // total wallclock when fully warm. Auto-clamps on smaller CI runners.
    // See docs/performance/issue-622-vitest-pool-tuning.md for the full
    // experiment data.
    pool: 'forks',
    maxWorkers: 4,
    minWorkers: 1,
    coverage: {
      provider: 'v8',
      // #1240 (#1177): addon code runs in the ngdpbase process and is measured
      // like src/. Excluded before, an untested addon file read as zero lines
      // — green in the same words a real pass would use.
      include: ['src/**/*.ts', 'addons/**/*.ts'],
      exclude: [
        'src/**/__tests__/**',
        'src/legacy/**',
        '**/*.d.ts',
        '**/__tests__/**',
        '**/*.test.ts',
        '**/node_modules/**',
        '**/dist/**',
        'addons/*/public/**'
      ],
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage'
    }
  }
});
