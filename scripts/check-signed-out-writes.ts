#!/usr/bin/env tsx
/**
 * Every write route is behind the signed-out write gate, or listed (#2298).
 *
 * `signedOutWriteGate` refuses a signed-out request other than GET, HEAD or OPTIONS before
 * any route runs, and only the routes in `src/security/signedOutWrites.ts` are
 * excepted. That holds only for routes registered AFTER the gate in
 * `src/app.ts`, in a file the gate's order reaches. This lint fails, naming the
 * route, when:
 *
 * 1. a route is registered in `src/app.ts` before the gate, other than the
 *    ones listed in PRE_GATE below with the reason each cannot be behind it;
 * 2. the gate is not registered in `src/app.ts` at all;
 * 3. a write route (`app|router.post|put|patch|delete|all(`) is registered in
 *    a file that is neither a known route file mounted after the gate nor an
 *    add-on's route module (an add-on is mounted by `initializeAddons()`,
 *    which runs after the gate).
 *
 * The runtime side — every registered write route is refused signed out
 * unless listed, and every listed route exists — is the test
 * `src/middleware/__tests__/signedOutWriteGate.test.ts`.
 *
 * Run via `npm run lint:signed-out-writes`. Exits 1 on any violation.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Registered ahead of the gate in app.ts, and why a signed-out caller must get past it. */
const PRE_GATE: Record<string, string> = {
  'app.use(OIDC_MOUNT': 'the OpenID Connect provider\'s protocol endpoints (token, revocation, the device flow when configured, session end; dynamic client registration is off) answer machine clients with their own client authentication and PKCE; mounted before the body parser and the session by design (#1570)',
  'app.post(OUTSIDE_CALLBACK_PATH': 'relays an outside provider\'s form_post callback to the GET callback; it only redirects, and must run before the session (#1743)'
};

/** Files that register routes mounted after the gate. A new one is a claim that it is. */
const ROUTE_FILES: Record<string, string> = {
  'src/routes/WikiRoutes.ts': 'registerRoutes(app), after the gate',
  'src/routes/InstallRoutes.ts': 'mounted at /install after the gate',
  'src/routes/OidcRoutes.ts': 'the sign-in bridge /oidc/interaction, registered after the gate',
  'src/routes/DawarichCompatRoutes.ts': 'registered from WikiRoutes.registerRoutes, after the gate'
};

export interface Violation { file: string; line: number; detail: string }

const WRITE_REGISTRATION = /(?:\b(?:app|\w*[Rr]outer|this\.router)|Router\(\))\s*\??\.\s*(?:post|put|patch|delete|all|propfind|proppatch|mkcol|copy|move|lock|unlock|merge|search|purge)\s*\(|\b(?:app|\w*[Rr]outer)\??\.route\s*\(/;
const isAddonRoute = (rel: string): boolean => /^addons\/[^/]+\/(?:routes\/[^/]+|index)\.ts$/.test(rel);

function code(line: string): string {
  if (/^\s*(?:\*|\/\*)/.test(line)) return '';
  const i = line.indexOf('//');
  return i === -1 ? line : line.slice(0, i);
}

/** Routes and route-bearing calls in app.ts that must come after the gate. */
const APP_ROUTE_BEARING = /\bapp\s*\??\.\s*(?:post|put|patch|delete|all|propfind|proppatch|mkcol|copy|move|lock|unlock|merge|search|purge|route)\s*\(|^\s*\.\s*(?:post|put|patch|delete|all|route)\s*\(|\bapp\.use\(\s*(?:['"`]|[A-Z_]{3,}\b)|\bapp\.use\([^)]*[Rr]outer\b|\bregisterRoutes\(|\binitializeAddons\(|\bregisterOidcRoutes\(/;

export function checkApp(source: string): Violation[] {
  const rel = 'src/app.ts';
  const lines = source.split('\n').map(code);
  const gate = lines.findIndex((l) => /app\.use\(\s*signedOutWriteGate\(/.test(l));
  if (gate === -1) return [{ file: rel, line: 1, detail: 'the signed-out write gate is not registered (app.use(signedOutWriteGate(engine)))' }];
  const out: Violation[] = [];
  lines.slice(0, gate).forEach((l, i) => {
    if (!APP_ROUTE_BEARING.test(l)) return;
    if (/express\.static\(/.test(l)) return; // static files answer GET and HEAD only
    if (Object.keys(PRE_GATE).some((p) => l.includes(p))) return;
    out.push({ file: rel, line: i + 1, detail: `registers a route before the signed-out write gate: ${l.trim()} — move it after the gate, or list it in PRE_GATE with the reason it cannot be behind it` });
  });
  // The listed pre-gate registrations must still exist, so the list cannot outlive them.
  for (const p of Object.keys(PRE_GATE)) {
    if (!lines.some((l) => l.includes(p))) out.push({ file: rel, line: 1, detail: `PRE_GATE names '${p}', which app.ts no longer registers — remove the entry` });
  }
  return out;
}

export function checkRouteFile(rel: string, source: string): Violation[] {
  if (rel in ROUTE_FILES || isAddonRoute(rel) || rel === 'src/app.ts') return [];
  const out: Violation[] = [];
  source.split('\n').forEach((raw, i) => {
    if (WRITE_REGISTRATION.test(code(raw))) {
      out.push({ file: rel, line: i + 1, detail: `registers a write route (${code(raw).trim()}) in a file the signed-out write gate is not known to cover. Mount it after the gate and add the file to ROUTE_FILES in scripts/check-signed-out-writes.ts, or put it in an add-on's routes/ module` });
    }
  });
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (['node_modules', '__tests__', 'dist', 'public', 'views'].includes(entry)) continue;
      walk(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) acc.push(full);
  }
  return acc;
}

export function run(): Violation[] {
  const out = checkApp(readFileSync(path.join(REPO, 'src/app.ts'), 'utf8'));
  for (const file of [...walk(path.join(REPO, 'src')), ...walk(path.join(REPO, 'addons'))]) {
    const rel = path.relative(REPO, file);
    out.push(...checkRouteFile(rel, readFileSync(file, 'utf8')));
  }
  for (const rel of Object.keys(ROUTE_FILES)) {
    try { statSync(path.join(REPO, rel)); } catch { out.push({ file: rel, line: 1, detail: 'ROUTE_FILES names a file that no longer exists — remove the entry' }); }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const violations = run();
  for (const v of violations) console.error(`${v.file}:${v.line}  ${v.detail}`);
  if (violations.length > 0) {
    console.error(`\n${violations.length} write route(s) outside the signed-out write gate (#2298).`);
    process.exit(1);
  }
  console.log('signed-out writes: every write route is behind the gate or listed.');
}
