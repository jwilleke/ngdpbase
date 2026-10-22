/**
 * Build `@jwilleke/ngdpbase-types` (#1865) into `packages/ngdpbase-types/dist/`,
 * the folder that is published.
 *
 * - The declarations: `tsc --declaration --emitDeclarationOnly` from the
 *   explicit entry (`index.ts`) and the test kit (`testing.ts`), so the
 *   published surface is what those files name and what their types reach.
 * - The test kit's JavaScript: a second `tsc` run over `testing.ts`, then
 *   every emitted `.js` the kit does not import at run time is removed (tsc
 *   emits a file for every type it reaches; only the ones the kit runs ship).
 * - Core's ambient module declarations (`src/types/*.d.ts`), which tsc never
 *   emits, are copied beside the output, and both entries reference the
 *   copies.
 * - `dist/package.json` is the folder's template with core's version and the
 *   dependencies the shipped files import, each at the range core itself
 *   declares. One version, one set of ranges: core's `package.json`.
 *
 * Then it checks what it built: the main entry has no JavaScript, the kit
 * loads in Node, and an add-on importing both entries typechecks against the
 * built package alone.
 *
 * Usage: npm run build:types-package
 */
import { builtinModules } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = path.join(REPO, 'packages', 'ngdpbase-types');
const OUT = path.join(PKG, 'dist');
const LIB = path.join(OUT, 'lib');
const ENTRY_DIR = path.join(LIB, 'packages', 'ngdpbase-types');
const TSC = path.join(REPO, 'node_modules', 'typescript', 'bin', 'tsc');

const BUILTINS = new Set(builtinModules);
/** An npm package name; anything else after `from` is prose in a comment. */
const PACKAGE_NAME = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/** Every module specifier a JS or declaration file names (imports, re-exports, `import()`, `reference types`), as TypeScript's scanner reads it: never text in a comment. */
export function specifiersIn(text: string): string[] {
  const { importedFiles, typeReferenceDirectives } = ts.preProcessFile(text, true, true);
  return [...importedFiles, ...typeReferenceDirectives].map((f) => f.fileName);
}

/** The package a bare specifier names (`@scope/name/sub` → `@scope/name`), or null for a relative path, a builtin or non-name text. */
export function packageOf(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) return null;
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  if (BUILTINS.has(name) || !PACKAGE_NAME.test(name)) return null;
  return name;
}

function walk(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, suffix));
    else if (entry.name.endsWith(suffix)) out.push(full);
  }
  return out;
}

/** The JS files `start` loads at run time, following relative imports. */
function reachableJs(start: string): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const file = queue.shift() as string;
    for (const s of specifiersIn(fs.readFileSync(file, 'utf8'))) {
      if (!s.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), s);
      if (!fs.existsSync(target)) throw new Error(`${path.relative(OUT, file)} imports ${s}, which was not emitted`);
      if (!seen.has(target)) { seen.add(target); queue.push(target); }
    }
  }
  return seen;
}

function tsc(config: string): void {
  execFileSync(process.execPath, [TSC, '-p', path.join(PKG, config)], { stdio: 'inherit', cwd: REPO });
}

/**
 * Core's ambient module declarations (`src/types/*.d.ts`, for packages that
 * ship no types). tsc reads them but never emits them, so copy each beside
 * the output and have both entries reference the copies.
 */
function shipAmbientDeclarations(): void {
  const dir = path.join(REPO, 'src', 'types');
  const copies = fs.readdirSync(dir).filter((f) => f.endsWith('.d.ts')).sort().map((f) => {
    const copy = path.join(LIB, 'src', 'types', f);
    fs.copyFileSync(path.join(dir, f), copy);
    return copy;
  });
  for (const entry of ['index.d.ts', 'testing.d.ts'].map((f) => path.join(ENTRY_DIR, f))) {
    const refs = copies.map((c) => `/// <reference path="${path.relative(ENTRY_DIR, c).split(path.sep).join('/')}" />\n`).join('');
    fs.writeFileSync(entry, refs + fs.readFileSync(entry, 'utf8'));
  }
}

type Ranges = Record<string, string>;

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/** Whether an installed package carries its own declarations, so its `@types/` package is not needed. */
function hasOwnTypes(name: string): boolean {
  const file = path.join(REPO, 'node_modules', name, 'package.json');
  if (!fs.existsSync(file)) return false;
  const pkg = readJson<{ types?: string; typings?: string }>(file);
  return Boolean(pkg.types || pkg.typings) || fs.existsSync(path.join(REPO, 'node_modules', name, 'index.d.ts'));
}

/**
 * The dependencies the shipped files import, at core's own ranges. A package
 * the kit runs must be one core declares. A package only a declaration names
 * and core does not declare (a dependency's own dependency, such as
 * winston-transport) is left to that dependency, and said. A package core
 * declares in `optionalDependencies` (playwright-core, #1974) is left out:
 * core's code already copes with it being absent, and the kit never needs it.
 */
function dependenciesOf(runtime: string[], declarations: string[], core: Ranges, optional: Ranges = {}): Ranges {
  const deps: Ranges = {};
  const add = (name: string): boolean => {
    if (!core[name]) return false;
    deps[name] = core[name];
    return true;
  };
  const leftOut = new Set<string>();
  for (const file of runtime) {
    for (const name of specifiersIn(fs.readFileSync(file, 'utf8')).map(packageOf)) {
      if (name && optional[name]) {
        if (!leftOut.has(name)) console.log(`  ${name}: optional in core, imported only when present; left out`);
        leftOut.add(name);
        continue;
      }
      if (name && !add(name)) throw new Error(`${path.relative(OUT, file)} needs ${name} at run time, which core's package.json does not declare`);
    }
  }
  let builtinTypes = false;
  const undeclared = new Set<string>();
  for (const file of declarations) {
    for (const s of specifiersIn(fs.readFileSync(file, 'utf8'))) {
      const bare = s.startsWith('node:') ? s.slice(5) : s.split('/')[0];
      if (BUILTINS.has(bare) || s === 'node') { builtinTypes = true; continue; }
      const name = packageOf(s);
      if (!name || deps[name] || undeclared.has(name)) continue;
      if (!add(name)) {
        undeclared.add(name);
        console.log(`  ${name}: named by ${path.relative(OUT, file)}, not declared by core; left to the dependency that brings it`);
      }
    }
  }
  for (const name of Object.keys(deps)) {
    if (!name.startsWith('@types/') && !hasOwnTypes(name)) add(`@types/${name.replace(/^@([^/]+)\//, '$1__')}`);
  }
  if (builtinTypes) add('@types/node');
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
}

/** An add-on that imports both entries, typechecked against the built package alone. */
function typecheckConsumer(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-types-consumer-'));
  try {
    fs.mkdirSync(path.join(dir, 'node_modules', '@jwilleke'), { recursive: true });
    fs.symlinkSync(OUT, path.join(dir, 'node_modules', '@jwilleke', 'ngdpbase-types'), 'dir');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'consumer', type: 'module', private: true }));
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, module: 'nodenext', moduleResolution: 'nodenext', target: 'es2022', skipLibCheck: true, types: [] },
      files: ['index.ts']
    }));
    fs.writeFileSync(path.join(dir, 'index.ts'), [
      "import type { AddonModule, AddonHost, WikiEngine, ApiContext, ActorContext, PermissionSubject, Decision, PluginContext, PluginFormatters, SimplePlugin, AuditEvent, JobRunContext, DatabaseManager, ExportManager, EmailManager, PolicyDecisionPoint, Migration, AddonDatabaseDeclaration } from '@jwilleke/ngdpbase-types';",
      // #1974: an add-on renders a PDF and emails it.
      'async function emailPdf(engine: WikiEngine, ctx: ActorContext): Promise<void> {',
      "  const pdf = await engine.getManager<ExportManager>('ExportManager')!.htmlToPdf(ctx, '<p>x</p>', { format: 'A4', margin: { top: '20mm' }, printBackground: true });",
      "  await engine.getManager<EmailManager>('EmailManager')!.sendTo(ctx, 'a@example.org', 's', 't', undefined, { attachments: [{ filename: 'x.pdf', contentType: 'application/pdf', content: pdf }] });",
      '}',
      "import { buildAddonHost, openAddonTestDatabase, toCsv, formatters } from '@jwilleke/ngdpbase-types/testing';",
      'const migrations: Migration[] = [];',
      "const plugin: SimplePlugin = { name: 'P', execute: (context, params) => context.formatters.escapeHtml(String(params.x)) };",
      'const addon: AddonModule = {',
      "  name: 'demo', version: '1.0.0',",
      '  register(engine: WikiEngine, _config: Record<string, unknown>, host?: AddonHost): void {',
      "    engine.getManager<DatabaseManager>('DatabaseManager')?.openAddonDatabase('demo', { migrations, ledgerTable: 'demo_schema_migrations' });",
      "    engine.getManager<ExportManager>('ExportManager')?.toCsv(['a'], [[1]]);",
      "    engine.getManager<PolicyDecisionPoint>('PolicyDecisionPoint');",
      "    host?.logger.info('ready');",
      "    engine.app?.use('/addons/demo', engine.createRouter(), engine.serveStatic('public'));",
      '  }',
      '};',
      'type Used = [AddonDatabaseDeclaration, ApiContext, ActorContext, PermissionSubject, Decision, PluginContext, PluginFormatters, AuditEvent, JobRunContext];',
      "const host: AddonHost = buildAddonHost('demo', {});",
      "openAddonTestDatabase('demo', { migrations, ledgerTable: 'demo_schema_migrations' });",
      "const csv: string = toCsv(['a'], [[1]]) + formatters.escapeHtml('<');",
      'export { addon, plugin, host, csv, emailPdf };',
      'export type { Used };',
      ''
    ].join('\n'));
    execFileSync(process.execPath, [TSC, '-p', path.join(dir, 'tsconfig.json')], { stdio: 'inherit', cwd: dir });
  } finally {
    // Only the directory this check made.
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main(): void {
  const core = readJson<{ version: string; dependencies?: Ranges; devDependencies?: Ranges; optionalDependencies?: Ranges }>(path.join(REPO, 'package.json'));
  const ranges: Ranges = { ...core.devDependencies, ...core.dependencies };

  fs.rmSync(OUT, { recursive: true, force: true });
  console.log('Declarations (tsc --declaration --emitDeclarationOnly)');
  tsc('tsconfig.json');
  console.log('Test kit JavaScript');
  tsc('tsconfig.testing.json');

  if (fs.existsSync(path.join(ENTRY_DIR, 'index.js'))) throw new Error('the main entry emitted JavaScript; it must be types only');
  const runtime = reachableJs(path.join(ENTRY_DIR, 'testing.js'));
  let pruned = 0;
  for (const file of walk(LIB, '.js')) {
    if (!runtime.has(file)) { fs.rmSync(file); pruned++; }
  }
  shipAmbientDeclarations();
  const declarations = walk(LIB, '.d.ts');

  const template = readJson<Record<string, unknown>>(path.join(PKG, 'package.json'));
  delete template['//'];
  delete template.private;
  const manifest = { ...template, version: core.version, dependencies: dependenciesOf([...runtime], declarations, ranges, core.optionalDependencies) };
  fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.copyFileSync(path.join(PKG, 'README.md'), path.join(OUT, 'README.md'));
  fs.copyFileSync(path.join(REPO, 'LICENSE'), path.join(OUT, 'LICENSE'));

  console.log('Check: the test kit loads in Node');
  execFileSync(process.execPath, ['-e', `import(${JSON.stringify(path.join(ENTRY_DIR, 'testing.js'))}).then((m) => { for (const k of ['buildAddonHost', 'openAddonTestDatabase', 'toCsv', 'formatters']) if (!m[k]) throw new Error('missing ' + k); })`], { stdio: 'inherit', cwd: REPO });
  console.log('Check: an add-on typechecks against the built package alone');
  typecheckConsumer();

  console.log(`${String(template.name)}@${core.version}: ${declarations.length} declaration files, ${runtime.size} test-kit modules (${pruned} type-only modules' JavaScript removed), ${Object.keys(manifest.dependencies).length} dependencies`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
