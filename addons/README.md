# ngdpbase Add-ons

This directory contains optional add-on modules that extend ngdpbase functionality.

## Creating an Add-on

Each add-on lives in its own subdirectory with an `index.js` or `index.ts` entry point.

### Directory Structure

```
addons/
├── your-addon/
│   ├── index.js          # Required: Entry point
│   ├── package.json      # Optional: Add-on dependencies
│   ├── routes.js         # Optional: Express routes
│   ├── models/           # Optional: Data models
│   └── README.md         # Recommended: Documentation
└── shared/               # Reserved: Shared utilities
```

### Add-on Interface

Your `index.js` must export an object implementing the `AddonModule` interface:

```javascript
module.exports = {
  // Required fields
  name: 'your-addon',           // Unique identifier
  version: '1.0.0',             // Semantic version

  // Optional fields
  description: 'What this add-on does',
  author: 'Your Name',
  dependencies: ['other-addon'], // Other add-ons this depends on

  // Required: Called during startup if add-on is enabled
  async register(engine, config) {
    // Access managers
    const pageManager = engine.getManager('PageManager');

    // Register routes (if you have an Express app reference)
    // const app = engine.app;
    // app.use('/api/your-addon', require('./routes'));

    // Initialize your add-on
    console.log('Your add-on initialized!');
  },

  // Optional: Health check
  async status() {
    return {
      healthy: true,
      message: 'All systems operational'
    };
  },

  // Optional: Cleanup on shutdown
  async shutdown() {
    // Close connections, cleanup resources
  }
};
```

## Configuration

Add-ons are configured in `config/app-custom-config.json`:

```json
{
  "ngdpbase.addons.your-addon.enabled": true,
  "ngdpbase.addons.your-addon.customSetting": "value"
}
```

By default, all add-ons are __disabled__. You must explicitly enable each add-on.

### Default configuration

An add-on may ship `config/default-config.json`. When the add-on is enabled, that file is a layer of the configuration merge, between the shipped `config/app-default-config.json` and the instance's `app-custom-config.json`, so:

- the add-on's own settings (`ngdpbase.addons.your-addon.*`) get sensible defaults the operator can override;
- the add-on can __declare a permission__ in `ngdpbase.permissions.definitions` and __grant it__ with its own policy in `ngdpbase.access.policies` (give the policy its own `id`; arrays of `id` objects merge by id, plain arrays replace wholesale). Routes then ask `await ctx.requirePermission('your-addon-manage')`. Never name a role in add-on code — a deployment grants your permission to its own roles in its own custom file.

The calendar add-on is the worked example: `addons/calendar/config/default-config.json` declares `calendar-manage`. Details: [docs/security-developer-guide.md](../docs/security-developer-guide.md#addons).

## Accessing Configuration

In your `register()` function, the `config` parameter contains all settings under `ngdpbase.addons.your-addon.*`:

```javascript
async register(engine, config) {
  const customSetting = config.customSetting || 'default';
  // ...
}
```

## Dependencies Between Add-ons

If your add-on depends on another, declare it in the `dependencies` array:

```javascript
module.exports = {
  name: 'financial-ledger',
  dependencies: ['person-contacts'], // Will load after person-contacts
  // ...
};
```

The AddonsManager will:

1. Verify all dependencies are installed
2. Verify all dependencies are enabled
3. Load add-ons in correct dependency order

## Security Notes

This section is written to the add-on author. The operator-facing part is short: an add-on runs in the ngdpbase process with the host's privileges, so install only add-ons whose code you have read, and keep an add-on's own data under `./data/addons/` or inside the add-on directory.

### The invariant

> Add-on code runs in the ngdpbase process. Every check that enforces a __runtime property__ of `src/` applies to `addons/` identically. A check that scans only `src/` is a bug in the check.

An add-on is not a plugin sandbox. It is host code that happens to be loaded from a different directory, and a mistake in it is a mistake in the host: an unguarded outbound request is a server-side request forgery from the host's network position, a role-name check is a policy the operator cannot configure, a call without a context is an audit record without an actor, and a background job enqueued without a context crash-loops the whole server (geohazardwatch#288, fixed by #1238). The rules below are the same rules `src/` lives under; there is no relaxed set for add-ons.

### What that means when you write one

- __Outbound HTTP goes through `src/http/guardedFetch`__ (`dist/src/http/guardedFetch.js` from an add-on), resolved against the deployment's egress policy. Never a bare `fetch`, never `axios`, `got`, `undici`, `node-fetch` or an Elasticsearch client built outside `src/http/`. The scaffold hands the manager a `fetchJson` that already does this.
- __A mutating browser request carries the CSRF token.__ In a view or `public/` script, send state-changing requests with `csrfFetch`, never `fetch`. The scaffold's status view shows the shape: `(window.csrfFetch || fetch)(url, { method: 'POST', ... })`.
- __A permission decision is `ctx.requirePermission(...)` or `hasPermission(...)` on the forwarded subject.__ Never a role name, never `isAuthenticated` as an allow, never a subject rebuilt from `req.session` or a username. An add-on's routes build an `ApiContext.from(req, engine)` and ask it.
- __An acting call takes an `ActorContext`__ (`PermissionSubject` from a request, or a `JobContext` from a timer, boot or operator action), never a bare username and never nothing. `enqueue`, `createBackup`, `upload`, `addComment` and the rest all refuse or misattribute without one.
- __An add-on declares its own permissions and policies__ in its `config/default-config.json` (the `<id>-manage` entries the scaffold writes). It never edits the host catalog in `config/app-default-config.json`.
- __An add-on never imports host source by a `src/` path.__ Import the compiled `dist/src/...` module; a value import of `src/` makes the add-on's build emit `.js` beside host source, and the container has no `src/`.

### The guards that run over `addons/`

These run in `npm run lint` (and `lint:ci`) over the host and every bundled add-on alike:

- `lint:code` — eslint over `src/**/*.ts` and `addons/**/*.ts`, including the bare-`fetch` and HTTP-client-library bans outside `src/http/`.
- `lint:csrf` — `check-csrf-fetch`: no tokenless state-changing client fetch in `views/`, `public/` or a plugin, add-on views included.
- `lint:http` — `check-http-boundary`: no network access originates outside `src/http/`, in `src` or `addons`.
- `lint:permission-subject` — `check-permission-subject`: no permission subject rebuilt in a route, manager, handler or add-on.
- `lint:gates` — `check-permission-gates`: no role-name gate and no `isAuthenticated` allow, in `src`, `addons` and views.
- `lint:addons` — `check-addon-boundary`: no add-on value-imports host `src/`, no compiled `.js` under `src/`.
- `lint:audit-deps` — `check-lockfile-audit`: `npm audit` over every lockfile in the repo, the add-ons' own included, with an expiring allowlist.
- Per-add-on `tsc` — `build:addons` compiles each bundled add-on against its own `tsconfig.json` under the host's compiler options.

The one deliberate exemption is `lint:docs` (`check-docs-coverage`): it measures this project's obligation to document its own managers, plugins and providers. An add-on documents itself in its own README. That exemption is about documentation, not a runtime property, which is why it does not contradict the invariant.

If you add a check that enforces a runtime property and it scans only `src/`, extend it to `addons/` in the same change. See [`docs/security-posture.md`](../docs/security-posture.md) for the posture these checks defend and [`docs/planning/Security-auditing.md`](../docs/planning/Security-auditing.md) for the audit side.

## Example Add-ons

See the [fairways-gen2-website](https://github.com/jwilleke/fairways-gen2-website) repository for example add-ons:

- `person-contacts` - Contact/CRM management
- `financial-ledger` - Double-entry accounting
- `business-hub` - Dashboard integration

## Related Documentation

- [Issue #158](https://github.com/jwilleke/ngdpbase/issues/158) - AddonsManager specification
- [Business Add-on MVP](../docs/planning/Business-packages/business-addon-mvp.md) - Planning docs
