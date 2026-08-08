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
import type ConfigurationManager from '../../dist/src/managers/ConfigurationManager.js';
import type { AddonStatusDetails } from '../../dist/src/managers/AddonsManager.js';
import logger from '../../dist/src/utils/logger.js';

/**
 * Permissions granted to a demo visitor who is shown the dashboard.
 *
 * Deliberately absent:
 *   admin-system — every admin mutation refused. The read-only guarantee.
 *   user-read    — /admin/users stays hidden; it lists every visitor's email.
 *   admin-roles  — the roles screen is viewable, but creating/editing/deleting
 *                  roles still requires this, so it cannot self-escalate.
 *   page-delete  — author-lock covers `edit` only, so delete would let a demo
 *                  account remove a locked documentation page.
 */
const DEMO_ADMIN_PERMISSIONS = [
  'page-read', 'page-edit', 'page-create', 'page-export',
  'asset-read', 'asset-upload', 'search-page',
  'admin-read'
];

const demoAddon = {
  name: 'demo',
  version: '0.1.0',
  description: 'Public demo instance content and the read-only demo-admin role (#1029)',
  author: 'Jim Willeke',
  dependencies: [] as string[],

  register(engine: WikiEngine, _config: Record<string, unknown>): Promise<void> {
    // The role is merged in here rather than declared in `domainDefaults`,
    // because domainDefaults applies whole-key replacement
    // (AddonsManager.applyDomainDefaults → setRuntimeProperty). Declaring
    // `ngdpbase.access.policies` that way would REPLACE all eight shipped
    // policies — including admin-full-access — and lock the operator out.
    //
    // Both halves are required and must stay in step: the role's inline
    // `permissions[]` is what ConfigAccessorPlugin renders on the
    // Roles/Permissions pages, while PolicyEvaluator decides actual access
    // from `ngdpbase.access.policies`. Writing one without the other gives
    // display-vs-enforcement drift, which the core config warns about.
    const configManager = engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      logger.warn('[demo addon] ConfigurationManager unavailable — demo-admin role not registered');
      return Promise.resolve();
    }

    const roles = {
      ...(configManager.getProperty('ngdpbase.roles.definitions', {}) as Record<string, unknown>)
    };
    if (!roles['demo-admin']) {
      roles['demo-admin'] = {
        name: 'demo-admin',
        displayname: 'Demo Administrator',
        description: 'Read-only access to the admin dashboard for demo visitors',
        issystem: false,
        icon: 'eye',
        color: '#6c757d',
        permissions: DEMO_ADMIN_PERMISSIONS
      };
      configManager.setRuntimeProperty('ngdpbase.roles.definitions', roles);
    }

    const policies = [
      ...(configManager.getProperty('ngdpbase.access.policies', []) as Record<string, unknown>[])
    ];
    if (!policies.some((p) => p.id === 'demo-admin-access')) {
      policies.push({
        id: 'demo-admin-access',
        name: 'Demo Administrator (read-only)',
        description: 'Demo visitors may view admin screens and edit pages, but change nothing administrative',
        // Below admin-full-access (100) — this never widens what an admin has.
        priority: 90,
        effect: 'allow',
        subjects: [{ type: 'role', value: 'demo-admin' }],
        resources: [{ type: 'page', pattern: '*' }],
        actions: DEMO_ADMIN_PERMISSIONS
      });
      configManager.setRuntimeProperty('ngdpbase.access.policies', policies);
    }

    logger.info(
      '[demo addon] Enabled — demo pages seeded from addons/demo/pages, demo-admin role registered'
    );
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
