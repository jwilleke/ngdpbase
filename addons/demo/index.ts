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
 *   ngdpbase.addons.demo.admin-account.password    — default "admin123"
 *   ngdpbase.addons.demo.admin-account.email
 *   ngdpbase.addons.demo.admin-account.display-name
 *
 * Pages in `pages/` are seeded by AddonsManager on startup and listed in
 * /admin/required-pages for on-demand sync. `Demo Sandbox` is deliberately
 * left editable; the rest carry `author-lock: true` so visitors can create and
 * edit their own pages without defacing the documentation.
 */

import type { WikiEngine } from '../../dist/src/types/WikiEngine.js';
import type { AddonStatusDetails } from '../../dist/src/managers/AddonsManager.js';
import type UserManager from '../../dist/src/managers/UserManager.js';
import logger from '../../dist/src/utils/logger.js';

/** Defaults for the shared account, published on the demo's Welcome page. */
const ADMIN_DEFAULTS = {
  username: 'admindemo',
  password: 'admin123',
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

  await userManager.createUser({
    username,
    password: readString(account, 'password', ADMIN_DEFAULTS.password),
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
