/**
 * create-addon.ts — scaffold a new ngdpbase addon (#675, #1636).
 *
 * The one source for a new addon. Generates a working, enable-able addon from
 * templates held in this file and, with --repo, the standalone repository
 * around it (CI, Renovate, licence). There is no template
 * repository to copy: a second hand-kept copy of this output drifted from it
 * (#1636), and generating in place keeps the scaffolder testable here and free
 * of a network dependency at the moment someone is trying to start work.
 *
 * What "working" means: the generated addon registers, its plugin renders, and
 * its seed page passes the page validator — verified by the scaffolder's own
 * tests, which generate into a temp dir and assert the contract below.
 *
 * Usage:
 *   npm run create:addon -- --id volcano-watch
 *   npm run create:addon -- --id volcano-watch --type domain \
 *     --plugins VolcanoMap,VolcanoList --managers VolcanoData --target ../volcano-watch
 *   npm run create:addon -- --id volcano-watch --repo --target ../volcano-watch
 *
 * Flags:
 *   --id        (required) canonical addon slug — lowercase, digits, dashes
 *   --type      additive (default) | domain
 *   --plugins   comma-separated plugin names (default: one named from the id)
 *   --managers  comma-separated manager names (default: one named from the id)
 *   --scope     npm scope for the package name, e.g. @yourphr → @yourphr/<id>-addon.
 *               Required unless the target is this checkout's addons/ (a bundled
 *               addon, named @ngdpbase/<id>) — the scaffold never guesses a scope (#1676)
 *   --repo      write a whole repository: the addon at <target>/addons/<id>/,
 *               plus renovate.json, .github/workflows/ci.yml and publish.yml,
 *               .gitignore, LICENSE and README.md at <target>. Nothing deployment-specific
 *               (#1829): the Dockerfile that ships it lives in the site repo
 *               (addons-developer-guide.md section 12)
 *   --target    output directory (default: addons/<id>; with --repo, ../<id>)
 *   --force     write into a non-empty target directory
 *
 * Exit codes:
 *   0 = generated
 *   1 = bad arguments, or target exists without --force
 */

// Deliberately no bootstrap-env (#1829). This is a repo-only tool: it reads
// this checkout's package.json and LICENSE and writes a target directory, and
// touches no instance data, so it needs no .env, no run-as user (#1693) and
// must not backfill instance secrets. A fresh clone with no .env can run it.
// See "Every entry point loads it" in docs/guides/bootstrap-developer-guide.md.
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

/** The page an addon author starts from; generated READMEs link it. */
const GUIDE_URL = 'https://github.com/jwilleke/ngdpbase/blob/master/docs/guides/addons-developer-guide.md';

/** This checkout's root: the LICENSE and version a --repo carries come from here. */
const NGDPBASE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  /** The addon directory, or with `repo` the repository root. */
  target: string;
  /** Write a whole standalone repository with the addon at addons/<id>/. */
  repo?: boolean;
  /** npm scope (`@yourphr`): the package is `<scope>/<id>-addon`. Absent: a bundled addon, `@ngdpbase/<id>` (#1676). */
  scope?: string;
  /** Injected by tests so generated output is deterministic. */
  uuid?: () => string;
}

/** A freshly scaffolded addon is not a 1.0.0 release; package.json and index.ts carry the same version (#1676). */
export const SCAFFOLD_VERSION = '0.1.0';

/** npm scope rule: `@` then a lowercase name (npm's own rule for scope names). */
export function validateScope(scope: string): string | null {
  return /^@[a-z0-9][a-z0-9._-]*$/.test(scope)
    ? null
    : `--scope must look like @your-scope (lowercase, starting with @), got '${scope}'`;
}

/**
 * The package name (#1676). A published addon is `<scope>/<id>-addon`, which is
 * what the guide documents and what `node_modules:@scope/*-addon` discovery
 * matches; a bundled addon keeps the bundled convention, `@ngdpbase/<id>`.
 */
export function packageName(o: Pick<ScaffoldOptions, 'id' | 'scope'>): string {
  return o.scope ? `${o.scope}/${o.id}-addon` : `@ngdpbase/${o.id}`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function packageJson(o: ScaffoldOptions): string {
  return JSON.stringify({
    name: packageName(o),
    version: SCAFFOLD_VERSION,
    license: 'Apache-2.0',
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
      type: o.type,
      // #1757: the core it was generated from is the oldest it is known to run on.
      minVersion: ngdpbaseVersion()
    }
  }, null, 2) + '\n';
}

function managerSource(name: string, o: ScaffoldOptions): string {
  return `/**
 * ${name}Manager — data layer for the ${o.id} addon.
 *
 * Registered on the engine as '${name}Manager' during register(), so other
 * addons and plugins reach it with engine.getManager('${name}Manager').
 *
 * Note what the constructor does NOT take: a way to reach the network of its
 * own. \`fetchJson\` is injected by register(), built there on the host's guarded
 * fetch under the instance's egress policy. An addon that calls bare \`fetch\`
 * bypasses that policy completely, so the manager is handed the one door it is
 * allowed to use rather than being trusted to pick the right one (#1133, #1244).
 */

/** Injected by register(); index.ts shows how it is built. */
export type FetchJson = (url: string) => Promise<unknown>;

export default class ${name}Manager {
  private records: unknown[] = [];

  constructor(
    protected readonly engine: unknown,
    protected readonly dataPath: string,
    private readonly fetchJson: FetchJson
  ) {}

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

  /**
   * Pull records from an operator-supplied URL.
   *
   * The call goes through the injected fetchJson, so the egress policy decides
   * whether the address may be reached — a loopback or LAN URL is refused there,
   * not here, and a redirect is re-checked on every hop. Nothing in this file
   * needs to know the policy exists.
   */
  async refresh(sourceUrl: string): Promise<number> {
    const body = await this.fetchJson(sourceUrl);
    this.records = Array.isArray(body) ? body : [];
    return this.records.length;
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
 * ${name}Plugin — renders [{${name}}] on any page.
 */

interface PluginContext {
  engine?: { getManager(name: string): unknown };
  pageName?: string;
}

const ${name}Plugin = {
  name: '${name}',
  description: '${toTitleCase(o.id)} — ${name} plugin',
  author: 'ngdpbase',
  version: '${SCAFFOLD_VERSION}',

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

  // The comment beside fetchJson points at whoever receives it.
  const managerDoor = o.managers.length === 1
    ? `The manager is handed this
    // and has no other door — see ${o.managers[0]}Manager's constructor.`
    : `Each manager is handed this
    // and has no other door — see their constructors.`;

  const pluginWiring = o.plugins.map(p =>
    `      await pluginManager.registerPlugin('${p}', ${p}Plugin);`).join('\n');

  return `/**
 * ${toTitleCase(o.id)} addon for ngdpbase.
 *
 * Addon code runs in the ngdpbase process. Every check that enforces a
 * runtime property of src/ applies here identically (this addon's README.md,
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
import type { Router } from 'express';
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
  /** A Router from core's own Express (#1861). Never value-import express. */
  createRouter(): Router;
  /** \`express.static\` from core's own Express, for files under public/ (#1861). */
  serveStatic(root: string): unknown;
  /** The Express app, present once the host has built it; routes and views mount here. */
  app?: {
    use(route: string, handler: unknown): void;
    get(setting: string): unknown;
    set(setting: string, value: unknown): void;
  };
}

const ${toPascalCase(o.id)}Addon = {
  name: '${o.id}',
  version: '${SCAFFOLD_VERSION}',
  description: '${toTitleCase(o.id)} addon for ngdpbase',
  author: 'ngdpbase',
  dependencies: [] as string[],

  async register(engine: Engine, config: Record<string, unknown>): Promise<void> {
    const cm = engine.getManager<{
      resolveDataPath(n: string): string;
      getProperty?(k: string, f?: unknown): unknown;
    }>('ConfigurationManager');

    // The ONE way this addon reaches the network (#1133): the host's guarded
    // fetch under the instance's egress policy, read per call so an operator
    // tightening it is honoured without a restart. ${managerDoor}
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

    // Views render with the host's layout; routes mount under the addon's own
    // prefix. Appending to \`views\` rather than replacing it keeps the host's
    // own templates — header and footer included — resolvable.
    const views = (engine.app?.get('views') as string | string[] | undefined) ?? [];
    engine.app?.set('views', [...[views].flat(), path.join(__dirname, 'views')]);
    engine.app?.use('/api/${o.id}', apiRoutes(engine));

    // Static assets, if this addon ships any under public/.
    // engine.app?.use('/addons/${o.id}', engine.serveStatic(path.join(__dirname, 'public')));
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
 * Every addon page is `system-category: addon` with `addon: <addonId>`
 * (addons.md §9, #1378). `documentation` would make it a required page, one
 * the Required Pages admin expects to find in the GitHub set.
 */
function seedPage(o: ScaffoldOptions, uuid: string): string {
  return `---
title: Using ${toTitleCase(o.id)}
uuid: ${uuid}
slug: using-${o.id}
addon: ${o.id}
system-category: addon
user-keywords:
  - ${toTitleCase(o.id)}
  - Addon
author: system
lastModified: '${new Date().toISOString().slice(0, 10)}T00:00:00.000Z'
---
# Using ${toTitleCase(o.id)}

This page ships with the __${o.id}__ addon and is seeded into [{$applicationname}]
when the addon is enabled.

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

Once seeded, this page belongs to the instance. Edits made here are preserved:
the addon will not overwrite a page you have changed.
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
      [perm]: { description: `Manage the ${toTitleCase(o.id)} addon: refresh its data and change its settings`, label: `Manage the ${toTitleCase(o.id)} add-on`, icon: 'gear', color: '#0d6efd' }
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
 * Every decision here is ctx.requirePermission('${perm}') on the
 * request's own subject (ApiContext forwards it, token and share ceilings
 * included). Never a role name, never isAuthenticated: allow and deny come from
 * policy (#1198), and this addon's config/default-config.json is where the
 * permission and the policy that grants it are declared.
 *
 * The host is imported through \`dist/\`, never \`src/\`. A value import of host
 * source pulls it into this addon's compilation and emits a \`.js\` beside it —
 * which exists on a developer's machine and does not exist in the container,
 * where the image carries \`dist/\` and \`addons/\` but no \`src/\` (#1192).
 *
 * The router comes from core: \`engine.createRouter()\`. Express is imported
 * for its types only — an installed addon has no express of its own to load,
 * and \`npm run lint:addons\` refuses a value import of it (#1861).
 */
import type { Router, Request, Response } from 'express';
import { ApiContext, ApiError } from '../../../dist/src/context/ApiContext.js';
${manager ? `import type ${manager}Manager from '../managers/${manager}Manager.js';\n` : ''}
interface Engine {
  getManager<T = unknown>(name: string): T | null;
  /** A Router from core's own Express (#1861). */
  createRouter(): Router;
}

export default function apiRoutes(engine: Engine): Router {
  const router = engine.createRouter();

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

- __Slug:__ \`${o.id}\` — the canonical identity. It is the registry key and the
  config key, and it must equal the \`name\` exported from \`index.ts\`.
- __Type:__ \`${o.type}\`${o.type === 'domain'
  ? ' — this addon IS the site identity, not an augmentation of an existing instance.'
  : ' — augments an existing instance.'}

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
| \`routes/api.ts\` | Status and refresh, gated by \`${o.id}-manage\` |
| \`views/${o.id}-status.ejs\` | Admin view; its POST carries the CSRF token |
| \`pages/\` | Seed pages copied into the platform on first enable |
| \`config/default-config.json\` | Config keys, the permission and its policy |

## Rules an addon lives under

Addon code runs in the ngdpbase process. Every check that enforces a runtime
property of \`src/\` applies to this directory identically — a check that scans
only \`src/\` is a bug in the check, not a licence. This addon already follows the
four that bite:

- __Outbound HTTP goes through the host's \`guardedFetch\`.__ \`index.ts\` builds
  one under the instance's egress policy and injects it; a manager never calls
  \`fetch\` or an HTTP client library itself. Loopback and link-local are never
  reachable; a LAN source needs its prefix in
  \`ngdpbase.security.egress.allowed-ranges\`.
- __A permission decision is \`ctx.requirePermission('${o.id}-manage')\`__ on
  the request's own subject, forwarded — never a role name, never
  \`isAuthenticated\`, never a subject rebuilt from fields. The permission and its
  policy are declared in \`config/default-config.json\`.
- __A mutating browser request carries the CSRF token__ — the view uses
  \`(window.csrfFetch || fetch)\`; a bare \`fetch\` is refused by the host.
- __An acting call takes a context__, never a bare username.

The host is imported through \`dist/\`, never \`src/\`: a value import of host
source compiles it into this addon and emits a \`.js\` beside it, which exists on
a developer's machine and does not exist in the container.

The host's guards run over this directory: \`lint:code\`, \`lint:csrf\`,
\`lint:http\`, \`lint:permission-subject\`, \`lint:gates\`, \`lint:addons\`,
\`lint:audit-deps\` and the addon's own \`tsc\`. Its CI also runs
\`audit-coverage.js --check --addon\` in the ngdpbase image: the audit events
it declares and the ones it emits must agree. The rules in full are the
standing rules of ngdpbase's [addons developer guide](${GUIDE_URL}#standing-rules).

## Develop

Drop this directory into an ngdpbase instance's \`addons/\` (or point
\`ngdpbase.managers.addons-manager.addons-path\` at its parent), enable it, and
restart. For production, see the platform's \`packaged\` distribution model.
`;
}

// ---------------------------------------------------------------------------
// Repository templates (--repo)
// ---------------------------------------------------------------------------

/** The ngdpbase release this checkout is: a new addon's ngdpbase.minVersion, which its CI checks against. */
export function ngdpbaseVersion(): string {
  return (fs.readJsonSync(path.join(NGDPBASE_ROOT, 'package.json')) as { version: string }).version;
}

/**
 * Renovate for the repository's own dependencies: the devDependencies and the
 * GitHub Actions in CI. No rule for the ngdpbase image — the add-on repo holds
 * nothing deployment-specific, and the image a site runs is the site repo's to
 * bump (#1829, addons-developer-guide.md section 12).
 */
function renovateJson(): string {
  return JSON.stringify({
    $schema: 'https://docs.renovatebot.com/renovate-schema.json',
    extends: ['config:recommended']
  }, null, 2) + '\n';
}

function ciWorkflow(o: ScaffoldOptions): string {
  const dir = `addons/${o.id}`;
  return `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  addon:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      # Typechecked INSIDE the ngdpbase image rather than standalone.
      #
      # A guarded addon imports the host — ApiContext, guardedFetch,
      # resolveEgressPolicy — through \`dist/\`, and takes express from the
      # instance. None of that exists in a bare checkout, so a standalone
      # \`npm install typescript @types/node && tsc\` could only ever check an
      # addon that reached for nothing.
      #
      # The \`-devtools\` tag is the runtime image with npm retained, so the
      # toolchain installs into a scratch directory and the @types are copied
      # where module resolution will find them.
      - name: Typecheck the addon against a real ngdpbase
        run: |
          # The manifest's ngdpbase.minVersion is the single source of the
          # base version: the check runs against the oldest core the addon
          # claims to support, so the claim and the check cannot drift apart.
          NGDPBASE_VERSION=$(node -p "require('./${dir}/package.json').ngdpbase.minVersion")
          echo "Checking against ngdpbase \${NGDPBASE_VERSION}"
          docker run --rm -v "$PWD/${dir}:/app/${dir}:ro" \\
            --entrypoint sh "ghcr.io/jwilleke/ngdpbase:\${NGDPBASE_VERSION}-devtools" -c '
              set -e
              cd /tmp && npm init -y >/dev/null
              npm install --no-save typescript@^5 @types/node@^24 @types/express@^5 @types/express-session@^1 @types/multer@^2 >/dev/null
              mkdir -p /app/node_modules/@types && cp -r /tmp/node_modules/@types/. /app/node_modules/@types/
              cd /app
              /tmp/node_modules/.bin/tsc --noEmit --strict --skipLibCheck \\
                --module nodenext --target es2022 --moduleResolution nodenext \\
                ${dir}/index.ts ${dir}/managers/*.ts \\
                ${dir}/plugins/*.ts ${dir}/routes/*.ts
            '

      # Every audit event this addon declares is emitted, every name it emits
      # is declared, and none collides with a name ngdpbase ships (#1638). The
      # host's own lint, compiled into the image, run over this directory.
      - name: Audit events declared and emitted agree
        run: |
          NGDPBASE_VERSION=$(node -p "require('./${dir}/package.json').ngdpbase.minVersion")
          docker run --rm -v "$PWD/${dir}:/app/${dir}:ro" -w /app \\
            --entrypoint node "ghcr.io/jwilleke/ngdpbase:\${NGDPBASE_VERSION}" \\
            dist/scripts/audit-coverage.js --check --addon ${dir}

      # The manifest slug and the name exported from index.ts must agree, or
      # the addon loads under one name and is configured under another.
      - name: Manifest slug matches exported name
        run: |
          for dir in addons/*/; do
            slug=$(node -p "require('./\${dir}package.json').ngdpbase.slug")
            if ! grep -q "name: '\${slug}'" "\${dir}index.ts"; then
              echo "::error::\${dir}: index.ts name does not match manifest slug '\${slug}'"
              exit 1
            fi
            case "$slug" in
              *-addon)
                echo "::error::\${dir}: slug '\${slug}' ends in -addon; ngdpbase strips that suffix"
                exit 1 ;;
            esac
          done

      # A page whose filename and frontmatter uuid disagree, or whose uuid is
      # not a real v4, is skipped by ngdpbase at seed time.
      - name: Seed page UUIDs are valid and match their filenames
        run: |
          fail=0
          for page in addons/*/pages/*.md; do
            [ -e "$page" ] || continue
            base=$(basename "$page" .md)
            fm=$(sed -n 's/^uuid: *//p' "$page" | head -1 | tr -d "'\\"")
            if [ "$base" != "$fm" ]; then
              echo "::error::$page: filename '$base' != frontmatter uuid '$fm'"; fail=1
            fi
            if ! echo "$fm" | grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'; then
              echo "::error::$page: '$fm' is not a v4 UUID"; fail=1
            fi
          done
          exit $fail
`;
}

/**
 * Publish to npm on a `v*` tag (#1863), with npm trusted publishing: the
 * workflow's OIDC token stands in for a stored NPM_TOKEN, and `--provenance`
 * has Sigstore sign a statement naming this workflow. That statement is what
 * the installer checks (src/utils/addonProvenance.ts): a certificate issued to
 * a GitHub Actions workflow under `https://github.com/<owner>/<repo>/`, for
 * `pkg:npm/<name>@<version>` with this tarball's sha512. So the job publishes
 * from GitHub-hosted runners, from the tag it was pushed with, and nothing
 * else.
 */
function publishWorkflow(o: ScaffoldOptions): string {
  const dir = `addons/${o.id}`;
  return `name: Publish

# Pushing a tag v<version> builds, tests and publishes ${dir}/ to npm with
# signed provenance. No npm token is stored: npm trusts this workflow
# (trusted publishing), set up once on npmjs.com. See README.md, "Release it".

on:
  push:
    tags: ['v*']

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      # The OIDC token npm takes instead of a token, and Sigstore signs the provenance with.
      id-token: write
      contents: read
    defaults:
      run:
        working-directory: ${dir}
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24.x
          registry-url: https://registry.npmjs.org

      # Trusted publishing needs npm 11.5.1 or later; older npm fails with a
      # bare authentication error.
      - name: Node 24.15 or later, npm 11.5.1 or later
        run: |
          node -e '
            const below = (v, min) => { const a = v.split(".").map(Number), b = min.split(".").map(Number); for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
            const npm = require("child_process").execSync("npm --version").toString().trim();
            if (below(process.versions.node, "24.15.0")) { console.error("::error::Node " + process.versions.node + " is older than 24.15.0"); process.exit(1); }
            if (below(npm, "11.5.1")) { console.error("::error::npm " + npm + " is older than 11.5.1, which trusted publishing needs"); process.exit(1); }
          '

      - name: Tag matches package.json version
        run: |
          version=$(node -p "require('./package.json').version")
          if [ "\${GITHUB_REF_NAME}" != "v\${version}" ]; then
            echo "::error::tag \${GITHUB_REF_NAME} does not match package.json version \${version}: tag v\${version}, or change the version"
            exit 1
          fi

      # npm refuses provenance whose repository differs from package.json's,
      # and a private package is never published.
      - name: package.json names this repository and is not private
        run: |
          node -e '
            const pkg = require("./package.json");
            const want = new URL(process.env.GITHUB_SERVER_URL).host + "/" + process.env.GITHUB_REPOSITORY;
            const url = typeof pkg.repository === "string" ? pkg.repository : (pkg.repository && pkg.repository.url) || "";
            const got = url.replace(/^git\\+/, "").replace(/^https?:\\/\\//, "").replace(/\\.git$/, "");
            if (pkg.private) { console.error("::error::package.json has \\"private\\": true; remove it to publish"); process.exit(1); }
            if (got.toLowerCase() !== want.toLowerCase()) {
              console.error("::error::package.json repository is \\"" + url + "\\"; set it to { \\"type\\": \\"git\\", \\"url\\": \\"git+https://" + want + ".git\\", \\"directory\\": \\"${dir}\\" }");
              process.exit(1);
            }
          '

      # ngdpbase unpacks an add-on as published and runs no npm install, so a
      # runtime dependency that is not bundled is missing on the site.
      - name: Runtime dependencies are bundled
        run: |
          node -e '
            const pkg = require("./package.json");
            const bundled = pkg.bundleDependencies ?? pkg.bundledDependencies ?? [];
            const missing = bundled === true ? [] : Object.keys(pkg.dependencies ?? {}).filter((d) => !bundled.includes(d));
            if (missing.length) {
              console.error("::error::not bundled: " + missing.join(", ") + ". ngdpbase installs an add-on as published and runs no npm install, so every entry in dependencies must also be in bundleDependencies. A package the host provides belongs in peerDependencies.");
              process.exit(1);
            }
          '

      - run: npm ci
      - run: npm run build --if-present
      - run: npm run test --if-present

      - run: npm publish --provenance --access public
`;
}

function gitignore(): string {
  return ['node_modules/', 'dist/', '*.tsbuildinfo', '.env', '.DS_Store', 'data/', ''].join('\n');
}

function repoReadme(o: ScaffoldOptions): string {
  return `# ${o.id}

${toTitleCase(o.id)}: an addon for [ngdpbase](https://github.com/jwilleke/ngdpbase).
The addon itself is [\`addons/${o.id}/\`](addons/${o.id}/); its README lists what
each file does and the rules it lives under.

## Run it

Against a local ngdpbase checkout, point the instance at this repository's
\`addons/\` directory and enable the addon in \`app-custom-config.json\`:

\`\`\`json
{
  "ngdpbase.managers.addons-manager.addons-path": ["/path/to/${o.id}/addons"],
  "ngdpbase.addons.${o.id}.enabled": true
}
\`\`\`

Restart the instance. The addon registers, its seed page appears, and
\`[{${o.plugins[0] ?? toPascalCase(o.id)}}]\` renders on any page.

## Deploy it

This repository holds the addon and nothing deployment-specific. The Dockerfile
that layers it onto the ngdpbase image, and the Renovate rule that keeps that
image current, live in the site repository that builds and deploys the site:
see [Shipping Your Addon as a Container Image](${GUIDE_URL}#12-shipping-your-addon-as-a-container-image).

## Release it

Pushing a tag \`v<version>\` publishes \`addons/${o.id}/\` to npm as
\`${packageName(o)}\`, from \`.github/workflows/publish.yml\`. The workflow
installs (\`npm ci\`), builds and tests it, checks the tag matches the
\`package.json\` version and every runtime dependency is bundled, and runs
\`npm publish --provenance\`. No npm token is stored anywhere: npm trusts this
repository's workflow instead (trusted publishing).

The first release, once. npm adds a trusted publisher only to a package that
already exists, so nobody can take over a name by pointing a workflow at it.
Adding one also needs your interactive npm login with 2FA, not a token. So
you claim the name first with an empty placeholder:

- 1 Claim the name by hand with a placeholder \`0.0.0\`. In an empty directory
  outside this repository, write a \`package.json\` holding only
  \`{ "name": "${packageName(o)}", "version": "0.0.0" }\` and a \`README.md\`
  saying "placeholder, not installable". Then run \`npm login\` and
  \`npm publish --access public\`. No site installs it: it has no provenance,
  so the installer refuses it, and a range such as \`^${SCAFFOLD_VERSION}\`
  excludes \`0.0.0\` anyway.
- 2 Add the trusted publisher on npmjs.com, in the package's settings, or with
  \`npm trust\`, which needs npm 11.15.0 or later on your machine. Choose
  GitHub Actions, this repository and workflow \`publish.yml\`. The workflow
  itself needs only npm 11.5.1 to publish, and checks for it.
- 3 In \`addons/${o.id}/package.json\`, remove \`"private": true\` and add
  \`"repository": { "type": "git", "url": "git+https://github.com/<owner>/<repo>.git", "directory": "addons/${o.id}" }\`.
  npm refuses provenance from any other repository. Run \`npm install\` in
  \`addons/${o.id}/\`, then commit \`package.json\` and \`package-lock.json\`.
  The workflow refuses to publish until this is done.
- 4 Tag the version in \`package.json\` and push the tag. This is the first
  real, signed release:

\`\`\`bash
git tag v${SCAFFOLD_VERSION}
git push origin v${SCAFFOLD_VERSION}
\`\`\`

Every later release: change \`version\` in \`addons/${o.id}/package.json\` (and
in \`index.ts\`) and commit. Then tag that version and push the tag, for
example \`git tag v0.2.0\` and \`git push origin v0.2.0\`.

A site installs it from npm with this in its \`app-custom-config.json\`. The
installer checks the release's provenance names \`repository\`, and refuses
it otherwise:

\`\`\`json
{
  "ngdpbase.addons.install": {
    "${o.id}": { "package": "${packageName(o)}", "version": "^${SCAFFOLD_VERSION}", "repository": "github.com/<owner>/<repo>" }
  },
  "ngdpbase.addons.${o.id}.enabled": true
}
\`\`\`

## Layout

| Path | What it is |
|---|---|
| \`addons/${o.id}/\` | The addon |
| \`renovate.json\` | Keeps the dev dependencies and CI actions current |
| \`.github/workflows/ci.yml\` | Typechecks the addon inside the ngdpbase image named by \`ngdpbase.minVersion\` |
| \`.github/workflows/publish.yml\` | On a \`v*\` tag, publishes the addon to npm with provenance |

## Further reading

Everything else — identity, configuration, permissions, seed pages, testing and
deployment — starts at ngdpbase's [addons developer guide](${GUIDE_URL}).
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

/**
 * Write the addon at `target`, or with `repo` a whole repository at `target`
 * holding the addon at addons/<id>/. The addon files are the same either way —
 * the repository only adds files around them. `files` is relative to `target`.
 */
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

  if (o.repo) {
    for (const f of files) f[0] = path.join('addons', o.id, f[0]);
    files.push(
      ['renovate.json', renovateJson()],
      ['.github/workflows/ci.yml', ciWorkflow(o)],
      ['.github/workflows/publish.yml', publishWorkflow(o)],
      ['.gitignore', gitignore()],
      // The licence ngdpbase itself carries (Apache-2.0), copied verbatim.
      ['LICENSE', await fs.readFile(path.join(NGDPBASE_ROOT, 'LICENSE'), 'utf8')],
      ['README.md', repoReadme(o)]
    );
  }

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

/** True when the target sits in this checkout's own addons/ directory: a bundled addon. */
export function isBundledTarget(target: string): boolean {
  const addonsDir = path.join(NGDPBASE_ROOT, 'addons') + path.sep;
  return path.resolve(target).startsWith(addonsDir);
}

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

  // A repository is a sibling of this checkout, never a directory inside its addons/.
  const repo = argv.includes('--repo');
  const target = get('--target') ?? (repo ? path.join('..', id) : path.join('addons', id));

  // #1676: anything outside this checkout's addons/ is published under its
  // project's own scope, so the scope is asked for, never guessed.
  const scope = get('--scope');
  if (scope) {
    const scopeError = validateScope(scope);
    if (scopeError) return { error: scopeError };
  } else if (repo || !isBundledTarget(target)) {
    return { error: `--scope is required for an addon outside ${path.join(NGDPBASE_ROOT, 'addons')} (e.g. --scope @your-scope → @your-scope/${id}-addon)` };
  }

  return {
    options: {
      id,
      type: typeRaw,
      plugins,
      managers,
      target,
      repo,
      ...(scope ? { scope } : {})
    }
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { options, error } = parseArgs(argv);

  if (error) {
    console.error(`✗ ${error}`);
    console.error('\nUsage: npx tsx scripts/create-addon.ts --id <slug> [--type additive|domain]');
    console.error('       [--scope @your-scope] [--plugins A,B] [--managers C] [--repo] [--target dir] [--force]');
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

  console.log(`✓ Scaffolded '${o.id}' (${o.type}) ${o.repo ? 'repository ' : ''}into ${result.target}`);
  for (const f of result.files) console.log(`    ${f}`);
  console.log('\nNext steps:');
  if (o.repo) {
    console.log(`  1. git init ${result.target}, commit, and push it to a new repository.`);
    console.log(`  2. Point an instance at it:  "ngdpbase.managers.addons-manager.addons-path": ["${path.resolve(result.target, 'addons')}"]`);
    console.log(`  3. Enable it:  "ngdpbase.addons.${o.id}.enabled": true`);
    console.log('  4. Restart the server — the addon registers and its page seeds.');
    console.log(`  5. Put [{${o.plugins[0]}}] on a page to see the plugin render.`);
    console.log('  6. To release to npm, follow "Release it" in its README.md.');
  } else {
    console.log(`  1. Enable it:  "ngdpbase.addons.${o.id}.enabled": true`);
    console.log('  2. Restart the server — the addon registers and its page seeds.');
    console.log(`  3. Put [{${o.plugins[0]}}] on a page to see the plugin render.`);
  }
}

// Only run the CLI when invoked directly, so the exports above stay importable
// from tests without generating anything.
if (process.argv[1] && process.argv[1].endsWith('create-addon.ts')) {
  main().catch((err: unknown) => {
    console.error('✗ Scaffold failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
