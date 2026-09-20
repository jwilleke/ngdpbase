#!/usr/bin/env tsx
/**
 * The permission registry, as a TypeScript type (#1431, step 5).
 *
 * `ngdpbase.permissions.definitions` is the registry — the doors this system
 * has. Until now a door named its permission as a bare string, so
 * `requirePermission('page-raed')` compiled, ran, and denied silently. The
 * registry-drift test catches a name that is checked and never declared, but
 * only after the fact and only inside the suite.
 *
 * This emits the same list as a union, so the typo is a compile error.
 *
 * __Generated, not authored.__ `npm run generate:permissions` rewrites it from
 * the config; `--check` fails when the file is out of date, which is what CI
 * and the pre-commit hook run. Editing the output by hand is pointless: the
 * next generation overwrites it.
 *
 * __Core only, deliberately.__ An addon declares its own permissions through
 * the configuration merge, so a union generated from core's file cannot name
 * them. Widening the type to `string` to accommodate that would throw away the
 * guarantee for everyone; an addon generates its own union from its own
 * `config/default-config.json` instead, keeping the check strict per package.
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(REPO, 'config', 'app-default-config.json');
const OUTPUT = path.join(REPO, 'src', 'security', 'permissions.generated.ts');

interface PermissionDefinition {
  description?: string;
}

export function render(): string {
  const config = JSON.parse(readFileSync(CONFIG, 'utf8')) as Record<string, unknown>;
  const definitions = (config['ngdpbase.permissions.definitions'] ?? {}) as Record<string, PermissionDefinition>;
  const names = Object.keys(definitions).sort();

  const entries = names
    .map((name) => {
      const description = (definitions[name]?.description ?? '').replace(/\*\//g, '*\\/');
      return `  /** ${description} */\n  | '${name}'`;
    })
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

function run(): void {
  const rendered = render();
  const check = process.argv.includes('--check');
  let current: string;
  try {
    current = readFileSync(OUTPUT, 'utf8');
  } catch {
    current = '';
  }

  if (check) {
    if (current === rendered) {
      console.log('Permission types (#1431)\n========================\nsrc/security/permissions.generated.ts is up to date.');
      return;
    }
    console.error(
      'Permission types (#1431)\n========================\n' +
      '  src/security/permissions.generated.ts is OUT OF DATE.\n' +
      '  Run `npm run generate:permissions` after changing ngdpbase.permissions.definitions.'
    );
    process.exit(1);
  }

  writeFileSync(OUTPUT, rendered);
  const count = rendered.split('\n').filter((l) => l.startsWith("  | '")).length;
  console.log(`Permission types (#1431)\n========================\nWrote ${count} permissions to src/security/permissions.generated.ts`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  run();
}
