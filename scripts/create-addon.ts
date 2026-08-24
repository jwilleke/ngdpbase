/**
 * create-addon.ts — scaffold a new ngdpbase addon (#675 Phases B + C).
 *
 * Generates a working, enable-able addon from templates held in this file.
 * It does NOT clone a template repo: the repo #675 Phase A proposes does not
 * exist yet, and generating in place keeps the scaffolder testable here and
 * free of a network dependency at the moment someone is trying to start work.
 *
 * What "working" means: the generated addon registers, its plugin renders, and
 * its seed page passes the page validator — verified by the scaffolder's own
 * tests, which generate into a temp dir and assert the contract below.
 *
 * Usage:
 *   npx tsx scripts/create-addon.ts --id volcano-watch
 *   npx tsx scripts/create-addon.ts --id volcano-watch --type domain \
 *     --plugins VolcanoMap,VolcanoList --managers VolcanoData --target ../volcano-watch
 *
 * Flags:
 *   --id        (required) canonical addon slug — lowercase, digits, dashes
 *   --type      additive (default) | domain
 *   --plugins   comma-separated plugin names (default: one named from the id)
 *   --managers  comma-separated manager names (default: one named from the id)
 *   --target    output directory (default: addons/<id>)
 *   --force     write into a non-empty target directory
 *
 * Exit codes:
 *   0 = generated
 *   1 = bad arguments, or target exists without --force
 */

// Loads .env (root and <FAST_STORAGE>/.env) into process.env before anything
// else evaluates. MUST stay the first import — see src/bootstrap-env.ts and
// docs/bootstrap-methodology.md. Without it this script resolves instance
// paths against an empty environment (#1091).
import '../src/bootstrap-env.js';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Identity rules — these mirror AddonsManager, and drift here is a real bug
// ---------------------------------------------------------------------------

/**
 * Canonical slug rule (#927). The slug is the registry key, the
 * `ngdpbase.addons.<slug>.enabled` config key, and the boot validator's match.
 * AddonsManager falls back to the folder name minus a trailing `-addon`, so a
 * slug that cannot survive that round-trip is rejected here rather than
 * producing an addon whose config key is not what its author expects.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateSlug(id: string): string | null {
  if (!id) return 'an --id is required';
  if (!SLUG_PATTERN.test(id)) {
    return `'${id}' is not a valid addon slug — use lowercase letters, digits and single dashes (e.g. volcano-watch)`;
  }
  if (id.endsWith('-addon')) {
    return `'${id}' ends with '-addon', which AddonsManager strips when deriving identity — use '${id.replace(/-addon$/, '')}' instead`;
  }
  return null;
}

/** `volcano-watch` → `VolcanoWatch`, for default plugin/manager names. */
export function toPascalCase(id: string): string {
  return id.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

/** `volcano-watch` → `Volcano Watch`, for page titles and descriptions. */
export function toTitleCase(id: string): string {
  return id.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export interface ScaffoldOptions {
  id: string;
  type: 'additive' | 'domain';
  plugins: string[];
  managers: string[];
  target: string;
  /** Injected by tests so generated output is deterministic. */
  uuid?: () => string;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function packageJson(o: ScaffoldOptions): string {
  return JSON.stringify({
    name: `@ngdpbase/${o.id}`,
    version: '1.0.0',
    description: `${toTitleCase(o.id)} addon for ngdpbase`,
    private: true,
    type: 'module',
    engines: { node: '>=24' },
    // The generated index.ts imports node builtins ('path', 'url'), so an
    // addon that declares no @types/node cannot be typechecked on its own —
    // it only appears to work inside a checkout that already has them. CI in
    // the template repo caught exactly that.
    devDependencies: {
      '@types/node': '^24.0.0',
      typescript: '^5.0.0'
    },
    // The `ngdpbase` block is read statically, with no module import — it is
    // what makes the slug authoritative before any code runs (#927).
    ngdpbase: {
      slug: o.id,
      type: o.type
    }
  }, null, 2) + '\n';
}

function managerSource(name: string, o: ScaffoldOptions): string {
  return `/**
 * ${name}Manager — data layer for the ${o.id} addon.
 *
 * Registered on the engine as '${name}Manager' during register(), so other
 * addons and plugins reach it with engine.getManager('${name}Manager').
 */

export default class ${name}Manager {
  private records: unknown[] = [];

  constructor(private engine: unknown, private dataPath: string) {}

  /** Called once during register(). Load persisted state here. */
  async load(): Promise<void> {
    // Replace with real loading. dataPath is resolved by the addon's
    // register() via ConfigurationManager.resolveDataPath, so it already
    // respects the instance's data directory.
    this.records = [];
  }

  list(): unknown[] {
    return this.records;
  }

  /** Surfaced in the admin addon dashboard. */
  status(): { healthy: boolean; records: number } {
    return { healthy: true, records: this.records.length };
  }
}
`;
}

function pluginSource(name: string, o: ScaffoldOptions): string {
  return `/**
 * ${name}Plugin — renders [{${name}}] on any wiki page.
 */

interface PluginContext {
  engine?: { getManager(name: string): unknown };
  pageName?: string;
}

const ${name}Plugin = {
  name: '${name}',
  description: '${toTitleCase(o.id)} — ${name} plugin',
  author: 'ngdpbase',
  version: '1.0.0',

  /**
   * Params arrive as a plain object of the attributes written in the markup.
   * Return a STRING of HTML — returning a Promise is fine, the renderer awaits.
   */
  execute(context: PluginContext, params: Record<string, string>): string {
    const label = params.label ?? '${toTitleCase(o.id)}';
    // Escape anything that reaches the page — params are author-controlled but
    // a plugin that interpolates raw input teaches the wrong pattern.
    const safe = String(label).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c] as string));
    return \`<div class="${o.id}-${name.toLowerCase()}">\${safe}</div>\`;
  }
};

export default ${name}Plugin;
`;
}

function indexSource(o: ScaffoldOptions): string {
  const managerImports = o.managers
    .map(m => `import ${m}Manager from './managers/${m}Manager.js';`)
    .join('\n');
  const pluginImports = o.plugins
    .map(p => `import ${p}Plugin from './plugins/${p}Plugin.js';`)
    .join('\n');

  const managerWiring = o.managers.map(m => `    const ${m.toLowerCase()} = new ${m}Manager(engine, dataPath);
    await ${m.toLowerCase()}.load();
    engine.registerManager('${m}Manager', ${m.toLowerCase()});`).join('\n\n');

  const pluginWiring = o.plugins.map(p =>
    `      await pluginManager.registerPlugin('${p}', ${p}Plugin);`).join('\n');

  return `/**
 * ${toTitleCase(o.id)} addon for ngdpbase.
 *
 * Configuration keys (in app-custom-config.json):
 *   ngdpbase.addons.${o.id}.enabled   — true/false (REQUIRED; defaults to false)
 *   ngdpbase.addons.${o.id}.dataPath  — override the data directory
 *
 * The exported \`name\` below MUST equal the \`ngdpbase.slug\` in package.json.
 * AddonsManager treats the manifest slug as authoritative and warns loudly on a
 * mismatch, because the config key follows the slug, not this label (#927).
 */

import path from 'path';
import { fileURLToPath } from 'url';
${managerImports}
${pluginImports}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Engine {
  getManager<T = unknown>(name: string): T | null;
  registerManager(name: string, manager: unknown): void;
  app?: { use(route: string, handler: unknown): void };
}

const ${toPascalCase(o.id)}Addon = {
  name: '${o.id}',
  version: '1.0.0',
  description: '${toTitleCase(o.id)} addon for ngdpbase',
  author: 'ngdpbase',
  dependencies: [] as string[],

  async register(engine: Engine, config: Record<string, unknown>): Promise<void> {
    const cm = engine.getManager<{ resolveDataPath(n: string): string }>('ConfigurationManager');
    const dataPath = typeof config['dataPath'] === 'string' && config['dataPath'] !== ''
      ? config['dataPath'] as string
      : (cm?.resolveDataPath('${o.id}') ?? './data/${o.id}');

${managerWiring}

    const pluginManager = engine.getManager<{
      registerPlugin(name: string, plugin: unknown): Promise<void>;
    }>('PluginManager');
    if (pluginManager) {
${pluginWiring}
    }

    // Static assets, if this addon ships any under public/.
    // engine.app?.use('/addons/${o.id}', express.static(path.join(__dirname, 'public')));
    void __dirname;
  },

  /** Optional. Surfaced in the admin addon dashboard. */
  status(): { healthy: boolean } {
    return { healthy: true };
  }
};

export default ${toPascalCase(o.id)}Addon;
`;
}

/**
 * A seed page. UUID is generated fresh and validated by the same `uuid`
 * package ValidationManager uses — a hand-typed placeholder UUID is the
 * footgun #675 cites from geohazardwatch's history.
 *
 * `system-category: documentation` is deliberate: per addons.md §9 an addon's
 * own help page is documentation, and that category is addon-owned. Domain
 * content would be `general` and instance-owned.
 */
function seedPage(o: ScaffoldOptions, uuid: string): string {
  return `---
title: Using ${toTitleCase(o.id)}
uuid: ${uuid}
slug: using-${o.id}
system-category: documentation
user-keywords:
  - ${toTitleCase(o.id)}
  - Addon
author: system
lastModified: '${new Date().toISOString().slice(0, 10)}T00:00:00.000Z'
---
# Using ${toTitleCase(o.id)}

This page ships with the **${o.id}** addon and is seeded into the wiki when the
addon is enabled.

## Enable the addon

\`\`\`json
{
  "ngdpbase.addons.${o.id}.enabled": true
}
\`\`\`

Discovery alone does not enable an addon — the key above is required.

## Plugins

${o.plugins.map(p => `- \`[{${p}}]\` — renders the ${p} plugin.`).join('\n')}

## Editing this page

Once seeded, this page belongs to the instance. Edits made in the wiki are
preserved: the addon will not overwrite a page you have changed.
`;
}

function defaultConfig(o: ScaffoldOptions): string {
  return JSON.stringify({
    [`ngdpbase.addons.${o.id}.enabled`]: false,
    [`ngdpbase.addons.${o.id}.dataPath`]: `./data/${o.id}`
  }, null, 2) + '\n';
}

function readme(o: ScaffoldOptions): string {
  return `# ${toTitleCase(o.id)}

${toTitleCase(o.id)} addon for [ngdpbase](https://github.com/jwilleke/ngdpbase).

- **Slug:** \`${o.id}\` — the canonical identity. It is the registry key and the
  config key, and it must equal the \`name\` exported from \`index.ts\`.
- **Type:** \`${o.type}\`${o.type === 'domain'
  ? ' — this addon IS the site identity, not an augmentation of an existing wiki.'
  : ' — augments an existing wiki.'}

## Enable

\`\`\`json
{
  "ngdpbase.addons.${o.id}.enabled": true
}
\`\`\`

## Contents

| Path | What it is |
|---|---|
${o.managers.map(m => `| \`managers/${m}Manager.ts\` | Data layer, registered as \`${m}Manager\` |`).join('\n')}
${o.plugins.map(p => `| \`plugins/${p}Plugin.ts\` | Renders \`[{${p}}]\` on a page |`).join('\n')}
| \`pages/\` | Seed pages copied into the wiki on first enable |
| \`config/default-config.json\` | Config keys this addon reads |

## Develop

Drop this directory into an ngdpbase instance's \`addons/\` (or point
\`ngdpbase.managers.addons-manager.addons-path\` at its parent), enable it, and
restart. For production, see the platform's \`packaged\` distribution model.
`;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface ScaffoldResult {
  target: string;
  files: string[];
  pageUuid: string;
}

export async function scaffoldAddon(o: ScaffoldOptions): Promise<ScaffoldResult> {
  const gen = o.uuid ?? uuidv4;
  const pageUuid = gen();
  const files: Array<[string, string]> = [
    ['package.json', packageJson(o)],
    ['index.ts', indexSource(o)],
    ['README.md', readme(o)],
    ['config/default-config.json', defaultConfig(o)],
    [`pages/${pageUuid}.md`, seedPage(o, pageUuid)]
  ];

  for (const m of o.managers) files.push([`managers/${m}Manager.ts`, managerSource(m, o)]);
  for (const p of o.plugins) files.push([`plugins/${p}Plugin.ts`, pluginSource(p, o)]);

  for (const [rel, content] of files) {
    const dest = path.join(o.target, rel);
    await fs.ensureDir(path.dirname(dest));
    await fs.writeFile(dest, content, 'utf8');
  }

  return { target: o.target, files: files.map(([rel]) => rel), pageUuid };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv: string[]): { options?: ScaffoldOptions; error?: string } {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
  };

  const id = get('--id') ?? '';
  const slugError = validateSlug(id);
  if (slugError) return { error: slugError };

  const typeRaw = get('--type') ?? 'additive';
  if (typeRaw !== 'additive' && typeRaw !== 'domain') {
    return { error: `--type must be 'additive' or 'domain', got '${typeRaw}'` };
  }

  const list = (flag: string, fallback: string): string[] => {
    const raw = get(flag);
    const names = (raw ? raw.split(',') : [fallback]).map(s => s.trim()).filter(Boolean);
    return names;
  };

  const plugins = list('--plugins', toPascalCase(id));
  const managers = list('--managers', toPascalCase(id));

  const bad = [...plugins, ...managers].find(n => !/^[A-Za-z][A-Za-z0-9]*$/.test(n));
  if (bad) return { error: `'${bad}' is not a valid identifier — plugin and manager names must be alphanumeric, starting with a letter` };

  return {
    options: {
      id,
      type: typeRaw,
      plugins,
      managers,
      target: get('--target') ?? path.join('addons', id)
    }
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { options, error } = parseArgs(argv);

  if (error) {
    console.error(`✗ ${error}`);
    console.error('\nUsage: npx tsx scripts/create-addon.ts --id <slug> [--type additive|domain]');
    console.error('       [--plugins A,B] [--managers C] [--target dir] [--force]');
    process.exit(1);
  }

  const o = options!;
  const exists = await fs.pathExists(o.target);
  if (exists) {
    const entries = await fs.readdir(o.target);
    if (entries.length > 0 && !argv.includes('--force')) {
      console.error(`✗ ${o.target} exists and is not empty — pass --force to write into it anyway`);
      process.exit(1);
    }
  }

  const result = await scaffoldAddon(o);

  console.log(`✓ Scaffolded '${o.id}' (${o.type}) into ${result.target}`);
  for (const f of result.files) console.log(`    ${f}`);
  console.log('\nNext steps:');
  console.log(`  1. Enable it:  "ngdpbase.addons.${o.id}.enabled": true`);
  console.log('  2. Restart the server — the addon registers and its page seeds.');
  console.log(`  3. Put [{${o.plugins[0]}}] on a page to see the plugin render.`);
}

// Only run the CLI when invoked directly, so the exports above stay importable
// from tests without generating anything.
if (process.argv[1] && process.argv[1].endsWith('create-addon.ts')) {
  main().catch((err: unknown) => {
    console.error('✗ Scaffold failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
