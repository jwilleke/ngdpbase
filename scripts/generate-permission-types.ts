#!/usr/bin/env tsx
/**
 * The registries in configuration, as TypeScript (#1431 step 5, #1638).
 *
 * Two files, one generator, one check:
 *
 * - `src/security/permissions.generated.ts` — `ngdpbase.permissions.definitions`
 *   as the `CorePermission` union. Until #1431 a door named its permission as a
 *   bare string, so `requirePermission('page-raed')` compiled, ran, and denied
 *   silently.
 * - `src/utils/auditEventNames.generated.ts` — `ngdpbase.audit.events` as the
 *   `AUDIT_EVENT` map and the `AuditEventName` union (#1638). Until #1638 that
 *   map was written by hand in `auditEventNames.ts` and a test held it equal to
 *   the configuration keys: two declarations of one list.
 *
 * Either way a typo is a compile error, and configuration is the one place a
 * name is declared.
 *
 * __Generated, not authored.__ `npm run generate:permissions` rewrites both
 * from the config; `--check` (`npm run lint:permissions`) fails when either is
 * out of date, which is what CI and the pre-commit hook run. Editing the output
 * by hand is pointless: the next generation overwrites it.
 *
 * __Core only, deliberately.__ An addon declares its own permissions and audit
 * events through the configuration merge, so a union generated from core's
 * file cannot name them. Widening the types to `string` to accommodate that
 * would throw away the guarantee for everyone. An addon generates its own
 * permission union from its own `config/default-config.json`, and emits its
 * audit events through `addonAuditEventName` (src/utils/auditEventNames.ts),
 * which `recordAuditEvent` checks at runtime against the merged registry.
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { auditDeclarationsFrom } from '../src/utils/auditRegistry.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(REPO, 'config', 'app-default-config.json');

interface Described {
  description?: string;
}

/**
 * The audit event naming rule (#1201): `{target}-{action}`, hyphens only,
 * URL-safe. Declared here, once, and emitted into the generated module, so the
 * generator, the boot check and `lint:audit` cannot disagree about it.
 */
export const AUDIT_EVENT_NAME_PATTERN = /^[a-z]+(-[a-z]+)+$/;

/** The `AUDIT_EVENT` key for a name: upper-cased, hyphens to underscores. */
export function auditEventKey(name: string): string {
  return name.toUpperCase().replace(/-/g, '_');
}

function readMap(key: string): Record<string, Described> {
  const config = JSON.parse(readFileSync(CONFIG, 'utf8')) as Record<string, unknown>;
  return (config[key] ?? {}) as Record<string, Described>;
}

/** A description as a one-line doc comment that cannot close itself early. */
function doc(entry: Described | undefined): string {
  return (entry?.description ?? '').replace(/\*\//g, '*\\/');
}

export function render(): string {
  const definitions = readMap('ngdpbase.permissions.definitions');
  const names = Object.keys(definitions).sort();

  const entries = names
    .map((name) => `  /** ${doc(definitions[name])} */\n  | '${name}'`)
    .join('\n');

  return `// GENERATED FILE — do not edit.
// Source: config/app-default-config.json → ngdpbase.permissions.definitions
// Regenerate: npm run generate:permissions
//
// A door asks for one of these. The union exists so a mistyped permission is a
// compile error rather than a silent deny (#1431).

/** Every permission core declares. Addons generate their own union. */
export type CorePermission =
${entries};

/** The same list at runtime, for a check that has to iterate. */
export const CORE_PERMISSIONS: readonly CorePermission[] = [
${names.map((n) => `  '${n}'`).join(',\n')}
] as const;
`;
}

export function renderAuditEventNames(): string {
  // #1638: the one reader — ngdpbase.audit.events plus every permission carrying `audit`.
  const config = JSON.parse(readFileSync(CONFIG, 'utf8')) as Record<string, unknown>;
  const events = auditDeclarationsFrom((key, fallback) => config[key] ?? fallback) as Record<string, Described>;
  const names = Object.keys(events).sort();

  const offConvention = names.filter((n) => !AUDIT_EVENT_NAME_PATTERN.test(n));
  if (offConvention.length) {
    throw new Error(`ngdpbase.audit.events: not {target}-{action}: ${offConvention.join(', ')}`);
  }

  const entries = names
    .map((name) => `  /** ${doc(events[name])} */\n  ${auditEventKey(name)}: '${name}'`)
    .join(',\n');

  return `// GENERATED FILE — do not edit.
// Source: config/app-default-config.json → ngdpbase.audit.events and ngdpbase.permissions.definitions.*.audit
// Regenerate: npm run generate:permissions
//
// Every audit event core declares, as code (#1201, #1638). An emitter names
// one as AUDIT_EVENT.KEY, so a typo is a compile error. Import from
// ./auditEventNames.js, not from this file.

/** The \`{target}-{action}\` convention: target first, hyphens only (#1201). */
export const AUDIT_EVENT_NAME_PATTERN = ${AUDIT_EVENT_NAME_PATTERN.toString()};

/** Every audit event core declares, keyed by the name upper-cased with underscores. */
export const AUDIT_EVENT = {
${entries}
} as const;

/** A name core code may emit. */
export type AuditEventName = (typeof AUDIT_EVENT)[keyof typeof AUDIT_EVENT];
`;
}

interface Output {
  file: string;
  render: () => string;
  /** The line shape of one generated entry, for the count. */
  entry: RegExp;
  what: string;
}

const OUTPUTS: Output[] = [
  { file: path.join('src', 'security', 'permissions.generated.ts'), render, entry: /^ {2}\| '/, what: 'permissions' },
  { file: path.join('src', 'utils', 'auditEventNames.generated.ts'), render: renderAuditEventNames, entry: /^ {2}[A-Z_]+: '/, what: 'audit events' }
];

function run(): void {
  const check = process.argv.includes('--check');
  console.log('Generated registry types (#1431, #1638)\n=======================================');
  const stale: string[] = [];

  for (const out of OUTPUTS) {
    const rendered = out.render();
    const full = path.join(REPO, out.file);
    let current: string;
    try {
      current = readFileSync(full, 'utf8');
    } catch {
      current = '';
    }

    if (check) {
      if (current === rendered) console.log(`${out.file} is up to date.`);
      else stale.push(out.file);
      continue;
    }

    writeFileSync(full, rendered);
    const count = rendered.split('\n').filter((l) => out.entry.test(l)).length;
    console.log(`Wrote ${count} ${out.what} to ${out.file}`);
  }

  if (stale.length) {
    for (const file of stale) console.error(`  ${file} is OUT OF DATE.`);
    console.error('  Run `npm run generate:permissions` after changing ngdpbase.permissions.definitions or ngdpbase.audit.events.');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  run();
}
