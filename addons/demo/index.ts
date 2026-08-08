/**
 * Demo add-on for ngdpbase (#1029).
 *
 * Everything a public demo instance needs that a private install must NOT get:
 * the demo pages, and a `demo-admin` role letting visitors open the admin
 * dashboard read-only.
 *
 * It exists because the demo pages were originally added to core
 * `required-pages/`, which ships them to EVERY instance — The Fairways and the
 * temp build both carry "Demo Welcome" on disk today, offered as **New** in
 * their required-pages sync screens. Demo content belongs to the demo, and an
 * addon is how this project scopes content to the instances that want it.
 *
 * Configuration (app-custom-config.json, established `ngdpbase.addons.<name>.*`):
 *   ngdpbase.addons.demo.enabled                   — true/false (default: false)
 *   ngdpbase.addons.demo.admin-account.enabled     — seed the shared admin account
 *   ngdpbase.addons.demo.admin-account.username    — default "admindemo"
 *   ngdpbase.addons.demo.admin-account.password    — NGDPBASE_DEMO_ADMIN_PASSWORD, no default
 *   ngdpbase.addons.demo.admin-account.email
 *   ngdpbase.addons.demo.admin-account.display-name
 *
 * No password ships. Set `NGDPBASE_DEMO_ADMIN_PASSWORD` in the instance
 * `.env` — repo root or `$FAST_STORAGE/.env`, whichever suits. Both are read
 * on every launch path: `./server.sh` sources them, and the app loads them
 * itself at startup (`src/bootstrap-env.ts`), so containers work too. On
 * Kubernetes that means a file on the persistent volume — no Secret, no
 * manifest change, no GitOps PR.
 *
 * This password is meant to be PUBLISHED on the Welcome page. Pick it
 * accordingly and never reuse a real one. The page renders whatever is in
 * force via [{DemoLogin}], so it cannot drift from the account that exists.
 *
 * With the variable unset the addon seeds no account and logs why — it does
 * not stop the boot, because a demo missing its dashboard login is still a
 * working wiki. The key uses the `${VAR}` brace form for exactly that reason:
 * bare `$VAR` is strict (#775) and would throw inside getAddonConfig, taking
 * the whole addon down — pages included — over an optional password.
 *
 * Pages in `pages/` are seeded by AddonsManager on startup and listed in
 * /admin/required-pages for on-demand sync. `Demo Sandbox` is deliberately
 * left editable; the rest carry `author-lock: true` so visitors can create and
 * edit their own pages without defacing the documentation.
 */

import type { WikiEngine } from '../../dist/src/types/WikiEngine.js';
import type { AddonStatusDetails } from '../../dist/src/managers/AddonsManager.js';
import type UserManager from '../../dist/src/managers/UserManager.js';
import type PluginManager from '../../dist/src/managers/PluginManager.js';
import logger from '../../dist/src/utils/logger.js';
import DemoLoginPlugin from './plugins/DemoLoginPlugin.js';

/**
 * Defaults for the shared account.
 *
 * There is deliberately no password here. It comes from
 * NGDPBASE_DEMO_ADMIN_PASSWORD via the config key, for the same reason the
 * core admin bootstrap password no longer ships one: a credential committed to
 * this repository ends up live on somebody's public instance.
 *
 * Exported so the tests assert against these rather than restating them.
 */
export const ADMIN_DEFAULTS = {
  username: 'admindemo',
  email: 'admindemo@example.com',
  displayName: 'Demo Administrator'
};

function readString(
  source: Record<string, unknown> | undefined,
  key: string,
  fallback: string
): string {
  const value = source?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/**
 * Seed the shared read-only admin account the demo publishes.
 *
 * Idempotent: if the account already exists it is left exactly as it is, so an
 * operator who rotated the password or adjusted the roles keeps their change
 * across restarts.
 *
 * The password is deliberately public — the whole point is that a visitor can
 * read it off the Welcome page and look around the dashboard. What must NOT
 * happen is a visitor taking the account over, so it is created with
 * `profileLocked`: password, email and display name are frozen against
 * self-service change. Email matters most — magic-link login resolves an
 * account by address, so repointing it would grant permanent exclusive access.
 * Only an administrator holding `user-edit` can change any of it, through
 * /admin/users/<name>/edit.
 */
async function seedAdminAccount(
  engine: WikiEngine,
  config: Record<string, unknown>
): Promise<void> {
  const account = config['admin-account'] as Record<string, unknown> | undefined;
  if (account?.enabled === false) {
    logger.info('[demo addon] admin-account.enabled is false — not seeding the shared account');
    return;
  }

  const userManager = engine.getManager<UserManager>('UserManager');
  if (!userManager) {
    logger.warn('[demo addon] UserManager unavailable — shared admin account not seeded');
    return;
  }

  const username = readString(account, 'username', ADMIN_DEFAULTS.username);

  const existing = await userManager.getUser(username);
  if (existing) {
    logger.info(`[demo addon] Shared admin account "${username}" already exists — left untouched`);
    return;
  }

  // No fallback. An unset NGDPBASE_DEMO_ADMIN_PASSWORD means no account rather
  // than an account with a guessable password — but it is NOT fatal: a demo
  // missing its dashboard login is still a working wiki, so say so clearly and
  // let the rest of the addon load.
  //
  // The key ships as the ${VAR} brace form, which is silent on a missing
  // variable and leaves the placeholder intact — so "unset" arrives here as
  // the literal "${NGDPBASE_DEMO_ADMIN_PASSWORD}", not as an empty string.
  // Seeding an account with that as its password would be worse than seeding
  // none, since it is a perfectly guessable credential.
  const configured = readString(account, 'password', '');
  const password = configured.startsWith('${') ? '' : configured;
  if (!password) {
    logger.warn(
      `[demo addon] No password configured for "${username}" — the shared admin account was NOT created. ` +
      'Set NGDPBASE_DEMO_ADMIN_PASSWORD in the instance .env (it is meant to be published on the ' +
      'Welcome page, so do not reuse a real password), then restart.'
    );
    return;
  }

  await userManager.createUser({
    username,
    password,
    email: readString(account, 'email', ADMIN_DEFAULTS.email),
    displayName: readString(account, 'display-name', ADMIN_DEFAULTS.displayName),
    roles: ['demo-admin'],
    profileLocked: true
  });

  logger.info(
    `[demo addon] Seeded shared admin account "${username}" (demo-admin, profile locked). ` +
    'Its credentials are published on the demo Welcome page.'
  );
}

const demoAddon = {
  name: 'demo',
  version: '0.1.0',
  description: 'Public demo instance content and the read-only demo-admin role (#1029)',
  author: 'Jim Willeke',
  dependencies: [] as string[],

  async register(engine: WikiEngine, config: Record<string, unknown>): Promise<void> {
    // The `demo-admin` role and its access policy live in
    // config/app-default-config.json, which is where custom roles belong —
    // UserManager.createRole() says so explicitly, and it is the only place
    // that works: UserManager snapshots ngdpbase.roles.definitions during
    // initialize(), long before AddonsManager loads, so a role injected here
    // at runtime is enforced by PolicyEvaluator but never appears in the
    // user-edit role picker. Symptom without a visible cause.
    //
    // Page seeding is handled by AddonsManager from `pages/`.
    logger.info('[demo addon] Enabled — demo pages seeded from addons/demo/pages');

    // [{DemoLogin}] renders the shared account's credentials on the Welcome
    // page. A plugin rather than literal text in the markdown, so the page
    // reads the same config key the account is seeded from and the two cannot
    // drift when the operator changes the password.
    const pluginManager = engine.getManager<PluginManager>('PluginManager');
    if (pluginManager) {
      await pluginManager.registerPlugin('DemoLogin', DemoLoginPlugin);
    } else {
      logger.warn('[demo addon] PluginManager unavailable — [{DemoLogin}] will not render');
    }

    // A failure here must not take the instance down: an unreachable user
    // store would otherwise turn "the demo login is missing" into "nothing
    // boots at all", and the pages are still worth serving without it.
    try {
      await seedAdminAccount(engine, config);
    } catch (error) {
      logger.error(
        '[demo addon] Failed to seed the shared admin account: ' +
        (error instanceof Error ? error.message : String(error))
      );
    }
  },

  status(): Promise<AddonStatusDetails> {
    return Promise.resolve({
      healthy: true,
      message: 'Demo content active. Intended for public demo instances only — not for a private install.'
    });
  },

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
};

export default demoAddon;
