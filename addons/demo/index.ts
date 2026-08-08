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
 * SKELETON (slice 1): pages and config surface only. The `demo-admin` role
 * ships once the `admin-read` permission it depends on exists in core — see
 * #1029. The addon is inert until enabled.
 *
 * Configuration (app-custom-config.json, established `ngdpbase.addons.<name>.*`):
 *   ngdpbase.addons.demo.enabled   — true/false (default: false)
 *
 * Pages in `pages/` are seeded by AddonsManager on startup and listed in
 * /admin/required-pages for on-demand sync. `Demo Sandbox` is deliberately
 * left editable; the rest carry `author-lock: true` so visitors can create and
 * edit their own pages without defacing the documentation.
 */

import type { WikiEngine } from '../../dist/src/types/WikiEngine.js';
import type { AddonStatusDetails } from '../../dist/src/managers/AddonsManager.js';
import logger from '../../dist/src/utils/logger.js';

const demoAddon = {
  name: 'demo',
  version: '0.1.0',
  description: 'Public demo instance content and the read-only demo-admin role (#1029)',
  author: 'Jim Willeke',
  dependencies: [] as string[],

  register(_engine: WikiEngine, _config: Record<string, unknown>): Promise<void> {
    // Nothing to wire. The `demo-admin` role and its access policy live in
    // config/app-default-config.json, which is where custom roles belong —
    // UserManager.createRole() says so explicitly, and it is the only place
    // that works: UserManager snapshots ngdpbase.roles.definitions during
    // initialize(), long before AddonsManager loads, so a role injected here
    // at runtime is enforced by PolicyEvaluator but never appears in the
    // user-edit role picker. Symptom without a visible cause.
    //
    // Page seeding is handled by AddonsManager from `pages/`.
    logger.info('[demo addon] Enabled — demo pages seeded from addons/demo/pages');
    return Promise.resolve();
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
