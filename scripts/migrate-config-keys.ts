/**
 * migrate-config-keys.js
 *
 * One-time migration script: renames all ngdpbase.* config keys to ngdpbase.*
 * in a deployed instance's app-custom-config.json.
 *
 * Usage:
 *   node scripts/migrate-config-keys.js --dataPath=/path/to/data
 *   node scripts/migrate-config-keys.js  # uses FAST_STORAGE env var
 */

// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment and silently operates on ./data.
import '../src/bootstrap-env.js';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const dataPathArg = args.find(a => a.startsWith('--dataPath='));
const dataPath = dataPathArg
  ? dataPathArg.split('=')[1]
  : process.env.FAST_STORAGE || './data';

const configFile = path.join(dataPath, 'config', 'app-custom-config.json');

if (!fs.existsSync(configFile)) {
  console.log(`No app-custom-config.json found at ${configFile} — nothing to migrate.`);
  process.exit(0);
}

const raw = fs.readFileSync(configFile, 'utf8');
let config;
try {
  config = JSON.parse(raw);
} catch (e) {
  console.error(`Failed to parse ${configFile}: ${e.message}`);
  process.exit(1);
}

let migrated = 0;
const newConfig = {};
for (const [key, value] of Object.entries(config)) {
  if (key.startsWith('ngdpbase.')) {
    const newKey = 'ngdpbase.' + key.slice('ngdpbase.'.length);
    newConfig[newKey] = value;
    console.log(`  ${key} → ${newKey}`);
    migrated++;
  } else {
    newConfig[key] = value;
  }
}

if (migrated === 0) {
  console.log('No ngdpbase.* keys found — already migrated or empty config.');
  process.exit(0);
}

// Atomic write: write to .tmp then rename
const tmpFile = configFile + '.tmp';
fs.writeFileSync(tmpFile, JSON.stringify(newConfig, null, 2) + '\n', 'utf8');
fs.renameSync(tmpFile, configFile);
console.log(`\nMigrated ${migrated} key(s) in ${configFile}`);
