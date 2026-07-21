/**
 * One-time migration for #896 (Slice 4 of EPIC #869) — move the instance's
 * user-keywords vocabulary out of config into the provider-owned store.
 *
 * Reads the legacy `ngdpbase.user-keywords` snapshot from the instance's
 * app-custom-config.json, diffs it against the SHIPPED defaults
 * (config/app-default-config.json), writes the delta to
 * `<instance-data>/vocabulary/user-keywords.json`, and removes the legacy key
 * from the custom config (backup written beside it first).
 *
 * Delta rules (mirror UserKeywordsCatalogProvider.saveCatalogObject):
 *   - entry identical to its seed counterpart → omitted (seed supplies it)
 *   - entry differing from seed, or absent from seed → stored verbatim
 *   - seed entry absent from the snapshot → stored as enabled:false override
 *
 * Idempotent: no legacy key in custom config → nothing to do. An existing
 * store file is MERGED (store entries win) so re-runs and prior adoptions
 * are preserved.
 *
 * Usage:
 *   npm run migrate:vocabulary-store          # apply
 *   npm run migrate:vocabulary-store:dry      # preview
 *
 * Resolution mirrors ConfigurationManager: instance dir = $FAST_STORAGE ||
 * $INSTANCE_DATA_FOLDER || ./data; custom config at <instance>/config/
 * app-custom-config.json (override with --custom <path>); defaults at
 * ./config/app-default-config.json (override with --defaults <path>).
 *
 * Exit codes: 0 success/no-op; 1 failure; 2 bad arguments.
 */

import fs from 'fs-extra';
import path from 'path';

interface Args {
  dryRun: boolean;
  customPath: string | null;
  defaultsPath: string | null;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, customPath: null, defaultsPath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--custom' && argv[i + 1]) { out.customPath = argv[++i]; }
    else if (a === '--defaults' && argv[i + 1]) { out.defaultsPath = argv[++i]; }
  }
  return out;
}

function instanceDataFolder(): string {
  return path.resolve(process.cwd(), process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data');
}

type Catalog = Record<string, Record<string, unknown>>;

export function computeStoreDelta(snapshot: Catalog, seed: Catalog, existingStore: Catalog = {}): Catalog {
  const store: Catalog = {};
  for (const [id, entry] of Object.entries(snapshot)) {
    const seedEntry = seed[id];
    if (seedEntry && JSON.stringify(seedEntry) === JSON.stringify(entry)) continue;
    store[id] = entry;
  }
  for (const id of Object.keys(seed)) {
    if (!(id in snapshot)) store[id] = { ...seed[id], enabled: false };
  }
  // Existing store entries win — preserves adoptions made after the provider
  // switch but before this migration ran.
  return { ...store, ...existingStore };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const customPath = args.customPath ?? path.join(instanceDataFolder(), 'config', 'app-custom-config.json');
  const defaultsPath = args.defaultsPath ?? path.join(process.cwd(), 'config', 'app-default-config.json');
  const storePath = path.join(instanceDataFolder(), 'vocabulary', 'user-keywords.json');

  if (!(await fs.pathExists(defaultsPath))) {
    console.error(`Defaults not found: ${defaultsPath}`);
    process.exit(2);
  }
  if (!(await fs.pathExists(customPath))) {
    console.log(`No custom config at ${customPath} — nothing to migrate.`);
    process.exit(0);
  }

  const defaults = await fs.readJson(defaultsPath) as Record<string, unknown>;
  const custom = await fs.readJson(customPath) as Record<string, unknown>;
  const snapshot = custom['ngdpbase.user-keywords'] as Catalog | undefined;
  if (!snapshot || typeof snapshot !== 'object') {
    console.log('Custom config has no ngdpbase.user-keywords key — nothing to migrate.');
    process.exit(0);
  }

  const seed = (defaults['ngdpbase.user-keywords'] as Catalog | undefined) ?? {};
  const existingStore = (await fs.pathExists(storePath)) ? await fs.readJson(storePath) as Catalog : {};
  const store = computeStoreDelta(snapshot, seed, existingStore);

  console.log(`#896 vocabulary-store migration${args.dryRun ? ' (dry run)' : ''}`);
  console.log(`  snapshot entries: ${Object.keys(snapshot).length}`);
  console.log(`  seed entries:     ${Object.keys(seed).length}`);
  console.log(`  store result:     ${Object.keys(store).length} → ${storePath}`);

  if (args.dryRun) {
    console.log('  (dry run — no files written)');
    process.exit(0);
  }

  const backupPath = `${customPath}.bak-vocabulary-store`;
  await fs.copy(customPath, backupPath);
  await fs.ensureDir(path.dirname(storePath));
  await fs.writeJson(storePath, store, { spaces: 2 });
  delete custom['ngdpbase.user-keywords'];
  await fs.writeJson(customPath, custom, { spaces: 2 });
  console.log(`  wrote store; removed legacy key from custom config (backup: ${backupPath})`);
  process.exit(0);
}

if (process.argv[1] && process.argv[1].includes('migrate-vocabulary-store')) {
  main().catch(err => { console.error(err); process.exit(1); });
}
