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
 * The rule: an addon reaches core's values through `host`, the third argument
 * to `register()`, or a manager (`engine.getManager`), never by importing
 * them (#1813, rule 5 below). `import type` from `dist/` is fine: it is
 * erased at compile and seeks no file.
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
 *
 * 3. (#1820) The plugin formatter helpers are PluginManager's. Plugins get
 *    them as `context.formatters`; other code reads
 *    `engine.getManager('PluginManager').formatters`. So no file value-imports
 *    `utils/pluginFormatters` — by `dist/` or `src/` — except
 *    `src/managers/PluginManager.ts`, which builds them. That covers addon
 *    runtime code and the host's own `src/`. `import type` stays allowed (the
 *    types live there), and tests are exempt: they check the module itself.
 *
 * 5. (#1813) No addon runtime file value-imports core's compiled code under
 *    `dist/`. `../../dist/…` resolves only for an add-on sitting at
 *    `<ngdpbase>/addons/<slug>/`; one installed into the data folder fails
 *    with ERR_MODULE_NOT_FOUND, and one run against another checkout loads a
 *    second copy of core. Core hands its values over in `host`; a manager's
 *    job is reached through `engine.getManager`. `import type` is erased and
 *    allowed; tests are exempt (they run against a core checkout and may
 *    build core's own values, such as `buildAddonHost`).
 *
 * 4. (#1861) No addon runtime file value-imports `express`. An addon installed
 *    into `<data>/addons` resolves imports from its own folder, where there is
 *    no Express and no npm at runtime; a bundled copy would miss core's
 *    security patches. Core hands it out: `engine.createRouter()` for a Router,
 *    `engine.serveStatic(dir)` for `express.static`. `import type { Request,
 *    Response } from 'express'` is erased and allowed; tests are exempt (they
 *    build their own app around the router).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

export interface Finding { file: string; line: number; detail: string }

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
  const lineOf = (index: number): number => source.slice(0, index).split('\n').length;
  // Over the whole source, so an import whose `{ … }` spans lines is seen too.
  const re = /^[ \t]*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m[2]) continue; // import type / export type — erased
    out.push({ line: lineOf(m.index), spec: m[3] });
  }
  // Dynamic import('…') and require('…') with a literal specifier are value imports too.
  const dyn = /\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g;
  let d: RegExpExecArray | null;
  while ((d = dyn.exec(source)) !== null) out.push({ line: lineOf(d.index), spec: d[1] });
  return out;
}

const isTestFile = (file: string): boolean =>
  file.endsWith('.test.ts') || file.split(path.sep).includes('__tests__');

/**
 * Every finding in the repository at `repo` (default: this one). Exported so a
 * test can run it over a planted tree (#1813).
 */
export function scan(repo: string = REPO_ROOT): { findings: Finding[]; addonFiles: number; srcFiles: number } {
  const REPO = repo;
  const ADDONS = path.join(REPO, 'addons');
  const SRC = path.join(REPO, 'src');
  const DIST = path.join(REPO, 'dist');
  const findings: Finding[] = [];

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
            'container has no src/. Take the value from `host`, the third argument to register(), or its manager ' +
            `(engine.getManager); for a type, \`import type\` from "${viaDist}" (#1813).`
        });
      }
    }
  }

  // 2. Emission symptom: compiled js under src/. A `.js` inside a `__fixtures__`
  // directory is test material committed on purpose (#1230 keeps a .ts/.js pair
  // to prove the resolver prefers source), not an addon build's emission.
  const strayJs: string[] = [];
  if (existsSync(SRC)) walk(SRC, '.js', strayJs);
  for (const f of strayJs) {
    if (f.split(path.sep).includes('__fixtures__')) continue;
    findings.push({
      file: path.relative(REPO, f),
      line: 0,
      detail: 'compiled .js under src/ — an addon build compiled host source (see 1). Delete it and fix the import that caused it.'
    });
  }

  // 3. Value imports of the plugin formatters, which PluginManager owns (#1820).
  const FORMATTERS_OWNER = path.join(SRC, 'managers', 'PluginManager.ts');
  const isFormattersModule = (target: string): boolean =>
    /[\\/]utils[\\/]pluginFormatters(\.js|\.ts)?$/.test(target);
  const srcFiles: string[] = [];
  if (existsSync(SRC)) walk(SRC, '.ts', srcFiles);
  for (const file of [...addonFiles, ...srcFiles]) {
    if (file === FORMATTERS_OWNER || isTestFile(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const { line, spec } of valueImportSpecifiers(source)) {
      if (!spec.startsWith('.') || !isFormattersModule(path.resolve(path.dirname(file), spec))) continue;
      findings.push({
        file: path.relative(REPO, file),
        line,
        detail: 'value-imports utils/pluginFormatters, which PluginManager owns (#1820). In a plugin use ' +
          "`context.formatters`; elsewhere `engine.getManager('PluginManager').formatters`. Types stay " +
          'importable with `import type`.'
      });
    }
  }

  // 4. Value imports of express in addon runtime code (#1861).
  const isExpress = (spec: string): boolean => spec === 'express' || spec.startsWith('express/');
  for (const file of addonFiles) {
    if (isTestFile(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const { line, spec } of valueImportSpecifiers(source)) {
      if (!isExpress(spec)) continue;
      findings.push({
        file: path.relative(REPO, file),
        line,
        detail: 'value-imports express (#1861). An installed addon has no express to resolve. Use ' +
          '`engine.createRouter()` for a Router and `engine.serveStatic(dir)` for static files; ' +
          "types stay importable with `import type { Request, Response } from 'express'`."
      });
    }
  }

  // 5. Value imports of core's compiled code in addon runtime code (#1813).
  for (const file of addonFiles) {
    if (isTestFile(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const { line, spec } of valueImportSpecifiers(source)) {
      if (!spec.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), spec);
      if (target !== DIST && !target.startsWith(DIST + path.sep)) continue;
      findings.push({
        file: path.relative(REPO, file),
        line,
        detail: `value-imports core's compiled code "${path.relative(REPO, target).replace(/\\/g, '/')}" (#1813). ` +
          'An installed add-on has no ../../dist. Take the value from `host`, the third argument to register(), ' +
          'or ask its manager through engine.getManager; `import type` stays allowed.'
      });
    }
  }

  return { findings, addonFiles: addonFiles.length, srcFiles: srcFiles.length };
}

function run(): void {
  const { findings, addonFiles, srcFiles } = scan();
  console.log('Addon/host import boundary (#1192)');
  console.log('==================================');
  if (findings.length === 0) {
    console.log(`No addon value-imports host source; no compiled .js under src/; only PluginManager value-imports pluginFormatters; no addon runtime file value-imports express or core's dist/ (scanned ${addonFiles} addon files, ${srcFiles} src files).`);
    process.exit(0);
  }
  for (const f of findings) {
    console.log(`  ${f.file}${f.line ? ':' + f.line : ''}: ${f.detail}`);
  }
  console.log(`\n${findings.length} finding(s). An addon that loads here and not in the image is the defect this exists to catch.`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) run();
