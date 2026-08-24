
/**
 * Usage:
 *   node scripts/configurationmanage-get-config.js <key> [--prefix] [--pretty]
 * Examples:
 *   node scripts/configurationmanage-get-config.js ngdpbase.notifications.dir
 *   node scripts/configurationmanage-get-config.js ngdpbase.notifications --prefix --pretty
 */

// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment and silently operates on ./data.
import '../src/bootstrap-env.js';
import fs from 'fs-extra';
import path from 'path';

async function collectAllKeysFromFiles() {
  const defaultsPath = path.resolve(__dirname, '..', 'config', 'app-default-config.json');
  const customPath = path.resolve(__dirname, '..', 'config', 'app-custom-config.json');

  const defaults = await fs.readJson(defaultsPath).catch(() => ({}));
  const custom = await fs.readJson(customPath).catch(() => ({}));

  const keys = new Set([...Object.keys(defaults), ...Object.keys(custom)]);
  return Array.from(keys).sort();
}

(async () => {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
      console.log('Usage: node scripts/configurationmanage-get-config.js <key> [--prefix] [--pretty]');
      process.exit(args.length ? 0 : 1);
    }

    const key = args[0];
    const asPrefix = args.includes('--prefix');
    const pretty = args.includes('--pretty');

    import ConfigurationManager from '../src/managers/ConfigurationManager';
    const engine = { logger: console };
    const cfg = new ConfigurationManager(engine);
    await cfg.initialize({});

    const getVal = (k, d) =>
      typeof cfg.get === 'function'
        ? cfg.get(k, d)
        : typeof cfg.getProperty === 'function'
          ? cfg.getProperty(k, d)
          : d;

    // Exact lookup (default)
    if (!asPrefix) {
      const val = getVal(key);
      if (val !== undefined) {
        console.log(typeof val === 'object' ? (pretty ? JSON.stringify(val, null, 2) : JSON.stringify(val)) : String(val));
        return;
      }
      // Fall through to prefix mode if exact not found
    }

    // Prefix lookup: try manager-provided keys(), else read from config files
    let allKeys = [];
    if (typeof cfg.keys === 'function') {
      allKeys = cfg.keys();
    } else {
      allKeys = await collectAllKeysFromFiles();
    }

    const matches = allKeys.filter((k) => k.startsWith(key));
    if (matches.length === 0) {
      console.error(`No keys found matching: ${key}`);
      process.exit(2);
    }

    const out = {};
    for (const k of matches) {
      out[k] = getVal(k);
    }

    console.log(pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
})();