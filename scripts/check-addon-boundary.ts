/**
 * Addon/host import boundary (#1192).
 *
 * The host compiles to `dist/`. Bundled addons compile IN PLACE: each addon's
 * tsconfig has `rootDir: "../.."` and `outDir: "../.."` so its `.js` lands
 * beside its `.ts`. That means a VALUE import of host source —
 *
 *   import { guardedFetch } from '../../../src/http/guardedFetch.js';
 *
 * — does two things at once. It pulls `src/http/guardedFetch.ts` into the
 * addon's compilation and EMITS `src/http/guardedFetch.js` next to it, so on
 * the developer's machine the path the import names now exists and the addon
 * loads. And it names a path the container never has: the runtime image
 * copies `dist/` and `addons/`, not `src/`, so there Node throws
 * ERR_MODULE_NOT_FOUND before any addon code runs. That is how v4.13.0
 * shipped with `elasticsearch` and `feeds` dead while 8661 unit tests, the
 * E2E suite and both container smoke halves were green.
 *
 * The rule: an addon reaches host code through `dist/` —
 *
 *   import { guardedFetch } from '../../../dist/src/http/guardedFetch.js';
 *
 * — which resolves in Node (the image has `dist/`) and in vitest (CI builds
 * before it tests). Every other value import across the boundary already did
 * this: `logger`, `BaseManager`, `ApiContext`, `pluginFormatters`.
 *
 * Two assertions, both red on the commit that introduces the defect:
 *
 * 1. No addon source file value-imports a specifier that resolves under
 *    `src/`. `import type` is erased at compile and cannot seek a file, so it
 *    is allowed (though `dist/` `.d.ts` files serve it equally well).
 * 2. No `*.js` exists under `src/` — the emission symptom. If one is there,
 *    an addon compiled host source, whether or not (1) currently catches the
 *    import that did it.
 *
 * Exemption: none. There is no legitimate reason for an addon to compile the
 * host's TypeScript.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '..');
const ADDONS = path.join(REPO, 'addons');
const SRC = path.join(REPO, 'src');

interface Finding { file: string; line: number; detail: string }
const findings: Finding[] = [];

function walk(dir: string, ext: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, ext, out);
    else if (name.endsWith(ext) && !name.endsWith('.d.ts')) out.push(full);
  }
}

/**
 * Every static import/export-from in a file, with whether it binds values.
 * `import type` and `export type … from` are erased. A mixed
 * `import { type A, b }` binds `b`, so it counts as a value import.
 */
function valueImportSpecifiers(source: string): Array<{ line: number; spec: string }> {
  const out: Array<{ line: number; spec: string }> = [];
  const lines = source.split('\n');
  const re = /^\s*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/;
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    if (m[2]) continue; // import type / export type — erased
    out.push({ line: i + 1, spec: m[3] });
  }
  // Dynamic import('…') with a literal specifier is a value import too.
  const dyn = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (let i = 0; i < lines.length; i++) {
    let d: RegExpExecArray | null;
    while ((d = dyn.exec(lines[i])) !== null) out.push({ line: i + 1, spec: d[1] });
  }
  return out;
}

// 1. Value imports resolving under src/.
const addonFiles: string[] = [];
try {
  walk(ADDONS, '.ts', addonFiles);
} catch {
  // No addons directory is a valid (empty) state.
}
for (const file of addonFiles) {
  const source = readFileSync(file, 'utf8');
  for (const { line, spec } of valueImportSpecifiers(source)) {
    if (!spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), spec);
    if (target === SRC || target.startsWith(SRC + path.sep)) {
      const rel = path.relative(REPO, target).replace(/\\/g, '/');
      const viaDist = 'dist/' + rel;
      findings.push({
        file: path.relative(REPO, file),
        line,
        detail: `value-imports host source "${rel}". The addon build would EMIT a .js beside it and the ` +
          `container has no src/. Import "${viaDist}" instead (path relative to this file).`
      });
    }
  }
}

// 2. Emission symptom: compiled js under src/. A `.js` inside a `__fixtures__`
// directory is test material committed on purpose (#1230 keeps a .ts/.js pair
// to prove the resolver prefers source), not an addon build's emission.
const strayJs: string[] = [];
walk(SRC, '.js', strayJs);
for (const f of strayJs) {
  if (f.split(path.sep).includes('__fixtures__')) continue;
  findings.push({
    file: path.relative(REPO, f),
    line: 0,
    detail: 'compiled .js under src/ — an addon build compiled host source (see 1). Delete it and fix the import that caused it.'
  });
}

console.log('Addon/host import boundary (#1192)');
console.log('==================================');
if (findings.length === 0) {
  console.log(`No addon value-imports host source; no compiled .js under src/ (scanned ${addonFiles.length} addon files).`);
  process.exit(0);
}
for (const f of findings) {
  console.log(`  ${f.file}${f.line ? ':' + f.line : ''}: ${f.detail}`);
}
console.log(`\n${findings.length} finding(s). An addon that loads here and not in the image is the defect this exists to catch.`);
process.exit(1);
