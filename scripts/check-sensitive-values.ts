/**
 * Every shipped setting is classified for display (#1750).
 *
 * `ngdpbase.config.sensitive-values` decides who may see a configuration
 * value: `secret`, `sensitive`, or anyone. A key left off the list whose name
 * looks like a secret is hidden by the backstop as `secret` — which fails
 * closed, but hides a storage path from the admins who need it and leaves the
 * decision unmade. So the rule is: decide when the key is added.
 *
 * This check fails when a shipped default config (core, or a bundled add-on's
 * `config/default-config.json`) has a key whose name looks like a secret and
 * whose default is a string, but which no `sensitive-values` map declares.
 * Declare it `secret` or `sensitive`. A key that is neither but trips the name
 * test is misnamed: `false` would not help, since the backstop still hides it.
 *
 * Keys whose names don't look like secrets can't be caught by name; the
 * configuration developer guide makes that classification part of adding a key.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { SENSITIVE_VALUES_KEY, LEGACY_SECRET_KEYS_KEY, looksSecret, valueLevels } from '../src/utils/sensitiveValues.js';

const root = join(import.meta.dirname, '..');
const files = [
  'config/app-default-config.json',
  ...readdirSync(join(root, 'addons'))
    .map((addon) => `addons/${addon}/config/default-config.json`)
    .filter((file) => existsSync(join(root, file)))
];

const configs = files.map((file) => ({ file, values: JSON.parse(readFileSync(join(root, file), 'utf8')) as Record<string, unknown> }));

// The maps merge per entry, add-ons over core, as at runtime.
const declared: Record<string, unknown> = {};
for (const { values } of configs) Object.assign(declared, values[SENSITIVE_VALUES_KEY] ?? {});
const legacy = configs.map(({ values }) => values[LEGACY_SECRET_KEYS_KEY]).find((v) => v !== undefined) ?? {};
const levels = valueLevels((key, fallback) => (key === SENSITIVE_VALUES_KEY ? declared : key === LEGACY_SECRET_KEYS_KEY ? legacy : fallback));

const unclassified: string[] = [];
for (const { file, values } of configs) {
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith('_') || key in declared || levels.has(key)) continue;
    if (looksSecret(key) && typeof value === 'string') unclassified.push(`  ${file}: ${key}`);
  }
}

if (unclassified.length > 0) {
  console.error(`✗ ${unclassified.length} setting(s) look secret but are not classified in ${SENSITIVE_VALUES_KEY}:`);
  console.error(unclassified.join('\n'));
  console.error('Declare each "secret" or "sensitive" (or rename a key that is neither). See docs/guides/configuration-developer-guide.md.');
  process.exit(1);
}
console.log(`✓ sensitive-values: every secret-looking setting is classified (${files.length} config files).`);
