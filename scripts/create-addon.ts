/**
 * create-addon.ts — scaffold a new ngdpbase addon (#675, #1636).
 *
 * The one source for a new addon. Generates a working, enable-able addon from
 * templates held in this file and, with --repo, the standalone repository
 * around it (wrapper Dockerfile, Renovate, CI, licence). There is no template
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
 *   --repo      write a whole repository: the addon at <target>/addons/<id>/,
 *               plus Dockerfile, renovate.json, .github/workflows/ci.yml,
 *               .gitignore, LICENSE and README.md at <target>
 *   --target    output directory (default: addons/<id>; with --repo, ../<id>)
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
  app?: {
    use(route: string, handler: unknown): void;
    get(setting: string): unknown;
    set(setting: string, value: unknown): void;
  };
}

const ${toPascalCase(o.id)}Addon = {
  name: '${o.id}',
  version: '1.0.0',
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

/** The ngdpbase release this checkout is — the base image a new repo starts on. */
export function ngdpbaseVersion(): string {
  return (fs.readJsonSync(path.join(NGDPBASE_ROOT, 'package.json')) as { version: string }).version;
}

function dockerfile(o: ScaffoldOptions): string {
  return `# Wrapper image: ngdpbase + this addon, layered in as a drop-in.
#
# This is the simplest of the deployment shapes: the addon is COPY'd into the
# image's default \`addons/\` directory, so no addons-path configuration is
# needed — only the enable key.
#
# NOTE: ngdpbase's runtime image ships no npm (removed to close a bundled-npm
# CVE). This addon declares no dependencies of its own — it takes express and
# the guarded host helpers from the instance it runs inside — so no install
# stage is required. The moment you add one, switch to the two-stage build in
# ngdpbase's docs/platform/deployment/addon-packaged.md: install in a stage that
# still has npm, then copy node_modules into the runtime image.
#
# For production, prefer the \`packaged\` (npm) model over this drop-in: it
# version-pins the addon independently of the base image.
#
# The version floor is not cosmetic. The addon imports ApiContext, guardedFetch
# and resolveEgressPolicy from the host's dist/, so an older base image fails to
# load it. CI reads this ARG as the single source of the base version, so
# bumping it here moves the typecheck with it; Renovate bumps it for you.

ARG NGDPBASE_VERSION=${ngdpbaseVersion()}

FROM ghcr.io/jwilleke/ngdpbase:\${NGDPBASE_VERSION}
WORKDIR /app

# Lands in the DEFAULT addons directory, so AddonsManager discovers it with no
# config change. Enabling is still explicit — discovery never implies consent.
COPY addons/${o.id}/ ./addons/${o.id}/

# Enable the addon in your instance config (app-custom-config.json):
#   { "ngdpbase.addons.${o.id}.enabled": true }
`;
}

function renovateJson(): string {
  return JSON.stringify({
    $schema: 'https://docs.renovatebot.com/renovate-schema.json',
    extends: ['config:recommended'],
    packageRules: [
      {
        description: 'Track the ngdpbase base image. Minor/patch may auto-merge; a major is a platform contract change and gets human review.',
        matchDatasources: ['docker'],
        matchPackageNames: ['ghcr.io/jwilleke/ngdpbase'],
        matchUpdateTypes: ['minor', 'patch'],
        automerge: true
      },
      {
        matchDatasources: ['docker'],
        matchPackageNames: ['ghcr.io/jwilleke/ngdpbase'],
        matchUpdateTypes: ['major'],
        automerge: false
      }
    ],
    regexManagers: [
      {
        description: 'Bump the NGDPBASE_VERSION build arg in the Dockerfile',
        fileMatch: ['(^|/)Dockerfile$'],
        matchStrings: ['ARG NGDPBASE_VERSION=(?<currentValue>[0-9.]+)'],
        depNameTemplate: 'ghcr.io/jwilleke/ngdpbase',
        datasourceTemplate: 'docker'
      }
    ]
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
          # The Dockerfile's ARG is the single source of the base version, so
          # the check and the image it documents cannot drift apart.
          NGDPBASE_VERSION=$(sed -n 's/^ARG NGDPBASE_VERSION=//p' Dockerfile)
          echo "Checking against ngdpbase \${NGDPBASE_VERSION}"
          docker run --rm -v "$PWD/${dir}:/app/${dir}:ro" \\
            --entrypoint sh "ghcr.io/jwilleke/ngdpbase:\${NGDPBASE_VERSION}-devtools" -c '
              set -e
              cd /tmp && npm init -y >/dev/null
              npm install --no-save typescript@^5 @types/node@^24 @types/express@^5 >/dev/null
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
          NGDPBASE_VERSION=$(sed -n 's/^ARG NGDPBASE_VERSION=//p' Dockerfile)
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

  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: Build the wrapper image
        run: docker build -t ${o.id}:ci .
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

As a container, build the wrapper image — ngdpbase with this addon layered in —
and run it as you would ngdpbase itself, with the enable key set:

\`\`\`bash
docker build -t ${o.id} .
\`\`\`

## Layout

| Path | What it is |
|---|---|
| \`addons/${o.id}/\` | The addon |
| \`Dockerfile\` | Wrapper image; \`ARG NGDPBASE_VERSION\` is the base release |
| \`renovate.json\` | Keeps \`NGDPBASE_VERSION\` current |
| \`.github/workflows/ci.yml\` | Typechecks the addon inside the matching ngdpbase image |

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
      ['Dockerfile', dockerfile(o)],
      ['renovate.json', renovateJson()],
      ['.github/workflows/ci.yml', ciWorkflow(o)],
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
  return {
    options: {
      id,
      type: typeRaw,
      plugins,
      managers,
      target: get('--target') ?? (repo ? path.join('..', id) : path.join('addons', id)),
      repo
    }
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { options, error } = parseArgs(argv);

  if (error) {
    console.error(`✗ ${error}`);
    console.error('\nUsage: npx tsx scripts/create-addon.ts --id <slug> [--type additive|domain]');
    console.error('       [--plugins A,B] [--managers C] [--repo] [--target dir] [--force]');
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
