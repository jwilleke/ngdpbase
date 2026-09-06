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

/**
 * Fetch JSON from a URL through the host's egress boundary. The addon's
 * register() builds this from src/http/guardedFetch and hands it in — a
 * manager never calls fetch itself (#1133, #1244).
 */
export type FetchJson = (url: string) => Promise<unknown>;

export default class ${name}Manager {
  private records: unknown[] = [];

  constructor(protected readonly engine: unknown, protected readonly dataPath: string, private readonly fetchJson: FetchJson) {}

  /** Called once during register(). Load persisted state here. */
  async load(): Promise<void> {
    // Replace with real loading. dataPath is resolved by the addon's
    // register() via ConfigurationManager.resolveDataPath, so it already
    // respects the instance's data directory.
    this.records = [];
  }

  /**
   * Pull records from an operator-configured source. Every outbound request
   * goes through the injected fetchJson, so the instance's egress policy
   * (ngdpbase.security.egress.*) applies and a redirect is re-checked on
   * every hop. Loopback and link-local are never reachable; a LAN source
   * needs its prefix in allowed-ranges.
   */
  async refresh(sourceUrl: string): Promise<number> {
    const body = await this.fetchJson(sourceUrl);
    this.records = Array.isArray(body) ? body : [];
    return this.records.length;
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
  execute(_context: PluginContext, params: Record<string, string>): string {
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

  const managerWiring = o.managers.map(m => `    const ${m.toLowerCase()} = new ${m}Manager(engine, dataPath, fetchJson);
    await ${m.toLowerCase()}.load();
    engine.registerManager('${m}Manager', ${m.toLowerCase()});`).join('\n\n');

  const pluginWiring = o.plugins.map(p =>
    `      await pluginManager.registerPlugin('${p}', ${p}Plugin);`).join('\n');

  return `/**
 * ${toTitleCase(o.id)} addon for ngdpbase.
 *
 * Addon code runs in the ngdpbase process. Every check that enforces a
 * runtime property of src/ applies here identically (addons/README.md,
 * "Rules an addon lives under"): outbound HTTP goes through the host's
 * guardedFetch (built once below and injected), a permission decision is
 * ctx.requirePermission on a forwarded subject, and a mutating browser
 * request carries the CSRF token. The generated route, view and manager
 * already do all three — keep it that way.
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
import { guardedFetch } from '../../dist/src/http/guardedFetch.js';
import { resolveEgressPolicy } from '../../dist/src/http/egressPolicy.js';
import apiRoutes from './routes/api.js';
${managerImports}
${pluginImports}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Engine {
  getManager<T = unknown>(name: string): T | null;
  registerManager(name: string, manager: unknown): void;
  /** The Express app, present once the host has built it; routes and views mount here. */
  app?: { use(mountPath: string, handler: unknown): void; get(name: string): unknown; set(name: string, value: unknown): void };
}

const ${toPascalCase(o.id)}Addon = {
  name: '${o.id}',
  version: '1.0.0',
  description: '${toTitleCase(o.id)} addon for ngdpbase',
  author: 'ngdpbase',
  dependencies: [] as string[],

  async register(engine: Engine, config: Record<string, unknown>): Promise<void> {
    const cm = engine.getManager<{ resolveDataPath(n: string): string; getProperty?(k: string, f?: unknown): unknown }>('ConfigurationManager');

    // The ONE way this addon reaches the network (#1133): the host's guarded
    // fetch under the instance's egress policy, read per call so an operator
    // tightening it is honoured without a restart.
    const readConfig = (key: string, fallback?: unknown): unknown => cm?.getProperty?.(key, fallback) ?? fallback;
    const fetchJson = async (url: string): Promise<unknown> => {
      const { policy } = resolveEgressPolicy(readConfig);
      const res = await guardedFetch(url, { policy });
      if (res.status < 200 || res.status >= 300) throw new Error(\`\${url}: HTTP \${res.status}\`);
      return JSON.parse(res.body.toString('utf8')) as unknown;
    };
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

    // Views render with the host's layout; routes mount under the addon's own prefix.
    const views = (engine.app?.get('views') as string | string[] | undefined) ?? [];
    engine.app?.set('views', [...[views].flat(), path.join(__dirname, 'views')]);
    engine.app?.use('/api/${o.id}', apiRoutes(engine));

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
  const perm = `${o.id}-manage`;
  return JSON.stringify({
    [`ngdpbase.addons.${o.id}.enabled`]: false,
    [`ngdpbase.addons.${o.id}.dataPath`]: `./data/${o.id}`,
    // #1220: an addon declares its own permission and the policy that grants
    // it; the host merges this layer. The route asks ctx.requirePermission
    // for this name — never a role name, never isAuthenticated (#1198).
    'ngdpbase.permissions.definitions': {
      [perm]: { description: `Manage the ${toTitleCase(o.id)} addon: refresh its data and change its settings`, icon: 'gear', color: '#0d6efd' }
    },
    'ngdpbase.access.policies': [{
      id: `${perm}-access`,
      name: `${toTitleCase(o.id)} management`,
      description: `Who may manage the ${toTitleCase(o.id)} addon`,
      priority: 90,
      effect: 'allow',
      subjects: [{ type: 'role', value: 'admin' }],
      resources: [{ type: 'page', pattern: '*' }],
      actions: [perm]
    }]
  }, null, 2) + '\n';
}

function routesSource(o: ScaffoldOptions): string {
  const perm = `${o.id}-manage`;
  const manager = o.managers[0];
  return `/**
 * ${toTitleCase(o.id)} API — mounted at /api/${o.id} by index.ts.
 *
 * Every decision here is ctx.requirePermission('${perm}') on the request's
 * own subject (ApiContext forwards it, token and share ceilings included).
 * Never a role name, never isAuthenticated: allow and deny come from policy
 * (#1198), and the addon's default-config.json declares the permission.
 */
import { Router, type Request, type Response } from 'express';
import { ApiContext, ApiError } from '../../../dist/src/context/ApiContext.js';
${manager ? `import type ${manager}Manager from '../managers/${manager}Manager.js';\n` : ''}
interface Engine { getManager<T = unknown>(name: string): T | null }

export default function apiRoutes(engine: Engine): Router {
  const router = Router();

  /** Status, for the addon dashboard and the admin view. */
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const ctx = ApiContext.from(req, engine as never);
      await ctx.requirePermission('${perm}');
${manager ? `      const manager = engine.getManager<${manager}Manager>('${manager}Manager');
      res.json({ ok: true, status: manager?.status() ?? null });` : '      res.json({ ok: true });'}
    } catch (err) {
      if (err instanceof ApiError) { res.status(err.status).json({ ok: false, error: err.message }); return; }
      res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  /** Refresh from the configured source — a mutating request, so the view sends the CSRF token. */
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const ctx = ApiContext.from(req, engine as never);
      await ctx.requirePermission('${perm}');
${manager ? `      const manager = engine.getManager<${manager}Manager>('${manager}Manager');
      const source = typeof req.body?.source === 'string' ? req.body.source : '';
      if (!manager || !source) { res.status(400).json({ ok: false, error: 'source is required' }); return; }
      const count = await manager.refresh(source);
      res.json({ ok: true, count });` : '      res.json({ ok: true });'}
    } catch (err) {
      if (err instanceof ApiError) { res.status(err.status).json({ ok: false, error: err.message }); return; }
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'internal error' });
    }
  });

  return router;
}
`;
}

function statusView(o: ScaffoldOptions): string {
  return `<%- include('header', { title: '${toTitleCase(o.id)}', currentUser }) %>
<div class="container py-4">
  <h1>${toTitleCase(o.id)}</h1>
  <p id="${o.id}-status" class="text-muted">Loading…</p>
  <form id="${o.id}-refresh">
    <label>Source URL <input name="source" type="url" class="form-control" required></label>
    <button type="submit" class="btn btn-primary mt-2">Refresh</button>
  </form>
  <div id="${o.id}-result" class="mt-2"></div>
</div>
<script>
  // A mutating request carries the CSRF token: csrfFetch is loaded by the
  // shared header (/js/csrf.js). A bare fetch here is refused by the host
  // and reads as "Network error" to the user (#727, #1176).
  const send = (url, init) => (window.csrfFetch || fetch)(url, init);
  fetch('/api/${o.id}/status').then(r => r.json()).then(j => {
    document.getElementById('${o.id}-status').textContent = j.ok ? JSON.stringify(j.status) : j.error;
  });
  document.getElementById('${o.id}-refresh').addEventListener('submit', async (e) => {
    e.preventDefault();
    const source = new FormData(e.target).get('source');
    const out = document.getElementById('${o.id}-result');
    try {
      const res = await send('/api/${o.id}/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
      });
      const j = await res.json();
      out.textContent = j.ok ? \`Loaded \${j.count} record(s).\` : j.error;
    } catch {
      out.textContent = 'Request failed.';
    }
  });
</script>
<%- include('footer') %>
`;
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
| \`routes/api.ts\` | \`/api/${o.id}/status\` and \`/refresh\`, gated by \`${o.id}-manage\` |
| \`views/${o.id}-status.ejs\` | Admin view; its POST carries the CSRF token |
| \`pages/\` | Seed pages copied into the wiki on first enable |
| \`config/default-config.json\` | Config keys, the \`${o.id}-manage\` permission and its policy |

## Rules an addon lives under

Addon code runs in the ngdpbase process. Every check that enforces a runtime
property of \`src/\` applies to this directory identically — a check that scans
only \`src/\` is a bug in the check, not a licence. The generated code already
follows the four that bite:

- **Outbound HTTP goes through the host's \`guardedFetch\`.** \`index.ts\` builds
  one under the instance's egress policy and injects it; a manager never calls
  \`fetch\` or an HTTP client library itself. Loopback and link-local are never
  reachable; a LAN source needs its prefix in
  \`ngdpbase.security.egress.allowed-ranges\`.
- **A permission decision is \`ctx.requirePermission('${o.id}-manage')\`** on the
  request's own subject, forwarded — never a role name, never
  \`isAuthenticated\`, never a subject rebuilt from fields. The permission and
  its policy are declared in \`config/default-config.json\`.
- **A mutating browser request carries the CSRF token** — the view uses
  \`(window.csrfFetch || fetch)\`; a bare \`fetch\` is refused by the host.
- **An acting call takes a context**, never a bare username.

The host's guards run over this directory: \`lint:code\`, \`lint:csrf\`,
\`lint:http\`, \`lint:permission-subject\`, \`lint:gates\`, \`lint:addons\`,
\`lint:audit-deps\` and the addon's own \`tsc\`. See ngdpbase's
\`addons/README.md\` for the statement of the rule and its one exemption.

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
    ['routes/api.ts', routesSource(o)],
    [`views/${o.id}-status.ejs`, statusView(o)],
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
