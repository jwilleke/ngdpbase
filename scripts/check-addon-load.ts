/**
 * Load every bundled addon the way `AddonsManager` does — in Node (#1192).
 *
 * v4.13.0 shipped with two addons that threw on their first line. Three gates
 * were green: 8661 unit tests (vitest maps a `.js` specifier back to `.ts`,
 * so a path Node cannot resolve resolved there), 96 E2E (never registers an
 * addon), and both container smoke halves (a failed addon is caught, logged
 * and skipped — correctly, one bad addon must not take the instance down —
 * so a total failure was one log line nobody read).
 *
 * This is the missing gate: `import()` each `addons/<name>/index.js` in a
 * CHILD Node process, with Node's resolver and nothing else. It runs after
 * `npm run build` (the addons must be compiled), and it fails on the first
 * addon whose module graph does not resolve. It does not call `register()` —
 * that needs an engine — so it proves the module loads, which is exactly the
 * property that was missing.
 *
 * `scripts/check-addon-boundary.ts` catches the CAUSE statically at commit
 * time; this catches the EFFECT with the resolver that matters, and would
 * also catch a cause that check does not know about yet.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '..');
const ADDONS = path.join(REPO, 'addons');

const names = readdirSync(ADDONS)
  .filter((n) => statSync(path.join(ADDONS, n)).isDirectory())
  .sort();

let failed = 0;
let checked = 0;
console.log('Addon load in Node (#1192)');
console.log('==========================');
for (const name of names) {
  const index = path.join(ADDONS, name, 'index.js');
  if (!existsSync(index)) {
    // Not compiled. That is a build problem, not a load problem — but a
    // silently skipped addon is the #1182 shape, so say it and fail.
    console.log(`  ${name}: index.js missing — run \`npm run build\` first`);
    failed++;
    continue;
  }
  checked++;
  const r = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `await import(${JSON.stringify(index)});`],
    { cwd: REPO, encoding: 'utf8', timeout: 60_000, env: { ...process.env, NODE_ENV: 'test' } }
  );
  if (r.status === 0) {
    console.log(`  ${name}: loads`);
    continue;
  }
  failed++;
  const lines = (r.stderr || r.stdout || '').split('\n');
  // Node prints the resolver's message before its own throw site; prefer it.
  const firstError =
    lines.find((l) => /Cannot find module/.test(l)) ??
    lines.find((l) => /^\s*(\w*Error|Error \[)/.test(l)) ??
    lines.find((l) => /ERR_/.test(l)) ??
    `exit ${r.status}`;
  console.log(`  ${name}: FAILED — ${firstError.trim()}`);
}

if (failed === 0) {
  console.log(`\nAll ${checked} bundled addons load with Node's resolver.`);
  process.exit(0);
}
console.log(`\n${failed} addon(s) do not load. AddonsManager would log "Failed to load add-on" and continue without them.`);
process.exit(1);
