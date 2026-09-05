/**
 * #1230 — an extensionless import beside a compiled `.js` loads the `.ts`.
 *
 * Every bundled addon compiles in place, so `Foo.js` sits beside `Foo.ts`,
 * and Vite's default extension order tried `.js` first: addon tests were
 * exercising the previous build, and a sabotage of the source stayed green
 * until `npx tsc` ran. `vitest.config.ts` now lists `.ts` before `.js`. The
 * fixture pair here is the same shape — a `.ts` and a deliberately stale
 * `.js` — so a config regression fails this before it fails silently
 * everywhere else.
 */
import { loadedFrom } from './__fixtures__/resolveOrder/probe';
import { loadedFrom as viaJsSpelling } from './__fixtures__/resolveOrder/probe.js';

describe('#1230 — source wins over compiled output beside it', () => {
  test('an extensionless import resolves to the .ts, not the stale .js', () => {
    expect(loadedFrom).toBe('ts');
  });

  test("the ESM spelling './probe.js' resolves to the .ts too, even though probe.js exists", () => {
    // This is the spelling every addon source file uses for its own imports.
    expect(viaJsSpelling).toBe('ts');
  });
});
