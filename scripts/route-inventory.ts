#!/usr/bin/env tsx
/**
 * The route inventory (#2298): every route the application registers —
 * method, path, handler, where it is registered — and for each write route
 * whether a signed-out caller may reach it (the signed-out write list) or the
 * signed-out write gate refuses it.
 *
 * It records what the code registers, not what a reader remembers: core's
 * `WikiRoutes.registerRoutes`, the install router, the OpenID Connect sign-in
 * bridge and the Dawarich layer are run against a recording app, and each
 * add-on's route modules are run against a recording router and mounted where
 * the add-on's `index.ts` mounts them. The handler is read from the line that
 * made the registration.
 *
 * `npm run inventory:routes` prints the table; the signed-out write test
 * (`src/middleware/__tests__/signedOutWriteGate.test.ts`) uses `collectRoutes`
 * to hold every write route to the gate.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface RouteRecord {
  method: string;
  path: string;
  handler: string;
  /** Where it is registered: `core`, `install`, `oidc-bridge`, `dawarich` or `addon:<slug>`. */
  origin: string;
  file: string;
  line: number;
}

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const isWriteMethod = (method: string): boolean => WRITE.has(method.toUpperCase());

const sourceCache = new Map<string, string[]>();
function linesOf(file: string): string[] {
  let lines = sourceCache.get(file);
  if (!lines) {
    lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
    sourceCache.set(file, lines);
  }
  return lines;
}

/** The first frame outside this file: where the route was registered. */
function callSite(): { file: string; line: number } {
  const frames = (new Error().stack ?? '').split('\n').slice(1);
  for (const frame of frames) {
    const m = /\(?((?:file:\/\/)?\/[^():]+):(\d+):\d+\)?$/.exec(frame.trim());
    if (!m) continue;
    const file = m[1].replace(/^file:\/\//, '');
    if (file.endsWith('route-inventory.ts') || file.includes('node_modules')) continue;
    return { file, line: Number(m[2]) };
  }
  return { file: '?', line: 0 };
}

/** The handler named on a registration, read from its line and the few after it. */
function handlerAt(file: string, line: number): string {
  const snippet = linesOf(file).slice(line - 1, line + 5).join(' ');
  const after = snippet.slice(snippet.indexOf('(') + 1);
  const named = /this\.(\w+)\(|this\.(\w+)\.bind|\bvoid this\.(\w+)|\b(\w+Routes)\(|decide\((true|false)\)/.exec(after.replace(/^[^,]*,/, ''));
  if (named) return named[1] ?? named[2] ?? named[3] ?? named[4] ?? `decide(${named[5]})`;
  return '(inline)';
}

type Sink = (method: string, routePath: string, file: string, line: number) => void;

/** A stand-in for an Express app or router that records `get`/`post`/… and ignores the rest. */
function recorder(sink: Sink, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const rec: Record<string, unknown> = { ...extra };
  for (const m of ['get', 'post', 'put', 'patch', 'delete', 'all', 'head', 'options']) {
    rec[m] = (p: unknown, ..._handlers: unknown[]) => {
      if (typeof p === 'string') {
        const site = callSite();
        sink(m.toUpperCase(), p, site.file, site.line);
      }
      return rec;
    };
  }
  rec.use = () => rec;
  rec.set = () => rec;
  rec.param = () => rec;
  rec.route = () => rec;
  return rec;
}

const stubEngine = (extra: Record<string, unknown> = {}): never => ({
  getManager: () => null,
  getConfig: () => ({}),
  createRouter: () => { throw new Error('replaced per router'); },
  ...extra
}) as never;

function relative(file: string): string {
  return path.relative(REPO, file);
}

/** Every `engine.app?.use('<prefix>', <name>(…))` in an add-on's index, with the module `<name>` came from. */
function addonMounts(slug: string): Array<{ prefix: string; module: string }> {
  const index = path.join(REPO, 'addons', slug, 'index.ts');
  const text = readFileSync(index, 'utf8');
  const imports = new Map<string, string>();
  for (const m of text.matchAll(/import\s+(\w+)\s+from\s+'(\.\/routes\/[^']+?)(?:\.js)?'/g)) imports.set(m[1], m[2]);
  const out: Array<{ prefix: string; module: string }> = [];
  for (const m of text.matchAll(/engine\.app\?\.use\(\s*'([^']+)'\s*,\s*(\w+)\(/g)) {
    const mod = imports.get(m[2]);
    if (mod) out.push({ prefix: m[1], module: mod });
  }
  return out;
}

/** Anything an add-on module is handed besides the engine: reads as a function, an object or `undefined`, as asked. */
const inert: unknown = new Proxy(function inertTarget() { /* stand-in */ }, {
  get: (_t, key) => (key === 'then' ? undefined : inert),
  apply: () => inert
});

/**
 * The signed-out routes each add-on declares in `register()` through
 * `host.allowSignedOutWrite({ method, path, reason })`, read from its index.ts.
 */
export function addonDeclarations(): Array<{ slug: string; method: string; path: string; reason: string }> {
  const out: Array<{ slug: string; method: string; path: string; reason: string }> = [];
  for (const slug of readdirSync(path.join(REPO, 'addons')).sort()) {
    const index = path.join(REPO, 'addons', slug, 'index.ts');
    if (!existsSync(index)) continue;
    const re = /allowSignedOutWrite\(\{\s*method: '(\w+)',\s*path: '([^']+)',\s*reason: '([^']+)'/g;
    for (const m of readFileSync(index, 'utf8').matchAll(re)) out.push({ slug, method: m[1], path: m[2], reason: m[3] });
  }
  return out;
}

/** Run every registration against a recording app and return what was registered. */
export async function collectRoutes(): Promise<RouteRecord[]> {
  const records: RouteRecord[] = [];
  const add = (origin: string): Sink => (method, routePath, file, line) => {
    const rel = relative(file);
    records.push({ method, path: routePath, handler: handlerAt(file, line), origin: rel.endsWith('DawarichCompatRoutes.ts') ? 'dawarich' : origin, file: rel, line });
  };

  const { default: WikiRoutes } = await import('../src/routes/WikiRoutes.js');
  new WikiRoutes(stubEngine() as never).registerRoutes(recorder(add('core')) as never);

  const { default: InstallRoutes } = await import('../src/routes/InstallRoutes.js');
  const installSink = add('install');
  const installRouter = recorder((m, p, f, l) => installSink(m, `/install${p === '/' ? '' : p}`, f, l));
  const express = (await import('express')).default;
  const realRouter = express.Router;
  (express as unknown as { Router: unknown }).Router = () => installRouter;
  try {
    new InstallRoutes(stubEngine() as never);
  } finally {
    (express as unknown as { Router: unknown }).Router = realRouter;
  }

  const { registerOidcRoutes } = await import('../src/routes/OidcRoutes.js');
  registerOidcRoutes(recorder(add('oidc-bridge')) as never, { oidc: {}, templateData: async () => ({}), permit: async () => true, describeScopes: () => [] } as never);

  const addonsDir = path.join(REPO, 'addons');
  for (const slug of readdirSync(addonsDir).sort()) {
    if (!existsSync(path.join(addonsDir, slug, 'index.ts'))) continue;
    for (const { prefix, module } of addonMounts(slug)) {
      const mod = await import(path.join(addonsDir, slug, `${module}.js`).replace(/\.js$/, '.ts')) as { default: (...a: unknown[]) => unknown };
      const sink = add(`addon:${slug}`);
      const router = recorder((m, p, f, l) => sink(m, `${prefix}${p === '/' ? '' : p}`, f, l));
      const engine = stubEngine({ createRouter: () => router });
      // The modules take (engine, config-or-addon, host) in varying order; every argument after the engine is the same inert stand-in.
      await mod.default(engine, inert, inert, inert);
    }
  }
  // Registered by app.ts or by a library, ahead of the gate; the lint holds this list to PRE_GATE.
  records.push(
    { method: 'POST', path: '/auth/oauth/:name/callback', handler: 'outsideCallbackRelay', origin: 'app (before the gate)', file: 'src/app.ts', line: 0 },
    { method: 'POST', path: '/oidc/*', handler: 'node-oidc-provider protocol endpoints (token, revocation, device flow when configured, session end)', origin: 'app (before the gate)', file: 'src/app.ts', line: 0 }
  );
  return records;
}

function markdown(records: RouteRecord[], listed: (method: string, p: string) => string | null): string {
  const rows = records.map((r) => {
    const write = isWriteMethod(r.method);
    const reason = write ? listed(r.method, r.path.replace(/:[A-Za-z]+/g, 'x')) : null;
    const gate = !write ? 'read' : r.origin.startsWith('app') ? 'before the gate (own authentication)' : reason ? `listed: ${reason}` : 'refused signed out';
    return `| ${r.method} | \`${r.path}\` | ${r.handler} | ${r.origin} | ${gate} |`;
  });
  return ['| Method | Path | Handler | Registered by | Signed out |', '| --- | --- | --- | --- | --- |', ...rows].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const records = await collectRoutes();
  const { signedOutWriteReason, declareAddonSignedOutWrite } = await import('../src/security/signedOutWrites.js');
  for (const d of addonDeclarations()) declareAddonSignedOutWrite(d.slug, { method: d.method as 'POST', path: d.path, reason: d.reason });
  console.log(markdown(records, signedOutWriteReason));
  const writes = records.filter((r) => isWriteMethod(r.method));
  console.error(`routes: ${records.length}, write routes: ${writes.length}`);
}
