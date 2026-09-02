#!/usr/bin/env tsx
/**
 * Outbound HTTP boundary guard (#1139).
 *
 * #1133 found an SSRF because nothing declared where network access was
 * allowed to originate: a new `fetch()` anywhere was invisible to review. The
 * fix was `src/http/` — `guardedFetch`, `guardedLookup`, the egress policy —
 * but a guard that is not enforced decays the way the store boundary did, one
 * convenient direct call at a time, with nothing going red.
 *
 * This is the check that keeps it closed. It is only writable because #1133
 * chose to forbid global `fetch` outside the boundary rather than guard it
 * with an undici dispatcher: *"calling fetch is fine, provided
 * setGlobalDispatcher ran first"* is not statically checkable, whereas
 * "`fetch` does not appear outside `src/http/`" is.
 *
 * __Matched on the symbol, never on the path.__ That is the whole design.
 * Several files legitimately touch these modules to LISTEN, which is inbound
 * and not the risk this guards: `app.ts` calls `https.createServer` and
 * `net.createServer` for the #1163 redirect multiplexer, and
 * `httpsRedirect.ts` calls `http.createServer`. Exempting those paths would
 * start exactly the allow-list rot the check exists to prevent — the whole
 * file would then be free to add a client call later, silently. So the check
 * asks what the code DOES with the module, and no path is ever exempt.
 *
 * The same discrimination handles the trap #1139 recorded: `CommentsPlugin`
 * and `FootnotesPlugin` contain `fetch(` inside template strings that are
 * emitted into the rendered page and run in the VISITOR'S browser against
 * relative URLs. They never execute in Node. A naive `\bfetch\(` flags both,
 * and the natural response — exempting `src/plugins/` — would blind the check
 * to a real server-side fetch in a plugin, which is a thing plugins do.
 *
 * Run via `npm run lint:http`. Wired into `npm run lint` / `lint:ci` /
 * `.husky/pre-commit`. Exits 1 on any violation.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '..');

/** The boundary itself. Everything here is allowed to open the network. */
const BOUNDARY = 'src/http';

/**
 * Scanned in full. `scripts/` is excluded: build and test tooling is not the app.
 *
 * __`addons/` is scanned too (#1139).__ Restricting this to `src` was the
 * defect, not an omission in passing: addon code is loaded into the ngdpbase
 * process and opens sockets from it, so the invariant applies identically. The
 * feeds addon made six raw `fetch()` calls on operator-supplied URLs from July
 * onward while this check printed `No network access originates outside
 * src/http/.` on every run — a guard reporting green over a scope that never
 * included the code.
 *
 * The header above argues that no PATH may be exempted, because allow-list rot
 * is what this exists to prevent. A scan root that omits half the process is
 * the same rot, arriving one level up.
 */
const SCAN_ROOTS = ['src', 'addons'];

/**
 * Client symbols on `http` / `https` / `net`.
 *
 * `createServer`, `Server` and `Agent`-free listening are inbound and fine.
 * These are the ones that open an outbound connection.
 */
const CLIENT_SYMBOLS = ['request', 'get', 'createConnection', 'connect', 'Agent'];

/** HTTP client libraries. None of these has an inbound use. */
const CLIENT_MODULES = ['axios', 'got', 'node-fetch', 'undici', 'superagent', 'request'];

export interface Violation {
  file: string;
  line: number;
  rule: string;
  detail: string;
}

/**
 * Is this `fetch(` real, or browser JavaScript inside a template literal?
 *
 * The distinction is positional: plugin-emitted client code lives inside a
 * backtick string that is returned into the page. Rather than parse, the line
 * is judged by whether it sits inside a template literal that the file is
 * building — tracked by counting unescaped backticks before it. That is a
 * heuristic, and it is deliberately the CONSERVATIVE one: an odd count means
 * "inside a template string", so an ambiguous case is reported rather than
 * skipped, and the failure mode is a false alarm a human resolves rather than
 * a real outbound call waved through.
 */
export function isInsideTemplateLiteral(lines: string[], index: number): boolean {
  let backticks = 0;
  for (let i = 0; i < index; i++) {
    const line = lines[i];
    for (let c = 0; c < line.length; c++) {
      if (line[c] === '`' && (c === 0 || line[c - 1] !== '\\')) backticks++;
    }
  }
  return backticks % 2 === 1;
}

/** Strip `//` comments and the bodies of block comments, so prose never trips a rule. */
function stripComments(source: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of source.split('\n')) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end === -1) { out.push(''); continue; }
      line = line.slice(end + 2);
      inBlock = false;
    }
    const block = line.indexOf('/*');
    if (block !== -1) {
      const end = line.indexOf('*/', block + 2);
      if (end === -1) { inBlock = true; line = line.slice(0, block); }
      else line = line.slice(0, block) + line.slice(end + 2);
    }
    const slash = line.indexOf('//');
    if (slash !== -1) line = line.slice(0, slash);
    out.push(line);
  }
  return out;
}

/** Which symbols an import statement actually binds, for symbol-level judgement. */
function importedSymbols(line: string): string[] {
  const named = /import\s+(?:type\s+)?\{([^}]+)\}/.exec(line);
  if (named) {
    return named[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
  }
  return [];
}

/**
 * A METHOD or signature named `fetch`, rather than a call to the global one.
 *
 * `SourceAdapter` declares `fetch(cfg): Promise<RawRecord[]>` and every adapter
 * implements `async fetch(cfg) { ... }`. Reporting those as outbound calls
 * roughly doubles the finding count with noise, and a check whose output is
 * half noise is one people learn to skim — which is how the real sixteen would
 * have been lost among them.
 *
 * Matched at the start of a line and requiring a `:` return type or an opening
 * brace after the parameter list, so an actual call (`await fetch(url)`,
 * `const r = fetch(url)`) is never excluded by it.
 */
const DECLARES_FETCH = /^\s*(?:(?:public|private|protected|static|readonly|async)\s+)*fetch\s*\([^)]*\)\s*(?::|\{|;)/;

export function checkFile(relPath: string, source: string): Violation[] {
  const violations: Violation[] = [];
  const rawLines = source.split('\n');
  const lines = stripComments(source);

  // A namespace import binds the whole module, so the judgement moves to the
  // call sites: `import net from 'net'` is fine, `net.connect(...)` is not.
  const namespaceAliases = new Map<string, string>();

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const report = (rule: string, detail: string): void => {
      violations.push({ file: relPath, line: lineNo, rule, detail });
    };

    const moduleMatch = /(?:from|require\()\s*['"]([^'"]+)['"]/.exec(line);
    const mod = moduleMatch?.[1]?.replace(/^node:/, '');
    const isImport = /^\s*import\b/.test(line) || /require\(/.test(line);

    if (isImport && mod) {
      if (CLIENT_MODULES.includes(mod)) {
        report('client-library', `imports "${mod}", an HTTP client. Outbound requests belong in ${BOUNDARY}/.`);
        return;
      }

      if (['http', 'https', 'net', 'dns', 'dns/promises'].includes(mod)) {
        // A type-only import is erased at compile time and cannot open
        // anything. `import type { Socket } from 'net'` is a shape, not a
        // capability.
        if (/^\s*import\s+type\b/.test(line)) return;

        if (mod.startsWith('dns')) {
          report('dns', `imports "${mod}". DNS resolution belongs in ${BOUNDARY}/ (guardedLookup) — resolving an address is how SSRF picks its target.`);
          return;
        }

        const symbols = importedSymbols(line);
        if (symbols.length > 0) {
          const bad = symbols.filter((s) => CLIENT_SYMBOLS.includes(s));
          if (bad.length > 0) {
            report('client-symbol', `imports { ${bad.join(', ')} } from "${mod}" — those open outbound connections. Use ${BOUNDARY}/guardedFetch.`);
          }
          return;
        }

        // Default or namespace import: remember the alias and judge its uses.
        const alias = /import\s+(\w+)\s+from/.exec(line)?.[1]
          ?? /import\s+\*\s+as\s+(\w+)\s+from/.exec(line)?.[1];
        if (alias) namespaceAliases.set(alias, mod);
      }
      return;
    }

    for (const [alias, module] of namespaceAliases) {
      const used = new RegExp(`\\b${alias}\\.(${CLIENT_SYMBOLS.join('|')})\\s*\\(`).exec(line);
      if (used) {
        report('client-call', `calls ${alias}.${used[1]}() on "${module}" — an outbound connection. Use ${BOUNDARY}/guardedFetch.`);
      }
    }

    if (/(?<![.\w$])fetch\s*\(/.test(line)) {
      if (isInsideTemplateLiteral(rawLines, i)) return; // browser code emitted into a page
      if (DECLARES_FETCH.test(line)) return;            // a METHOD named fetch, not a call to one
      report('fetch', `calls fetch(). Global fetch is not used in this codebase — route it through ${BOUNDARY}/guardedFetch so the egress policy applies.`);
    }
  });

  return violations;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walk(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

export function run(): Violation[] {
  const boundary = path.join(REPO, BOUNDARY);
  return SCAN_ROOTS.flatMap((r) => walk(path.join(REPO, r)))
    .filter((f) => !f.startsWith(boundary + path.sep))
    .flatMap((f) => checkFile(path.relative(REPO, f), readFileSync(f, 'utf8')));
}

// Only when executed directly, so the functions above stay importable by tests.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  console.log('Outbound HTTP boundary (#1139)');
  console.log('==============================');
  const violations = run();
  if (violations.length === 0) {
    console.log(`No network access originates outside ${BOUNDARY}/ (scanned: ${SCAN_ROOTS.join(', ')}).`);
    process.exit(0);
  }
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.detail}`);
  }
  console.error(`\n${violations.length} violation(s). Outbound requests go through ${BOUNDARY}/guardedFetch,`);
  console.error('which applies the egress policy and re-checks the address on every redirect hop (#1133).');
  process.exit(1);
}
