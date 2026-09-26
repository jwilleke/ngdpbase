/**
 * Every script is in the TypeScript project, or on the list of those not yet
 * brought in (#1092).
 *
 * `tsconfig.json` names the scripts it covers one by one, so a new script
 * sat outside the project by default: never typechecked, and unlintable once
 * staged, because the type-aware ESLint rules cannot parse a file no project
 * includes. This fails on a script that is in neither place, so a new one is
 * added to the project, and on a listed one that has since been added, so
 * the list only shrinks.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

/** Scripts with type errors still to fix before they join the project. */
const NOT_YET_IN_PROJECT = [
  'scripts/analyze-test-pages.ts',
  'scripts/check-metadata-compliance.ts',
  'scripts/configurationmanage-get-config.ts',
  'scripts/dom-performance.ts',
  'scripts/fix-page-index-editor.ts',
  'scripts/fix-required-pages-editor.ts',
  'scripts/maintain-versions.ts',
  'scripts/migrate-br-to-backslash.ts',
  'scripts/migrate-config-keys.ts',
  'scripts/migrate-developer-pages.ts',
  'scripts/migrate-to-versioning.ts',
  'scripts/performance-test.ts',
  'scripts/test-bulk-import.ts',
  'scripts/test-mcp-bulk-upload.ts',
  'scripts/validate-pages.ts'
];

const included = new Set(
  [...fs.readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf8').matchAll(/"(scripts\/[^"*]+\.ts)"/g)].map((m) => m[1])
);
const scripts = fs.readdirSync(path.join(ROOT, 'scripts'))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => `scripts/${f}`);

describe('scripts are in the TypeScript project (#1092)', () => {
  test.each(scripts)('%s is in tsconfig.json or on the not-yet list', (script) => {
    expect(included.has(script) || NOT_YET_IN_PROJECT.includes(script)).toBe(true);
  });

  test.each(NOT_YET_IN_PROJECT)('%s on the not-yet list still exists and is not in the project', (script) => {
    expect(scripts).toContain(script);
    expect(included.has(script)).toBe(false);
  });
});
